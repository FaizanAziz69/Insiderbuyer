import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { HistoricalInsiderBuy } from '../entities/historical-insider-buy.entity';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import {
  BacktestCache,
  PriceHistoryCache,
} from '../entities/backtest-cache.entity';
import { MarketStatsService } from '../market-stats/market-stats.service';

export interface EquityPoint {
  /** Week end, epoch ms. */
  t: number;
  /** Strategy equity, indexed to 100 at the start. */
  s: number;
  /** Benchmark equity, indexed to 100 at the start. */
  b: number;
}

export interface BacktestStats {
  startDate: string;
  endDate: string;
  years: number;
  totalReturn: number;
  cagr: number;
  benchmarkTotalReturn: number;
  benchmarkCagr: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  volatility: number;
  beta: number;
  alpha: number;
  weeks: number;
  trades: number;
}

export interface BacktestResult {
  ready: boolean;
  curve: EquityPoint[];
  stats: BacktestStats | null;
  rules: {
    holdings: number;
    rebalance: string;
    lookbackDays: number;
    benchmark: string;
  };
  /** Set while price history is still being gathered. */
  note?: string;
  /** Symbols cached / needed, so the UI can show it filling in. */
  progress?: { have: number; need: number };
}

const DAY = 86_400_000;
const WEEK = 7 * DAY;
/** Trailing window over which insider buying is accumulated to rank names. */
const LOOKBACK_DAYS = 30;
const HOLDINGS = 10;
const BENCHMARK = 'SPY';
/** Ignore parse artifacts the same way the leaderboards do. */
const MAX_TX_VALUE = 5_000_000_000;

/**
 * Backtest of the insider-buying premise on OUR OWN filing data.
 *
 * Rules (deliberately simple and fully point-in-time):
 *   • every Monday, rank companies by total open-market insider purchase value
 *     over the trailing 30 days, using ONLY filings dated on or before that day
 *   • buy the top 10, equally weighted
 *   • hold one week, then rebalance
 *   • benchmark: SPY over the identical window
 *
 * The ranking signal is raw filing data rather than the live Insider Score,
 * because stored scores are as-of-today — ranking on them would leak future
 * information into past weeks and inflate the result. Nothing here is
 * estimated: every weekly return comes from real closes for names really held.
 */
@Injectable()
export class BacktestService {
  private readonly logger = new Logger(BacktestService.name);
  private readonly RESULT_TTL_MS = 24 * 60 * 60_000;
  private readonly PRICE_TTL_MS = 7 * 24 * 60 * 60_000;
  /** Symbols fetched per request — kept small so we stay well inside the
   *  60s function limit; the next request picks up where this one stopped. */
  private readonly SLICE = 45;
  private readonly CONCURRENCY = 6;
  private readonly CACHE_KEY = 'insider-strategy-v5'; // v5 = sustained-density start

  constructor(
    @InjectRepository(InsiderTransaction)
    private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(HistoricalInsiderBuy)
    private readonly histRepo: Repository<HistoricalInsiderBuy>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    @InjectRepository(PriceHistoryCache)
    private readonly priceRepo: Repository<PriceHistoryCache>,
    @InjectRepository(BacktestCache)
    private readonly resultRepo: Repository<BacktestCache>,
    private readonly market: MarketStatsService,
  ) {}

  private emptyRules() {
    return {
      holdings: HOLDINGS,
      rebalance: 'Weekly',
      lookbackDays: LOOKBACK_DAYS,
      benchmark: BENCHMARK,
    };
  }

  async get(): Promise<BacktestResult> {
    // 1. A fresh persisted result serves immediately, even on a cold instance.
    const stored = await this.resultRepo.findOne({ where: { key: this.CACHE_KEY } });
    if (
      stored &&
      Date.now() - new Date(stored.computedAt).getTime() < this.RESULT_TTL_MS
    ) {
      return stored.payload as BacktestResult;
    }

    // 2. Work out which symbols the backtest needs.
    const plan = await this.buildPlan();
    if (!plan) {
      return {
        ready: false,
        curve: [],
        stats: null,
        rules: this.emptyRules(),
        note: 'Not enough filing history to backtest yet.',
      };
    }

    // 3. Fill in missing price history a slice at a time.
    const symbols = plan.symbols;
    const cached = await this.priceRepo.find({
      select: ['symbol', 'updatedAt'],
      where: symbols.map((symbol) => ({ symbol })),
    });
    const freshSet = new Set(
      cached
        .filter(
          (c) => Date.now() - new Date(c.updatedAt).getTime() < this.PRICE_TTL_MS,
        )
        .map((c) => c.symbol),
    );
    const missing = symbols.filter((s) => !freshSet.has(s));

    if (missing.length) {
      const slice = missing.slice(0, this.SLICE);
      for (let i = 0; i < slice.length; i += this.CONCURRENCY) {
        const chunk = slice.slice(i, i + this.CONCURRENCY);
        const got = await Promise.all(
          chunk.map((sym) =>
            this.market.getCloseHistory(sym, '10y').catch(() => []),
          ),
        );
        // Forced upsert, NOT save(): TypeORM skips a no-op UPDATE when the
        // stored value is identical (e.g. an empty [] for a delisted symbol
        // fetched again), which left updatedAt frozen — those rows read as
        // permanently stale and the gathering loop never converged.
        await Promise.all(
          got.map((points, j) =>
            this.priceRepo
              .createQueryBuilder()
              .insert()
              .values({ symbol: chunk[j], points })
              .orUpdate(['points', 'updatedAt'], ['symbol'])
              .execute(),
          ),
        );
      }
      const have = symbols.length - missing.length + slice.length;
      return {
        ready: false,
        curve: [],
        stats: null,
        rules: this.emptyRules(),
        note: `Gathering price history — ${have} of ${symbols.length} symbols ready. Refresh in a moment.`,
        progress: { have, need: symbols.length },
      };
    }

    // 4. Everything is cached — compute and persist.
    const rows = await this.priceRepo.find({
      where: symbols.map((symbol) => ({ symbol })),
    });
    const hist = new Map<string, Array<{ t: number; c: number }>>();
    rows.forEach((r) => hist.set(r.symbol, r.points || []));

    const result = this.runBacktest(plan, hist);
    await this.resultRepo.save({ key: this.CACHE_KEY, payload: result });
    return result;
  }

  /** Weekly rebalance dates, the point-in-time top-10 for each, and every
   *  symbol whose price history the backtest will need. */
  /** Populate the 10-year event store: full FMP purchase history for every
   *  US-tickered company we track. Idempotent (unique-key upserts); safe to
   *  re-run. Invalidates the computed result so the next request rebuilds. */
  async backfillBuyEvents(opts?: {
    maxPagesPerSymbol?: number;
    limit?: number;
  }): Promise<{ symbols: number; events: number }> {
    if (!this.fmp.enabled) return { symbols: 0, events: 0 };
    const rows = await this.companies
      .createQueryBuilder('c')
      .select('DISTINCT UPPER(c.ticker)', 'ticker')
      .where(`c.exchange = 'US'`)
      .andWhere(`c.ticker IS NOT NULL AND c.ticker NOT LIKE '%.%'`)
      .getRawMany<{ ticker: string }>();
    const symbols = rows
      .map((r) => r.ticker)
      .filter((t) => t && /^[A-Z0-9\-]+$/.test(t))
      .slice(0, opts?.limit ?? 5000);
    let events = 0;
    for (const sym of symbols) {
      try {
        const buys = await this.fmp.insiderPurchasesForSymbol(
          sym,
          opts?.maxPagesPerSymbol ?? 10,
        );
        for (const b of buys) {
          try {
            await this.histRepo.upsert(
              {
                symbol: b.symbol,
                insiderName: b.insiderName,
                typeOfOwner: b.typeOfOwner,
                transactionDate: new Date(b.transactionDate),
                totalValue: b.totalValue,
              },
              ['symbol', 'insiderName', 'transactionDate', 'totalValue'],
            );
            events++;
          } catch {
            /* duplicate — fine */
          }
        }
      } catch (e: any) {
        this.logger.warn(`buy-event backfill ${sym}: ${e?.message || e}`);
      }
    }
    await this.resultRepo.delete({ key: this.CACHE_KEY });
    this.logger.log(`buy-event backfill: ${symbols.length} symbols, ${events} events`);
    return { symbols: symbols.length, events };
  }

  private async buildPlan(): Promise<{
    weeks: number[];
    picksByWeek: string[][];
    symbols: string[];
  } | null> {
    // 1. Every qualifying open-market buy by a PERSON at a US-listed company,
    //    oldest first. Spec v2: the v1 basket ranked raw dollars and was
    //    dominated by 10%-owner institutions (Sumitomo, TPG, Prudential,
    //    Apollo, Blackstone block purchases), foreign BaFin lines and junk
    //    tickers — none of which is the "officers and directors buying their
    //    own stock" premise this page describes. Those are excluded now.
    const buys = await this.txRepo
      .createQueryBuilder('t')
      .select(['t.transactionDate', 't.totalValue'])
      .addSelect('c.ticker', 'ticker')
      .addSelect('t."insiderName"', 'insiderName')
      .leftJoin('t.company', 'c')
      .where(`t."transactionCode" = 'P'`)
      .andWhere('t."totalValue" > 0 AND t."totalValue" <= :max', {
        max: MAX_TX_VALUE,
      })
      .andWhere(`c.exchange = 'US'`)
      .andWhere(`c.ticker IS NOT NULL AND c.ticker NOT LIKE '%.%'`)
      .andWhere(`UPPER(c.ticker) NOT IN ('N/A', 'NONE', '')`)
      .orderBy('t."transactionDate"', 'ASC')
      .getRawMany<{
        t_transactionDate: string;
        t_totalValue: string;
        ticker: string | null;
        insiderName: string | null;
      }>();

    // Corporate filers (funds, banks, holding companies) buy as 10% owners —
    // real filings, but not the insider-conviction signal being tested.
    const ORG =
      /\b(inc|incorporated|corp|corporation|co|company|llc|llp|lp|ltd|limited|plc|gmbh|ag|nv|sa|trust|fund|funds|capital|partners?|holdings?|group|management|advisors?|advisers?|ventures?|associates|investments?|equity|asset|bancorp|bank|financial|insurance|life|principal)\b/i;

    const rawEvents = buys.map((r) => ({
      ms: new Date(r.t_transactionDate).getTime(),
      value: Number(r.t_totalValue),
      ticker: (r.ticker || '').toUpperCase(),
      insiderName: String(r.insiderName || ''),
    }));

    // Long-horizon event store (10 years via FMP per-symbol history) — merged
    // with our own ingest, deduplicated on (ticker, day, insider, value).
    const hist = await this.histRepo.find();
    for (const h of hist) {
      const typeOk =
        !h.typeOfOwner || /officer|director/i.test(h.typeOfOwner);
      if (!typeOk) continue;
      rawEvents.push({
        ms: new Date(h.transactionDate as unknown as string).getTime(),
        value: Number(h.totalValue),
        ticker: (h.symbol || '').toUpperCase(),
        insiderName: h.insiderName,
      });
    }

    const seen = new Set<string>();
    const events = rawEvents
      .filter(
        (e) =>
          e.ticker &&
          !e.ticker.includes('.') &&
          Number.isFinite(e.ms) &&
          Number.isFinite(e.value) &&
          e.value > 0 &&
          e.value <= MAX_TX_VALUE &&
          !ORG.test(e.insiderName.replace(/[.,]/g, ' ')),
      )
      .filter((e) => {
        const key = `${e.ticker}|${new Date(e.ms).toISOString().slice(0, 10)}|${e.insiderName.toLowerCase()}|${Math.round(e.value)}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .sort((a, b) => a.ms - b.ms);

    if (events.length < 100) {
      this.logger.warn(`not enough filings to backtest (${events.length})`);
      return null;
    }

    // 2. Weekly rebalance dates. Start one lookback window in, so the first
    //    ranking already has a full 30 days of filings behind it.
    const firstMs = events[0].ms;
    const lastMs = events[events.length - 1].ms;
    const start = firstMs + LOOKBACK_DAYS * DAY;
    const weeks: number[] = [];
    for (let t = start; t <= lastMs; t += WEEK) weeks.push(t);
    if (weeks.length < 8) {
      this.logger.warn(`backtest window too short (${weeks.length} weeks)`);
      return null;
    }

    // 3. Point-in-time top-10 per week.
    const picksByWeek: string[][] = weeks.map((wk) => {
      const from = wk - LOOKBACK_DAYS * DAY;
      const byTicker = new Map<string, number>();
      for (const e of events) {
        if (e.ms > wk) break; // events are sorted, nothing later can qualify
        if (e.ms <= from) continue;
        byTicker.set(e.ticker, (byTicker.get(e.ticker) || 0) + e.value);
      }
      return Array.from(byTicker.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, HOLDINGS)
        .map(([tk]) => tk);
    });

    // 4. Every name ever held, plus the benchmark — the price history the
    //    caller has to have cached before the walk can run.
    const needed = new Set<string>([BENCHMARK]);
    picksByWeek.forEach((p) => p.forEach((tk) => needed.add(tk)));

    return { weeks, picksByWeek, symbols: Array.from(needed) };
  }

  /** Pure walk over the weeks — no I/O, all history supplied by the caller. */
  private runBacktest(
    plan: { weeks: number[]; picksByWeek: string[][]; symbols: string[] },
    hist: Map<string, Array<{ t: number; c: number }>>,
  ): BacktestResult {
    const { weeks, picksByWeek } = plan;

    const priceOn = (tk: string, ms: number): number | null => {
      const h = hist.get(tk);
      if (!h || !h.length) return null;
      return MarketStatsService.closeOn(h, ms);
    };

    // 5a. Trim the leading period where the strategy can't even form a real
    //     basket — early history has too few insider filings, so the curve
    //     would sit flat at 100 for years then spike (misleading). Start at
    //     the first week that holds at least MIN_HELD priced names.
    const MIN_HELD = 5;
    const held = weeks.map((_, i) =>
      picksByWeek[i].filter((tk) => {
        const p = priceOn(tk, weeks[i]);
        return p != null && p > 0;
      }).length,
    );
    // Start where coverage becomes SUSTAINED, not at the first isolated early
    // cluster: the first week from which ≥90% of the next 26 weeks each hold
    // at least MIN_HELD priced names. This drops the long flat-at-100 tail of
    // sparse early history and begins the curve at genuine data density.
    const WIN = 26;
    let startIdx = 0;
    for (let i = 0; i < weeks.length; i++) {
      if (i > weeks.length - 9) { startIdx = i; break; } // never trim to < 8 weeks
      const end = Math.min(weeks.length, i + WIN);
      let ok = 0;
      for (let j = i; j < end; j++) if (held[j] >= MIN_HELD) ok++;
      if (ok / (end - i) >= 0.9) { startIdx = i; break; }
    }
    const W = weeks.slice(startIdx);
    const P = picksByWeek.slice(startIdx);

    // 5b. Walk the weeks, equal-weighting whatever priced names we hold.
    let equity = 100;
    let bench = 100;
    const curve: EquityPoint[] = [{ t: W[0], s: 100, b: 100 }];
    const weeklyReturns: number[] = [];
    const benchReturns: number[] = [];
    let wins = 0;
    let losses = 0;
    let winSum = 0;
    let lossSum = 0;
    let trades = 0;

    for (let i = 0; i < W.length - 1; i++) {
      const open = W[i];
      const close = W[i + 1];

      const rets: number[] = [];
      for (const tk of P[i]) {
        const p0 = priceOn(tk, open);
        const p1 = priceOn(tk, close);
        if (p0 == null || p1 == null || !(p0 > 0) || !(p1 > 0)) continue;
        // Sanity clamp: a single-name weekly move beyond +200% / −90% is
        // almost always a bad tick / split artifact in a thin micro-cap, not
        // a real return — cap it so one bad print can't distort the curve.
        const r = Math.max(-0.9, Math.min(2, p1 / p0 - 1));
        rets.push(r);
        trades += 1;
      }
      const b0 = priceOn(BENCHMARK, open);
      const b1 = priceOn(BENCHMARK, close);
      const bRet = b0 != null && b1 != null && b0 > 0 ? b1 / b0 - 1 : 0;

      // A week with no priced holdings sits in cash rather than guessing.
      const sRet = rets.length
        ? rets.reduce((a, b) => a + b, 0) / rets.length
        : 0;

      equity *= 1 + sRet;
      bench *= 1 + bRet;
      weeklyReturns.push(sRet);
      benchReturns.push(bRet);
      if (rets.length) {
        if (sRet > 0) {
          wins += 1;
          winSum += sRet;
        } else if (sRet < 0) {
          losses += 1;
          lossSum += sRet;
        }
      }
      curve.push({
        t: close,
        s: Math.round(equity * 100) / 100,
        b: Math.round(bench * 100) / 100,
      });
    }

    // 6. Statistics.
    const n = weeklyReturns.length;
    const years = (W[W.length - 1] - W[0]) / (365.25 * DAY);
    const mean = weeklyReturns.reduce((a, b) => a + b, 0) / n;
    const variance =
      weeklyReturns.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, n - 1);
    const weeklySd = Math.sqrt(variance);
    const annVol = weeklySd * Math.sqrt(52);

    // Max drawdown on the strategy equity curve.
    let peak = curve[0].s;
    let maxDd = 0;
    for (const p of curve) {
      if (p.s > peak) peak = p.s;
      const dd = p.s / peak - 1;
      if (dd < maxDd) maxDd = dd;
    }

    // Beta / alpha vs the benchmark, from the weekly series.
    const bMean = benchReturns.reduce((a, b) => a + b, 0) / n;
    let cov = 0;
    let bVar = 0;
    for (let i = 0; i < n; i++) {
      cov += (weeklyReturns[i] - mean) * (benchReturns[i] - bMean);
      bVar += (benchReturns[i] - bMean) ** 2;
    }
    cov /= Math.max(1, n - 1);
    bVar /= Math.max(1, n - 1);
    const beta = bVar > 0 ? cov / bVar : 0;
    const annStrat = (1 + mean) ** 52 - 1;
    const annBench = (1 + bMean) ** 52 - 1;
    const alpha = annStrat - beta * annBench;

    const totalReturn = equity / 100 - 1;
    const benchTotal = bench / 100 - 1;
    const pct = (x: number) => Math.round(x * 1000) / 10;

    const stats: BacktestStats = {
      startDate: new Date(W[0]).toISOString().slice(0, 10),
      endDate: new Date(W[W.length - 1]).toISOString().slice(0, 10),
      years: Math.round(years * 100) / 100,
      totalReturn: pct(totalReturn),
      cagr: pct(years > 0 ? (equity / 100) ** (1 / years) - 1 : 0),
      benchmarkTotalReturn: pct(benchTotal),
      benchmarkCagr: pct(years > 0 ? (bench / 100) ** (1 / years) - 1 : 0),
      maxDrawdown: pct(maxDd),
      // Excess-return Sharpe would need a rate series; this is the plain
      // annualized return/vol ratio, which is what the comparable published
      // backtests quote.
      sharpe: annVol > 0 ? Math.round((annStrat / annVol) * 1000) / 1000 : 0,
      winRate: wins + losses > 0 ? pct(wins / (wins + losses)) : 0,
      avgWin: wins > 0 ? pct(winSum / wins) : 0,
      avgLoss: losses > 0 ? pct(lossSum / losses) : 0,
      volatility: pct(annVol),
      beta: Math.round(beta * 100) / 100,
      alpha: Math.round(alpha * 1000) / 10,
      weeks: n,
      trades,
    };

    this.logger.log(
      `backtest: ${stats.startDate}→${stats.endDate} ${stats.totalReturn}% vs SPY ${stats.benchmarkTotalReturn}% (${trades} trades)`,
    );

    return {
      ready: true,
      curve,
      stats,
      rules: {
        holdings: HOLDINGS,
        rebalance: 'Weekly',
        lookbackDays: LOOKBACK_DAYS,
        benchmark: BENCHMARK,
      },
    };
  }
}
