import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { RosterService, ageOn, ageBracket, AgeBracket } from './roster.service';
import { PtrService, StoredTrade } from './ptr.service';
import { PricesService, BENCHMARK } from './prices.service';
import { UnifiedService } from './unified.service';
import {
  Aligned, alignSeries, calendarIndex, dayMs, disclosureLagDays, indexDaysBefore, indexYearStart,
  midpoint, reconstruct, thinCurve, trailingBenchmark, trailingReturn, CurvePoint,
} from './reconstruction';
import {
  awardBadges, gradeCongress, BadgeKey, Grade, BADGE_CONFIG, BADGE_META, MIN_TRACKED_DAYS, STANDING_FRAME, ESTIMATE_NOTE,
} from './badges';

/**
 * The Wealth Tracker — Brief v7 Build 1.
 *
 * Nightly: roster → PTRs → prices → reconstruct every member → grades and
 * badges across the field → write `wt_member_stats`, `wt_positions`,
 * `wt_curves`. Pages read those tables and never compute on request (§5).
 */

const DAY = 86_400_000;
const CURVE_MAX_POINTS = 600;
const CALENDAR_FROM = Date.UTC(2011, 0, 1);

export type View = 'growth90d' | 'ytd' | 'alltime' | 'hitrate' | 'active' | 'movers';
export const VIEWS: View[] = ['growth90d', 'ytd', 'alltime', 'hitrate', 'active', 'movers'];

export interface LeaderboardFilters {
  view: View;
  party?: string;
  chamber?: string;
  age?: AgeBracket;
  activity?: 'none' | 'low' | 'mid' | 'high';
  recency?: '7d' | '30d' | '90d';
  returnBand?: 'neg' | 'flat' | 'up' | 'strong';
  hitBand?: 'lt40' | '40-60' | '60-70' | 'gte70';
  includeFormer?: boolean;
  sort?: string;
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
  q?: string;
}

interface StatsRow {
  bioguide: string;
  value: number;
  invested: number;
  realized: number;
  unrealized: number;
  ret_all: number | null;
  ret_90d: number | null;
  ret_ytd: number | null;
  ret_7d: number | null;
  bench_all: number | null;
  bench_90d: number | null;
  bench_ytd: number | null;
  wow_change: number | null;
  hit_rate: number | null;
  hit_sample: number;
  trades_total: number;
  trades_12m: number;
  buys_total: number;
  priced_trades: number;
  last_trade: string | null;
  avg_lag_days: number | null;
  holdings: number;
  qualifies: boolean;
  grade: Grade | null;
  grade_pct: number | null;
  badges: BadgeKey[];
  top_holdings: Array<{ ticker: string; name: string; value: number }>;
  unpriced_buys: number;
  clamped_days: number;
  /** The ten most recent trades as dots: side + return so far (buys only). */
  last10: Array<{ side: 'buy' | 'sell'; ret: number | null; ticker: string; date: string }>;
  computed_at?: string;
}

@Injectable()
export class WealthTrackerService {
  private readonly log = new Logger(WealthTrackerService.name);
  private running: { started: string; step: string; progress?: string } | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly roster: RosterService,
    private readonly ptr: PtrService,
    private readonly prices: PricesService,
    private readonly unified: UnifiedService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.roster.ensureTables();
    await this.ptr.ensureTables();
    await this.prices.ensureTables();
    await this.q(`CREATE TABLE IF NOT EXISTS wt_member_stats (
      bioguide text PRIMARY KEY,
      value numeric(20,2) NOT NULL DEFAULT 0,
      invested numeric(20,2) NOT NULL DEFAULT 0,
      realized numeric(20,2) NOT NULL DEFAULT 0,
      unrealized numeric(20,2) NOT NULL DEFAULT 0,
      ret_all real, ret_90d real, ret_ytd real, ret_7d real,
      bench_all real, bench_90d real, bench_ytd real,
      wow_change numeric(20,2),
      hit_rate real, hit_sample int NOT NULL DEFAULT 0,
      trades_total int NOT NULL DEFAULT 0, trades_12m int NOT NULL DEFAULT 0, buys_total int NOT NULL DEFAULT 0,
      priced_trades int NOT NULL DEFAULT 0,
      last_trade date, avg_lag_days real,
      holdings int NOT NULL DEFAULT 0,
      qualifies boolean NOT NULL DEFAULT false,
      grade text, grade_pct real,
      badges jsonb NOT NULL DEFAULT '[]'::jsonb,
      top_holdings jsonb NOT NULL DEFAULT '[]'::jsonb,
      unpriced_buys int NOT NULL DEFAULT 0, clamped_days int NOT NULL DEFAULT 0,
      computed_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_positions (
      bioguide text NOT NULL,
      ticker text NOT NULL,
      name text NOT NULL DEFAULT '',
      shares numeric(20,4) NOT NULL,
      cost_basis numeric(20,2) NOT NULL,
      avg_cost numeric(18,4) NOT NULL,
      price numeric(18,4) NOT NULL,
      price_as_of date NOT NULL,
      value numeric(20,2) NOT NULL,
      unrealized numeric(20,2) NOT NULL,
      realized numeric(20,2) NOT NULL DEFAULT 0,
      buys int NOT NULL DEFAULT 0, sells int NOT NULL DEFAULT 0,
      first_bought date, last_action date,
      status text NOT NULL DEFAULT 'live',
      computed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (bioguide, ticker)
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_lots (
      trade_id text PRIMARY KEY,
      bioguide text NOT NULL,
      ticker text NOT NULL,
      open_date date NOT NULL,
      shares numeric(20,4) NOT NULL,
      cost_per_share numeric(18,4) NOT NULL,
      remaining numeric(20,4) NOT NULL,
      sold_shares numeric(20,4) NOT NULL DEFAULT 0,
      sold_proceeds numeric(20,2) NOT NULL DEFAULT 0,
      computed_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_lots_member_idx ON wt_lots (bioguide, open_date)`);
    await this.q(`ALTER TABLE wt_member_stats ADD COLUMN IF NOT EXISTS last10 jsonb NOT NULL DEFAULT '[]'::jsonb`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_curves (
      bioguide text PRIMARY KEY,
      points jsonb NOT NULL,
      computed_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_meta (key text PRIMARY KEY, value text, updated_at timestamptz NOT NULL DEFAULT now())`);
  }

  // ── Nightly ─────────────────────────────────────────────────────────────

  @Cron('50 4 * * *')
  async nightly(): Promise<void> {
    if (this.running) return;
    try {
      const sunday = new Date().getUTCDay() === 0;
      await this.run({ roster: sunday, full: sunday, latest: true });
    } catch (e: any) {
      this.log.error(`nightly failed: ${e?.message || e}`);
    }
  }

  status() {
    return this.running;
  }

  /** The whole pipeline. `full` re-pulls every member's complete record. */
  async run(opts: { roster?: boolean; full?: boolean; latest?: boolean; recomputeOnly?: boolean; limitSurnames?: number } = {}): Promise<any> {
    if (this.running) return { started: false, running: this.running };
    this.running = { started: new Date().toISOString(), step: 'start' };
    const t0 = Date.now();
    const report: any = {};
    try {
      await this.ensureTables();
      if (!opts.recomputeOnly) {
        const members = await this.roster.all();
        if (opts.roster || !members.length) {
          this.running.step = 'roster';
          report.roster = await this.roster.refresh();
        }
        if (opts.full) {
          this.running.step = 'ptr-full';
          report.ptr = await this.ptr.ingestAll({
            limitSurnames: opts.limitSurnames,
            onProgress: (d, t) => { if (this.running) this.running.progress = `${d}/${t} surnames`; },
          });
          this.running.step = 'renames';
          report.renames = await this.prices.refreshRenames();
        } else if (opts.latest) {
          this.running.step = 'ptr-latest';
          report.ptr = await this.ptr.ingestLatest(4);
        }
      }
      this.running.step = 'compute';
      report.compute = await this.recompute((p) => { if (this.running) this.running.progress = p; });
      this.running.step = 'unified';
      try {
        report.unified = await this.unified.rebuild();
      } catch (e: any) {
        this.log.warn(`unified rebuild failed: ${e?.message || e}`);
      }
      report.seconds = Math.round((Date.now() - t0) / 1000);
      await this.q(`INSERT INTO wt_meta (key, value, updated_at) VALUES ('last_run', $1, now()) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`, [JSON.stringify(report)]);
      this.log.log(`run done in ${report.seconds}s: ${JSON.stringify(report.compute)}`);
      return report;
    } finally {
      this.running = null;
    }
  }

  /** Fire-and-forget for the admin route; the status endpoint reports progress. */
  start(opts: Parameters<WealthTrackerService['run']>[0]): { started: boolean; running: any } {
    if (this.running) return { started: false, running: this.running };
    void this.run(opts).catch((e) => this.log.error(`run failed: ${e?.message || e}`));
    return { started: true, running: this.running };
  }

  // ── Reconstruction across the field ──────────────────────────────────────

  async recompute(progress?: (s: string) => void): Promise<any> {
    await this.ensureTables();
    const members = await this.roster.all();
    const trades = await this.ptr.allTrades();
    const byMember = new Map<string, StoredTrade[]>();
    for (const t of trades) {
      const arr = byMember.get(t.bioguide) || [];
      arr.push(t);
      byMember.set(t.bioguide, arr);
    }
    // Which tickers matter, and which are "hot" (held or traded recently).
    const tickers = new Set<string>();
    const hot = new Set<string>();
    const twoYearsAgo = Date.now() - 730 * DAY;
    for (const t of trades) {
      if (!t.ticker || t.assetClass !== 'stock') continue;
      tickers.add(t.ticker);
      if (dayMs(t.date) >= twoYearsAgo) hot.add(t.ticker);
    }
    progress?.(`prices: ${tickers.size} tickers`);
    const spySeries = await this.prices.ensureBenchmark();
    if (!spySeries) throw new Error('No benchmark series (SPY) — cannot build the calendar.');
    const priced = await this.prices.ensure(Array.from(tickers), hot, {
      onProgress: (d, t) => progress?.(`prices ${d}/${t}`),
    });
    const calendar = spySeries.t.filter((t) => t >= CALENDAR_FROM);
    const spyAligned = alignSeries({ t: spySeries.t, c: spySeries.c }, calendar);
    if (!spyAligned) throw new Error('Benchmark could not be aligned.');
    const todayIdx = calendar.length - 1;
    const todayMs = calendar[todayIdx];

    const alignedCache = new Map<string, Aligned | null>();
    const price = (ticker: string): Aligned | null => alignedCache.get(ticker) ?? null;
    const preload = async (syms: Iterable<string>) => {
      for (const s of syms) {
        if (alignedCache.has(s)) continue;
        const loaded = await this.prices.loadResolved(s);
        alignedCache.set(s, loaded ? alignSeries(loaded.series, calendar) : null);
      }
    };

    const stats: StatsRow[] = [];
    const nameByTicker = new Map<string, string>();
    for (const t of trades) if (t.ticker && t.assetDescription && !nameByTicker.has(t.ticker)) nameByTicker.set(t.ticker, t.assetDescription);
    const idx90 = indexDaysBefore(calendar, todayIdx, 90);
    const idx7 = indexDaysBefore(calendar, todayIdx, 7);
    const idxY = indexYearStart(calendar, todayIdx);
    const yearAgoMs = todayMs - 365 * DAY;
    const weekAgoMs = todayMs - 7 * DAY;

    let n = 0;
    await this.q(`DELETE FROM wt_trades WHERE transaction_date > current_date + 7 OR transaction_date < '2000-01-01'`);
    await this.q(`DELETE FROM wt_positions`);
    await this.q(`DELETE FROM wt_lots`);
    for (const m of members) {
      const mine = byMember.get(m.bioguide) || [];
      n++;
      if (n % 100 === 0) progress?.(`reconstruct ${n}/${members.length}`);
      if (!mine.length) continue;
      await preload(mine.filter((t) => t.ticker && t.assetClass === 'stock').map((t) => t.ticker as string));
      const out = reconstruct({ trades: mine, calendar, price, benchmark: spyAligned, todayIdx });
      const curve = out.curve;
      const last = curve[curve.length - 1];
      // Activity, over every row (options and bonds included).
      let trades12m = 0;
      let buys = 0;
      let lastTrade: string | null = null;
      let lagSum = 0;
      let lagN = 0;
      let flows7 = 0;
      for (const t of mine) {
        const ms = dayMs(t.date);
        if (ms >= yearAgoMs) trades12m++;
        if (t.side === 'buy') buys++;
        if (!lastTrade || t.date > lastTrade) lastTrade = t.date;
        // A "disclosure" more than 180 days after the trade is an amendment
        // or a re-filed report, not the member's filing speed; it counts as
        // a late filing, not toward the average.
        const lag = disclosureLagDays(t.date, t.disclosed);
        if (lag != null && lag <= 180) { lagSum += lag; lagN++; }
        if (ms >= weekAgoMs && t.ticker && t.assetClass === 'stock') {
          const mid = midpoint(t.amountMin, t.amountMax) || 0;
          if (t.side === 'buy') flows7 += mid;
          else if (t.side === 'sell') flows7 -= mid;
        }
      }
      const startedThisYear = curve.length ? curve[0].i > idxY : true;
      // No priced purchase ever → there is no portfolio to have a return.
      const priced = out.buysPriced > 0;
      const retAll = priced && last ? last.idx / 100 - 1 : null;
      // A window in which nothing was held is a flat line, not a 0% ranking.
      const heldIn = (fromIdx: number) => {
        const from = curve.find((p) => p.i >= fromIdx);
        return !!(from && (from.v > 0 || (last && last.v > 0)));
      };
      const ret90 = priced && heldIn(idx90) ? trailingReturn(curve, idx90) : null;
      const ret7 = priced && heldIn(idx7) ? trailingReturn(curve, idx7) : null;
      const retYtd = !priced ? null : startedThisYear ? retAll : heldIn(idxY) ? trailingReturn(curve, idxY) : null;
      const benchAll = last && curve[0].b > 0 ? last.b / curve[0].b - 1 : null;
      const bench90 = trailingBenchmark(curve, idx90);
      const benchYtd = startedThisYear ? benchAll : trailingBenchmark(curve, idxY);
      const weekPoint = curve.length && curve[0].i <= idx7 ? curve.find((p) => p.i >= idx7) || null : null;
      const wow = last && weekPoint ? last.v - weekPoint.v - flows7 : null;
      const pricedTrades = out.buysPriced + out.sellsPriced;
      const hitRate = out.hitSample >= 2 ? (out.hits / out.hitSample) * 100 : null;
      const row: StatsRow = {
        bioguide: m.bioguide,
        value: out.value,
        invested: out.investedCost,
        realized: out.realized,
        unrealized: out.unrealized,
        ret_all: retAll == null ? null : retAll * 100,
        ret_90d: ret90 == null ? null : ret90 * 100,
        ret_ytd: retYtd == null ? null : retYtd * 100,
        ret_7d: ret7 == null ? null : ret7 * 100,
        bench_all: benchAll == null ? null : benchAll * 100,
        bench_90d: bench90 == null ? null : bench90 * 100,
        bench_ytd: benchYtd == null ? null : benchYtd * 100,
        wow_change: wow,
        hit_rate: hitRate,
        hit_sample: out.hitSample,
        trades_total: mine.length,
        trades_12m: trades12m,
        buys_total: buys,
        priced_trades: pricedTrades,
        last_trade: lastTrade,
        avg_lag_days: lagN ? lagSum / lagN : null,
        holdings: out.positions.length,
        qualifies: pricedTrades >= BADGE_CONFIG.minTrades,
        grade: null,
        grade_pct: null,
        badges: [],
        top_holdings: out.positions.slice(0, 3).map((p) => ({ ticker: p.ticker, name: nameByTicker.get(p.ticker) || p.ticker, value: p.shares * p.price })),
        unpriced_buys: out.buysUnpriced,
        clamped_days: out.clampedDays,
        last10: [],
      };
      // Lots: what each priced buy has returned so far (realized part plus
      // what remains at today's price). Persisted for the last-10 strip.
      const lotByTrade = new Map(out.lots.map((l) => [l.tradeId, l]));
      const priceNow = (ticker: string): number | null => {
        const a = price(ticker);
        if (!a) return null;
        const p = a.c[Math.min(todayIdx, a.lastReal)];
        return p > 0 ? p : null;
      };
      const recent = [...mine].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).filter((t) => t.side === 'buy' || t.side === 'sell').slice(0, 10);
      row.last10 = recent.map((t) => {
        const lot = lotByTrade.get(t.id);
        let ret: number | null = null;
        if (lot) {
          const now = priceNow(lot.ticker);
          const cost = lot.shares * lot.costPerShare;
          if (cost > 0 && (lot.remaining <= 1e-9 || now != null)) ret = ((lot.soldProceeds + lot.remaining * (now || 0)) / cost - 1) * 100;
        }
        return { side: t.side as 'buy' | 'sell', ret, ticker: t.ticker || '', date: t.date };
      });
      if (out.lots.length) {
        for (let i = 0; i < out.lots.length; i += 500) {
          const chunk = out.lots.slice(i, i + 500);
          const values: any[] = [];
          const tuples = chunk.map((l, k) => {
            const b = k * 9;
            values.push(l.tradeId, m.bioguide, l.ticker, new Date(calendar[l.openIdx]).toISOString().slice(0, 10), l.shares, l.costPerShare, l.remaining, l.soldShares, l.soldProceeds);
            return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9})`;
          });
          await this.q(
            `INSERT INTO wt_lots (trade_id,bioguide,ticker,open_date,shares,cost_per_share,remaining,sold_shares,sold_proceeds) VALUES ${tuples.join(',')}
             ON CONFLICT (trade_id) DO UPDATE SET remaining = EXCLUDED.remaining, sold_shares = EXCLUDED.sold_shares, sold_proceeds = EXCLUDED.sold_proceeds, computed_at = now()`,
            values,
          );
        }
      }
      stats.push(row);
      // Positions.
      if (out.positions.length) {
        const values: any[] = [];
        const tuples = out.positions.map((p, k) => {
          const b = k * 15;
          values.push(
            m.bioguide, p.ticker, (nameByTicker.get(p.ticker) || p.ticker).slice(0, 200), p.shares, p.costBasis, p.avgCost, p.price,
            new Date(calendar[p.priceIdx]).toISOString().slice(0, 10), p.shares * p.price, p.shares * p.price - p.costBasis, p.realized,
            p.buys, p.sells, p.firstBoughtIdx >= 0 ? new Date(calendar[p.firstBoughtIdx]).toISOString().slice(0, 10) : null,
            p.lastActionIdx >= 0 ? new Date(calendar[p.lastActionIdx]).toISOString().slice(0, 10) : null,
          );
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},'${p.status}')`;
        });
        await this.q(
          `INSERT INTO wt_positions (bioguide,ticker,name,shares,cost_basis,avg_cost,price,price_as_of,value,unrealized,realized,buys,sells,first_bought,last_action,status)
           VALUES ${tuples.join(',')} ON CONFLICT (bioguide, ticker) DO UPDATE SET name = EXCLUDED.name, shares = EXCLUDED.shares, cost_basis = EXCLUDED.cost_basis,
           avg_cost = EXCLUDED.avg_cost, price = EXCLUDED.price, price_as_of = EXCLUDED.price_as_of, value = EXCLUDED.value, unrealized = EXCLUDED.unrealized,
           realized = EXCLUDED.realized, buys = EXCLUDED.buys, sells = EXCLUDED.sells, first_bought = EXCLUDED.first_bought, last_action = EXCLUDED.last_action,
           status = EXCLUDED.status, computed_at = now()`,
          values,
        );
      }
      // Curve, thinned for transport; [t, value, index, benchmark].
      const compact = thinCurve(curve, CURVE_MAX_POINTS).map((p: CurvePoint) => [calendar[p.i], Math.round(p.v), +p.idx.toFixed(3), +p.b.toFixed(3)]);
      await this.q(
        `INSERT INTO wt_curves (bioguide, points, computed_at) VALUES ($1, $2::jsonb, now()) ON CONFLICT (bioguide) DO UPDATE SET points = EXCLUDED.points, computed_at = now()`,
        [m.bioguide, JSON.stringify(compact)],
      );
    }

    // Grades and badges need the whole field.
    // §4.3 roster governance: a member earns a grade from their add-date
    // forward. `added_at` is written once and never rewritten, so this is a
    // real floor rather than a restatement of "today".
    const addedAt = new Map(members.map((m) => [m.bioguide, m.added_at ? new Date(m.added_at).getTime() : null]));
    const inception = await this.roster.inception();
    // A member on the roster when the tracker started is tracked from
    // inception; one added later serves the window. Without the inception
    // exemption the rule blanks every grade on launch day, which is the
    // letter of §4.3 against its purpose.
    const FOUNDING_WINDOW = 2 * DAY;
    const trackedLongEnough = (bioguide: string): boolean => {
      const t = addedAt.get(bioguide);
      if (t == null) return true;
      if (inception != null && t - inception <= FOUNDING_WINDOW) return true;
      return Date.now() - t >= MIN_TRACKED_DAYS * DAY;
    };
    const grades = gradeCongress(stats.map((s) => ({
      key: s.bioguide, qualifies: s.qualifies, retAll: s.ret_all, hitRate: s.hit_rate,
      trades12m: s.trades_12m, avgLagDays: s.avg_lag_days, trackedLongEnough: trackedLongEnough(s.bioguide),
    })));
    for (const s of stats) {
      const g = grades.get(s.bioguide);
      s.grade = g?.grade || null;
      s.grade_pct = g?.percentile ?? null;
    }
    const badges = awardBadges(stats.map((s) => ({
      key: s.bioguide, qualifies: s.qualifies, retAll: s.ret_all, ret90d: s.ret_90d, hitRate: s.hit_rate, hitSample: s.hit_sample,
      trades12m: s.trades_12m, tradesTotal: s.trades_total, avgLagDays: s.avg_lag_days, grade: s.grade,
      trackedLongEnough: trackedLongEnough(s.bioguide),
    })));
    for (const s of stats) s.badges = badges.get(s.bioguide) || [];

    await this.q(`DELETE FROM wt_member_stats`);
    for (let i = 0; i < stats.length; i += 200) {
      const chunk = stats.slice(i, i + 200);
      const values: any[] = [];
      const tuples = chunk.map((s, k) => {
        const b = k * 31;
        values.push(
          s.bioguide, s.value, s.invested, s.realized, s.unrealized, s.ret_all, s.ret_90d, s.ret_ytd, s.ret_7d, s.bench_all, s.bench_90d, s.bench_ytd,
          s.wow_change, s.hit_rate, s.hit_sample, s.trades_total, s.trades_12m, s.buys_total, s.priced_trades, s.last_trade, s.avg_lag_days,
          s.holdings, s.qualifies, s.grade, s.grade_pct, JSON.stringify(s.badges), JSON.stringify(s.top_holdings), s.unpriced_buys, s.clamped_days, new Date().toISOString(),
          JSON.stringify(s.last10),
        );
        return `(${Array.from({ length: 31 }, (_, j) => `$${b + j + 1}`).join(',')})`;
      });
      await this.q(
        `INSERT INTO wt_member_stats (bioguide,value,invested,realized,unrealized,ret_all,ret_90d,ret_ytd,ret_7d,bench_all,bench_90d,bench_ytd,wow_change,hit_rate,hit_sample,
          trades_total,trades_12m,buys_total,priced_trades,last_trade,avg_lag_days,holdings,qualifies,grade,grade_pct,badges,top_holdings,unpriced_buys,clamped_days,computed_at,last10)
         VALUES ${tuples.join(',')}`,
        values,
      );
    }
    const graded = stats.filter((s) => s.grade).length;
    return {
      members: members.length,
      withTrades: stats.length,
      graded,
      qualifying: stats.filter((s) => s.qualifies).length,
      tickers: tickers.size,
      pricesFetched: priced.fetched,
      unpricedTickers: priced.unpriced.length,
      calendarTo: new Date(todayMs).toISOString().slice(0, 10),
    };
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  private memberShape(r: any) {
    const age = ageOn(r.birthday ? new Date(r.birthday).toISOString().slice(0, 10) : null);
    return {
      bioguide: r.bioguide,
      name: r.fmp_name || r.name,
      displayName: r.name,
      slug: encodeURIComponent(r.fmp_name || r.name),
      party: r.party,
      chamber: r.chamber,
      state: r.state,
      district: r.district,
      age,
      ageBracket: ageBracket(age),
      current: !!r.current,
      trackedSince: r.tracked_since ? new Date(r.tracked_since).toISOString().slice(0, 10) : null,
      photoUrl: r.photo_url,
    };
  }

  private statsShape(r: any) {
    const num = (v: any) => (v == null ? null : Number(v));
    return {
      value: Number(r.value) || 0,
      invested: Number(r.invested) || 0,
      realized: Number(r.realized) || 0,
      unrealized: Number(r.unrealized) || 0,
      retAll: num(r.ret_all),
      ret90d: num(r.ret_90d),
      retYtd: num(r.ret_ytd),
      ret7d: num(r.ret_7d),
      benchAll: num(r.bench_all),
      bench90d: num(r.bench_90d),
      benchYtd: num(r.bench_ytd),
      wowChange: num(r.wow_change),
      hitRate: num(r.hit_rate),
      hitSample: Number(r.hit_sample) || 0,
      tradesTotal: Number(r.trades_total) || 0,
      trades12m: Number(r.trades_12m) || 0,
      buysTotal: Number(r.buys_total) || 0,
      pricedTrades: Number(r.priced_trades) || 0,
      lastTrade: r.last_trade ? new Date(r.last_trade).toISOString().slice(0, 10) : null,
      avgLagDays: num(r.avg_lag_days),
      holdings: Number(r.holdings) || 0,
      qualifies: !!r.qualifies,
      grade: r.grade || null,
      trackedLongEnough: r.tracked_long_enough == null ? true : !!r.tracked_long_enough,
      badges: (r.badges || []) as BadgeKey[],
      topHoldings: r.top_holdings || [],
      unpricedBuys: Number(r.unpriced_buys) || 0,
      last10: r.last10 || [],
      computedAt: r.computed_at,
    };
  }

  async leaderboard(f: LeaderboardFilters) {
    await this.ensureTables();
    const where: string[] = ['s.trades_total > 0'];
    const params: any[] = [];
    const add = (sql: string, v: any) => { params.push(v); return sql.replace('?', `$${params.length}`); };
    if (!f.includeFormer) where.push('m.current = true');
    if (f.party && /^[DRI]$/.test(f.party)) where.push(add('m.party = ?', f.party));
    if (f.chamber === 'House' || f.chamber === 'Senate') where.push(add('m.chamber = ?', f.chamber));
    if (f.age) {
      const ageExpr = `date_part('year', age(m.birthday))`;
      if (f.age === 'lt50') where.push(`${ageExpr} < 50`);
      else if (f.age === '50-64') where.push(`${ageExpr} BETWEEN 50 AND 64`);
      else if (f.age === '65-74') where.push(`${ageExpr} BETWEEN 65 AND 74`);
      else if (f.age === '75plus') where.push(`${ageExpr} >= 75`);
    }
    if (f.activity === 'none') where.push('s.trades_12m = 0');
    else if (f.activity === 'low') where.push('s.trades_12m BETWEEN 1 AND 9');
    else if (f.activity === 'mid') where.push('s.trades_12m BETWEEN 10 AND 49');
    else if (f.activity === 'high') where.push('s.trades_12m >= 50');
    if (f.recency) where.push(`s.last_trade >= current_date - ${f.recency === '7d' ? 7 : f.recency === '30d' ? 30 : 90}`);
    if (f.returnBand === 'neg') where.push('s.ret_all < 0');
    else if (f.returnBand === 'flat') where.push('s.ret_all BETWEEN 0 AND 10');
    else if (f.returnBand === 'up') where.push('s.ret_all > 10 AND s.ret_all <= 50');
    else if (f.returnBand === 'strong') where.push('s.ret_all > 50');
    if (f.hitBand === 'lt40') where.push('s.hit_rate < 40');
    else if (f.hitBand === '40-60') where.push('s.hit_rate >= 40 AND s.hit_rate < 60');
    else if (f.hitBand === '60-70') where.push('s.hit_rate >= 60 AND s.hit_rate < 70');
    else if (f.hitBand === 'gte70') where.push('s.hit_rate >= 70');
    if (f.q) where.push(add(`(m.name ILIKE ? OR m.fmp_name ILIKE $${params.length + 1} OR m.state ILIKE $${params.length + 1})`, `%${f.q}%`));

    // Each view has its own qualifying rule and default sort (§2.2).
    const view = VIEWS.includes(f.view) ? f.view : 'growth90d';
    let metric = 's.ret_90d';
    if (view === 'growth90d') { where.push('s.ret_90d IS NOT NULL'); metric = 's.ret_90d'; }
    if (view === 'ytd') { where.push('s.ret_ytd IS NOT NULL'); metric = 's.ret_ytd'; }
    if (view === 'alltime') { where.push('s.qualifies = true AND s.ret_all IS NOT NULL'); metric = 's.ret_all'; }
    if (view === 'hitrate') { where.push(`s.hit_sample >= ${BADGE_CONFIG.minTrades} AND s.hit_rate IS NOT NULL`); metric = 's.hit_rate'; }
    if (view === 'active') { where.push('s.trades_12m > 0'); metric = 's.trades_12m'; }
    if (view === 'movers') { where.push('s.wow_change IS NOT NULL AND s.value > 0'); metric = 'abs(s.wow_change)'; }
    const SORTS: Record<string, string> = {
      metric, name: 'm.last', value: 's.value', ret90d: 's.ret_90d', retYtd: 's.ret_ytd', retAll: 's.ret_all', hitRate: 's.hit_rate',
      trades12m: 's.trades_12m', wowChange: 's.wow_change', lastTrade: 's.last_trade', age: 'm.birthday', grade: 's.grade_pct',
    };
    const sortCol = SORTS[f.sort || 'metric'] || metric;
    const dir = f.dir === 'asc' ? 'ASC' : 'DESC';
    const limit = Math.min(Math.max(Number(f.limit) || 100, 1), 600);
    const offset = Math.max(Number(f.offset) || 0, 0);
    const rows = await this.q<any[]>(
      `SELECT m.*, s.*, ${metric} AS metric, count(*) OVER() AS total
       FROM wt_member_stats s JOIN wt_members m ON m.bioguide = s.bioguide
       WHERE ${where.join(' AND ')}
       ORDER BY ${sortCol} ${dir} NULLS LAST, m.last ASC
       LIMIT ${limit} OFFSET ${offset}`,
      params,
    );
    const meta = (await this.q<any[]>(`SELECT max(computed_at) AS computed_at, count(*)::int AS n FROM wt_member_stats`))[0];
    return {
      view,
      total: rows[0]?.total ? Number(rows[0].total) : 0,
      rows: rows.map((r, i) => ({
        rank: offset + i + 1,
        member: this.memberShape(r),
        stats: this.statsShape(r),
        metric: r.metric == null ? null : Number(r.metric),
      })),
      frame: STANDING_FRAME,
      estimateNote: ESTIMATE_NOTE,
      badgeMeta: BADGE_META,
      minTrades: BADGE_CONFIG.minTrades,
      computedAt: meta?.computed_at || null,
      membersTracked: meta?.n || 0,
    };
  }

  async member(nameOrBioguide: string, opts: { allHoldings: boolean }) {
    await this.ensureTables();
    const bioguide = await this.roster.resolve(nameOrBioguide);
    if (!bioguide) return null;
    const m = (await this.q<any[]>(`SELECT m.*, s.* FROM wt_members m LEFT JOIN wt_member_stats s ON s.bioguide = m.bioguide WHERE m.bioguide = $1`, [bioguide]))[0];
    if (!m) return null;
    const holdings = await this.q<any[]>(`SELECT p.*, c.name AS company_name, c.sector FROM wt_positions p LEFT JOIN companies c ON upper(c.ticker) = p.ticker WHERE p.bioguide = $1 ORDER BY p.value DESC`, [bioguide]);
    const curveRow = (await this.q<any[]>(`SELECT points FROM wt_curves WHERE bioguide = $1`, [bioguide]))[0];
    const points: number[][] = curveRow?.points || [];
    const total = holdings.length;
    const FREE_HOLDINGS = 5;
    const shown = opts.allHoldings ? holdings : holdings.slice(0, FREE_HOLDINGS);
    return {
      member: this.memberShape(m),
      stats: m.trades_total != null ? this.statsShape(m) : null,
      holdings: shown.map((h) => ({
        ticker: h.ticker,
        name: h.company_name || h.name,
        sector: h.sector || null,
        shares: Number(h.shares),
        costBasis: Number(h.cost_basis),
        avgCost: Number(h.avg_cost),
        price: Number(h.price),
        priceAsOf: new Date(h.price_as_of).toISOString().slice(0, 10),
        value: Number(h.value),
        unrealized: Number(h.unrealized),
        unrealizedPct: Number(h.cost_basis) > 0 ? (Number(h.unrealized) / Number(h.cost_basis)) * 100 : null,
        realized: Number(h.realized),
        buys: Number(h.buys),
        sells: Number(h.sells),
        firstBought: h.first_bought ? new Date(h.first_bought).toISOString().slice(0, 10) : null,
        lastAction: h.last_action ? new Date(h.last_action).toISOString().slice(0, 10) : null,
        status: h.status,
      })),
      holdingsTotal: total,
      holdingsFree: FREE_HOLDINGS,
      holdingsLocked: !opts.allHoldings && total > FREE_HOLDINGS,
      /** [{t, s, b}] indexed to 100 — the BacktestChart shape; `v` is the est. value. */
      curve: points.map((p) => ({ t: p[0], v: p[1], s: p[2], b: p[3] })),
      benchmark: BENCHMARK,
      frame: STANDING_FRAME,
      estimateNote: ESTIMATE_NOTE,
      badgeMeta: BADGE_META,
    };
  }

  /** CSV of every holding — Premium export. */
  async holdingsCsv(nameOrBioguide: string): Promise<{ filename: string; csv: string } | null> {
    const data = await this.member(nameOrBioguide, { allHoldings: true });
    if (!data) return null;
    const esc = (v: any) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const head = ['ticker', 'name', 'est_shares', 'est_cost_basis', 'est_avg_cost', 'price', 'price_as_of', 'est_value', 'est_unrealized', 'est_unrealized_pct', 'est_realized', 'buys', 'sells', 'first_bought', 'last_action', 'status'];
    const lines = [head.join(',')];
    for (const h of data.holdings) {
      lines.push([h.ticker, h.name, h.shares.toFixed(2), h.costBasis.toFixed(2), h.avgCost.toFixed(4), h.price.toFixed(4), h.priceAsOf, h.value.toFixed(2), h.unrealized.toFixed(2),
        h.unrealizedPct == null ? '' : h.unrealizedPct.toFixed(2), h.realized.toFixed(2), h.buys, h.sells, h.firstBought || '', h.lastAction || '', h.status].map(esc).join(','));
    }
    lines.push('');
    lines.push(esc(`Estimates from disclosed trades (range midpoints). ${ESTIMATE_NOTE}`));
    return { filename: `${data.member.name.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-disclosed-holdings.csv`, csv: lines.join('\n') };
  }

  async summary() {
    await this.ensureTables();
    const counts = await this.ptr.counts();
    const s = (await this.q<any[]>(`SELECT count(*)::int AS members, count(*) FILTER (WHERE qualifies)::int AS qualifying, count(*) FILTER (WHERE grade IS NOT NULL)::int AS graded,
      max(computed_at) AS computed_at FROM wt_member_stats`))[0];
    const meta = (await this.q<any[]>(`SELECT value, updated_at FROM wt_meta WHERE key = 'last_run'`))[0];
    return { trades: counts, stats: s, lastRun: meta ? { ...JSON.parse(meta.value || '{}'), at: meta.updated_at } : null, running: this.running };
  }
}
