import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { BacktestResult, BacktestStats, EquityPoint } from '../backtest/backtest.service';

/**
 * George 2026-09-21: "I want to make a backtest of stocks that have spent
 * money on stock promotions. Let's understand how these stocks have
 * performed historically."
 *
 * Two readings of the same disclosed-agreement record (ir_agreements, the
 * TSXV Policy 3.4 / CSE news releases we ingest):
 *
 *   1. EVENT STUDY — for every issuer-start (an issuer beginning promotion on
 *      a date; several providers signed the same day count once), the share
 *      price return from the first session on or after the start date to
 *      30 / 60 / 90 / 180 / 365 calendar days later, against the S&P/TSX 60
 *      (XIU.TO) over the identical window. A horizon that has not elapsed is
 *      not reported. Returns are clamped to [-95%, +300%] so one bad venture
 *      print cannot dominate a mean; medians and win rates are also given
 *      because the mean of micro-cap returns is a poor summary on its own.
 *
 *   2. PORTFOLIO — every Monday, hold (equal weight) every promoted stock
 *      whose contract started within the last 90 days and has a price; hold
 *      a week; rebalance. Same statistics as the insider-strategy backtest so
 *      the two curves read alike. Starts where coverage becomes sustained.
 *
 * A start date in the future is excluded: two rows carry one (a parse
 * artifact off a term sentence), and an engagement that has not begun cannot
 * be measured — it would also make the coverage line claim a record running
 * into next year.
 *
 * Honesty about the record: it is what we have ingested, weighted heavily
 * to 2025–2026 with a thin tail back to 2018, and FMP prices roughly half of
 * these venture issuers. The response says how many contracts, events and
 * issuers went in and how many had prices, so the reader can weigh the
 * result. Nothing is estimated for a stock we cannot price.
 */

const DAY = 86_400_000;
const WEEK = 7 * DAY;
const HORIZONS = [30, 60, 90, 180, 365] as const;
const HOLD_DAYS = 90;
const BENCHMARK = 'XIU.TO';
const BENCHMARK_LABEL = 'S&P/TSX 60 (XIU.TO)';
/** A start or horizon date must find a session within this many days. */
const MAX_GAP_DAYS = 10;
const CLAMP_LO = -0.95;
const CLAMP_HI = 3;
const RESULT_TTL_MS = 24 * 60 * 60_000;

type Horizon = (typeof HORIZONS)[number];

interface Bar {
  t: number;
  date: string;
  c: number;
}

interface Event {
  ticker: string;
  issuer: string | null;
  exchange: string | null;
  start: string;
  startMs: number;
  monthlyFeeCad: number | null;
  providers: string[];
  symbol: string | null;
  agreementIds: number[];
}

export interface HorizonRow {
  days: Horizon;
  n: number;
  mean: number;
  median: number;
  winRate: number;
  benchMean: number;
  meanExcess: number;
  medianExcess: number;
  beatRate: number;
}

export interface BucketRow {
  bucket: string;
  n: number;
  median: number;
  mean: number;
  winRate: number;
  medianExcess: number;
}

export interface EventRow {
  ticker: string;
  issuer: string | null;
  exchange: string | null;
  start: string;
  monthlyFeeCad: number | null;
  providers: number;
  r30: number | null;
  r90: number | null;
  bench90: number | null;
  rNow: number | null;
}

export interface PromoterBacktestResult {
  ready: boolean;
  note?: string;
  computedAt?: string;
  benchmark: string;
  benchmarkLabel: string;
  coverage: {
    contracts: number;
    events: number;
    pricedEvents: number;
    issuers: number;
    pricedIssuers: number;
    firstStart: string | null;
    lastStart: string | null;
    byYear: Array<{ year: string; events: number; priced: number }>;
  };
  horizons: HorizonRow[];
  byFee: BucketRow[];
  byExchange: BucketRow[];
  histogram90: Array<{ label: string; n: number }>;
  best90: EventRow[];
  worst90: EventRow[];
  portfolio: BacktestResult;
}

const pct = (x: number) => Math.round(x * 1000) / 10;
const median = (xs: number[]): number => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const mean = (xs: number[]): number => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const clamp = (r: number) => Math.max(CLAMP_LO, Math.min(CLAMP_HI, r));

/** First close ON OR AFTER `ms`, within MAX_GAP_DAYS; null otherwise. */
function closeOnOrAfter(bars: Bar[], ms: number): number | null {
  const limit = ms + MAX_GAP_DAYS * DAY;
  for (const b of bars) {
    if (b.t >= ms) return b.t <= limit ? b.c : null;
  }
  return null;
}
/** Last close ON OR BEFORE `ms` (for the weekly portfolio walk). */
function closeOn(bars: Bar[], ms: number): number | null {
  let best: number | null = null;
  for (const b of bars) {
    if (b.t <= ms) best = b.c;
    else break;
  }
  return best;
}

@Injectable()
export class PromoterBacktestService {
  private readonly log = new Logger(PromoterBacktestService.name);
  private cache: { ts: number; data: PromoterBacktestResult } | null = null;
  private inflight: Promise<PromoterBacktestResult> | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  /** Cached result, or kick off the computation and say so. */
  async get(): Promise<PromoterBacktestResult> {
    if (this.cache && Date.now() - this.cache.ts < RESULT_TTL_MS) return this.cache.data;
    if (!this.inflight) {
      this.inflight = this.build()
        .then((data) => {
          this.cache = { ts: Date.now(), data };
          return data;
        })
        .finally(() => {
          this.inflight = null;
        });
    }
    // First caller after a cold start waits up to ~25s; later callers poll.
    const timeout = new Promise<PromoterBacktestResult>((resolve) =>
      setTimeout(
        () =>
          resolve({
            ready: false,
            note: 'Pricing every promoted issuer from the contract start date. This takes a minute on first load.',
            benchmark: BENCHMARK,
            benchmarkLabel: BENCHMARK_LABEL,
            coverage: { contracts: 0, events: 0, pricedEvents: 0, issuers: 0, pricedIssuers: 0, firstStart: null, lastStart: null, byYear: [] },
            horizons: [],
            byFee: [],
            byExchange: [],
            histogram90: [],
            best90: [],
            worst90: [],
            portfolio: { ready: false, curve: [], stats: null, rules: { holdings: 0, rebalance: 'Weekly', lookbackDays: HOLD_DAYS, benchmark: BENCHMARK } },
          }),
        25_000,
      ),
    );
    return Promise.race([this.inflight, timeout]);
  }

  async refresh(): Promise<PromoterBacktestResult> {
    this.cache = null;
    return this.get();
  }

  private async build(): Promise<PromoterBacktestResult> {
    const rows: any[] = await this.q(
      `SELECT a.id, a.ticker, a.exchange, COALESCE(i.name, a.issuer_name) AS issuer_name, a.provider_name,
              a.start_date, a.monthly_fee_cad::float8 AS monthly_fee_cad,
              i.fmp_symbol, i.exchange AS issuer_exchange
         FROM ir_agreements a
         LEFT JOIN ir_issuers i ON i.ticker = a.ticker
        WHERE a.start_date IS NOT NULL
          AND a.start_date <= CURRENT_DATE
          AND a.provider_slug IS NOT NULL
          AND a.status <> 'rejected'
        ORDER BY a.start_date ASC`,
    );
    // One event per issuer-start.
    const byKey = new Map<string, Event>();
    for (const r of rows) {
      const start = new Date(r.start_date).toISOString().slice(0, 10);
      const key = `${r.ticker}|${start}`;
      const ev =
        byKey.get(key) ||
        ({
          ticker: String(r.ticker).toUpperCase(),
          issuer: r.issuer_name || null,
          exchange: r.issuer_exchange || r.exchange || null,
          start,
          startMs: Date.parse(start),
          monthlyFeeCad: null,
          providers: [],
          symbol: r.fmp_symbol || null,
          agreementIds: [],
        } as Event);
      if (r.monthly_fee_cad != null) ev.monthlyFeeCad = (ev.monthlyFeeCad ?? 0) + Number(r.monthly_fee_cad);
      if (r.provider_name && !ev.providers.includes(r.provider_name)) ev.providers.push(r.provider_name);
      ev.agreementIds.push(Number(r.id));
      byKey.set(key, ev);
    }
    const events = [...byKey.values()].sort((a, b) => a.startMs - b.startMs);
    const today = new Date().toISOString().slice(0, 10);
    const earliest = events.length ? events[0].start : today;
    const from = new Date(Date.parse(earliest) - 45 * DAY).toISOString().slice(0, 10);

    // Prices: one series per issuer symbol, plus the benchmark.
    const bars = new Map<string, Bar[]>();
    const fetchBars = async (symbol: string): Promise<Bar[]> => {
      try {
        const raw = await this.fmp.getEodBars(symbol, { from, adjusted: true });
        return raw
          .filter((b) => b.close > 0)
          .map((b) => ({ date: b.date.slice(0, 10), t: Date.parse(b.date.slice(0, 10)), c: b.close }))
          .sort((a, b) => a.t - b.t);
      } catch (e: any) {
        this.log.debug(`bars failed for ${symbol}: ${e?.message || e}`);
        return [];
      }
    };
    const symbols = Array.from(new Set(events.map((e) => e.symbol).filter((s): s is string => !!s)));
    const CONCURRENCY = 5;
    for (let i = 0; i < symbols.length; i += CONCURRENCY) {
      const slice = symbols.slice(i, i + CONCURRENCY);
      const got = await Promise.all(slice.map((s) => fetchBars(s)));
      slice.forEach((s, j) => bars.set(s, got[j]));
    }
    const bench = await fetchBars(BENCHMARK);
    const lastBench = bench.length ? bench[bench.length - 1].t : 0;

    // ── Event study ────────────────────────────────────────────────────
    type Priced = Event & { startPrice: number; series: Bar[]; last: Bar; r: Partial<Record<Horizon, number>>; b: Partial<Record<Horizon, number>>; rNow: number };
    const priced: Priced[] = [];
    for (const ev of events) {
      const series = ev.symbol ? bars.get(ev.symbol) || [] : [];
      if (!series.length) continue;
      const startPrice = closeOnOrAfter(series, ev.startMs);
      const b0 = closeOnOrAfter(bench, ev.startMs);
      if (startPrice == null || !(startPrice > 0)) continue;
      const last = series[series.length - 1];
      const r: Partial<Record<Horizon, number>> = {};
      const b: Partial<Record<Horizon, number>> = {};
      for (const h of HORIZONS) {
        const at = ev.startMs + h * DAY;
        if (at > last.t || at > lastBench) continue;
        const p = closeOnOrAfter(series, at);
        const bp = closeOnOrAfter(bench, at);
        if (p == null) continue;
        r[h] = clamp(p / startPrice - 1);
        if (bp != null && b0 != null && b0 > 0) b[h] = bp / b0 - 1;
      }
      priced.push({ ...ev, startPrice, series, last, r, b, rNow: clamp(last.c / startPrice - 1) });
    }

    const horizons: HorizonRow[] = HORIZONS.map((h) => {
      const rs = priced.filter((p) => p.r[h] != null);
      const both = rs.filter((p) => p.b[h] != null);
      const ex = both.map((p) => (p.r[h] as number) - (p.b[h] as number));
      return {
        days: h,
        n: rs.length,
        mean: pct(mean(rs.map((p) => p.r[h] as number))),
        median: pct(median(rs.map((p) => p.r[h] as number))),
        winRate: rs.length ? pct(rs.filter((p) => (p.r[h] as number) > 0).length / rs.length) : 0,
        benchMean: pct(mean(both.map((p) => p.b[h] as number))),
        meanExcess: pct(mean(ex)),
        medianExcess: pct(median(ex)),
        beatRate: both.length ? pct(ex.filter((x) => x > 0).length / both.length) : 0,
      };
    });

    const bucketRows = (label: (p: Priced) => string, order: string[]): BucketRow[] =>
      order
        .map((bucket) => {
          const rs = priced.filter((p) => p.r[90] != null && label(p) === bucket);
          const ex = rs.filter((p) => p.b[90] != null).map((p) => (p.r[90] as number) - (p.b[90] as number));
          return {
            bucket,
            n: rs.length,
            median: pct(median(rs.map((p) => p.r[90] as number))),
            mean: pct(mean(rs.map((p) => p.r[90] as number))),
            winRate: rs.length ? pct(rs.filter((p) => (p.r[90] as number) > 0).length / rs.length) : 0,
            medianExcess: pct(median(ex)),
          };
        })
        .filter((b) => b.n > 0);
    const feeBucket = (p: Priced) =>
      p.monthlyFeeCad == null ? 'Fee not disclosed' : p.monthlyFeeCad < 5000 ? 'Under C$5k / month' : p.monthlyFeeCad < 15000 ? 'C$5k–15k / month' : 'C$15k+ / month';
    const exBucket = (p: Priced) => (p.exchange === 'TSXV' ? 'TSX Venture' : p.exchange === 'CSE' ? 'CSE' : 'Other');
    const byFee = bucketRows(feeBucket, ['Under C$5k / month', 'C$5k–15k / month', 'C$15k+ / month', 'Fee not disclosed']);
    const byExchange = bucketRows(exBucket, ['TSX Venture', 'CSE', 'Other']);

    const bins: Array<[string, number, number]> = [
      ['−95% to −50%', -1, -0.5],
      ['−50% to −25%', -0.5, -0.25],
      ['−25% to 0%', -0.25, 0],
      ['0% to +25%', 0, 0.25],
      ['+25% to +50%', 0.25, 0.5],
      ['+50% to +100%', 0.5, 1],
      ['Over +100%', 1, Infinity],
    ];
    const r90s = priced.filter((p) => p.r[90] != null).map((p) => p.r[90] as number);
    const histogram90 = bins.map(([label, lo, hi]) => ({ label, n: r90s.filter((r) => r >= lo && r < hi).length }));

    const toRow = (p: Priced): EventRow => ({
      ticker: p.ticker,
      issuer: p.issuer,
      exchange: p.exchange,
      start: p.start,
      monthlyFeeCad: p.monthlyFeeCad,
      providers: p.providers.length,
      r30: p.r[30] != null ? pct(p.r[30] as number) : null,
      r90: p.r[90] != null ? pct(p.r[90] as number) : null,
      bench90: p.b[90] != null ? pct(p.b[90] as number) : null,
      rNow: pct(p.rNow),
    });
    const with90 = priced.filter((p) => p.r[90] != null).sort((a, b) => (b.r[90] as number) - (a.r[90] as number));
    const best90 = with90.slice(0, 8).map(toRow);
    const worst90 = with90.slice(-8).reverse().map(toRow);

    // ── Portfolio: hold each promoted stock for 90 days from its start ─
    const portfolio = this.runPortfolio(priced, bench);

    const years = new Map<string, { events: number; priced: number }>();
    for (const ev of events) {
      const y = ev.start.slice(0, 4);
      const cur = years.get(y) || { events: 0, priced: 0 };
      cur.events++;
      if (priced.some((p) => p.ticker === ev.ticker && p.start === ev.start)) cur.priced++;
      years.set(y, cur);
    }

    const result: PromoterBacktestResult = {
      ready: true,
      computedAt: new Date().toISOString(),
      benchmark: BENCHMARK,
      benchmarkLabel: BENCHMARK_LABEL,
      coverage: {
        contracts: rows.length,
        events: events.length,
        pricedEvents: priced.length,
        issuers: new Set(events.map((e) => e.ticker)).size,
        pricedIssuers: new Set(priced.map((p) => p.ticker)).size,
        firstStart: events[0]?.start ?? null,
        lastStart: events[events.length - 1]?.start ?? null,
        byYear: [...years.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, v]) => ({ year, ...v })),
      },
      horizons,
      byFee,
      byExchange,
      histogram90,
      best90,
      worst90,
      portfolio,
    };
    this.log.log(
      `promoter backtest: ${rows.length} contracts → ${events.length} events, ${priced.length} priced; 90d median ${horizons[2]?.median}% (n=${horizons[2]?.n}), win ${horizons[2]?.winRate}%`,
    );
    return result;
  }

  private runPortfolio(priced: Array<Event & { series: Bar[] }>, bench: Bar[]): BacktestResult {
    const empty: BacktestResult = {
      ready: true,
      curve: [],
      stats: null,
      rules: { holdings: 0, rebalance: 'Weekly', lookbackDays: HOLD_DAYS, benchmark: BENCHMARK },
      note: 'Not enough priced contracts for a portfolio curve.',
    };
    if (priced.length < 3 || bench.length < 10) return empty;
    // Mondays from the first start to the last benchmark session.
    const first = new Date(Math.min(...priced.map((p) => p.startMs)));
    const day = first.getUTCDay();
    const firstMonday = first.getTime() - ((day + 6) % 7) * DAY;
    const end = bench[bench.length - 1].t;
    const weeks: number[] = [];
    for (let t = firstMonday; t <= end; t += WEEK) weeks.push(t);
    if (weeks.length < 10) return empty;
    const holdingsAt = (ms: number) => priced.filter((p) => p.startMs <= ms && ms < p.startMs + HOLD_DAYS * DAY);
    const held = weeks.map((w) => holdingsAt(w).filter((p) => closeOn(p.series, w) != null).length);
    // Start where coverage is sustained: ≥2 priced holdings in ≥80% of the
    // following 26 weeks (the record is thin before 2025).
    const MIN_HELD = 2;
    const WIN = 26;
    let startIdx = 0;
    for (let i = 0; i < weeks.length; i++) {
      if (i > weeks.length - 9) {
        startIdx = i;
        break;
      }
      const stop = Math.min(weeks.length, i + WIN);
      let ok = 0;
      for (let j = i; j < stop; j++) if (held[j] >= MIN_HELD) ok++;
      if (ok / (stop - i) >= 0.8) {
        startIdx = i;
        break;
      }
    }
    const W = weeks.slice(startIdx);
    if (W.length < 9) return empty;
    let equity = 100;
    let benchEq = 100;
    const curve: EquityPoint[] = [{ t: W[0], s: 100, b: 100 }];
    const weekly: number[] = [];
    const benchWeekly: number[] = [];
    let wins = 0, losses = 0, winSum = 0, lossSum = 0, trades = 0, maxHeld = 0;
    for (let i = 0; i < W.length - 1; i++) {
      const open = W[i];
      const close = W[i + 1];
      const rets: number[] = [];
      for (const p of holdingsAt(open)) {
        const p0 = closeOn(p.series, open);
        const p1 = closeOn(p.series, close);
        if (p0 == null || p1 == null || !(p0 > 0) || !(p1 > 0)) continue;
        rets.push(Math.max(-0.9, Math.min(2, p1 / p0 - 1)));
        trades++;
      }
      maxHeld = Math.max(maxHeld, rets.length);
      const b0 = closeOn(bench, open);
      const b1 = closeOn(bench, close);
      const bRet = b0 != null && b1 != null && b0 > 0 ? b1 / b0 - 1 : 0;
      const sRet = rets.length ? mean(rets) : 0;
      equity *= 1 + sRet;
      benchEq *= 1 + bRet;
      weekly.push(sRet);
      benchWeekly.push(bRet);
      if (rets.length) {
        if (sRet > 0) { wins++; winSum += sRet; } else if (sRet < 0) { losses++; lossSum += sRet; }
      }
      curve.push({ t: close, s: Math.round(equity * 100) / 100, b: Math.round(benchEq * 100) / 100 });
    }
    const n = weekly.length;
    const years = (W[W.length - 1] - W[0]) / (365.25 * DAY);
    const m = mean(weekly);
    const variance = weekly.reduce((a, r) => a + (r - m) ** 2, 0) / Math.max(1, n - 1);
    const annVol = Math.sqrt(variance) * Math.sqrt(52);
    let peak = curve[0].s, maxDd = 0;
    for (const p of curve) { if (p.s > peak) peak = p.s; const dd = p.s / peak - 1; if (dd < maxDd) maxDd = dd; }
    const bm = mean(benchWeekly);
    let cov = 0, bVar = 0;
    for (let i = 0; i < n; i++) { cov += (weekly[i] - m) * (benchWeekly[i] - bm); bVar += (benchWeekly[i] - bm) ** 2; }
    cov /= Math.max(1, n - 1); bVar /= Math.max(1, n - 1);
    const beta = bVar > 0 ? cov / bVar : 0;
    const annStrat = (1 + m) ** 52 - 1;
    const annBench = (1 + bm) ** 52 - 1;
    const stats: BacktestStats = {
      startDate: new Date(W[0]).toISOString().slice(0, 10),
      endDate: new Date(W[W.length - 1]).toISOString().slice(0, 10),
      years: Math.round(years * 100) / 100,
      totalReturn: pct(equity / 100 - 1),
      cagr: pct(years > 0 ? (equity / 100) ** (1 / years) - 1 : 0),
      benchmarkTotalReturn: pct(benchEq / 100 - 1),
      benchmarkCagr: pct(years > 0 ? (benchEq / 100) ** (1 / years) - 1 : 0),
      maxDrawdown: pct(maxDd),
      sharpe: annVol > 0 ? Math.round((annStrat / annVol) * 1000) / 1000 : 0,
      winRate: wins + losses > 0 ? pct(wins / (wins + losses)) : 0,
      avgWin: wins > 0 ? pct(winSum / wins) : 0,
      avgLoss: losses > 0 ? pct(lossSum / losses) : 0,
      volatility: pct(annVol),
      beta: Math.round(beta * 100) / 100,
      alpha: Math.round((annStrat - beta * annBench) * 1000) / 10,
      weeks: n,
      trades,
    };
    return {
      ready: true,
      curve,
      stats,
      rules: { holdings: maxHeld, rebalance: 'Weekly', lookbackDays: HOLD_DAYS, benchmark: BENCHMARK },
    };
  }
}
