import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { REFERENCE_QUOTES, ReferenceQuote } from './reference-quotes';
import { MARKET_UNIVERSE } from './market-universe';
import { SECTOR_BY_TICKER } from './market-sectors';

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

  constructor() {
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
      for (let offset = 0; offset < opts.limit && offset < 1000; offset += PAGE) {
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

  async getTopGainers(limit = 100) {
    const rows = await this.screenYahoo({
      key: 'gainers',
      sortField: 'percentchange',
      sortType: 'DESC',
      operands: [
        { operator: 'GT', operands: ['intradayprice', 1] },
        { operator: 'GT', operands: ['dayvolume', 20000] },
        { operator: 'EQ', operands: ['region', 'us'] },
        this.MAJOR_EXCHANGE_OPERAND,
      ],
      limit,
    });
    const base = rows.length ? rows : await this.fetchScreener('day_gainers', limit);
    return this.onlyMajorExchanges(base).slice(0, limit);
  }
  async getTopLosers(limit = 100) {
    // Yahoo's screener 500s on an ASC percentchange sort, so pull a large pool
    // of decliners ordered by volume (works) and sort biggest-loss-first here.
    const pool = await this.screenYahoo({
      key: 'losers',
      sortField: 'dayvolume',
      sortType: 'DESC',
      operands: [
        { operator: 'LT', operands: ['percentchange', 0] },
        { operator: 'GT', operands: ['intradayprice', 1] },
        { operator: 'GT', operands: ['dayvolume', 20000] },
        { operator: 'EQ', operands: ['region', 'us'] },
        this.MAJOR_EXCHANGE_OPERAND,
      ],
      limit: Math.max(limit, 500),
    });
    const base = pool.length ? pool : await this.fetchScreener('day_losers', limit);
    return this.onlyMajorExchanges([...base].sort((a, b) => a.changePct - b.changePct)).slice(
      0,
      limit,
    );
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

    // Anything Yahoo couldn't resolve falls back to the static reference
    // snapshot so tables never render empty cells for known tickers.
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
      this.logger.warn(`Quote batch: ${missed}/${unique.length} symbols unresolved (no live quote or reference entry).`);
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
  private readonly SUMMARY_MODULES = 'financialData,summaryDetail,defaultKeyStatistics';

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
    return MARKET_UNIVERSE;
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

    const data = {
      symbol,
      income: incomeRows,
      balance: balanceRows,
      cashflow: cashflowRows,
    };
    this.detailCache.set(cacheKey, { ts: Date.now(), data });
    return data;
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
   *  market universe, sorted by analyst-implied upside. */
  async getAnalystRatings(): Promise<AnalystRow[]> {
    return this.cachedTool("analyst", () => this.buildAnalystRatings(), 20);
  }
  private async buildAnalystRatings(): Promise<AnalystRow[]> {
    const syms = this.universe();
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
      });
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
}
