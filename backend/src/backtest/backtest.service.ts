import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
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
  /** Set while the first computation is still running. */
  note?: string;
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
  private cache: BacktestResult | null = null;
  private cachedAt = 0;
  private computing = false;
  private readonly TTL_MS = 24 * 60 * 60_000;

  constructor(
    @InjectRepository(InsiderTransaction)
    private readonly txRepo: Repository<InsiderTransaction>,
    private readonly market: MarketStatsService,
  ) {}

  async get(): Promise<BacktestResult> {
    const fresh = this.cache && Date.now() - this.cachedAt < this.TTL_MS;
    if (!fresh && !this.computing) {
      // The sweep needs one price history per name ever held, far too slow for
      // a single request — compute in the background and serve the last result.
      this.computing = true;
      void this.compute()
        .then((r) => {
          this.cache = r;
          this.cachedAt = Date.now();
        })
        .catch((err) =>
          this.logger.warn(`backtest failed: ${err?.message || err}`),
        )
        .finally(() => {
          this.computing = false;
        });
    }
    if (this.cache) return this.cache;
    return {
      ready: false,
      curve: [],
      stats: null,
      rules: {
        holdings: HOLDINGS,
        rebalance: 'Weekly',
        lookbackDays: LOOKBACK_DAYS,
        benchmark: BENCHMARK,
      },
      note: 'Backtest is being computed from our filing history — check back in a moment.',
    };
  }

  private async compute(): Promise<BacktestResult> {
    // 1. Every qualifying open-market buy, oldest first.
    const buys = await this.txRepo
      .createQueryBuilder('t')
      .select(['t.transactionDate', 't.totalValue'])
      .addSelect('c.ticker', 'ticker')
      .leftJoin('t.company', 'c')
      .where(`t."transactionCode" = 'P'`)
      .andWhere('t."totalValue" > 0 AND t."totalValue" <= :max', {
        max: MAX_TX_VALUE,
      })
      .orderBy('t."transactionDate"', 'ASC')
      .getRawMany<{ t_transactionDate: string; t_totalValue: string; ticker: string | null }>();

    const events = buys
      .map((r) => ({
        ms: new Date(r.t_transactionDate).getTime(),
        value: Number(r.t_totalValue),
        ticker: (r.ticker || '').toUpperCase(),
      }))
      .filter((e) => e.ticker && Number.isFinite(e.ms) && Number.isFinite(e.value));

    if (events.length < 100) {
      throw new Error(`not enough filings to backtest (${events.length})`);
    }

    // 2. Weekly rebalance dates. Start one lookback window in, so the first
    //    ranking already has a full 30 days of filings behind it.
    const firstMs = events[0].ms;
    const lastMs = events[events.length - 1].ms;
    const start = firstMs + LOOKBACK_DAYS * DAY;
    const weeks: number[] = [];
    for (let t = start; t <= lastMs; t += WEEK) weeks.push(t);
    if (weeks.length < 8) throw new Error('backtest window too short');

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

    // 4. Price history for every name ever held, plus the benchmark.
    const needed = new Set<string>([BENCHMARK]);
    picksByWeek.forEach((p) => p.forEach((tk) => needed.add(tk)));
    const symbols = Array.from(needed);
    const hist = new Map<string, Array<{ t: number; c: number }>>();
    const CONC = 6;
    for (let i = 0; i < symbols.length; i += CONC) {
      const chunk = symbols.slice(i, i + CONC);
      const got = await Promise.all(
        chunk.map((s) => this.market.getCloseHistory(s, '5y').catch(() => [])),
      );
      got.forEach((h, j) => {
        if (h.length) hist.set(chunk[j], h);
      });
    }

    const priceOn = (tk: string, ms: number): number | null => {
      const h = hist.get(tk);
      if (!h || !h.length) return null;
      return MarketStatsService.closeOn(h, ms);
    };

    // 5. Walk the weeks, equal-weighting whatever priced names we hold.
    let equity = 100;
    let bench = 100;
    const curve: EquityPoint[] = [{ t: weeks[0], s: 100, b: 100 }];
    const weeklyReturns: number[] = [];
    const benchReturns: number[] = [];
    let wins = 0;
    let losses = 0;
    let winSum = 0;
    let lossSum = 0;
    let trades = 0;

    for (let i = 0; i < weeks.length - 1; i++) {
      const open = weeks[i];
      const close = weeks[i + 1];

      const rets: number[] = [];
      for (const tk of picksByWeek[i]) {
        const p0 = priceOn(tk, open);
        const p1 = priceOn(tk, close);
        if (p0 == null || p1 == null || !(p0 > 0) || !(p1 > 0)) continue;
        rets.push(p1 / p0 - 1);
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
    const years = (weeks[weeks.length - 1] - weeks[0]) / (365.25 * DAY);
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
      startDate: new Date(weeks[0]).toISOString().slice(0, 10),
      endDate: new Date(weeks[weeks.length - 1]).toISOString().slice(0, 10),
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
