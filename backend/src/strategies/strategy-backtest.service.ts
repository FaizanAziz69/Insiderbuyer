import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { riskMetrics, type RiskMetrics } from '../quant/risk';
import type { Pick, SelectorContext, StrategyDef } from './strategy-types';

const DAY = 86_400_000;

export interface StrategyRun {
  slug: string;
  version: string;
  from: string;
  to: string;
  rebalances: number;
  equity: Array<{ date: string; value: number; benchmark: number }>;
  holdings: Array<{ ticker: string; weight: number; entryDate: string; trigger: string }>;
  log: Array<{ date: string; ticker: string; action: 'add' | 'drop'; trigger: string }>;
  metrics: RiskMetrics;
  turnover: number;
  costsPaid: number;
  hitRate: number | null;
  notes: string[];
}

/**
 * The one engine of Brief v8 §6.
 *
 * It knows how to walk dates, ask a rule set what to hold, price the result
 * forward from the point-in-time series and charge for trading. It knows
 * nothing about congress, insiders or lobbying — that is what the selectors in
 * the registry are for, and it is why adding a strategy is a config change.
 *
 * NO LOOKAHEAD, enforced in two places rather than trusted: the walker only
 * ever passes a selector an `asOf` and only ever prices with closes at or
 * before the date being valued, and each definition declares the disclosure lag
 * its dataset carries so a signal cannot be held before the public could have
 * seen it (§6: "a congress strategy cannot trade before the PTR filing date").
 */
@Injectable()
export class StrategyBacktestService {
  private readonly log = new Logger(StrategyBacktestService.name);

  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companyRepo.query(sql, params) as Promise<T>;
  }

  /** Last close at or before `ms` — never after, which is the whole point. */
  private static closeAt(
    points: Array<[number, number, number]> | undefined,
    ms: number,
  ): number | null {
    if (!points?.length) return null;
    let lo = 0;
    let hi = points.length - 1;
    let best: number | null = null;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (points[mid][0] <= ms) {
        best = points[mid][1];
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return best;
  }

  /** Every selector reads from this; built once and shared across dates. */
  async buildContext(): Promise<SelectorContext> {
    const priceRows: Array<{ symbol: string; points: any }> = await this.q(
      `SELECT symbol, points FROM pit_price_series`,
    );
    const prices = new Map<string, Array<[number, number, number]>>();
    for (const r of priceRows) {
      if (Array.isArray(r.points) && r.points.length) {
        prices.set(String(r.symbol).toUpperCase(), r.points);
      }
    }

    const gradeRows: Array<{ member: string; grade: string }> = await this.q(
      `SELECT lower(member) AS member, grade FROM wt_member_stats WHERE grade IS NOT NULL`,
    ).catch(() => []);
    const memberGrades = new Map<string, string>();
    for (const r of gradeRows) memberGrades.set(r.member, r.grade);

    const capRows: Array<{ ticker: string; mc: string }> = await this.q(
      `SELECT ticker, "marketCap"::text AS mc FROM companies WHERE "marketCap" IS NOT NULL`,
    ).catch(() => []);
    const marketCap = new Map<string, number>();
    for (const r of capRows) {
      const v = Number(r.mc);
      if (Number.isFinite(v) && v > 0) marketCap.set(String(r.ticker).toUpperCase(), v);
    }

    // S&P 500 membership. CURRENT membership, which is a real flaw in any
    // backtest that uses it and is stated in the limitations of the two
    // strategies that do: a company added to the index last year appears as a
    // member in 2019 here, and the companies dropped along the way are absent
    // entirely. Point-in-time membership is not in any feed we have.
    const spRows: Array<{ symbol: string }> = await this.q(
      `SELECT symbol FROM sp500_membership`,
    ).catch(() => []);
    const sp500 = new Set<string>(spRows.map((r) => String(r.symbol).toUpperCase()));

    return { q: this.q.bind(this), prices, memberGrades, sp500, marketCap };
  }

  /**
   * Walk one strategy.
   *
   * `benchmarkTicker` is priced the same way the portfolio is, from the same
   * series, so the comparison cannot flatter the strategy through a different
   * price source. §3 requires strategies 7 and 8 to sit beside a plain
   * buy-and-hold S&P 500 line, and every card in §5.1 carries a sparkline
   * against it, so there is no run without one.
   */
  async run(
    def: StrategyDef,
    ctx: SelectorContext,
    opts: { from: string; to: string; costBps?: number; benchmarkTicker?: string },
  ): Promise<StrategyRun> {
    const costBps = opts.costBps ?? 10;
    const benchTicker = (opts.benchmarkTicker ?? 'SPY').toUpperCase();
    const benchPts = ctx.prices.get(benchTicker);
    const notes: string[] = [];
    if (!benchPts) notes.push(`No price series for the ${benchTicker} benchmark; the comparison line is flat.`);

    const fromMs = Date.parse(`${opts.from}T00:00:00Z`);
    const toMs = Date.parse(`${opts.to}T00:00:00Z`);
    const step = def.rebalanceDays * DAY;

    let equityValue = 1;
    let benchStart: number | null = null;
    const equity: StrategyRun['equity'] = [];
    const log: StrategyRun['log'] = [];
    let held = new Map<string, { weight: number; entryDate: string; trigger: string }>();
    let rebalances = 0;
    let costsPaid = 0;
    let turnoverSum = 0;
    let wins = 0;
    let closed = 0;

    for (let t = fromMs; t <= toMs; t += step) {
      const next = Math.min(t + step, toMs);
      const dateStr = new Date(t).toISOString().slice(0, 10);

      // 1. Price the CURRENT book across this period, before touching it.
      if (held.size) {
        let periodReturn = 0;
        let priced = 0;
        for (const [ticker, pos] of held) {
          const pts = ctx.prices.get(ticker);
          const p0 = StrategyBacktestService.closeAt(pts, t);
          const p1 = StrategyBacktestService.closeAt(pts, next);
          if (p0 == null || p1 == null || !(p0 > 0)) continue;
          const r = (p1 - p0) / p0;
          periodReturn += r * pos.weight;
          priced += pos.weight;
          closed++;
          if (r > 0) wins++;
        }
        // Un-priceable weight sits in cash rather than being scaled away —
        // pretending the rest of the book absorbed it would invent return.
        if (priced > 0) equityValue *= 1 + periodReturn;
      }

      // 2. Ask the rule set what it wants to hold as of this date.
      let picks: Pick[] = [];
      try {
        picks = await def.select(ctx, t);
      } catch (e: any) {
        notes.push(`${dateStr}: selector failed (${e?.message || e}); the book was carried unchanged.`);
        picks = [...held.entries()].map(([ticker, p]) => ({ ticker, weight: p.weight, trigger: p.trigger }));
      }

      // Only names we can actually price are tradable; §6 models the dataset's
      // lag, and a name with no series is not a holding, it is a guess.
      const tradable = picks.filter((p) => {
        const c = StrategyBacktestService.closeAt(ctx.prices.get(p.ticker.toUpperCase()), t);
        return c != null && c > 0;
      });
      const wSum = tradable.reduce((a, b) => a + Math.max(0, b.weight), 0);
      const target = new Map<string, { weight: number; trigger: string }>();
      if (wSum > 0) {
        for (const p of tradable) {
          const w = Math.max(0, p.weight) / wSum;
          if (w > 0) target.set(p.ticker.toUpperCase(), { weight: w, trigger: p.trigger });
        }
      }

      // 3. Turnover and costs — one-way turnover, charged both ways.
      let turnover = 0;
      for (const [ticker, tgt] of target) turnover += Math.abs(tgt.weight - (held.get(ticker)?.weight ?? 0));
      for (const [ticker, pos] of held) if (!target.has(ticker)) turnover += pos.weight;
      turnover /= 2;
      if (target.size || held.size) {
        turnoverSum += turnover;
        const cost = turnover * 2 * (costBps / 10_000);
        equityValue *= 1 - cost;
        costsPaid += cost;
        rebalances++;
      }

      for (const [ticker, tgt] of target) {
        if (!held.has(ticker)) log.push({ date: dateStr, ticker, action: 'add', trigger: tgt.trigger });
      }
      for (const ticker of held.keys()) {
        if (!target.has(ticker)) log.push({ date: dateStr, ticker, action: 'drop', trigger: 'left the rule set' });
      }

      const nextHeld = new Map<string, { weight: number; entryDate: string; trigger: string }>();
      for (const [ticker, tgt] of target) {
        nextHeld.set(ticker, {
          weight: tgt.weight,
          entryDate: held.get(ticker)?.entryDate ?? dateStr,
          trigger: tgt.trigger,
        });
      }
      held = nextHeld;

      // 4. The benchmark, priced from the same series over the same dates.
      const bench = StrategyBacktestService.closeAt(benchPts, next);
      if (bench != null && benchStart == null) benchStart = StrategyBacktestService.closeAt(benchPts, t) ?? bench;
      equity.push({
        date: new Date(next).toISOString().slice(0, 10),
        value: equityValue,
        benchmark: bench != null && benchStart ? bench / benchStart : 1,
      });
    }

    const metrics = riskMetrics(equity.map((e) => e.value), {
      periodsPerYear: 365 / def.rebalanceDays,
      benchmarkEquity: equity.map((e) => e.benchmark),
    });

    return {
      slug: def.slug,
      version: def.version,
      from: opts.from,
      to: opts.to,
      rebalances,
      equity,
      holdings: [...held.entries()].map(([ticker, p]) => ({
        ticker,
        weight: p.weight,
        entryDate: p.entryDate,
        trigger: p.trigger,
      })),
      log,
      metrics,
      turnover: rebalances ? turnoverSum / rebalances : 0,
      costsPaid,
      hitRate: closed ? wins / closed : null,
      notes,
    };
  }
}
