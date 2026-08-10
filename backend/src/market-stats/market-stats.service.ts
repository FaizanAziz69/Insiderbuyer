import { Injectable, Logger, Optional } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { FmpService } from '../fmp/fmp.service';
import { REFERENCE_QUOTES, ReferenceQuote } from './reference-quotes';
import { MARKET_UNIVERSE } from './market-universe';
import { SECTOR_BY_TICKER } from './market-sectors';
import {
  AnalystFirmRow,
  RatingOutcome,
  aggregateFirms,
  classifyGrade,
  scoreRating,
} from './analyst-firms';

export interface AnalystRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upsidePct: number | null;
  recommendation: string | null; // strong_buy | buy | hold | underperform | sell
  numAnalysts: number | null;
  /** Rating breakdown from the current-month recommendation trend: how many
   *  analysts rate the stock Buy (strong buy + buy), Hold, and Sell (sell +
   *  strong sell). Null when no trend is available for the listing. */
  buyRatings: number | null;
  holdRatings: number | null;
  sellRatings: number | null;
  totalRatings: number | null;
}

export interface DividendRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  dividendYield: number | null; // percent
  dividendRate: number | null; // annual $ per share
  payoutRatio: number | null; // percent
  exDividendDate: string | null;
  marketCap: number | null;
}

export interface ShortInterestRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  sharesShort: number | null;
  sharesShortPrior: number | null;
  shortPctFloat: number | null; // percent
  shortRatio: number | null; // days to cover
  changePct: number | null; // MoM change in shares short
  marketCap: number | null;
}

/** Round to 2dp, or null if not a finite number. */
function round2(x: any): number | null {
  const n = Number(x);
  return Number.isFinite(n) ? +n.toFixed(2) : null;
}

/** Multi-period % returns for one symbol (null when not derivable). */
export interface PeriodReturns {
  d1: number | null;
  d7: number | null;
  d30: number | null;
  d180: number | null;
  y1: number | null;
}

/** 20-/60-day returns + short/long relative dollar-volume for one symbol —
 *  inputs for Sector Sentiment and per-stock Volume Momentum (IQ Score v2). */
export interface MomentumSeries {
  ret20: number | null;
  ret60: number | null;
  relVol: number | null;
  recentDollarVol: number | null;
}

export interface MarketStatRow {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number; // 3-month average daily volume
  avgVol10d?: number | null; // 10-day average daily volume (≈ weekly)
  marketCap: number | null;
  sector: string | null;
  exchange?: string | null; // Yahoo short exchange code (NMS, NYQ, PNK, …)
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
  peRatio?: number | null;
  dividendYield?: number | null; // percent
  dividendRate?: number | null; // annual $ per share
  analystRating?: number | null; // Yahoo mean rating 1 (strong buy) – 5 (strong sell)
  analystLabel?: string | null; // e.g. "Buy", "Hold", "Sell"
  // Performance metrics for heatmap "color by" (all in percent).
  perfYear?: number | null; // 52-week change %
  perf50d?: number | null; // % vs 50-day average
  perf200d?: number | null; // % vs 200-day average
  postMarketPct?: number | null; // post-market change %
}

/** Full stockanalysis.com-style fundamentals for a single ticker. */
export interface StockStats {
  symbol: string;
  name: string | null;
  currency: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  marketCap: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  sharesOut: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: string | null;
  volume: number | null;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  beta: number | null;
  analystRating: string | null;
  priceTarget: number | null;
  priceTargetUpsidePct: number | null;
  earningsDate: string | null;
}

const FALLBACK_GAINERS: MarketStatRow[] = [
  { symbol: 'PLTR', name: 'Palantir Technologies', price:  88.42, changeAbs:  6.10, changePct:  7.41, volume: 142_000_000, avgVolume:  92_000_000, marketCap: 198_000_000_000, sector: 'Technology' },
  { symbol: 'SMCI', name: 'Super Micro Computer',  price: 612.50, changeAbs: 42.30, changePct:  7.42, volume:  29_500_000, avgVolume:  22_000_000, marketCap:  35_500_000_000, sector: 'Technology' },
  { symbol: 'MRNA', name: 'Moderna',               price:  87.15, changeAbs:  5.85, changePct:  7.19, volume:  18_200_000, avgVolume:  14_300_000, marketCap:  33_400_000_000, sector: 'Healthcare' },
  { symbol: 'COIN', name: 'Coinbase Global',       price: 312.80, changeAbs: 19.20, changePct:  6.54, volume:  12_800_000, avgVolume:   9_400_000, marketCap:  78_900_000_000, sector: 'Financial Services' },
  { symbol: 'MSTR', name: 'MicroStrategy',         price: 415.60, changeAbs: 24.40, changePct:  6.24, volume:   8_900_000, avgVolume:   7_100_000, marketCap:  72_300_000_000, sector: 'Technology' },
  { symbol: 'AMD',  name: 'Advanced Micro Devices',price: 168.42, changeAbs:  9.20, changePct:  5.78, volume:  82_000_000, avgVolume:  58_000_000, marketCap: 272_000_000_000, sector: 'Technology' },
  { symbol: 'NVDA', name: 'NVIDIA Corp.',          price: 145.30, changeAbs:  7.65, changePct:  5.56, volume: 380_000_000, avgVolume: 260_000_000, marketCap:3_550_000_000_000, sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla',                 price: 322.15, changeAbs: 16.40, changePct:  5.36, volume: 122_000_000, avgVolume:  98_000_000, marketCap:1_020_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'AVGO', name: 'Broadcom',              price: 192.05, changeAbs:  9.10, changePct:  4.97, volume:  31_500_000, avgVolume:  24_000_000, marketCap: 895_000_000_000, sector: 'Technology' },
  { symbol: 'CRWD', name: 'CrowdStrike Holdings',  price: 415.20, changeAbs: 18.60, changePct:  4.69, volume:   7_400_000, avgVolume:   5_800_000, marketCap: 102_000_000_000, sector: 'Technology' },
];

const FALLBACK_LOSERS: MarketStatRow[] = [
  { symbol: 'LULU', name: 'Lululemon Athletica',   price: 215.40, changeAbs: -19.30, changePct: -8.22, volume: 14_200_000, avgVolume:  9_800_000, marketCap:  26_500_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'WBA',  name: 'Walgreens Boots Alliance', price: 9.42, changeAbs: -0.78, changePct: -7.65, volume: 28_500_000, avgVolume: 22_000_000, marketCap:   8_100_000_000, sector: 'Healthcare' },
  { symbol: 'BBY',  name: 'Best Buy',              price:  76.30, changeAbs:  -5.40, changePct: -6.61, volume:  9_600_000, avgVolume:  6_900_000, marketCap:  16_400_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'INTC', name: 'Intel Corp.',           price:  21.05, changeAbs:  -1.32, changePct: -5.90, volume: 98_400_000, avgVolume: 72_000_000, marketCap:  90_500_000_000, sector: 'Technology' },
  { symbol: 'BA',   name: 'Boeing Co.',            price: 152.60, changeAbs:  -8.40, changePct: -5.22, volume: 14_700_000, avgVolume: 10_200_000, marketCap: 115_000_000_000, sector: 'Industrials' },
  { symbol: 'PFE',  name: 'Pfizer',                price:  28.42, changeAbs:  -1.43, changePct: -4.79, volume: 38_900_000, avgVolume: 31_000_000, marketCap: 161_000_000_000, sector: 'Healthcare' },
  { symbol: 'F',    name: 'Ford Motor',            price:   9.85, changeAbs:  -0.46, changePct: -4.46, volume: 62_400_000, avgVolume: 48_000_000, marketCap:  39_200_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'TGT',  name: 'Target Corp.',          price: 124.80, changeAbs:  -5.60, changePct: -4.30, volume:  8_900_000, avgVolume:  6_400_000, marketCap:  57_500_000_000, sector: 'Consumer Staples' },
  { symbol: 'NKE',  name: 'Nike Inc.',             price:  68.40, changeAbs:  -2.90, changePct: -4.07, volume: 12_300_000, avgVolume:  9_700_000, marketCap: 102_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'CVS',  name: 'CVS Health',            price:  56.20, changeAbs:  -2.30, changePct: -3.93, volume: 11_800_000, avgVolume:  8_900_000, marketCap:  70_500_000_000, sector: 'Healthcare' },
];

const FALLBACK_MOST_ACTIVE: MarketStatRow[] = [
  { symbol: 'NVDA', name: 'NVIDIA Corp.',          price: 145.30, changeAbs:  7.65, changePct:  5.56, volume: 380_000_000, avgVolume: 260_000_000, marketCap: 3_550_000_000_000, sector: 'Technology' },
  { symbol: 'TSLA', name: 'Tesla',                 price: 322.15, changeAbs: 16.40, changePct:  5.36, volume: 122_000_000, avgVolume:  98_000_000, marketCap: 1_020_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'AAPL', name: 'Apple Inc.',            price: 232.80, changeAbs:  1.20, changePct:  0.52, volume: 112_000_000, avgVolume:  85_000_000, marketCap: 3_540_000_000_000, sector: 'Technology' },
  { symbol: 'AMD',  name: 'Advanced Micro Devices',price: 168.42, changeAbs:  9.20, changePct:  5.78, volume:  82_000_000, avgVolume:  58_000_000, marketCap:   272_000_000_000, sector: 'Technology' },
  { symbol: 'AMZN', name: 'Amazon.com',            price: 212.40, changeAbs:  3.10, changePct:  1.48, volume:  68_500_000, avgVolume:  54_000_000, marketCap: 2_230_000_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'F',    name: 'Ford Motor',            price:   9.85, changeAbs: -0.46, changePct: -4.46, volume:  62_400_000, avgVolume:  48_000_000, marketCap:    39_200_000_000, sector: 'Consumer Discretionary' },
  { symbol: 'INTC', name: 'Intel Corp.',           price:  21.05, changeAbs: -1.32, changePct: -5.90, volume:  98_400_000, avgVolume:  72_000_000, marketCap:    90_500_000_000, sector: 'Technology' },
  { symbol: 'BAC',  name: 'Bank of America',       price:  44.20, changeAbs:  0.85, changePct:  1.96, volume:  54_200_000, avgVolume:  42_000_000, marketCap:   332_000_000_000, sector: 'Financial Services' },
  { symbol: 'PLTR', name: 'Palantir Technologies', price:  88.42, changeAbs:  6.10, changePct:  7.41, volume: 142_000_000, avgVolume:  92_000_000, marketCap:   198_000_000_000, sector: 'Technology' },
  { symbol: 'META', name: 'Meta Platforms',        price: 612.40, changeAbs:  4.80, changePct:  0.79, volume:  18_500_000, avgVolume:  14_700_000, marketCap: 1_550_000_000_000, sector: 'Communication Services' },
];

type ScrId = 'day_gainers' | 'day_losers' | 'most_actives';

@Injectable()
export class MarketStatsService {
  private readonly logger = new Logger(MarketStatsService.name);
  private readonly http: AxiosInstance;
  private cache: Partial<Record<ScrId, { ts: number; data: MarketStatRow[] }>> = {};
  private readonly CACHE_MS = 60_000;
  private pennyCache: { ts: number; data: MarketStatRow[] } | null = null;
  private readonly PENNY_CACHE_MS = 10 * 60_000;
  private screenCache = new Map<string, { ts: number; data: MarketStatRow[] }>();
  private readonly SCREEN_CACHE_MS = 60_000;

  // Result cache for the summary-heavy tool tables (analyst/dividends/short
  // interest). These scan the whole universe with per-symbol summary calls, so
  // caching keeps them fast and — crucially — complete: a warm cache serves the
  // full set even if a later refresh partially fails on a cold serverless start.
  private toolCache = new Map<string, { ts: number; data: any }>();
  private readonly TOOL_CACHE_MS = 15 * 60_000;

  private async cachedTool<T>(
    key: string,
    build: () => Promise<T[]>,
    minHealthy = 1,
  ): Promise<T[]> {
    const hit = this.toolCache.get(key);
    if (hit && Date.now() - hit.ts < this.TOOL_CACHE_MS) return hit.data as T[];
    try {
      const data = await build();
      const prevLen = hit?.data?.length ?? 0;
      // Only persist a "healthy" result. A cold-start auth race or a blocked
      // Yahoo endpoint can yield a near-empty build; caching that would pin the
      // table to garbage for the whole TTL. Instead we return it but skip the
      // cache so the very next request rebuilds (auth is warm by then).
      const healthy = data.length >= minHealthy && data.length >= prevLen * 0.6;
      if (healthy || !hit) {
        if (healthy) this.toolCache.set(key, { ts: Date.now(), data });
        return data;
      }
      return hit.data as T[]; // keep the fuller previous set
    } catch {
      if (hit) return hit.data as T[];
      throw new Error(`tool ${key} failed and no cache`);
    }
  }

  // Only surface names on the two major US exchanges (NASDAQ tiers + NYSE).
  // This excludes OTC / pink-sheet listings (exchange codes PNK, OTC, OQB,
  // OQX, etc.) where a few hundred shares can manufacture a fake "top gainer".
  private readonly MAJOR_EXCHANGES = new Set(['NMS', 'NGM', 'NCM', 'NYQ']);
  private readonly MAJOR_EXCHANGE_OPERAND = {
    operator: 'OR',
    operands: [
      { operator: 'EQ', operands: ['exchange', 'NMS'] }, // Nasdaq Global Select
      { operator: 'EQ', operands: ['exchange', 'NGM'] }, // Nasdaq Global Market
      { operator: 'EQ', operands: ['exchange', 'NCM'] }, // Nasdaq Capital Market
      { operator: 'EQ', operands: ['exchange', 'NYQ'] }, // NYSE
    ],
  };

  /** Belt-and-suspenders: drop anything not on a major exchange, in case the
   *  screener's exchange filter is ever ignored or a fallback path is used. */
  private onlyMajorExchanges(rows: MarketStatRow[]): MarketStatRow[] {
    return rows.filter((r) => !r.exchange || this.MAJOR_EXCHANGES.has(r.exchange));
  }

  constructor(@Optional() private readonly fmp?: FmpService) {
    this.http = axios.create({
      timeout: 10_000,
      // Force IPv4 — Node resolves Yahoo's hosts (fc.yahoo.com especially) to
      // an IPv6 address that hangs/ETIMEDOUTs, breaking the cookie+crumb auth.
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      // Yahoo rate-limits requests carrying full browser UA strings without
      // browser cookies — a bare UA passes cleanly.
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' },
    });
  }

  private fallback(scrId: ScrId): MarketStatRow[] {
    if (scrId === 'day_gainers') return FALLBACK_GAINERS;
    if (scrId === 'day_losers') return FALLBACK_LOSERS;
    return FALLBACK_MOST_ACTIVE;
  }

  private async fetchScreener(scrId: ScrId, limit = 20): Promise<MarketStatRow[]> {
    const cached = this.cache[scrId];
    if (cached && Date.now() - cached.ts < this.CACHE_MS) return cached.data;
    try {
      // The predefined screener requires the same cookie+crumb handshake as
      // the v7 quote API — with it, gainers/losers/most-active are live.
      const auth = await this.getAuth();
      if (!auth) throw new Error('No Yahoo auth (cookie/crumb)');
      const { data } = await this.http.get(
        `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved?count=${limit}&scrIds=${scrId}&crumb=${encodeURIComponent(auth.crumb)}`,
        { headers: { Cookie: auth.cookie } },
      );
      const quotes: any[] = data?.finance?.result?.[0]?.quotes || [];
      if (!quotes.length) throw new Error('Empty quotes');
      const out: MarketStatRow[] = quotes.map((q: any) => ({
        symbol: String(q.symbol || ''),
        name: String(q.shortName || q.longName || q.symbol || ''),
        price: Number(q.regularMarketPrice ?? 0),
        changeAbs: Number(q.regularMarketChange ?? 0),
        changePct: Number(q.regularMarketChangePercent ?? 0),
        volume: Number(q.regularMarketVolume ?? 0),
        avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
        marketCap: q.marketCap != null ? Number(q.marketCap) : null,
        sector: q.sector ?? null,
        exchange: q.exchange ?? null,
        peRatio: q.trailingPE != null ? Number(q.trailingPE) : null,
        dividendYield:
          q.dividendYield != null
            ? Number(q.dividendYield)
            : q.trailingAnnualDividendYield != null
              ? +(Number(q.trailingAnnualDividendYield) * 100).toFixed(2)
              : null,
      }));
      this.cache[scrId] = { ts: Date.now(), data: out };
      return out;
    } catch (err: any) {
      this.logger.warn(
        `Yahoo screener ${scrId} failed: ${err?.message || err}. Using fallback.`,
      );
      const out = this.fallback(scrId);
      this.cache[scrId] = { ts: Date.now(), data: out };
      return out;
    }
  }

  /**
   * Generalized Yahoo custom screener (paginated to ~1000) — used for the
   * movers tables so they return hundreds of rows instead of the ~10-25 the
   * predefined screener caps at. Cached 60s per key; falls back to the
   * cached set on failure.
   */
  private async screenYahoo(opts: {
    key: string;
    sortField: string;
    sortType: 'ASC' | 'DESC';
    operands: any[];
    limit: number;
  }): Promise<MarketStatRow[]> {
    const cached = this.screenCache.get(opts.key);
    if (cached && Date.now() - cached.ts < this.SCREEN_CACHE_MS) {
      return cached.data.slice(0, opts.limit);
    }
    try {
      const auth = await this.getAuth();
      if (!auth) throw new Error('No Yahoo auth (cookie/crumb)');
      const PAGE = 250;
      const out: MarketStatRow[] = [];
      const seen = new Set<string>();
      // Yahoo's screener paginates to ~2000 — pull the whole qualifying set so
      // volatile days aren't truncated (client wants ALL 10%+ movers).
      for (let offset = 0; offset < opts.limit && offset < 2000; offset += PAGE) {
        const size = Math.min(PAGE, opts.limit - offset);
        const body = {
          size,
          offset,
          sortField: opts.sortField,
          sortType: opts.sortType,
          quoteType: 'EQUITY',
          query: { operator: 'AND', operands: opts.operands },
          userId: '',
          userIdType: 'guid',
        };
        const { data } = await this.http.post(
          `https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}&lang=en-US&region=US`,
          body,
          { headers: { Cookie: auth.cookie, 'Content-Type': 'application/json' } },
        );
        const quotes: any[] = data?.finance?.result?.[0]?.quotes || [];
        if (!quotes.length) break;
        for (const q of quotes) {
          const symbol = String(q.symbol || '');
          if (!symbol || seen.has(symbol)) continue;
          seen.add(symbol);
          out.push({
            symbol,
            name: String(q.shortName || q.longName || symbol),
            price: Number(q.regularMarketPrice ?? 0),
            changeAbs: Number(q.regularMarketChange ?? 0),
            changePct: Number(q.regularMarketChangePercent ?? 0),
            volume: Number(q.regularMarketVolume ?? 0),
            avgVolume: Number(q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0),
            marketCap: q.marketCap != null ? Number(q.marketCap) : null,
            sector: q.sector ?? null,
            exchange: q.exchange ?? null,
            peRatio: q.trailingPE != null ? Number(q.trailingPE) : null,
            dividendYield:
              q.dividendYield != null
                ? Number(q.dividendYield)
                : q.trailingAnnualDividendYield != null
                  ? +(Number(q.trailingAnnualDividendYield) * 100).toFixed(2)
                  : null,
          });
        }
        if (quotes.length < size) break;
      }
      if (!out.length) throw new Error('Empty screen');
      this.screenCache.set(opts.key, { ts: Date.now(), data: out });
      return out.slice(0, opts.limit);
    } catch (err: any) {
      this.logger.warn(`Yahoo screen ${opts.key} failed: ${err?.message || err}.`);
      return this.screenCache.get(opts.key)?.data.slice(0, opts.limit) ?? [];
    }
  }

  /** Minimum absolute daily move (%) to qualify as a top gainer/loser —
   *  client spec: show EVERY stock that moved 10%+ on the day (comprehensive,
   *  not a curated shortlist). */
  private readonly MOVER_MIN_PCT = 10;

  async getTopGainers(limit = 500) {
    const rows = await this.screenYahoo({
      key: 'gainers',
      sortField: 'percentchange',
      sortType: 'DESC',
      operands: [
        { operator: 'GT', operands: ['percentchange', this.MOVER_MIN_PCT] },
        { operator: 'GT', operands: ['intradayprice', 1] },
        { operator: 'GT', operands: ['dayvolume', 20000] },
        { operator: 'EQ', operands: ['region', 'us'] },
        this.MAJOR_EXCHANGE_OPERAND,
      ],
      limit,
    });
    const base = rows.length ? rows : await this.fetchScreener('day_gainers', limit);
    return this.onlyMajorExchanges(base)
      .filter((r) => r.changePct >= this.MOVER_MIN_PCT)
      .slice(0, limit);
  }
  async getTopLosers(limit = 500) {
    // Yahoo's screener 500s on an ASC percentchange sort, so pull a large pool
    // of decliners ordered by volume (works) and sort biggest-loss-first here.
    const pool = await this.screenYahoo({
      key: 'losers',
      sortField: 'dayvolume',
      sortType: 'DESC',
      operands: [
        { operator: 'LT', operands: ['percentchange', -this.MOVER_MIN_PCT] },
        { operator: 'GT', operands: ['intradayprice', 1] },
        { operator: 'GT', operands: ['dayvolume', 20000] },
        { operator: 'EQ', operands: ['region', 'us'] },
        this.MAJOR_EXCHANGE_OPERAND,
      ],
      limit: Math.max(limit, 500),
    });
    const base = pool.length ? pool : await this.fetchScreener('day_losers', limit);
    return this.onlyMajorExchanges(
      [...base].sort((a, b) => a.changePct - b.changePct),
    )
      .filter((r) => r.changePct <= -this.MOVER_MIN_PCT)
      .slice(0, limit);
  }
  async getMostActive(limit = 100) {
    const rows = await this.screenYahoo({
      key: 'most_active',
      sortField: 'dayvolume',
      sortType: 'DESC',
      operands: [
        { operator: 'GT', operands: ['intradayprice', 1] },
        { operator: 'EQ', operands: ['region', 'us'] },
        this.MAJOR_EXCHANGE_OPERAND,
      ],
      limit,
    });
    const base = rows.length ? rows : await this.fetchScreener('most_actives', limit);
    return this.onlyMajorExchanges(base).slice(0, limit);
  }

  /**
   * Live penny-stock screener — every U.S. equity trading under $5, sorted by
   * dollar volume, via Yahoo's custom screener endpoint (paginated). Returns
   * hundreds of names rather than a hand-picked basket. Cached 10 min; on
   * failure returns whatever is cached (caller falls back to a static basket).
   */
  async getPennyStocks(limit = 250): Promise<MarketStatRow[]> {
    if (this.pennyCache && Date.now() - this.pennyCache.ts < this.PENNY_CACHE_MS) {
      return this.pennyCache.data.slice(0, limit);
    }
    try {
      const auth = await this.getAuth();
      if (!auth) throw new Error('No Yahoo auth (cookie/crumb)');
      const PAGE = 250;
      const out: MarketStatRow[] = [];
      const seen = new Set<string>();
      for (let offset = 0; offset < limit && offset < 1000; offset += PAGE) {
        const size = Math.min(PAGE, limit - offset);
        const body = {
          size,
          offset,
          sortField: 'dayvolume',
          sortType: 'DESC',
          quoteType: 'EQUITY',
          query: {
            operator: 'AND',
            operands: [
              { operator: 'GT', operands: ['intradayprice', 0.05] },
              { operator: 'LT', operands: ['intradayprice', 5] },
              { operator: 'EQ', operands: ['region', 'us'] },
            ],
          },
          userId: '',
          userIdType: 'guid',
        };
        const { data } = await this.http.post(
          `https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}&lang=en-US&region=US`,
          body,
          { headers: { Cookie: auth.cookie, 'Content-Type': 'application/json' } },
        );
        const quotes: any[] = data?.finance?.result?.[0]?.quotes || [];
        if (!quotes.length) break;
        for (const q of quotes) {
          const symbol = String(q.symbol || '');
          if (!symbol || seen.has(symbol)) continue;
          seen.add(symbol);
          out.push({
            symbol,
            name: String(q.shortName || q.longName || symbol),
            price: Number(q.regularMarketPrice ?? 0),
            changeAbs: Number(q.regularMarketChange ?? 0),
            changePct: Number(q.regularMarketChangePercent ?? 0),
            volume: Number(q.regularMarketVolume ?? 0),
            avgVolume: Number(
              q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0,
            ),
            marketCap: q.marketCap != null ? Number(q.marketCap) : null,
            sector: q.sector ?? null,
            exchange: q.exchange ?? null,
            peRatio: q.trailingPE != null ? Number(q.trailingPE) : null,
            dividendYield:
              q.dividendYield != null
                ? Number(q.dividendYield)
                : q.trailingAnnualDividendYield != null
                  ? +(Number(q.trailingAnnualDividendYield) * 100).toFixed(2)
                  : null,
          });
        }
        if (quotes.length < size) break;
      }
      if (!out.length) throw new Error('Empty penny screener');
      this.pennyCache = { ts: Date.now(), data: out };
      return out.slice(0, limit);
    } catch (err: any) {
      this.logger.warn(`Yahoo penny screener failed: ${err?.message || err}.`);
      return this.pennyCache?.data.slice(0, limit) ?? [];
    }
  }

  /** Static reference metadata for a ticker (name / sector / market cap). */
  getReferenceQuote(symbol: string): ReferenceQuote | null {
    return REFERENCE_QUOTES[symbol.toUpperCase()] ?? null;
  }

  /** Deterministic per-day jitter in [-1, 1] — keeps fallback quotes looking
   *  alive (small daily moves) without flickering between requests. */
  private dailyJitter(symbol: string): number {
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const ch of symbol + day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ((h % 2001) - 1000) / 1000;
  }

  /** Build a full fallback quote from the static reference table. */
  private referenceRow(symbol: string): MarketStatRow | null {
    const ref = REFERENCE_QUOTES[symbol];
    if (!ref) return null;
    const j = this.dailyJitter(symbol);
    const pct = +(j * 2.4).toFixed(2); // daily move within ±2.4%
    const price = +(ref.price * (1 + pct / 100)).toFixed(2);
    return {
      symbol,
      name: ref.name,
      price,
      changeAbs: +(price - ref.price).toFixed(2),
      changePct: pct,
      volume: Math.round(ref.avgVolume * (1 + j * 0.35)),
      avgVolume: Math.round(ref.avgVolume),
      marketCap: ref.marketCap,
      sector: ref.sector,
    };
  }

  /** Yahoo cookie + crumb handshake — required by the v7 batch quote API.
   *  fc.yahoo.com sets an anonymous session cookie; /v1/test/getcrumb turns
   *  it into a crumb token. Cached for an hour, refreshed on 401. */
  private auth: { cookie: string; crumb: string; ts: number } | null = null;
  private readonly AUTH_TTL_MS = 60 * 60_000;

  private async getAuth(force = false): Promise<{ cookie: string; crumb: string } | null> {
    if (!force && this.auth && Date.now() - this.auth.ts < this.AUTH_TTL_MS) {
      return this.auth;
    }
    try {
      const res = await this.http.get('https://fc.yahoo.com', {
        validateStatus: () => true,
      });
      const cookie = res.headers['set-cookie']?.[0]?.split(';')[0];
      if (!cookie) return null;
      const { data: crumb } = await this.http.get(
        'https://query1.finance.yahoo.com/v1/test/getcrumb',
        // getcrumb responds text/plain and 406s on an Accept: json header.
        { headers: { Cookie: cookie, Accept: '*/*' } },
      );
      if (!crumb || typeof crumb !== 'string') return null;
      this.auth = { cookie, crumb, ts: Date.now() };
      return this.auth;
    } catch {
      return null;
    }
  }

  /** Primary live source — v7 batch quote (real market cap + 3-month avg
   *  volume for up to 50 symbols per request). */
  private async fetchQuoteV7(symbols: string[]): Promise<Map<string, MarketStatRow>> {
    const out = new Map<string, MarketStatRow>();
    let auth = await this.getAuth();
    if (!auth) return out;
    for (let i = 0; i < symbols.length; i += 50) {
      const chunk = symbols.slice(i, i + 50);
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data } = await this.http.get(
            `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}&crumb=${encodeURIComponent(auth.crumb)}`,
            { headers: { Cookie: auth.cookie } },
          );
          for (const q of data?.quoteResponse?.result || []) {
            const sym = String(q.symbol || '').toUpperCase();
            if (!sym) continue;
            const ref = REFERENCE_QUOTES[sym];
            out.set(sym, {
              symbol: sym,
              name: String(q.shortName || q.longName || ref?.name || sym),
              price: Number(q.regularMarketPrice ?? 0),
              changeAbs: Number(q.regularMarketChange ?? 0),
              changePct: Number(q.regularMarketChangePercent ?? 0),
              volume: Number(q.regularMarketVolume ?? 0),
              avgVolume: Number(
                q.averageDailyVolume3Month ?? q.averageDailyVolume10Day ?? 0,
              ),
              avgVol10d: Number(
                q.averageDailyVolume10Day ?? q.averageDailyVolume3Month ?? 0,
              ),
              exchange: q.exchange ?? null,
              marketCap: q.marketCap != null ? Number(q.marketCap) : ref?.marketCap ?? null,
              sector: q.sector ?? ref?.sector ?? null,
              fiftyTwoWeekHigh: q.fiftyTwoWeekHigh != null ? Number(q.fiftyTwoWeekHigh) : null,
              fiftyTwoWeekLow: q.fiftyTwoWeekLow != null ? Number(q.fiftyTwoWeekLow) : null,
              peRatio: q.trailingPE != null ? Number(q.trailingPE) : null,
              dividendYield:
                q.dividendYield != null
                  ? Number(q.dividendYield)
                  : q.trailingAnnualDividendYield != null
                    ? +(Number(q.trailingAnnualDividendYield) * 100).toFixed(2)
                    : null,
              dividendRate:
                q.dividendRate != null
                  ? Number(q.dividendRate)
                  : q.trailingAnnualDividendRate != null
                    ? Number(q.trailingAnnualDividendRate)
                    : null,
              // v7 quote carries the analyst mean rating as e.g. "2.0 - Buy"
              // (works on the server, unlike the blocked summary endpoint).
              ...(() => {
                const s = String(q.averageAnalystRating ?? '');
                const m = s.match(/^([\d.]+)\s*-\s*(.+)$/);
                return {
                  analystRating: m ? Number(m[1]) : null,
                  analystLabel: m ? m[2].trim() : null,
                };
              })(),
              // Performance metrics (Yahoo mixes percent vs fraction fields:
              // fiftyTwoWeekChangePercent is already a percent; the *Average*
              // ones and postMarket are fractions → ×100).
              perfYear:
                q.fiftyTwoWeekChangePercent != null ? +Number(q.fiftyTwoWeekChangePercent).toFixed(2) : null,
              perf50d:
                q.fiftyDayAverageChangePercent != null ? +(Number(q.fiftyDayAverageChangePercent) * 100).toFixed(2) : null,
              perf200d:
                q.twoHundredDayAverageChangePercent != null ? +(Number(q.twoHundredDayAverageChangePercent) * 100).toFixed(2) : null,
              postMarketPct:
                q.postMarketChangePercent != null ? +Number(q.postMarketChangePercent).toFixed(2) : null,
            });
          }
          break;
        } catch (err: any) {
          if (err?.response?.status === 401 && attempt === 0) {
            auth = await this.getAuth(true); // stale crumb — refresh once
            if (!auth) return out;
          } else {
            this.logger.warn(`v7 quote chunk failed: ${err?.message || err}`);
            break;
          }
        }
      }
    }
    return out;
  }

  /** Company sector + industry via Yahoo quoteSummary `assetProfile`. This is
   *  the ONLY reliable free source of sector data for non-US (.DE / foreign)
   *  tickers — the v7 quote omits it and our static SECTOR_BY_TICKER map is
   *  US-only. Crumb-authed, per-symbol, run with modest concurrency. Returns a
   *  map keyed by UPPER-CASE symbol → { sector, industry } (either may be null). */
  async getCompanyProfiles(
    symbols: string[],
  ): Promise<Map<string, { sector: string | null; industry: string | null }>> {
    const out = new Map<string, { sector: string | null; industry: string | null }>();
    const unique = Array.from(
      new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())),
    );
    if (!unique.length) return out;
    let auth = await this.getAuth();

    const CONCURRENCY = 6;
    for (let i = 0; i < unique.length; i += CONCURRENCY) {
      const chunk = unique.slice(i, i + CONCURRENCY);
      await Promise.all(
        chunk.map(async (sym) => {
          for (let attempt = 0; attempt < 2; attempt++) {
            try {
              const host = sym.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
              const url =
                `https://${host}.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(sym)}` +
                `?modules=assetProfile${auth ? `&crumb=${encodeURIComponent(auth.crumb)}` : ''}`;
              const { data } = await this.http.get(url, {
                headers: auth ? { Cookie: auth.cookie } : undefined,
                validateStatus: () => true,
              });
              const p = data?.quoteSummary?.result?.[0]?.assetProfile;
              if (p && (p.sector || p.industry)) {
                out.set(sym, {
                  sector: p.sector ?? null,
                  industry: p.industry ?? null,
                });
              }
              return;
            } catch (err: any) {
              if (err?.response?.status === 401 && attempt === 0) {
                auth = await this.getAuth(true);
              } else {
                return;
              }
            }
          }
        }),
      );
    }
    return out;
  }

  /** Per-symbol fallback via Yahoo's v8 chart endpoint (no crumb needed).
   *  One call per symbol gives current price, prev close, today's volume,
   *  and 3 months of daily volumes for the average. */
  private async fetchChartQuote(symbol: string): Promise<MarketStatRow | null> {
    try {
      // Spread symbols across Yahoo's two query hosts to soften rate limits.
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=3mo&interval=1d`,
      );
      const result = data?.chart?.result?.[0];
      const meta = result?.meta;
      const price = Number(meta?.regularMarketPrice ?? 0);
      if (!price) return null;
      const prev = Number(meta?.chartPreviousClose ?? price) || price;
      const vols: number[] = (result?.indicators?.quote?.[0]?.volume || [])
        .map((v: any) => Number(v))
        .filter((v: number) => v > 0);
      const ref = REFERENCE_QUOTES[symbol];
      const avgVolume = vols.length
        ? Math.round(vols.reduce((a, b) => a + b, 0) / vols.length)
        : Math.round(ref?.avgVolume ?? 0);
      return {
        symbol,
        name: String(meta?.shortName || meta?.longName || ref?.name || symbol),
        price,
        changeAbs: +(price - prev).toFixed(2),
        changePct: +(((price - prev) / prev) * 100).toFixed(2),
        volume: Number(meta?.regularMarketVolume ?? 0) || avgVolume,
        avgVolume,
        // Chart meta carries no market cap — use the reference table.
        marketCap: ref?.marketCap ?? null,
        sector: ref?.sector ?? null,
        fiftyTwoWeekHigh: meta?.fiftyTwoWeekHigh != null ? Number(meta.fiftyTwoWeekHigh) : null,
        fiftyTwoWeekLow: meta?.fiftyTwoWeekLow != null ? Number(meta.fiftyTwoWeekLow) : null,
      };
    } catch {
      return null;
    }
  }

  private momentumCache = new Map<
    string,
    { ts: number; data: MomentumSeries }
  >();
  private readonly MOMENTUM_TTL_MS = 60 * 60_000;

  /** 20-/60-day price returns + short/long relative DOLLAR volume for one
   *  symbol, from a single 6-month daily chart. Powers Sector Sentiment
   *  (component 2) and per-stock Volume Momentum (component 4). Cached 1h;
   *  missing data → nulls. */
  async getMomentumSeries(symbol: string): Promise<MomentumSeries> {
    const key = symbol.toUpperCase();
    const cached = this.momentumCache.get(key);
    if (cached && Date.now() - cached.ts < this.MOMENTUM_TTL_MS) return cached.data;
    const empty: MomentumSeries = {
      ret20: null,
      ret60: null,
      relVol: null,
      recentDollarVol: null,
    };
    try {
      const host = key.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=6mo&interval=1d`,
      );
      const result = data?.chart?.result?.[0];
      const closesRaw: number[] = (result?.indicators?.quote?.[0]?.close || []).map(Number);
      const volsRaw: number[] = (result?.indicators?.quote?.[0]?.volume || []).map(Number);
      // Keep only aligned, valid (close,volume) pairs.
      const closes: number[] = [];
      const dollarVol: number[] = [];
      for (let i = 0; i < closesRaw.length; i++) {
        const c = closesRaw[i];
        const v = volsRaw[i];
        if (Number.isFinite(c) && c > 0) {
          closes.push(c);
          dollarVol.push(Number.isFinite(v) && v > 0 ? c * v : 0);
        }
      }
      const n = closes.length;
      if (n < 21) {
        this.momentumCache.set(key, { ts: Date.now(), data: empty });
        return empty;
      }
      const last = closes[n - 1];
      const ret = (back: number): number | null =>
        n > back && closes[n - 1 - back] > 0
          ? (last / closes[n - 1 - back] - 1) * 100
          : null;
      const avgTail = (arr: number[], k: number): number | null => {
        const slice = arr.slice(Math.max(0, arr.length - k)).filter((x) => x > 0);
        return slice.length ? slice.reduce((a, b) => a + b, 0) / slice.length : null;
      };
      const avg20 = avgTail(dollarVol, 20);
      const avg90 = avgTail(dollarVol, 90);
      const out: MomentumSeries = {
        ret20: ret(20),
        ret60: ret(60),
        relVol: avg20 != null && avg90 != null && avg90 > 0 ? avg20 / avg90 : null,
        recentDollarVol: avg20,
      };
      this.momentumCache.set(key, { ts: Date.now(), data: out });
      return out;
    } catch {
      this.momentumCache.set(key, { ts: Date.now(), data: empty });
      return empty;
    }
  }

  private closeHistCache = new Map<string, { ts: number; data: Array<{ t: number; c: number }> }>();
  private readonly CLOSE_HIST_TTL_MS = 6 * 60 * 60_000;

  /** Daily close history for a symbol (cached 6h). Returns ascending
   *  [{t: epoch-ms, c: close}]. Powers per-trade excess return + estimated
   *  portfolio value over time on politician/insider profiles. */
  async getCloseHistory(symbol: string, range = '5y'): Promise<Array<{ t: number; c: number }>> {
    const key = `${symbol.toUpperCase()}|${range}`;
    const cached = this.closeHistCache.get(key);
    if (cached && Date.now() - cached.ts < this.CLOSE_HIST_TTL_MS) return cached.data;
    let out: Array<{ t: number; c: number }> = [];
    try {
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`,
      );
      const result = data?.chart?.result?.[0];
      const ts: number[] = result?.timestamp || [];
      const closes: number[] = result?.indicators?.quote?.[0]?.close || [];
      const adj: number[] = result?.indicators?.adjclose?.[0]?.adjclose || closes;
      out = ts
        .map((t, i) => ({ t: t * 1000, c: Number(adj[i] ?? closes[i]) }))
        .filter((p) => Number.isFinite(p.c) && p.c > 0);
    } catch {
      out = [];
    }
    this.closeHistCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  /** Close on or just before a target date (ms) from a close-history array. */
  static closeOn(hist: Array<{ t: number; c: number }>, targetMs: number): number | null {
    if (!hist.length) return null;
    let best: number | null = null;
    for (const p of hist) {
      if (p.t <= targetMs) best = p.c;
      else break;
    }
    return best ?? (hist[0]?.c ?? null);
  }

  private quoteCache = new Map<string, { ts: number; row: MarketStatRow }>();
  /** Symbols that recently failed live fetch — back off instead of
   *  re-hammering Yahoo on every page load while rate-limited. */
  private quoteFailCache = new Map<string, number>();
  private readonly QUOTE_TTL_MS = 10 * 60_000;
  private readonly QUOTE_FAIL_TTL_MS = 3 * 60_000;
  private readonly QUOTE_CONCURRENCY = 5;

  // ---- Multi-period returns (heatmap performance) -----------------------
  // One v8 chart call per symbol (range=1y) yields every period we need, so we
  // cache the derived returns per symbol for an hour.
  private returnsCache = new Map<
    string,
    { ts: number; data: PeriodReturns | null }
  >();
  private readonly RETURNS_TTL_MS = 60 * 60_000;

  /** Period % returns for a basket of symbols, derived from one 1-year daily
   *  chart each (cached 1h, concurrency-limited). Missing periods come back
   *  null. Used by the market heatmap's time-period toggle. */
  async getReturns(symbols: string[]): Promise<Record<string, PeriodReturns>> {
    const unique = Array.from(
      new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())),
    ).slice(0, 150);
    const out: Record<string, PeriodReturns> = {};
    const now = Date.now();
    const toFetch: string[] = [];
    for (const sym of unique) {
      const c = this.returnsCache.get(sym);
      if (c && now - c.ts < this.RETURNS_TTL_MS) {
        if (c.data) out[sym] = c.data;
      } else {
        toFetch.push(sym);
      }
    }
    for (let i = 0; i < toFetch.length; i += this.QUOTE_CONCURRENCY) {
      const chunk = toFetch.slice(i, i + this.QUOTE_CONCURRENCY);
      const settled = await Promise.all(
        chunk.map((s) => this.fetchReturns(s)),
      );
      chunk.forEach((sym, j) => {
        const data = settled[j];
        this.returnsCache.set(sym, { ts: Date.now(), data });
        if (data) out[sym] = data;
      });
    }
    return out;
  }

  private async fetchReturns(symbol: string): Promise<PeriodReturns | null> {
    try {
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
      );
      const result = data?.chart?.result?.[0];
      const closesRaw: any[] = result?.indicators?.quote?.[0]?.close || [];
      const closes = closesRaw
        .map((c) => Number(c))
        .filter((c) => Number.isFinite(c) && c > 0);
      if (closes.length < 2) return null;
      const last = closes[closes.length - 1];
      // Trading-day offsets (approx): 1d=prior close, 1w≈5, 1m≈21, 6m≈126,
      // 1y = first close in the window.
      const at = (back: number) =>
        closes[Math.max(0, closes.length - 1 - back)];
      const pct = (from: number) =>
        from > 0 ? +(((last - from) / from) * 100).toFixed(2) : null;
      return {
        d1: pct(at(1)),
        d7: pct(at(5)),
        d30: pct(at(21)),
        d180: pct(at(126)),
        y1: pct(closes[0]),
      };
    } catch {
      return null;
    }
  }

  // ── Month-to-date + year-to-date returns (for Hot Sectors) ────────────
  private monthYtdCache = new Map<
    string,
    { ts: number; data: { mtd: number | null; ytd: number | null } | null }
  >();
  private readonly MONTH_YTD_TTL_MS = 60 * 60_000;

  /** Month-to-date and year-to-date % returns per symbol, derived from one
   *  1-year daily chart each (timestamps + closes). MTD/YTD bases are the last
   *  close before the first calendar day of the current month / year. Cached
   *  1h, concurrency-limited. */
  async getMonthYtdReturns(
    symbols: string[],
  ): Promise<Record<string, { mtd: number | null; ytd: number | null }>> {
    const unique = Array.from(
      new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())),
    ).slice(0, 300);
    const out: Record<string, { mtd: number | null; ytd: number | null }> = {};
    const now = Date.now();
    const toFetch: string[] = [];
    for (const sym of unique) {
      const c = this.monthYtdCache.get(sym);
      if (c && now - c.ts < this.MONTH_YTD_TTL_MS) {
        if (c.data) out[sym] = c.data;
      } else {
        toFetch.push(sym);
      }
    }
    for (let i = 0; i < toFetch.length; i += this.QUOTE_CONCURRENCY) {
      const chunk = toFetch.slice(i, i + this.QUOTE_CONCURRENCY);
      const settled = await Promise.all(
        chunk.map((s) => this.fetchMonthYtd(s)),
      );
      chunk.forEach((sym, j) => {
        const data = settled[j];
        this.monthYtdCache.set(sym, { ts: Date.now(), data });
        if (data) out[sym] = data;
      });
    }
    return out;
  }

  private async fetchMonthYtd(
    symbol: string,
  ): Promise<{ mtd: number | null; ytd: number | null } | null> {
    try {
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1y&interval=1d`,
      );
      const result = data?.chart?.result?.[0];
      const stamps: number[] = (result?.timestamp || []).map((t: any) => Number(t));
      const closesRaw: any[] = result?.indicators?.quote?.[0]?.close || [];
      // Pair each close with its timestamp, dropping null/holiday gaps.
      const pts: { t: number; c: number }[] = [];
      for (let i = 0; i < closesRaw.length; i++) {
        const c = Number(closesRaw[i]);
        const t = stamps[i];
        if (Number.isFinite(c) && c > 0 && Number.isFinite(t)) pts.push({ t, c });
      }
      if (pts.length < 2) return null;
      const last = pts[pts.length - 1].c;

      const now = new Date();
      const monthStartSec =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
      const yearStartSec = Date.UTC(now.getUTCFullYear(), 0, 1) / 1000;

      // Base = last close strictly before the boundary (prior period's close).
      // Fall back to the first available point when the chart starts later.
      const baseBefore = (boundary: number): number => {
        let base = pts[0].c;
        for (const p of pts) {
          if (p.t < boundary) base = p.c;
          else break;
        }
        return base;
      };
      const pct = (from: number) =>
        from > 0 ? +(((last - from) / from) * 100).toFixed(2) : null;

      return {
        mtd: pct(baseBefore(monthStartSec)),
        ytd: pct(baseBefore(yearStartSec)),
      };
    } catch {
      return null;
    }
  }

  // ── 7-day sparklines for stock listings ───────────────────────────────
  private sparkCache = new Map<string, { ts: number; data: number[] }>();
  private readonly SPARK_TTL_MS = 30 * 60_000;

  /** Last ~7 daily closes per symbol for an inline sparkline. Keyless v8 chart,
   *  cached 30 min, concurrency-limited. */
  async getSparklines(symbols: string[]): Promise<Record<string, number[]>> {
    const unique = Array.from(
      new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())),
    ).slice(0, 60);
    const out: Record<string, number[]> = {};
    const now = Date.now();
    const toFetch: string[] = [];
    for (const s of unique) {
      const c = this.sparkCache.get(s);
      if (c && now - c.ts < this.SPARK_TTL_MS) {
        if (c.data.length) out[s] = c.data;
      } else toFetch.push(s);
    }
    for (let i = 0; i < toFetch.length; i += this.QUOTE_CONCURRENCY) {
      const chunk = toFetch.slice(i, i + this.QUOTE_CONCURRENCY);
      const res = await Promise.all(chunk.map((s) => this.fetchSpark(s)));
      chunk.forEach((s, j) => {
        this.sparkCache.set(s, { ts: Date.now(), data: res[j] });
        if (res[j].length) out[s] = res[j];
      });
    }
    return out;
  }

  private async fetchSpark(symbol: string): Promise<number[]> {
    try {
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=7d&interval=1d`,
      );
      const closes: number[] = (data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [])
        .map((c: any) => Number(c))
        .filter((c: number) => Number.isFinite(c) && c > 0);
      return closes.slice(-7);
    } catch {
      return [];
    }
  }

  // ── Ticker / company-name search (navbar typeahead) ───────────────────
  private searchCache = new Map<
    string,
    { ts: number; data: Array<{ symbol: string; name: string; exchange: string | null; type: string | null }> }
  >();
  private readonly SEARCH_TTL_MS = 10 * 60_000;
  // US exchanges we surface first (stockanalysis-style: US listings on top).
  private readonly US_EXCHANGES = new Set([
    'NASDAQ', 'NasdaqGS', 'NasdaqGM', 'NasdaqCM', 'NYSE', 'NYSEArca',
    'NYSE American', 'AMEX', 'BATS', 'BATS Trading', 'OTC Markets', 'Cboe US',
  ]);

  /** Symbol/name search via Yahoo's keyless search endpoint. Returns equities
   *  and ETFs, US listings first, cached 10 min. */
  async searchSymbols(q: string, limit = 8) {
    const query = (q || '').trim();
    if (!query) return [];
    const key = `${query.toLowerCase()}|${limit}`;
    const cached = this.searchCache.get(key);
    if (cached && Date.now() - cached.ts < this.SEARCH_TTL_MS) return cached.data;
    try {
      const { data } = await this.http.get(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&enableFuzzyQuery=false`,
      );
      const quotes: any[] = data?.quotes || [];
      const rows = quotes
        .filter(
          (x) => x?.symbol && (x.quoteType === 'EQUITY' || x.quoteType === 'ETF'),
        )
        .map((x) => ({
          symbol: String(x.symbol).toUpperCase(),
          name: x.shortname || x.longname || String(x.symbol),
          exchange: x.exchDisp || x.exchange || null,
          type: x.quoteType || null,
        }))
        // US listings first, otherwise preserve Yahoo's relevance order.
        .sort(
          (a, b) =>
            (this.US_EXCHANGES.has(b.exchange || '') ? 1 : 0) -
            (this.US_EXCHANGES.has(a.exchange || '') ? 1 : 0),
        )
        .slice(0, limit);
      this.searchCache.set(key, { ts: Date.now(), data: rows });
      return rows;
    } catch {
      return [];
    }
  }

  async getQuoteBatch(symbols: string[]): Promise<Map<string, MarketStatRow>> {
    const map = new Map<string, MarketStatRow>();
    if (!symbols.length) return map;
    const unique = Array.from(new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())));
    if (!unique.length) return map;

    const now = Date.now();
    const toFetch: string[] = [];
    for (const sym of unique) {
      const cached = this.quoteCache.get(sym);
      // Rows cached without a market cap (chart-endpoint fallback shape) are
      // retried through the richer v7 batch path instead of short-circuiting.
      if (cached && now - cached.ts < this.QUOTE_TTL_MS && cached.row.marketCap != null) {
        map.set(sym, cached.row);
      } else if ((this.quoteFailCache.get(sym) ?? 0) > now - this.QUOTE_FAIL_TTL_MS) {
        // Recently failed — skip the live attempt, fall to reference below.
      } else {
        toFetch.push(sym);
      }
    }

    // 1. Batch v7 quote (one request per 50 symbols, real market caps).
    if (toFetch.length) {
      const v7 = await this.fetchQuoteV7(toFetch);
      for (const [sym, row] of v7.entries()) {
        if (row.price > 0) {
          map.set(sym, row);
          this.quoteCache.set(sym, { ts: now, row });
          this.quoteFailCache.delete(sym);
        }
      }
    }

    // 2. Per-symbol chart fallback for whatever the batch missed.
    const chartFetch = toFetch.filter((s) => !map.has(s));
    for (let i = 0; i < chartFetch.length; i += this.QUOTE_CONCURRENCY) {
      const chunk = chartFetch.slice(i, i + this.QUOTE_CONCURRENCY);
      const rows = await Promise.all(chunk.map((s) => this.fetchChartQuote(s)));
      rows.forEach((row, j) => {
        if (row) {
          map.set(chunk[j], row);
          this.quoteCache.set(chunk[j], { ts: now, row });
          this.quoteFailCache.delete(chunk[j]);
        } else {
          this.quoteFailCache.set(chunk[j], now);
        }
      });
    }

    // Whatever Yahoo couldn't resolve gets a LIVE second chance through FMP
    // (paid key) before falling to the static reference snapshot — so no
    // page renders an empty price/cap for a real ticker.
    const stillMissing = unique.filter((s) => !map.has(s));
    if (stillMissing.length && this.fmp?.enabled) {
      try {
        const fmpQuotes = await this.fmp.getQuotesBatch(stillMissing);
        for (const [sym, q] of fmpQuotes.entries()) {
          const row: MarketStatRow = {
            symbol: sym,
            name: q.name,
            price: q.price,
            changeAbs: q.changeAbs,
            changePct: q.changePct,
            volume: q.volume,
            avgVolume: q.avgVolume,
            avgVol10d: null,
            marketCap: q.marketCap,
            sector: SECTOR_BY_TICKER[sym] ?? null,
            exchange: null, // FMP uses full codes, not Yahoo's — leave unfiltered
            fiftyTwoWeekHigh: q.fiftyTwoWeekHigh,
            fiftyTwoWeekLow: q.fiftyTwoWeekLow,
            peRatio: q.peRatio,
          };
          map.set(sym, row);
          this.quoteCache.set(sym, { ts: now, row });
          this.quoteFailCache.delete(sym);
        }
      } catch {
        /* FMP unavailable — fall through to reference rows */
      }
    }

    // Anything still unresolved falls back to the static reference snapshot
    // so tables never render empty cells for known tickers.
    let missed = 0;
    for (const sym of unique) {
      if (!map.has(sym)) {
        const row = this.referenceRow(sym);
        if (row) {
          map.set(sym, row);
          this.quoteCache.set(sym, { ts: now, row });
        } else missed++;
      }
    }
    if (missed > 0) {
      this.logger.warn(`Quote batch: ${missed}/${unique.length} symbols unresolved (no live quote, FMP or reference entry).`);
    }
    return map;
  }

  // ──────────────────────────────────────────────────────────────────
  // quoteSummary — per-symbol fundamentals (analyst targets, short
  // interest, dividends). One call per symbol, cached + concurrency-capped.
  // ──────────────────────────────────────────────────────────────────
  private summaryCache = new Map<string, { ts: number; data: any }>();
  private readonly SUMMARY_TTL_MS = 30 * 60_000;

  // All three tool pages share one quoteSummary call per symbol so the cache
  // (keyed by symbol) is always complete regardless of which page asked first.
  private readonly SUMMARY_MODULES = 'financialData,summaryDetail,defaultKeyStatistics,recommendationTrend';

  private async fetchQuoteSummary(symbol: string, modules = this.SUMMARY_MODULES): Promise<any | null> {
    const cached = this.summaryCache.get(symbol);
    if (cached && Date.now() - cached.ts < this.SUMMARY_TTL_MS) return cached.data;
    let auth = await this.getAuth();
    if (!auth) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await this.http.get(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
          { headers: { Cookie: auth.cookie } },
        );
        const result = data?.quoteSummary?.result?.[0] ?? null;
        if (result) this.summaryCache.set(symbol, { ts: Date.now(), data: result });
        return result;
      } catch (err: any) {
        if (err?.response?.status === 401 && attempt === 0) {
          auth = await this.getAuth(true);
          if (!auth) return null;
        } else {
          return null;
        }
      }
    }
    return null;
  }

  private async summaryBatch(symbols: string[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const CONCURRENCY = 6;
    for (let i = 0; i < symbols.length; i += CONCURRENCY) {
      const chunk = symbols.slice(i, i + CONCURRENCY);
      const rows = await Promise.all(chunk.map((s) => this.fetchQuoteSummary(s)));
      rows.forEach((r, j) => {
        if (r) out.set(chunk[j], r);
      });
    }
    return out;
  }

  private universe(): string[] {
    // Defensive dedupe — a repeated symbol in the curated list must never
    // produce duplicate rows in analyst/dividend/heatmap payloads.
    return Array.from(new Set(MARKET_UNIVERSE));
  }

  // ──────────────────────────────────────────────────────────────────
  // Per-ticker full fundamentals (stockanalysis.com-style stats grid).
  // ──────────────────────────────────────────────────────────────────
  private statsCache = new Map<string, { ts: number; data: StockStats }>();
  private readonly STATS_TTL_MS = 15 * 60_000;

  /** Full fundamentals for one ticker: price, market cap, revenue, net income,
   *  EPS, P/E, forward P/E, dividend, ex-div, volume, day/52-wk range, beta,
   *  analyst rating, price target and next earnings date. Cached 15 min. */
  async getStockStats(symbolRaw: string): Promise<StockStats> {
    const symbol = (symbolRaw || '').toUpperCase();
    const cached = this.statsCache.get(symbol);
    if (cached && Date.now() - cached.ts < this.STATS_TTL_MS) return cached.data;

    const modules =
      'price,summaryDetail,financialData,defaultKeyStatistics,calendarEvents';
    let r: any = null;
    let auth = await this.getAuth();
    if (auth) {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data } = await this.http.get(
            `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
            { headers: { Cookie: auth.cookie } },
          );
          r = data?.quoteSummary?.result?.[0] ?? null;
          break;
        } catch (err: any) {
          if (err?.response?.status === 401 && attempt === 0) {
            auth = await this.getAuth(true);
            if (!auth) break;
          } else {
            break;
          }
        }
      }
    }

    const num = (x: any): number | null =>
      x && typeof x.raw === 'number' ? x.raw : null;
    const price = r?.price;
    const sd = r?.summaryDetail;
    const fd = r?.financialData;
    const ks = r?.defaultKeyStatistics;
    const cal = r?.calendarEvents;
    const ref = REFERENCE_QUOTES[symbol];

    // quoteSummary is gated/empty for many micro-caps (and the v7 quote API now
    // 401s). The v8 chart endpoint needs no crumb and always carries the price
    // block — price, prev close, day/52-week range, volume, name — so we use it
    // to backfill anything quoteSummary left null.
    let cm: any = null;
    if (!r || num(price?.regularMarketPrice) == null) {
      try {
        const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
        const { data } = await this.http.get(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1d&interval=1d`,
        );
        cm = data?.chart?.result?.[0]?.meta ?? null;
      } catch {
        cm = null;
      }
    }
    const cmNum = (k: string): number | null =>
      cm && typeof cm[k] === 'number' ? cm[k] : null;

    const priceVal =
      num(price?.regularMarketPrice) ?? cmNum('regularMarketPrice') ?? ref?.price ?? null;
    const prevClose =
      num(price?.regularMarketPreviousClose) ??
      num(sd?.previousClose) ??
      cmNum('chartPreviousClose');
    const change =
      num(price?.regularMarketChange) ??
      (priceVal != null && prevClose != null
        ? +(priceVal - prevClose).toFixed(2)
        : null);
    const changePctRaw = num(price?.regularMarketChangePercent);
    const changePct =
      changePctRaw != null
        ? +(changePctRaw * 100).toFixed(2)
        : priceVal != null && prevClose
          ? +(((priceVal - prevClose) / prevClose) * 100).toFixed(2)
          : null;
    const divYieldRaw = num(sd?.dividendYield);
    const targetMean = num(fd?.targetMeanPrice);
    const exTs = sd?.exDividendDate?.raw ?? null;
    const earnTs = cal?.earnings?.earningsDate?.[0]?.raw ?? null;

    const stats: StockStats = {
      symbol,
      name:
        price?.shortName ||
        price?.longName ||
        cm?.shortName ||
        cm?.longName ||
        ref?.name ||
        symbol,
      currency: price?.currency || cm?.currency || 'USD',
      price: priceVal,
      change,
      changePct,
      marketCap: num(price?.marketCap) ?? num(sd?.marketCap) ?? ref?.marketCap ?? null,
      revenue: num(fd?.totalRevenue),
      netIncome: num(ks?.netIncomeToCommon),
      eps: num(ks?.trailingEps),
      sharesOut: num(ks?.sharesOutstanding),
      peRatio: num(sd?.trailingPE),
      forwardPE: num(sd?.forwardPE) ?? num(ks?.forwardPE),
      dividendRate: num(sd?.dividendRate),
      dividendYield: divYieldRaw != null ? +(divYieldRaw * 100).toFixed(2) : null,
      exDividendDate: exTs ? new Date(exTs * 1000).toISOString().slice(0, 10) : null,
      volume: num(price?.regularMarketVolume) ?? num(sd?.volume) ?? cmNum('regularMarketVolume'),
      open: num(price?.regularMarketOpen) ?? num(sd?.open),
      previousClose: prevClose,
      dayLow: num(price?.regularMarketDayLow) ?? num(sd?.dayLow) ?? cmNum('regularMarketDayLow'),
      dayHigh: num(price?.regularMarketDayHigh) ?? num(sd?.dayHigh) ?? cmNum('regularMarketDayHigh'),
      week52Low: num(sd?.fiftyTwoWeekLow) ?? cmNum('fiftyTwoWeekLow'),
      week52High: num(sd?.fiftyTwoWeekHigh) ?? cmNum('fiftyTwoWeekHigh'),
      beta: num(sd?.beta) ?? num(ks?.beta),
      analystRating: fd?.recommendationKey ?? null,
      priceTarget: targetMean,
      priceTargetUpsidePct:
        targetMean && priceVal
          ? +(((targetMean - priceVal) / priceVal) * 100).toFixed(2)
          : null,
      earningsDate: earnTs ? new Date(earnTs * 1000).toISOString().slice(0, 10) : null,
    };
    this.statsCache.set(symbol, { ts: Date.now(), data: stats });
    return stats;
  }

  // ---- stockanalysis.com-style detail tabs ------------------------------
  // Profile / Financials reuse the crumb-authed quoteSummary; History uses the
  // public v8 chart. All cached 30 min per symbol.
  private detailCache = new Map<string, { ts: number; data: any }>();
  private readonly DETAIL_TTL_MS = 30 * 60_000;

  private async fetchModules(symbol: string, modules: string): Promise<any | null> {
    let auth = await this.getAuth();
    if (!auth) return null;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const { data } = await this.http.get(
          `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}&crumb=${encodeURIComponent(auth.crumb)}`,
          { headers: { Cookie: auth.cookie } },
        );
        return data?.quoteSummary?.result?.[0] ?? null;
      } catch (err: any) {
        if (err?.response?.status === 401 && attempt === 0) {
          auth = await this.getAuth(true);
          if (!auth) break;
        } else break;
      }
    }
    return null;
  }

  /** Company profile — description, sector/industry, employees, HQ, officers. */
  async getProfile(symbolRaw: string): Promise<any> {
    const symbol = (symbolRaw || '').toUpperCase();
    const cacheKey = `profile:${symbol}`;
    const c = this.detailCache.get(cacheKey);
    if (c && Date.now() - c.ts < this.DETAIL_TTL_MS) return c.data;
    const r = await this.fetchModules(symbol, 'assetProfile,price,summaryDetail');
    const p = r?.assetProfile ?? {};
    const price = r?.price ?? {};
    const data = {
      symbol,
      name: price.longName || price.shortName || symbol,
      exchange: price.exchangeName || null,
      sector: p.sector || null,
      industry: p.industry || null,
      employees: typeof p.fullTimeEmployees === 'number' ? p.fullTimeEmployees : null,
      website: p.website || null,
      phone: p.phone || null,
      description: p.longBusinessSummary || null,
      address: [p.address1, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ') || null,
      country: p.country || null,
      officers: (p.companyOfficers || [])
        .slice(0, 6)
        .map((o: any) => ({
          name: o.name || null,
          title: o.title || null,
          pay: o.totalPay?.raw ?? null,
        })),
    };
    // Yahoo's quoteSummary is flaky for smaller names — backfill every gap
    // from the FMP profile so company pages never render empty sections.
    if (this.fmp?.enabled && (!data.description || !data.sector || !data.exchange)) {
      try {
        const f = await this.fmp.getCompanyProfile(symbol);
        if (f) {
          data.name = data.name && data.name !== symbol ? data.name : f.name || data.name;
          data.exchange = data.exchange || f.exchange || null;
          data.sector = data.sector || f.sector || null;
          data.industry = data.industry || f.industry || null;
          data.employees = data.employees ?? f.employees ?? null;
          data.website = data.website || f.website || null;
          data.phone = data.phone || f.phone || null;
          data.description = data.description || f.description || null;
          data.address = data.address || f.address || null;
          data.country = data.country || f.country || null;
          if (!data.officers.length && f.ceo) {
            data.officers = [{ name: f.ceo, title: 'Chief Executive Officer', pay: null }];
          }
        }
      } catch {
        /* FMP unavailable — Yahoo data stands */
      }
    }
    this.detailCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  }

  /** Fetch Yahoo's fundamentals-timeseries (far richer than quoteSummary).
   *  Returns { typeName: { 'YYYY-MM-DD': value } }. No crumb required. */
  private async fetchTimeseries(
    symbol: string,
    types: string[],
  ): Promise<Record<string, Record<string, number>>> {
    const p2 = Math.floor(Date.now() / 1000);
    const p1 = p2 - 220_000_000; // ~7 years back
    const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
    const url =
      `https://${host}.finance.yahoo.com/ws/fundamentals-timeseries/v1/finance/timeseries/${encodeURIComponent(symbol)}` +
      `?symbol=${encodeURIComponent(symbol)}&type=${types.join(',')}&period1=${p1}&period2=${p2}`;
    const out: Record<string, Record<string, number>> = {};
    try {
      const { data } = await this.http.get(url);
      for (const r of data?.timeseries?.result || []) {
        const t = r?.meta?.type?.[0];
        if (!t || !Array.isArray(r[t])) continue;
        const m: Record<string, number> = {};
        for (const v of r[t]) {
          const raw = v?.reportedValue?.raw;
          if (v?.asOfDate && typeof raw === 'number') m[v.asOfDate] = raw;
        }
        out[t] = m;
      }
    } catch {
      /* fall through to whatever we collected */
    }
    return out;
  }

  /** Annual financials — income statement, balance sheet, cash-flow — sourced
   *  from the fundamentals-timeseries API so the tables are as deep as the ones
   *  on stockanalysis.com (revenue → margins → EPS → debt → free cash flow). */
  async getFinancials(symbolRaw: string): Promise<any> {
    const symbol = (symbolRaw || '').toUpperCase();
    const cacheKey = `fin:${symbol}`;
    const c = this.detailCache.get(cacheKey);
    if (c && Date.now() - c.ts < this.DETAIL_TTL_MS) return c.data;

    const incomeTypes = [
      'annualTotalRevenue', 'annualCostOfRevenue', 'annualGrossProfit',
      'annualOperatingExpense', 'annualOperatingIncome', 'annualEBITDA',
      'annualPretaxIncome', 'annualTaxProvision', 'annualNetIncome',
      'annualBasicEPS', 'annualDilutedEPS', 'annualResearchAndDevelopment',
      'annualSellingGeneralAndAdministration', 'annualInterestExpense',
      'annualDilutedAverageShares',
    ];
    const balanceTypes = [
      'annualTotalAssets', 'annualCurrentAssets', 'annualCashAndCashEquivalents',
      'annualTotalLiabilitiesNetMinorityInterest', 'annualCurrentLiabilities',
      'annualTotalDebt', 'annualStockholdersEquity', 'annualRetainedEarnings',
      'annualWorkingCapital',
    ];
    const cashflowTypes = [
      'annualOperatingCashFlow', 'annualCapitalExpenditure', 'annualFreeCashFlow',
      'annualInvestingCashFlow', 'annualFinancingCashFlow', 'annualEndCashPosition',
      'annualRepurchaseOfCapitalStock',
    ];

    const [inc, bal, cf] = await Promise.all([
      this.fetchTimeseries(symbol, incomeTypes),
      this.fetchTimeseries(symbol, balanceTypes),
      this.fetchTimeseries(symbol, cashflowTypes),
    ]);

    // Build the union of report dates for a statement, newest 5.
    const datesFor = (map: Record<string, Record<string, number>>): string[] => {
      const set = new Set<string>();
      for (const t of Object.keys(map)) for (const d of Object.keys(map[t])) set.add(d);
      return Array.from(set).sort().slice(-5);
    };
    const val = (map: Record<string, Record<string, number>>, type: string, date: string) =>
      map[type]?.[date] ?? null;
    const pct = (a: number | null, b: number | null) =>
      a != null && b ? +((a / b) * 100).toFixed(2) : null;

    const incomeRows = datesFor(inc).map((date) => {
      const revenue = val(inc, 'annualTotalRevenue', date);
      const grossProfit = val(inc, 'annualGrossProfit', date);
      const operatingIncome = val(inc, 'annualOperatingIncome', date);
      const netIncome = val(inc, 'annualNetIncome', date);
      return {
        date,
        revenue,
        costOfRevenue: val(inc, 'annualCostOfRevenue', date),
        grossProfit,
        grossMargin: pct(grossProfit, revenue),
        sga: val(inc, 'annualSellingGeneralAndAdministration', date),
        researchDevelopment: val(inc, 'annualResearchAndDevelopment', date),
        operatingExpense: val(inc, 'annualOperatingExpense', date),
        operatingIncome,
        operatingMargin: pct(operatingIncome, revenue),
        ebitda: val(inc, 'annualEBITDA', date),
        interestExpense: val(inc, 'annualInterestExpense', date),
        pretaxIncome: val(inc, 'annualPretaxIncome', date),
        taxProvision: val(inc, 'annualTaxProvision', date),
        netIncome,
        profitMargin: pct(netIncome, revenue),
        basicEPS: val(inc, 'annualBasicEPS', date),
        dilutedEPS: val(inc, 'annualDilutedEPS', date),
        dilutedShares: val(inc, 'annualDilutedAverageShares', date),
      };
    });

    const balanceRows = datesFor(bal).map((date) => ({
      date,
      totalAssets: val(bal, 'annualTotalAssets', date),
      currentAssets: val(bal, 'annualCurrentAssets', date),
      cash: val(bal, 'annualCashAndCashEquivalents', date),
      totalLiabilities: val(bal, 'annualTotalLiabilitiesNetMinorityInterest', date),
      currentLiabilities: val(bal, 'annualCurrentLiabilities', date),
      totalDebt: val(bal, 'annualTotalDebt', date),
      totalEquity: val(bal, 'annualStockholdersEquity', date),
      retainedEarnings: val(bal, 'annualRetainedEarnings', date),
      workingCapital: val(bal, 'annualWorkingCapital', date),
    }));

    const cashflowRows = datesFor(cf).map((date) => ({
      date,
      operatingCashflow: val(cf, 'annualOperatingCashFlow', date),
      capex: val(cf, 'annualCapitalExpenditure', date),
      freeCashflow: val(cf, 'annualFreeCashFlow', date),
      investingCashflow: val(cf, 'annualInvestingCashFlow', date),
      financingCashflow: val(cf, 'annualFinancingCashFlow', date),
      buyback: val(cf, 'annualRepurchaseOfCapitalStock', date),
      endCashPosition: val(cf, 'annualEndCashPosition', date),
    }));

    // Year-over-year growth vs the prior annual period (rows are ascending).
    const yoy = (cur: number | null, prev: number | null): number | null =>
      cur != null && prev != null && prev !== 0
        ? +(((cur - prev) / Math.abs(prev)) * 100).toFixed(2)
        : null;
    for (let i = 0; i < incomeRows.length; i++) {
      const p = i > 0 ? incomeRows[i - 1] : null;
      (incomeRows[i] as any).revenueGrowth = yoy(incomeRows[i].revenue, p?.revenue ?? null);
      (incomeRows[i] as any).netIncomeGrowth = yoy(incomeRows[i].netIncome, p?.netIncome ?? null);
      (incomeRows[i] as any).epsGrowth = yoy(incomeRows[i].dilutedEPS, p?.dilutedEPS ?? null);
    }

    const data = {
      symbol,
      income: incomeRows,
      balance: balanceRows,
      cashflow: cashflowRows,
    };
    this.detailCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  }

  /** Quarterly income/balance/cash-flow statements — period-per-column table
   *  data for the Financials tab (newest first, up to 7 quarters + YoY). */
  async getQuarterlyStatements(symbolRaw: string): Promise<any> {
    const symbol = (symbolRaw || '').toUpperCase();
    const cacheKey = `stmtq:${symbol}`;
    const c = this.detailCache.get(cacheKey);
    if (c && Date.now() - c.ts < this.DETAIL_TTL_MS) return c.data;
    const Q = (names: string[]) => names.map((n) => `quarterly${n}`);
    const incomeTypes = Q([
      'TotalRevenue', 'CostOfRevenue', 'GrossProfit', 'SellingGeneralAndAdministration',
      'ResearchAndDevelopment', 'OperatingExpense', 'OperatingIncome', 'PretaxIncome',
      'TaxProvision', 'NetIncome', 'BasicEPS', 'DilutedEPS', 'BasicAverageShares',
    ]);
    const balanceTypes = Q([
      'TotalAssets', 'CurrentAssets', 'CashAndCashEquivalents', 'TotalLiabilitiesNetMinorityInterest',
      'CurrentLiabilities', 'TotalDebt', 'LongTermDebt', 'StockholdersEquity', 'RetainedEarnings',
    ]);
    const cashflowTypes = Q([
      'OperatingCashFlow', 'CapitalExpenditure', 'FreeCashFlow', 'InvestingCashFlow',
      'FinancingCashFlow', 'RepurchaseOfCapitalStock', 'EndCashPosition',
    ]);
    const [inc, bal, cf] = await Promise.all([
      this.fetchTimeseries(symbol, incomeTypes),
      this.fetchTimeseries(symbol, balanceTypes),
      this.fetchTimeseries(symbol, cashflowTypes),
    ]);
    const build = (map: Record<string, Record<string, number>>) => {
      const set = new Set<string>();
      for (const t of Object.keys(map)) for (const d of Object.keys(map[t])) set.add(d);
      // Newest first, keep 9 so the frontend can compute YoY for 5 shown.
      const dates = Array.from(set).sort().reverse().slice(0, 9);
      return dates.map((date) => {
        const values: Record<string, number | null> = {};
        for (const t of Object.keys(map)) values[t.replace(/^quarterly/, '')] = map[t]?.[date] ?? null;
        return { date, values };
      });
    };
    let income = build(inc);
    // Yahoo's quarterly timeseries is often thin (only the newest 1–2 quarters
    // carry revenue), so the YoY growth row shows for at most one quarter.
    // stockanalysis shows growth across several quarters, which needs ~9+
    // quarters of data (each quarter needs its year-ago counterpart). Backfill
    // from FMP whenever Yahoo can't cover that depth.
    const revCount = income.filter((r) => r.values.TotalRevenue != null).length;
    if (revCount < 9 && this.fmp?.enabled) {
      try {
        const fmpRows = await this.fmp.getQuarterlyIncomeRows(symbol, 13);
        if (fmpRows.length > revCount) income = fmpRows;
      } catch { /* keep Yahoo income */ }
    }
    const data = { symbol, income, balance: build(bal), cashflow: build(cf) };
    this.detailCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  }

  /** Analyst forecast block: price targets + recommendation trend counts. */
  async getForecast(symbolRaw: string): Promise<any> {
    const symbol = (symbolRaw || '').toUpperCase();
    const cacheKey = `fcast:${symbol}`;
    const c = this.detailCache.get(cacheKey);
    if (c && Date.now() - c.ts < this.DETAIL_TTL_MS) return c.data;
    const r = await this.fetchModules(symbol, 'financialData,recommendationTrend,price');
    const fd = r?.financialData ?? {};
    const price = r?.price ?? {};
    const num = (v: any) => (typeof v === 'number' ? v : (v?.raw ?? null));
    const t0 = (r?.recommendationTrend?.trend || []).find((t: any) => t.period === '0m') ||
      (r?.recommendationTrend?.trend || [])[0] || {};
    const data = {
      symbol,
      lastPrice: num(price.regularMarketPrice),
      targetMean: num(fd.targetMeanPrice),
      targetHigh: num(fd.targetHighPrice),
      targetLow: num(fd.targetLowPrice),
      targetMedian: num(fd.targetMedianPrice),
      analysts: num(fd.numberOfAnalystOpinions),
      recommendationKey: fd.recommendationKey ?? null,
      trend: {
        strongBuy: Number(t0.strongBuy) || 0,
        buy: Number(t0.buy) || 0,
        hold: Number(t0.hold) || 0,
        sell: Number(t0.sell) || 0,
        strongSell: Number(t0.strongSell) || 0,
      },
    };
    // FMP fallback for listings Yahoo leaves blank (esp. foreign .DE/.PA/…):
    //  • rating consensus is currency-agnostic → always safe to fill;
    //  • price targets only from FMP for THIS exact listing — we never graft a
    //    US-ADR USD target onto a EUR page (FMP returns [] for .DE, honored).
    const needTrend =
      data.trend.strongBuy + data.trend.buy + data.trend.hold + data.trend.sell + data.trend.strongSell === 0;
    const needTargets = data.targetMean == null && data.targetMedian == null;
    if ((needTrend || needTargets) && this.fmp?.enabled) {
      try {
        if (needTrend) {
          const g = await this.fmp.getGradesConsensus(symbol);
          if (g) {
            data.trend = {
              strongBuy: g.strongBuy,
              buy: g.buy,
              hold: g.hold,
              sell: g.sell,
              strongSell: g.strongSell,
            };
            if (!data.recommendationKey && g.consensus) {
              data.recommendationKey = g.consensus.toLowerCase().replace(/\s+/g, '_');
            }
            const gTotal = g.strongBuy + g.buy + g.hold + g.sell + g.strongSell;
            data.analysts = data.analysts ?? (gTotal || null);
          }
        }
        if (needTargets) {
          const pt = await this.fmp.getPriceTargetConsensus(symbol);
          if (pt && (pt.targetConsensus != null || pt.targetMedian != null)) {
            data.targetMean = pt.targetConsensus ?? data.targetMean;
            data.targetMedian = pt.targetMedian ?? data.targetMedian;
            data.targetHigh = pt.targetHigh ?? data.targetHigh;
            data.targetLow = pt.targetLow ?? data.targetLow;
          }
        }
      } catch {
        /* FMP unavailable — Yahoo values stand */
      }
    }

    this.detailCache.set(cacheKey, { ts: Date.now(), data });
    return data;
  }

  // ── Top ETF holders (reverse index over major ETFs' top-10 holdings) ──
  private etfIndex: { ts: number; map: Map<string, { etf: string; name: string; est: number | null; pct: number }[]> } | null = null;
  private readonly ETF_UNIVERSE = [
    'SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'SCHD', 'VUG', 'VTV', 'IWM', 'DIA',
    'XLK', 'XLF', 'XLV', 'XLE', 'XLY', 'XLP', 'XLI', 'XLU', 'XLC', 'SMH',
    'VIG', 'VYM', 'RSP', 'MGK',
  ];

  /** ETFs with the largest estimated position in a stock. Estimate = the
   *  fund's disclosed top-10 weight × fund AUM (Yahoo). Only stocks inside a
   *  major ETF's top 10 appear — honest empty state otherwise. */
  async getEtfHolders(symbolRaw: string): Promise<{ etf: string; name: string; est: number | null; pct: number }[]> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.etfIndex || Date.now() - this.etfIndex.ts > 24 * 60 * 60_000) {
      const map = new Map<string, { etf: string; name: string; est: number | null; pct: number }[]>();
      // Small batches to stay friendly with Yahoo.
      for (let i = 0; i < this.ETF_UNIVERSE.length; i += 6) {
        await Promise.all(
          this.ETF_UNIVERSE.slice(i, i + 6).map(async (etf) => {
            try {
              const r = await this.fetchModules(etf, 'topHoldings,summaryDetail,price');
              const holdings = r?.topHoldings?.holdings || [];
              const aum =
                (typeof r?.summaryDetail?.totalAssets === 'number'
                  ? r.summaryDetail.totalAssets
                  : r?.summaryDetail?.totalAssets?.raw) ?? null;
              const etfName = r?.price?.longName || r?.price?.shortName || etf;
              for (const h of holdings) {
                const sym = String(h.symbol || '').toUpperCase();
                if (!sym) continue;
                const pct =
                  (typeof h.holdingPercent === 'number' ? h.holdingPercent : h.holdingPercent?.raw) ?? 0;
                const list = map.get(sym) || [];
                list.push({ etf, name: etfName, est: aum ? Math.round(aum * pct) : null, pct: +(pct * 100).toFixed(2) });
                map.set(sym, list);
              }
            } catch { /* skip ETF */ }
          }),
        );
      }
      this.etfIndex = { ts: Date.now(), map };
    }
    return (this.etfIndex.map.get(symbol) || []).sort((a, b) => (b.est ?? 0) - (a.est ?? 0)).slice(0, 10);
  }

  /** Daily OHLCV history for the history tab + chart. */
  async getPriceHistory(symbolRaw: string, range = '1y'): Promise<any> {
    const symbol = (symbolRaw || '').toUpperCase();
    // Range → Yahoo interval, so 1D/5D show intraday and long ranges stay light.
    const INTERVAL: Record<string, string> = {
      '1d': '5m',
      '5d': '30m',
      '1mo': '1d',
      '3mo': '1d',
      '6mo': '1d',
      '1y': '1d',
      '2y': '1wk',
      '5y': '1wk',
    };
    const safeRange = INTERVAL[range] ? range : '1y';
    const interval = INTERVAL[safeRange];
    const intraday = safeRange === '1d' || safeRange === '5d';
    const cacheKey = `hist:${symbol}:${safeRange}`;
    const c = this.detailCache.get(cacheKey);
    // Intraday data goes stale fast — cache it for only 1 minute.
    const ttl = intraday ? 60_000 : this.DETAIL_TTL_MS;
    if (c && Date.now() - c.ts < ttl) return c.data;
    try {
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${safeRange}&interval=${interval}&includePrePost=false`,
      );
      const res = data?.chart?.result?.[0];
      const ts: number[] = res?.timestamp || [];
      const q = res?.indicators?.quote?.[0] || {};
      const bars: any[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = Number(q.close?.[i]);
        if (!Number.isFinite(close) || close <= 0) continue;
        const prev = bars.length ? bars[bars.length - 1].close : close;
        const iso = new Date(ts[i] * 1000).toISOString();
        bars.push({
          t: ts[i] * 1000, // ms epoch — lets the chart format date vs time
          date: intraday ? iso : iso.slice(0, 10),
          open: round2(q.open?.[i]),
          high: round2(q.high?.[i]),
          low: round2(q.low?.[i]),
          close: round2(close),
          volume: Number(q.volume?.[i]) || 0,
          changePct: prev ? +(((close - prev) / prev) * 100).toFixed(2) : 0,
        });
      }
      const out = { symbol, range: safeRange, interval, intraday, bars };
      this.detailCache.set(cacheKey, { ts: Date.now(), data: out });
      return out;
    } catch {
      return { symbol, range: safeRange, bars: [] };
    }
  }

  /** Analyst Ratings — consensus recommendation + price targets across the
   *  market universe, sorted by analyst-implied upside. Pass `symbols` to get
   *  coverage for an arbitrary ticker set (e.g. the Insider Score tables)
   *  instead of the default most-covered universe. */
  async getAnalystRatings(symbols?: string[]): Promise<AnalystRow[]> {
    if (symbols && symbols.length) {
      const key = `analyst:${[...symbols].sort().join(',').slice(0, 400)}`;
      return this.cachedTool(key, () => this.buildAnalystRatings(symbols), 20);
    }
    return this.cachedTool("analyst", () => this.buildAnalystRatings(), 20);
  }
  private async buildAnalystRatings(symbols?: string[]): Promise<AnalystRow[]> {
    const syms =
      symbols && symbols.length
        ? Array.from(new Set(symbols.map((s) => s.toUpperCase()))).slice(0, 250)
        : this.universe();
    // Consensus comes from the v7 batch quote (averageAnalystRating), which is
    // reliable on the server. Price targets need the per-symbol summary, which
    // Yahoo blocks from datacenter IPs — so we fetch it only as a time-boxed
    // best-effort and never let it starve the table.
    const quotes = await this.getQuoteBatch(syms);
    let summaries = new Map<string, any>();
    try {
      summaries = await Promise.race([
        this.summaryBatch(syms),
        new Promise<Map<string, any>>((res) => setTimeout(() => res(new Map()), 20000)),
      ]);
    } catch {
      /* targets unavailable — consensus from the quote is enough */
    }
    const RECO: Record<string, string> = {
      "strong buy": "strong_buy",
      buy: "buy",
      outperform: "buy",
      hold: "hold",
      neutral: "hold",
      underperform: "underperform",
      sell: "sell",
      "strong sell": "strong_sell",
    };
    const rows: AnalystRow[] = [];
    for (const sym of syms) {
      const q = quotes.get(sym);
      const fd = summaries.get(sym)?.financialData;
      const ref = REFERENCE_QUOTES[sym];
      const price = q?.price ?? ref?.price ?? 0;
      const label = q?.analystLabel ?? null;
      const recommendation =
        fd?.recommendationKey ??
        (label ? RECO[label.toLowerCase()] ?? label.toLowerCase().replace(/\s+/g, "_") : null);
      if (!price || !recommendation) continue; // only covered names
      const targetMean = fd?.targetMeanPrice?.raw ?? null;
      const upsidePct =
        targetMean && price ? +(((targetMean - price) / price) * 100).toFixed(2) : null;
      // Rating breakdown from the current-month recommendation trend.
      const trendArr = summaries.get(sym)?.recommendationTrend?.trend || [];
      const t0 = trendArr.find((t: any) => t.period === '0m') || trendArr[0] || null;
      let buyRatings: number | null = null;
      let holdRatings: number | null = null;
      let sellRatings: number | null = null;
      let totalRatings: number | null = null;
      if (t0) {
        const sb = Number(t0.strongBuy) || 0;
        const b = Number(t0.buy) || 0;
        const h = Number(t0.hold) || 0;
        const s = Number(t0.sell) || 0;
        const ss = Number(t0.strongSell) || 0;
        const tot = sb + b + h + s + ss;
        if (tot > 0) {
          buyRatings = sb + b;
          holdRatings = h;
          sellRatings = s + ss;
          totalRatings = tot;
        }
      }
      rows.push({
        symbol: sym,
        name: q?.name ?? ref?.name ?? sym,
        sector: q?.sector ?? ref?.sector ?? null,
        price,
        targetMean,
        targetHigh: fd?.targetHighPrice?.raw ?? null,
        targetLow: fd?.targetLowPrice?.raw ?? null,
        upsidePct,
        recommendation,
        numAnalysts: fd?.numberOfAnalystOpinions?.raw ?? null,
        buyRatings,
        holdRatings,
        sellRatings,
        totalRatings,
      });
    }
    // FMP grades-consensus fallback for rows Yahoo left without a trend
    // breakdown (foreign listings, thin coverage) — bounded concurrency so a
    // universe refresh doesn't hammer FMP.
    if (this.fmp?.enabled) {
      // Cap the fallback so a full-universe refresh can't exhaust the FMP
      // budget; remaining rows simply show no breakdown.
      const missing = rows.filter((r) => r.totalRatings == null).slice(0, 80);
      const CONC = 5;
      for (let i = 0; i < missing.length; i += CONC) {
        const chunk = missing.slice(i, i + CONC);
        await Promise.all(
          chunk.map(async (r) => {
            try {
              const g = await this.fmp!.getGradesConsensus(r.symbol);
              if (!g) return;
              const tot = g.strongBuy + g.buy + g.hold + g.sell + g.strongSell;
              if (tot > 0) {
                r.buyRatings = g.strongBuy + g.buy;
                r.holdRatings = g.hold;
                r.sellRatings = g.sell + g.strongSell;
                r.totalRatings = tot;
                if (r.numAnalysts == null) r.numAnalysts = tot;
              }
            } catch {
              /* leave blank */
            }
          }),
        );
      }
    }
    // Strongest consensus first (falls back to this when no upside is known).
    const strength: Record<string, number> = {
      strong_buy: 5, buy: 4, hold: 3, underperform: 2, sell: 2, strong_sell: 1,
    };
    rows.sort(
      (a, b) =>
        (b.upsidePct ?? -999) - (a.upsidePct ?? -999) ||
        (strength[b.recommendation ?? ""] ?? 0) - (strength[a.recommendation ?? ""] ?? 0),
    );
    return rows;
  }

  /** Market heat-map feed — the biggest U.S. companies (by market cap) with
   *  live intraday change and sector, for the market heatmap. Sourced from the
   *  v7 batch quote (reliable on the server), largest first. */
  async getMarketHeatmap(): Promise<MarketStatRow[]> {
    return this.cachedTool(
      "heatmap",
      async () => {
        const quotes = await this.getQuoteBatch(this.universe());
        return Array.from(quotes.values())
          .filter((r) => (r.marketCap ?? 0) > 0 && r.price > 0)
          // Authoritative sector (Yahoo omits it on the fast quote path) so the
          // heatmap groups cleanly with no "Other" bucket.
          .map((r) => ({ ...r, sector: SECTOR_BY_TICKER[r.symbol] ?? r.sector ?? "Other" }))
          .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
      },
      20,
    );
  }

  /** Dividends — yield, rate, payout and ex-date for every dividend payer in
   *  the universe, highest yield first. */
  async getDividends(): Promise<DividendRow[]> {
    return this.cachedTool("dividends", () => this.buildDividends(), 15);
  }
  private async buildDividends(): Promise<DividendRow[]> {
    const syms = this.universe();
    // Built entirely from the v7 batch quote (reliable on the server). We do
    // NOT call the per-symbol summary here — Yahoo blocks it from datacenter
    // IPs, and 250 slow/failing summary calls would blow the request budget
    // and starve the table. Payout ratio / ex-date are omitted as a result.
    const quotes = await this.getQuoteBatch(syms);
    const rows: DividendRow[] = [];
    for (const sym of syms) {
      const q = quotes.get(sym);
      const ref = REFERENCE_QUOTES[sym];
      const price = q?.price ?? ref?.price ?? 0;
      const rate = q?.dividendRate ?? null;
      const yieldPct = q?.dividendYield ?? null;
      if (!price || !rate || !yieldPct) continue; // dividend payers only
      rows.push({
        symbol: sym,
        name: q?.name ?? ref?.name ?? sym,
        sector: q?.sector ?? ref?.sector ?? null,
        price,
        dividendYield: yieldPct,
        dividendRate: rate,
        payoutRatio: null,
        exDividendDate: null,
        marketCap: q?.marketCap ?? ref?.marketCap ?? null,
      });
    }
    rows.sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0));
    return rows;
  }

  /** Short Interest — shares short, % of float, days-to-cover and the
   *  month-over-month change, most-shorted first. */
  async getShortInterest(): Promise<ShortInterestRow[]> {
    return this.cachedTool("short-interest", () => this.buildShortInterest());
  }
  private async buildShortInterest(): Promise<ShortInterestRow[]> {
    const syms = this.universe();
    const [quotes, summaries] = await Promise.all([
      this.getQuoteBatch(syms),
      this.summaryBatch(syms),
    ]);
    const rows: ShortInterestRow[] = [];
    for (const sym of syms) {
      const q = quotes.get(sym);
      const ks = summaries.get(sym)?.defaultKeyStatistics;
      const ref = REFERENCE_QUOTES[sym];
      const price = q?.price ?? ref?.price ?? 0;
      const sharesShort = ks?.sharesShort?.raw ?? null;
      if (!price || !sharesShort) continue;
      const prior = ks?.sharesShortPriorMonth?.raw ?? null;
      const changePct =
        prior && sharesShort ? +(((sharesShort - prior) / prior) * 100).toFixed(1) : null;
      rows.push({
        symbol: sym,
        name: q?.name ?? ref?.name ?? sym,
        sector: q?.sector ?? ref?.sector ?? null,
        price,
        sharesShort,
        sharesShortPrior: prior,
        shortPctFloat: ks?.shortPercentOfFloat?.raw != null ? +(ks.shortPercentOfFloat.raw * 100).toFixed(2) : null,
        shortRatio: ks?.shortRatio?.raw ?? null,
        changePct,
        marketCap: q?.marketCap ?? ref?.marketCap ?? null,
      });
    }
    rows.sort((a, b) => (b.shortPctFloat ?? 0) - (a.shortPctFloat ?? 0));
    return rows;
  }

  // ──────────────────────────────────────────────────────────────────
  // Historical daily closes (Yahoo v8 chart) — powers the earnings
  // performance backtest (price reaction around report dates).
  // ──────────────────────────────────────────────────────────────────
  private dailyClosesCache = new Map<string, { ts: number; data: { t: number; c: number }[] }>();

  /** Daily closing prices for ~`days` back. Returns [{t: unixSeconds, c: close}]
   *  ascending. Cached 6h. Empty on failure. */
  async getDailyCloses(symbol: string, days = 400): Promise<{ t: number; c: number }[]> {
    const sym = symbol.toUpperCase();
    const cached = this.dailyClosesCache.get(sym);
    if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) return cached.data;

    const range =
      days <= 35 ? '1mo' : days <= 95 ? '3mo' : days <= 185 ? '6mo' : days <= 370 ? '1y' : '2y';
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const host = sym.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
        const { data } = await this.http.get(
          `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=${range}&interval=1d`,
        );
        const result = data?.chart?.result?.[0];
        const ts: number[] = result?.timestamp || [];
        const closes: (number | null)[] = result?.indicators?.quote?.[0]?.close || [];
        const out: { t: number; c: number }[] = [];
        for (let i = 0; i < ts.length; i++) {
          const c = closes[i];
          if (c != null && Number(c) > 0) out.push({ t: ts[i], c: Number(c) });
        }
        this.dailyClosesCache.set(sym, { ts: Date.now(), data: out });
        return out;
      } catch {
        /* retry once */
      }
    }
    return [];
  }

  // ──────────────────────────────────────────────────────────────────
  // Wall Street research-firm league table.
  //
  // Yahoo's upgradeDowngradeHistory gives us every rating action on a ticker
  // attributed to a FIRM (no analyst name is published anywhere free), and
  // getCloseHistory gives the forward prices to score it. Sweeping the whole
  // universe is ~2 calls per ticker, which is far too slow for one request on
  // a cold instance — so a request serves whatever is already gathered and
  // kicks the rest off in the background, filling in over subsequent loads.
  // ──────────────────────────────────────────────────────────────────
  private firmRatings = new Map<string, RatingOutcome[]>();
  private firmSweepAt = 0;
  private firmSweeping = false;
  private readonly FIRM_TTL_MS = 12 * 60 * 60_000;
  /** Symbols pulled before the first response returns — keeps cold starts fast. */
  private readonly FIRM_EAGER = 30;
  private readonly FIRM_CONCURRENCY = 6;

  /** Ratings for one ticker, joined to forward returns. Cached via the
   *  underlying quoteSummary + close-history caches. */
  private async ratingsForSymbol(symbol: string): Promise<RatingOutcome[]> {
    const sym = symbol.toUpperCase();
    const summary = await this.fetchQuoteSummary(sym, 'upgradeDowngradeHistory');
    const history: any[] = summary?.upgradeDowngradeHistory?.history || [];
    if (!history.length) return [];

    const closes = await this.getCloseHistory(sym, '5y');
    if (!closes.length) return [];
    const priceAt = (ms: number) => MarketStatsService.closeOn(closes, ms);
    const now = Date.now();

    const out: RatingOutcome[] = [];
    for (const h of history) {
      const firm = String(h?.firm || '').trim();
      const epoch = Number(h?.epochGradeDate);
      if (!firm || !Number.isFinite(epoch) || epoch <= 0) continue;
      // Yahoo mixes seconds and milliseconds across records.
      const dateMs = epoch > 1e12 ? epoch : epoch * 1000;
      if (dateMs > now) continue;
      const direction = classifyGrade(String(h?.toGrade || ''));
      out.push({
        firm,
        symbol: sym,
        dateMs,
        direction,
        directionalReturn: scoreRating(direction, dateMs, now, priceAt),
      });
    }
    return out;
  }

  /** Walk the universe filling `firmRatings`. Fire-and-forget. */
  private async sweepFirmRatings(symbols: string[]): Promise<void> {
    if (this.firmSweeping) return;
    this.firmSweeping = true;
    try {
      for (let i = 0; i < symbols.length; i += this.FIRM_CONCURRENCY) {
        const chunk = symbols.slice(i, i + this.FIRM_CONCURRENCY);
        const results = await Promise.all(
          chunk.map((s) => this.ratingsForSymbol(s).catch(() => [])),
        );
        results.forEach((rows, j) => {
          if (rows.length) this.firmRatings.set(chunk[j], rows);
        });
      }
      this.firmSweepAt = Date.now();
    } finally {
      this.firmSweeping = false;
    }
  }

  /**
   * Ranked research firms, best first. `coverage` reports how much of the
   * universe has been gathered so the UI can say the table is still filling in
   * rather than presenting a partial sweep as final.
   */
  async getAnalystFirms(
    limit = 100,
  ): Promise<{
    rows: AnalystFirmRow[];
    coverage: { symbols: number; universe: number; ratings: number };
  }> {
    const universe = this.universe();
    const stale = Date.now() - this.firmSweepAt > this.FIRM_TTL_MS;

    // Nothing gathered yet → pull a small slice inline so the first paint has
    // real rows, then let the background sweep finish the rest. The slice is
    // STRIDED across the universe, not the first N: the universe is grouped by
    // sector, so taking the head would make every firm's "main sector" look
    // like tech until the background sweep caught up (and on a serverless
    // instance that may never happen before it's frozen).
    if (!this.firmRatings.size) {
      const stride = Math.max(1, Math.floor(universe.length / this.FIRM_EAGER));
      const eager: string[] = [];
      for (let i = 0; i < universe.length && eager.length < this.FIRM_EAGER; i += stride) {
        eager.push(universe[i]);
      }
      const results = await Promise.all(
        eager.map((s) => this.ratingsForSymbol(s).catch(() => [])),
      );
      results.forEach((rows, j) => {
        if (rows.length) this.firmRatings.set(eager[j], rows);
      });
    }

    if ((stale || this.firmRatings.size < universe.length) && !this.firmSweeping) {
      const remaining = universe.filter((s) => !this.firmRatings.has(s));
      const todo = stale ? universe : remaining;
      if (todo.length) {
        void this.sweepFirmRatings(todo).catch((err) =>
          this.logger.warn(`firm rating sweep failed: ${err?.message || err}`),
        );
      }
    }

    const outcomes: RatingOutcome[] = [];
    for (const rows of this.firmRatings.values()) outcomes.push(...rows);

    const rows = aggregateFirms(
      outcomes,
      (sym) => SECTOR_BY_TICKER[sym] ?? null,
      Date.now(),
    ).slice(0, limit);

    return {
      rows,
      coverage: {
        symbols: this.firmRatings.size,
        universe: universe.length,
        ratings: outcomes.length,
      },
    };
  }
}
