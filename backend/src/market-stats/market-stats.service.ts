import { Injectable, Logger, Optional } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { FmpService } from '../fmp/fmp.service';
import { MarketSnapshotService } from './market-snapshot.service';
import { PeCacheService } from './pe-cache.service';
import { REFERENCE_QUOTES, ReferenceQuote } from './reference-quotes';
import {
  EXCLUDED_UNIVERSE_INDUSTRIES,
  MARKET_UNIVERSE,
  UNIVERSE_MIN_MARKET_CAP,
  UNIVERSE_SCREENER_QUERY,
} from './market-universe';
import { SECTOR_BY_TICKER, sectorFromFmp } from './market-sectors';
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
  changePct: number | null;
  peRatio: number | null;
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
  private toolCache = new Map<string, { ts: number; data: any; ttl?: number }>();
  private readonly TOOL_CACHE_MS = 15 * 60_000;
  /** Short TTL for a result that is well-formed but not fully enriched — see
   *  the `isComplete` parameter on cachedTool. Long enough to protect latency
   *  against a rebuild storm, short enough that gaps are not user-visible for
   *  a quarter of an hour. */
  private readonly TOOL_PARTIAL_TTL_MS = 90_000;

  /** `isComplete` distinguishes a result that has the right SHAPE from one that
   *  is fully ENRICHED. Some builds (dividends) fill per-symbol columns under a
   *  wall-clock budget, so a cold build can return every row with only the first
   *  ~40 enriched. Caching that for the full TTL is what made a cold build's
   *  blanks look permanent in production — measured 187/227 blank ex-dates on a
   *  cold window while a warm one showed 0/227. Such a result is still served
   *  (partial data beats none) but cached only briefly, so the next request
   *  rebuilds against the now-warm per-symbol caches and converges in ~90s
   *  instead of being frozen for 15 minutes. Callers that pass nothing keep the
   *  previous behaviour exactly. */
  private async cachedTool<T>(
    key: string,
    build: () => Promise<T[]>,
    minHealthy = 1,
    isComplete?: (data: T[]) => boolean,
  ): Promise<T[]> {
    const hit = this.toolCache.get(key);
    if (hit && Date.now() - hit.ts < (hit.ttl ?? this.TOOL_CACHE_MS)) {
      return hit.data as T[];
    }
    try {
      const data = await build();
      const prevLen = hit?.data?.length ?? 0;
      // Only persist a "healthy" result. A cold-start auth race or a blocked
      // Yahoo endpoint can yield a near-empty build; caching that would pin the
      // table to garbage for the whole TTL. Instead we return it but skip the
      // cache so the very next request rebuilds (auth is warm by then).
      const healthy = data.length >= minHealthy && data.length >= prevLen * 0.6;
      if (healthy || !hit) {
        if (healthy) {
          const complete = !isComplete || isComplete(data);
          this.toolCache.set(key, {
            ts: Date.now(),
            data,
            ttl: complete ? undefined : this.TOOL_PARTIAL_TTL_MS,
          });
        }
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

  /** Authoritative sector for a ticker. Yahoo's fast quote and screener payloads
   *  omit `sector` for most names, so the static map — which covers every ticker
   *  in the curated fallback list — is consulted FIRST, then the screener
   *  snapshot's own sector/industry (translated into the SAME TRBC buckets, so
   *  the thousands of dynamic names group with the curated ones instead of
   *  forming a parallel set of headings), and only then whatever the feed
   *  happened to return. Pure in-memory lookup: zero added latency, so every
   *  builder that emits a sector can afford it. */
  private sectorFor(symbol: string, feedSector: string | null = null): string | null {
    const sym = (symbol || '').toUpperCase();
    const curated = SECTOR_BY_TICKER[sym];
    if (curated) return curated;
    const row = this.universeRow(sym);
    return sectorFromFmp(row?.sector, row?.industry) ?? feedSector ?? null;
  }

  /** Resolve `p`, or give up after `ms` and hand back `fallback`. The FMP client
   *  allows itself a 15s timeout, which alone would blow the ~10s serverless
   *  gateway budget — so every gap-filling call below is wrapped and can only
   *  ever cost its own slice of the budget, never the whole request. */
  private withTimeout<T>(p: Promise<T>, ms: number, fallback: T): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]).finally(() => clearTimeout(timer));
  }

  // ---- P/E gap-filler --------------------------------------------------
  // Yahoo omits trailingPE from BOTH the screener payload and the v7 fast quote
  // for most names, which is why the "P/E" column renders em-dashes across the
  // movers, dividend, short-interest and rankings tables.
  //
  // The only working FMP source is `ratios-ttm`, which takes ONE symbol per
  // request — verified: `ratios-ttm?symbol=AAPL,MSFT,USB` returns zero rows, and
  // `batch-quote` carries no `pe` field at all. So this CANNOT be batched, and
  // the design is built around that: bounded concurrency, a symbol cap, a
  // wall-clock budget, and rows filled in the order they appear (tables are
  // sorted most-visible-first, so a budget that only reaches part of the list
  // fills the rows a user actually sees). Coverage then converges across
  // requests via the 24h cache inside FmpService.getPeRatioTtm — which caches
  // MISSES too, so a loss-making or unknown symbol costs one request per day,
  // not one per page load. No local cache here: duplicating it would only
  // shorten that TTL and split coverage away from the other callers of the same
  // FMP cache.
  private readonly PE_CONCURRENCY = 8;
  /** Above this many symbols in one quote batch, the shared hot-path P/E top-up
   *  is skipped — see the note at the end of getQuoteBatch. */
  private readonly PE_HOT_PATH_MAX_SYMBOLS = 1_000;

  /** Fill `peRatio` in place for rows the feed left blank. Never throws — a
   *  failure or an exhausted budget leaves the remaining cells exactly as they
   *  were, and the next request resumes where this one stopped. Only POSITIVE
   *  ratios are published: a loss-making company genuinely has no trailing P/E
   *  and must stay an em-dash rather than show a negative multiple. */
  private async fillPeRatios(
    rows: Array<{ symbol: string; peRatio?: number | null }>,
    maxSymbols = 120,
    budgetMs = 2_500,
  ): Promise<void> {
    if (!rows.length) return;
    let pending: string[] = [];
    const seen = new Set<string>();
    for (const r of rows) {
      if (r.peRatio != null) continue;
      const sym = (r.symbol || '').toUpperCase();
      if (!sym || seen.has(sym)) continue;
      seen.add(sym);
      pending.push(sym);
    }
    if (!pending.length) return;

    // The bulk cache answers the whole page in ONE indexed query, so it runs
    // before the budgeted per-symbol sweep and is NOT capped by maxSymbols —
    // that cap only ever existed to bound HTTP fan-out. Whatever the table is
    // missing (a symbol refreshed since the last bulk run, or a refresh that
    // never happened) still falls through to the original path below, so this
    // is strictly additive: worst case it fills nothing and behaviour is
    // exactly what it was.
    const cached = await this.peCache?.lookup(pending);
    if (cached?.size) {
      for (const r of rows) {
        if (r.peRatio != null) continue;
        const pe = cached.get((r.symbol || '').toUpperCase());
        if (pe != null) r.peRatio = pe;
      }
      pending = pending.filter((s) => !cached.has(s));
    }

    if (!this.fmp?.enabled || budgetMs <= 0) return;
    const todo = pending.slice(0, maxSymbols);
    if (!todo.length) return;
    const deadline = Date.now() + budgetMs;
    const resolved = new Map<string, number>();
    for (let i = 0; i < todo.length && Date.now() < deadline; i += this.PE_CONCURRENCY) {
      const chunk = todo.slice(i, i + this.PE_CONCURRENCY);
      const settled = await Promise.all(
        chunk.map((sym) =>
          this.withTimeout(
            this.fmp!.getPeRatioTtm(sym).catch(() => null),
            Math.max(500, deadline - Date.now()),
            null,
          ),
        ),
      );
      chunk.forEach((sym, j) => {
        const pe = settled[j];
        if (pe != null && pe > 0) resolved.set(sym, pe);
      });
    }
    if (!resolved.size) return;
    for (const r of rows) {
      if (r.peRatio != null) continue;
      const pe = resolved.get((r.symbol || '').toUpperCase());
      if (pe != null) r.peRatio = pe;
    }
  }

  constructor(
    @Optional() private readonly fmp?: FmpService,
    @Optional() private readonly peCache?: PeCacheService,
    @Optional() private readonly snapshot?: MarketSnapshotService,
  ) {
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
        sector: this.sectorFor(String(q.symbol || ''), q.sector ?? null),
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
        // Page failures are contained: Yahoo intermittently 500s on deep
        // offsets, and letting that throw out of the loop used to discard every
        // row already collected — the caller then fell back to the predefined
        // screener, which caps at 25 rows. Keep what we have and stop paging.
        let quotes: any[] = [];
        try {
          const { data } = await this.http.post(
            `https://query1.finance.yahoo.com/v1/finance/screener?crumb=${encodeURIComponent(auth.crumb)}&lang=en-US&region=US`,
            body,
            { headers: { Cookie: auth.cookie, 'Content-Type': 'application/json' } },
          );
          quotes = data?.finance?.result?.[0]?.quotes || [];
        } catch (err: any) {
          this.logger.warn(
            `Yahoo screen ${opts.key} page@${offset} failed: ${err?.message || err}. Keeping ${out.length} rows.`,
          );
          break;
        }
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
            // Yahoo's screener payload carries no sector at all; the static map
            // covers the universe names that show up in the movers lists.
            sector: this.sectorFor(symbol, q.sector ?? null),
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

  /** FMP names exchanges; Yahoo codes them, and every filter downstream (plus
   *  the rendered column) speaks Yahoo. Translate so a snapshot-backed row is
   *  indistinguishable from a scraped one. */
  private static readonly FMP_EXCHANGE_CODE: Record<string, string> = {
    NASDAQ: 'NMS',
    NYSE: 'NYQ',
  };

  /** How old a snapshot may be and still be called "today's movers". Sized to
   *  the intraday refresh cadence plus slack, so one missed cron degrades to
   *  the live scrape instead of publishing stale movers. */
  private readonly SNAPSHOT_MOVER_MAX_AGE_MS = 90 * 60_000;

  /**
   * Movers straight off the licensed FMP snapshot, shaped exactly like the
   * scraped rows.
   *
   * Returns [] whenever the snapshot can't answer — table empty, stale, or
   * fewer rows than a real market day produces — so each caller falls through
   * to the Yahoo path unchanged. That "empty means fall back" contract is what
   * makes this safe to ship: the worst case is the behaviour we already had.
   */
  private async snapshotMovers(
    order: 'gainers' | 'losers' | 'volume',
    limit: number,
  ): Promise<MarketStatRow[]> {
    if (!this.snapshot) return [];
    const rows = await this.snapshot.query({
      order,
      limit,
      minChangePct:
        order === 'gainers' ? this.MOVER_MIN_PCT
        : order === 'losers' ? -this.MOVER_MIN_PCT
        : undefined,
      exchanges: Object.keys(MarketStatsService.FMP_EXCHANGE_CODE),
      // Movers are an INTRADAY question. A snapshot older than this would
      // answer "who moved this morning" while the page claims "today", so it is
      // rejected and the live scrape answers instead. This is why the snapshot
      // is refreshed through the session rather than once a day.
      maxAgeMs: this.SNAPSHOT_MOVER_MAX_AGE_MS,
    });
    if (!rows.length) return [];
    return rows.map<MarketStatRow>((r) => ({
      symbol: r.symbol,
      name: r.name,
      price: r.price,
      changeAbs: r.changeAbs,
      changePct: r.changePct,
      volume: r.volume,
      avgVolume: r.avgVolume,
      marketCap: r.marketCap,
      // Route through sectorFor so snapshot names land in the SAME TRBC buckets
      // as the curated ones instead of forming a parallel set of headings.
      sector: this.sectorFor(r.symbol, r.sector),
      exchange: MarketStatsService.FMP_EXCHANGE_CODE[r.exchange || ''] ?? r.exchange,
      fiftyTwoWeekHigh: r.fiftyTwoWeekHigh,
      fiftyTwoWeekLow: r.fiftyTwoWeekLow,
      peRatio: null,
      dividendRate: r.lastDividend,
      dividendYield:
        r.lastDividend != null && r.price > 0
          ? +((r.lastDividend / r.price) * 100).toFixed(2)
          : null,
    }));
  }

  async getTopGainers(limit = 500) {
    // Licensed snapshot first; the Yahoo scrape below stays as the fallback.
    const fromSnapshot = await this.snapshotMovers('gainers', limit);
    if (fromSnapshot.length) {
      await this.fillPeRatios(fromSnapshot);
      return fromSnapshot;
    }
    // Mirrors getTopLosers exactly: Yahoo's screener is unreliable when asked to
    // SORT on percentchange (it 500s outright on ASC, and intermittently on deep
    // DESC pages), which used to collapse this endpoint onto the predefined
    // screener and its hard 25-row cap. Pull a large pool ordered by volume —
    // the sort field that works — and rank biggest-gain-first here.
    const pool = await this.screenYahoo({
      key: 'gainers',
      sortField: 'dayvolume',
      sortType: 'DESC',
      operands: [
        { operator: 'GT', operands: ['percentchange', this.MOVER_MIN_PCT] },
        { operator: 'GT', operands: ['intradayprice', 1] },
        { operator: 'GT', operands: ['dayvolume', 20000] },
        { operator: 'EQ', operands: ['region', 'us'] },
        this.MAJOR_EXCHANGE_OPERAND,
      ],
      limit: Math.max(limit, 500),
    });
    const base = pool.length ? pool : await this.fetchScreener('day_gainers', limit);
    const rows = this.onlyMajorExchanges(
      [...base].sort((a, b) => b.changePct - a.changePct),
    )
      .filter((r) => r.changePct >= this.MOVER_MIN_PCT)
      .slice(0, limit);
    // "P/E" is a rendered column here and the screener payload omits trailingPE
    // for ~3 of every 4 movers — fill it from FMP's batch quote.
    await this.fillPeRatios(rows);
    return rows;
  }
  async getTopLosers(limit = 500) {
    const fromSnapshot = await this.snapshotMovers('losers', limit);
    if (fromSnapshot.length) {
      await this.fillPeRatios(fromSnapshot);
      return fromSnapshot;
    }
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
    const rows = this.onlyMajorExchanges(
      [...base].sort((a, b) => a.changePct - b.changePct),
    )
      .filter((r) => r.changePct <= -this.MOVER_MIN_PCT)
      .slice(0, limit);
    await this.fillPeRatios(rows);
    return rows;
  }
  async getMostActive(limit = 100) {
    const fromSnapshot = await this.snapshotMovers('volume', limit);
    if (fromSnapshot.length) return fromSnapshot;
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
            sector: this.sectorFor(symbol, q.sector ?? null),
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

  // Batch size and parallelism for the v7 quote, both MEASURED rather than
  // guessed. The endpoint was being asked for 50 symbols per request, one chunk
  // at a time; it in fact accepts far more, and sweeping the whole $100M+
  // universe (4,311 symbols) came out as:
  //     50 × serial   ~87 calls   (never completed inside the budget)
  //    200 × 4 conc   22 calls    11.1s
  //    200 × 8 conc   22 calls    17.7s   ← Yahoo throttles wide fan-out
  //    400 × 6 conc   11 calls     6.2s
  //    500 × 3 conc    9 calls     3.7–5.1s, 4,307/4,311 resolved, 0 failures
  //   1000 × 2 conc    5 calls     6.0s
  // 500×3 is the sweet spot: fewest round trips at the concurrency Yahoo serves
  // fastest. Going wider is slower, not faster, so this is not a knob to turn up.
  private readonly V7_CHUNK = 500;
  private readonly V7_CONCURRENCY = 3;

  /** Primary live source — v7 batch quote (real market cap + 3-month avg
   *  volume). `deadlineMs` (epoch ms) makes a whole-universe sweep time-boxed:
   *  chunks are ordered largest-cap-first by the caller, so a sweep that runs
   *  out of budget returns the most-viewed names and the rest fill in on the
   *  next request from the shared 10-minute quote cache. */
  private async fetchQuoteV7(
    symbols: string[],
    opts: { deadlineMs?: number } = {},
  ): Promise<Map<string, MarketStatRow>> {
    const out = new Map<string, MarketStatRow>();
    // Checked BEFORE the handshake, not just around the chunks: getAuth() is two
    // HTTP calls against a 10s client timeout, and a throttled fc.yahoo.com has
    // been observed taking 10.9s on its own. A caller whose budget is already
    // spent must not start it — otherwise it pays the handshake and then finds it
    // has no time left to use the crumb for.
    if (opts.deadlineMs != null && Date.now() >= opts.deadlineMs) return out;
    let auth = await this.getAuth();
    if (!auth) return out;
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += this.V7_CHUNK) {
      chunks.push(symbols.slice(i, i + this.V7_CHUNK));
    }
    // A deadline that only gates the START of each round is not a guarantee: the
    // HTTP client allows each request 10s, so one round of slow chunks can run
    // far past it (measured: a 27s analyst build against an 8s budget). The whole
    // sweep is therefore also RACED against the deadline. Racing is safe because
    // chunks write into `out` as they resolve, so abandoning the wait keeps every
    // row that has already landed.
    const fetchChunk = async (chunk: string[]): Promise<void> => {
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const { data } = await this.http.get(
            `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(chunk.join(','))}&crumb=${encodeURIComponent(auth!.crumb)}`,
            { headers: { Cookie: auth!.cookie } },
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
              sector: this.sectorFor(sym, q.sector ?? ref?.sector ?? null),
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
              // Extended-hours move. Yahoo populates exactly ONE of these at a
              // time — postMarket* after the close, preMarket* before the open —
              // and NEITHER during the regular session, so this is null for
              // every row while the market is open. Callers must treat null as
              // "no extended-hours session", not as 0%.
              postMarketPct:
                q.postMarketChangePercent != null
                  ? +Number(q.postMarketChangePercent).toFixed(2)
                  : q.preMarketChangePercent != null
                    ? +Number(q.preMarketChangePercent).toFixed(2)
                    : null,
            });
          }
          return;
        } catch (err: any) {
          if (err?.response?.status === 401 && attempt === 0) {
            auth = await this.getAuth(true); // stale crumb — refresh once
            if (!auth) return;
          } else {
            this.logger.warn(`v7 quote chunk failed: ${err?.message || err}`);
            return;
          }
        }
      }
    };
    const sweep = async (): Promise<void> => {
      for (let i = 0; i < chunks.length; i += this.V7_CONCURRENCY) {
        if (opts.deadlineMs != null && Date.now() >= opts.deadlineMs) break;
        await Promise.all(chunks.slice(i, i + this.V7_CONCURRENCY).map(fetchChunk));
      }
    };
    if (opts.deadlineMs == null) {
      await sweep();
    } else {
      await this.withTimeout(sweep(), Math.max(0, opts.deadlineMs - Date.now()), undefined);
    }
    if (out.size < symbols.length) {
      this.logger.warn(
        `v7 quote sweep resolved ${out.size}/${symbols.length} symbols.`,
      );
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
        // Baseline for the full year is the close immediately BEFORE the window,
        // which the chart meta hands us for free. `closes[0]` is the first close
        // INSIDE the window — i.e. already one day into the year being measured —
        // so using it understates a 1-year return by that day's move.
        y1: pct(
          Number(result?.meta?.chartPreviousClose) > 0
            ? Number(result.meta.chartPreviousClose)
            : closes[0],
        ),
      };
    } catch {
      return null;
    }
  }

  // ── Month-to-date + year-to-date returns (for Hot Sectors) ────────────
  //
  // A period return is (live price ÷ period baseline − 1), and those two halves
  // have completely different lifetimes:
  //
  //  • The BASELINE — the last close before the 1st of this month / this year —
  //    is FIXED for the whole period. It cannot change until the month rolls
  //    over. Verified against an independent source: AAPL's 2025-12-31 close of
  //    271.86 gives YTD 11.02%, and FMP's `stock-price-change` reports
  //    ytd = 11.029% for the same instant. (Measuring from the first close
  //    INSIDE the window instead — 2026-01-02 at 271.01 — gives 11.37%, and for
  //    MTD the same mistake turns AAPL's −2.29% into −0.53%. This code takes the
  //    prior period's close and is correct; the note is here so it stays that way.)
  //  • The PRICE is live, and it is BATCHED — the v7 quote returns hundreds of
  //    symbols per request.
  //
  // The old code re-derived both halves from one 1-year chart per symbol and
  // cached the RESULT for an hour. That made every figure up to an hour stale,
  // let a sector's members and the S&P 500 benchmark be marked at different
  // instants (each symbol's cache expires on its own clock, so a sector could be
  // compared against an index quoted 59 minutes apart), and cost one HTTP request
  // per symbol per hour — measured at 25.8 SECONDS for the 209 Hot Sectors
  // tickers on a cold instance, which is a guaranteed 504 at the ~10s gateway.
  //
  // Splitting the two halves fixes all three: baselines are fetched once per
  // symbol per MONTH, prices come from the batch quote every request, and every
  // symbol in a response is marked to the same instant as the benchmark.
  private periodBaseCache = new Map<
    string,
    { key: string; monthBase: number; yearBase: number; lastClose: number }
  >();
  /** Symbols one call will ask for. Well above any current caller; the wall-clock
   *  budget, not this, is what bounds a cold build. */
  private readonly MONTH_YTD_MAX_SYMBOLS = 1_500;
  /** Wall-clock slice a single request may spend fetching missing baselines.
   *  Whatever isn't reached is simply absent from the result (as a failed fetch
   *  always was) and is picked up by the next request — every baseline fetched
   *  is then good for the rest of the month. */
  private readonly MONTH_YTD_BASE_BUDGET_MS = 3_000;
  /** Baseline fetches are one chart request each and independent, so they run
   *  wider than the shared QUOTE_CONCURRENCY: measured 20 parallel 1-year charts
   *  in ~950ms. */
  private readonly MONTH_YTD_BASE_CONCURRENCY = 20;

  /** Month-to-date and year-to-date % returns per symbol. Baselines are the last
   *  close before the first calendar day of the current month / year; the
   *  numerator is the live batch quote, so every symbol in one response — and the
   *  benchmark it is compared against — is marked at the same instant. */
  async getMonthYtdReturns(
    symbols: string[],
    opts: { baselineBudgetMs?: number } = {},
  ): Promise<Record<string, { mtd: number | null; ytd: number | null }>> {
    const unique = Array.from(
      new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())),
    ).slice(0, this.MONTH_YTD_MAX_SYMBOLS);
    const out: Record<string, { mtd: number | null; ytd: number | null }> = {};
    if (!unique.length) return out;
    const key = this.periodKey();

    // 1. Baselines: cached until the month rolls over, then re-derived. Ordered
    //    as the caller asked, so a truncated fill is a stable prefix.
    const toFetch = unique.filter((s) => this.periodBaseCache.get(s)?.key !== key);
    const budgetMs = opts.baselineBudgetMs ?? this.MONTH_YTD_BASE_BUDGET_MS;
    const deadline = Date.now() + budgetMs;
    const fill = async (): Promise<void> => {
      for (
        let i = 0;
        i < toFetch.length && Date.now() < deadline;
        i += this.MONTH_YTD_BASE_CONCURRENCY
      ) {
        const chunk = toFetch.slice(i, i + this.MONTH_YTD_BASE_CONCURRENCY);
        const settled = await Promise.all(chunk.map((s) => this.fetchPeriodBaselines(s)));
        chunk.forEach((sym, j) => {
          const b = settled[j];
          if (b) this.periodBaseCache.set(sym, { key, ...b });
        });
      }
    };
    // Hard-bounded for the same reason as the sweeps above: one round of charts
    // against a 10s client timeout would otherwise blow a 2.5s budget. Baselines
    // are written to the cache as each fetch resolves, so nothing already
    // gathered is lost when the wait is abandoned.
    if (toFetch.length) await this.withTimeout(fill(), budgetMs, undefined);

    // 2. One batch quote for the live numerator, shared with whatever else the
    //    request already fetched (Hot Sectors quotes the same tickers).
    const priced = unique.filter((s) => this.periodBaseCache.get(s)?.key === key);
    let quotes = new Map<string, MarketStatRow>();
    if (priced.length) {
      quotes = await this.getQuoteBatch(priced, {
        deadlineMs: Date.now() + this.DIV_QUOTE_BUDGET_MS,
      }).catch(() => new Map<string, MarketStatRow>());
    }

    for (const sym of priced) {
      const b = this.periodBaseCache.get(sym)!;
      // No live quote → the chart's own last close, so a symbol the quote feed
      // missed still reports a real (if slightly older) return rather than none.
      const price = quotes.get(sym)?.price || b.lastClose;
      if (!(price > 0)) continue;
      const pct = (from: number) =>
        from > 0 ? +(((price - from) / from) * 100).toFixed(2) : null;
      out[sym] = { mtd: pct(b.monthBase), ytd: pct(b.yearBase) };
    }
    return out;
  }

  /** Cache generation for the period baselines: they are only invalid once the
   *  calendar month changes (which also re-derives the year baseline every
   *  January). UTC, matching the boundaries used below. */
  private periodKey(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
  }

  /** The two immutable period baselines for one symbol, from a single 1-year
   *  daily chart. Null when the series is too short to establish either. */
  private async fetchPeriodBaselines(
    symbol: string,
  ): Promise<{ monthBase: number; yearBase: number; lastClose: number } | null> {
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

      const now = new Date();
      const monthStartSec =
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) / 1000;
      const yearStartSec = Date.UTC(now.getUTCFullYear(), 0, 1) / 1000;

      // Base = last close strictly before the boundary, i.e. the PRIOR period's
      // closing price — the only baseline that captures the whole period. Yahoo
      // stamps a daily bar at the session open in UTC (13:30Z for a U.S. equity
      // in summer), so every bar dated on or after the 1st sorts after a
      // midnight-UTC boundary and the comparison needs no timezone arithmetic.
      //
      // A series that STARTS after the boundary (listed this month/year) has no
      // prior close, and falls back to its own first close — the same "since
      // listing" convention every data provider reports for a new issue.
      const baseBefore = (boundary: number): number => {
        let base = pts[0].c;
        for (const p of pts) {
          if (p.t < boundary) base = p.c;
          else break;
        }
        return base;
      };

      return {
        monthBase: baseBefore(monthStartSec),
        yearBase: baseBefore(yearStartSec),
        lastClose: pts[pts.length - 1].c,
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

  /** Live quotes for a symbol list, cached 10 min per symbol.
   *
   *  `deadlineMs` (epoch ms) bounds the WHOLE call and exists because this is
   *  now asked for thousands of symbols, not dozens: the per-symbol fallbacks
   *  below (one chart request each, 5 at a time) are fine for the handful the
   *  batch misses out of 287 names but would run for minutes on a 4,311-name
   *  sweep. With a deadline they take what fits and leave the rest to the next
   *  request; without one the behaviour is exactly as before. */
  async getQuoteBatch(
    symbols: string[],
    opts: { deadlineMs?: number } = {},
  ): Promise<Map<string, MarketStatRow>> {
    const map = new Map<string, MarketStatRow>();
    if (!symbols.length) return map;
    const unique = Array.from(new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())));
    if (!unique.length) return map;
    const inBudget = () => opts.deadlineMs == null || Date.now() < opts.deadlineMs;

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

    // 1. Batch v7 quote (500 symbols per request, real market caps).
    if (toFetch.length) {
      const v7 = await this.fetchQuoteV7(toFetch, { deadlineMs: opts.deadlineMs });
      for (const [sym, row] of v7.entries()) {
        if (row.price > 0) {
          // Yahoo omits marketCap for ~6% of the universe (262 of 4,311
          // measured); the screener snapshot already carries a real cap for
          // every member, so a heatmap tile is never sized from nothing.
          if (row.marketCap == null) {
            const cap = this.universeRow(sym)?.marketCap;
            if (cap != null) row.marketCap = cap;
          }
          map.set(sym, row);
          this.quoteCache.set(sym, { ts: now, row });
          this.quoteFailCache.delete(sym);
        }
      }
    }

    // 2. Per-symbol chart fallback for whatever the batch missed.
    const chartFetch = toFetch.filter((s) => !map.has(s));
    for (let i = 0; i < chartFetch.length && inBudget(); i += this.QUOTE_CONCURRENCY) {
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
    if (stillMissing.length && this.fmp?.enabled && inBudget()) {
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
            sector: this.sectorFor(sym),
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

    // Yahoo's v7 quote omits trailingPE for a large share of names, and this
    // batch is what feeds the "P/E" column on /dividends, /short-interest,
    // /short-squeeze, /congressional-trades and the live /rankings table — so
    // top the column up from FMP before returning. The fill MUTATES the row
    // objects, which are the same instances held in `quoteCache`, so a symbol
    // resolved here stays resolved for the rest of that cache generation.
    //
    // Deliberately given a TIGHTER budget than the tool-page call sites: the P/E
    // source is one request per symbol, and this is the hot path shared by every
    // caller of getQuoteBatch, so it takes a small bite per request and lets the
    // 24h FMP cache accumulate coverage across requests rather than trying to
    // finish a whole table here. Skipped for tiny lookups — single-symbol detail
    // pages get their P/E from quoteSummary anyway, and this keeps the
    // per-symbol call sites from each issuing an FMP request.
    //
    // Skipped for a WHOLE-UNIVERSE sweep: 80 symbols out of 4,000 is 2% of the
    // column, which is not worth 1.5s of a request that has just spent most of
    // its budget on the sweep itself (measured: it was the difference between an
    // 8.5s and a 10.1s heatmap build). The pages that actually render P/E run
    // their own fill with their own budget over the rows they display, and both
    // share the same 24h FMP cache, so nothing is lost but the latency.
    if (unique.length >= 5 && unique.length <= this.PE_HOT_PATH_MAX_SYMBOLS && inBudget()) {
      await this.fillPeRatios(
        unique.map((s) => map.get(s)).filter(Boolean) as MarketStatRow[],
        80,
        1_500,
      );
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

  /** Per-symbol quoteSummary for a list of symbols, concurrency-capped.
   *  `deadlineMs` (epoch ms) makes the sweep time-boxed instead of exhaustive:
   *  it stops starting new rounds once the budget is spent and RETURNS whatever
   *  it already gathered, so a caller can enrich as much of a long list as fits
   *  in the serverless request budget and cover the rest from cheaper sources.
   *  Every symbol it does fetch lands in the shared per-symbol `summaryCache`,
   *  so successive builds (and the other tool pages) get it for free. */
  private async summaryBatch(
    symbols: string[],
    opts: { concurrency?: number; deadlineMs?: number } = {},
  ): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const CONCURRENCY = opts.concurrency ?? 6;
    const sweep = async (): Promise<void> => {
      for (let i = 0; i < symbols.length; i += CONCURRENCY) {
        if (opts.deadlineMs != null && Date.now() >= opts.deadlineMs) break;
        const chunk = symbols.slice(i, i + CONCURRENCY);
        const rows = await Promise.all(chunk.map((s) => this.fetchQuoteSummary(s)));
        rows.forEach((r, j) => {
          if (r) out.set(chunk[j], r);
        });
      }
    };
    // Hard-bounded as well as round-gated: each request may take the client's
    // full 10s, so a single slow round could otherwise overrun the deadline by
    // more than the deadline itself. Whatever landed is kept, and every symbol
    // fetched is in the shared summaryCache regardless.
    if (opts.deadlineMs == null) {
      await sweep();
    } else {
      await this.withTimeout(sweep(), Math.max(0, opts.deadlineMs - Date.now()), undefined);
    }
    return out;
  }

  // ──────────────────────────────────────────────────────────────────
  // The market-wide universe: every actively-traded NASDAQ/NYSE common
  // stock above a $100M market cap, from ONE `company-screener` call.
  //
  // Measured (production key, 2026-08-13): 4,311 rows / 1.85 MB, 3–4s warm and
  // ~10s cold — see market-universe.ts for the query and why funds are filtered
  // at the source. That is 15x the 287-name curated list every market-wide page
  // used to be built from, and the reason those tables were thin (short
  // interest 283 rows, analyst ratings 283, heatmap 281, dividends 227).
  //
  // The snapshot lives in FmpService's own 12h cache and is SHARED with every
  // other caller, so this costs one request per instance per half-day. Because
  // a serverless instance is frozen the moment it responds, the fetch is given
  // a real budget on the request that needs it and falls back to the curated
  // list when it can't land in time — a page renders the 287 names on the first
  // request of a cold instance and the full 4,311 once the snapshot is cached.
  // Never blocks a page for the full 10s and never returns an empty universe.
  // ──────────────────────────────────────────────────────────────────
  private universeCache: {
    ts: number;
    symbols: string[];
    rows: Map<string, { sector: string | null; industry: string | null; marketCap: number | null; name: string }>;
  } | null = null;
  private readonly UNIVERSE_TTL_MS = 12 * 60 * 60_000;
  /** Slice of a request's budget the screener snapshot may consume. Sized off
   *  the measured warm latency (3–4s) plus headroom, so a warm snapshot always
   *  lands and a cold one degrades to the fallback instead of a 504. */
  private readonly UNIVERSE_BUDGET_MS = 5_000;

  /** Screener-driven universe, largest market cap first. Falls back to the
   *  curated list; never throws. `budgetMs` is how long the caller can afford
   *  to wait for a cold snapshot. */
  private async loadUniverse(budgetMs = this.UNIVERSE_BUDGET_MS): Promise<string[]> {
    const hit = this.universeCache;
    if (hit && Date.now() - hit.ts < this.UNIVERSE_TTL_MS) return hit.symbols;
    if (!this.fmp?.enabled) return this.universe();
    try {
      const snap = await this.fmp.getScreenerSnapshot(UNIVERSE_SCREENER_QUERY, { budgetMs });
      if (snap.size) {
        const rows = new Map<
          string,
          { sector: string | null; industry: string | null; marketCap: number | null; name: string }
        >();
        for (const [symbol, r] of snap) {
          // The screener already applied the cap floor and the fund filters;
          // re-check the cap so a stale/odd row can never sneak a micro-cap in,
          // and drop the named industry exclusions (SPAC shells).
          if ((r.marketCap ?? 0) < UNIVERSE_MIN_MARKET_CAP) continue;
          if (r.industry && EXCLUDED_UNIVERSE_INDUSTRIES.has(r.industry)) continue;
          rows.set(symbol, {
            sector: r.sector,
            industry: r.industry,
            marketCap: r.marketCap,
            name: r.name,
          });
        }
        if (rows.size) {
          // Largest first: every consumer below is budget-bounded, so ordering
          // by cap means a truncated sweep covers the names users look for.
          const symbols = Array.from(rows.keys()).sort(
            (a, b) => (rows.get(b)!.marketCap ?? 0) - (rows.get(a)!.marketCap ?? 0),
          );
          this.universeCache = { ts: Date.now(), symbols, rows };
          this.logger.log(
            `Market universe: ${symbols.length} NASDAQ/NYSE stocks above $${Math.round(UNIVERSE_MIN_MARKET_CAP / 1e6)}M (screener).`,
          );
          return symbols;
        }
      }
    } catch {
      /* fall through to the curated list */
    }
    return this.universe();
  }

  /** The $100M+ universe as reference rows (sector, industry, market cap, name),
   *  cap-ordered, for callers that need to widen a themed basket to every
   *  qualifying company rather than just list one. Empty when the snapshot is
   *  unavailable, so a caller falls back to whatever membership it already had. */
  async getUniverseRows(budgetMs = this.UNIVERSE_BUDGET_MS): Promise<
    Array<{ symbol: string; sector: string | null; industry: string | null; marketCap: number | null; name: string }>
  > {
    const symbols = await this.loadUniverse(budgetMs);
    if (!this.universeIsDynamic()) return [];
    const out: Array<{
      symbol: string;
      sector: string | null;
      industry: string | null;
      marketCap: number | null;
      name: string;
    }> = [];
    for (const symbol of symbols) {
      const r = this.universeRow(symbol);
      if (r) out.push({ symbol, ...r });
    }
    return out;
  }

  /** The universe WITHOUT waiting on anything: the screener list once loaded,
   *  else the curated fallback. For callers that must stay synchronous. */
  private universe(): string[] {
    if (this.universeCache && Date.now() - this.universeCache.ts < this.UNIVERSE_TTL_MS) {
      return this.universeCache.symbols;
    }
    // Defensive dedupe — a repeated symbol in the curated list must never
    // produce duplicate rows in analyst/dividend/heatmap payloads.
    return Array.from(new Set(MARKET_UNIVERSE));
  }

  /** Screener reference row for a universe member (sector, industry, cap, name),
   *  or undefined for a symbol outside the loaded universe. */
  private universeRow(symbol: string) {
    return this.universeCache?.rows.get((symbol || '').toUpperCase());
  }

  /** True when the screener snapshot has landed, i.e. a build ran against the
   *  full $100M+ universe rather than the 287-name fallback. Tool caches use
   *  this to tell a COMPLETE result from a merely well-formed one, so a build
   *  that had to fall back is cached only briefly and retried. */
  private universeIsDynamic(): boolean {
    return (
      !!this.universeCache && Date.now() - this.universeCache.ts < this.UNIVERSE_TTL_MS
    );
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
      // Computable fallback (QA audit, ATTO): sharesOut x price when the feed
      // omits the cap outright.
      marketCap:
        num(price?.marketCap) ??
        num(sd?.marketCap) ??
        ref?.marketCap ??
        (num(ks?.sharesOutstanding) && priceVal
          ? Math.round((num(ks?.sharesOutstanding) as number) * priceVal)
          : null),
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
    // `DilutedAverageShares` is requested alongside the EPS fields (same
    // endpoint, no extra request) because Yahoo reports BasicEPS/DilutedEPS at
    // the 2dp precision of the filing itself. A TTM-YoY growth figure summed
    // from 2dp quarters drifts a few tenths of a point, so a caller that needs
    // precision can divide the full-precision NetIncome by the full-precision
    // share count instead of summing the rounded per-quarter EPS.
    const incomeTypes = Q([
      'TotalRevenue', 'CostOfRevenue', 'GrossProfit', 'SellingGeneralAndAdministration',
      'ResearchAndDevelopment', 'OperatingExpense', 'OperatingIncome', 'PretaxIncome',
      'TaxProvision', 'NetIncome', 'BasicEPS', 'DilutedEPS', 'BasicAverageShares',
      'DilutedAverageShares',
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
    // EVERY range the frontend offers must have a key here: an unlisted range
    // silently falls through to '1y' below, which is how 'ytd' and 'max' both
    // ended up rendering a one-year chart.
    const INTERVAL: Record<string, string> = {
      // 1-minute bars for the single-session view. At '5m' a half-elapsed
      // session is only ~25 points, which is the whole reason the intraday line
      // rendered visibly angular. A full session is 390 points (~55KB), and the
      // only consumers of the 1d range are line/OHLC renderers — the indicator
      // code paths request 1y/5y, so no window-based math shifts underneath.
      '1d': '1m',
      '5d': '30m',
      '1mo': '1d',
      // Jan 1 → today. Yahoo supports 'ytd' as a range natively, so there is
      // nothing to compute or slice here.
      ytd: '1d',
      '3mo': '1d',
      '6mo': '1d',
      '1y': '1d',
      '2y': '1wk',
      '5y': '1wk',
      // Yahoo serves 'max' at monthly granularity whatever interval is asked
      // for (verified: '1wk' and '1mo' both return the same 322 points), so
      // label it honestly rather than claiming weekly bars we don't get.
      max: '1mo',
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
      const meta = res?.meta ?? {};
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
      const num = (v: any): number | null => {
        const n = Number(v);
        return Number.isFinite(n) && n > 0 ? n : null;
      };
      const out = {
        symbol,
        range: safeRange,
        interval,
        intraday,
        bars,
        // Additive baselines, straight off the chart meta at no extra request
        // cost, so a caller need not cross-reference the quote endpoint:
        //  • previousClose — the PRIOR TRADING DAY's close. This is the correct
        //    reference for the 1D line's colour and its period return (measuring
        //    from the first bar instead reports the move since the open, which
        //    can be green on a day the stock is actually down). Yahoo only sends
        //    it on the 1d range; null elsewhere, so callers must handle null
        //    rather than assume it is always present.
        //  • rangePreviousClose — the close immediately BEFORE the returned
        //    window (e.g. the last close of last year for ytd). The correct
        //    baseline for a whole-range return; bars[0] is the first close
        //    INSIDE the window, so using it understates the period.
        previousClose: num(meta.previousClose),
        rangePreviousClose: num(meta.chartPreviousClose),
      };
      this.detailCache.set(cacheKey, { ts: Date.now(), data: out });
      return out;
    } catch {
      return {
        symbol,
        range: safeRange,
        bars: [],
        previousClose: null,
        rangePreviousClose: null,
      };
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
    return this.cachedTool(
      "analyst",
      () => this.buildAnalystRatings(),
      20,
      // Only a build that saw the full universe is cached for the long TTL; one
      // that fell back to the 287 curated names is retried shortly.
      () => this.universeIsDynamic(),
    );
  }
  /** Wall-clock ceiling for a whole-universe analyst build, and the slice of it
   *  the per-symbol target sweep may use. The old code raced the sweep against
   *  a 20s timer — twice the gateway's own limit, so a cold build could only
   *  ever end in a 504. Both legs are now inside one 8s budget. */
  private readonly ANALYST_BUDGET_MS = 8_000;
  private readonly ANALYST_TARGET_BUDGET_MS = 3_500;
  private async buildAnalystRatings(symbols?: string[]): Promise<AnalystRow[]> {
    const deadline = Date.now() + this.ANALYST_BUDGET_MS;
    const syms =
      symbols && symbols.length
        ? Array.from(new Set(symbols.map((s) => s.toUpperCase()))).slice(0, 250)
        : await this.loadUniverse(this.UNIVERSE_BUDGET_MS);
    // Consensus comes from the v7 batch quote (averageAnalystRating), which is
    // reliable on the server and BATCHED — so the row set scales to the whole
    // $100M+ universe for the price of a few requests (2,996 of the 4,311 names
    // carry a consensus rating; the rest are genuinely uncovered and are
    // dropped below, as they always were).
    //
    // Price targets need the per-symbol summary, which Yahoo blocks from
    // datacenter IPs and which CANNOT be batched — so it is a time-boxed
    // best-effort over the largest names first and never starves the table.
    // Rows without a target sort last (upsidePct null ⇒ -999 in the comparator),
    // so what the sweep does reach is exactly what a user sees at the top.
    const quotes = await this.getQuoteBatch(syms, { deadlineMs: deadline });
    let summaries = new Map<string, any>();
    try {
      summaries = await this.summaryBatch(syms, {
        deadlineMs: Math.min(deadline, Date.now() + this.ANALYST_TARGET_BUDGET_MS),
      });
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
        sector: this.sectorFor(sym, q?.sector ?? ref?.sector ?? null),
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
      const fill = async (): Promise<void> => {
        for (let i = 0; i < missing.length && Date.now() < deadline; i += CONC) {
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
      };
      // FMP's client allows itself 15s per request, so the round gate alone can't
      // hold this inside the budget. Rows are mutated in place as they resolve,
      // so an abandoned wait keeps every breakdown already filled.
      await this.withTimeout(fill(), Math.max(0, deadline - Date.now()), undefined);
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

  /** Wall-clock ceiling for the whole heatmap build (universe snapshot + quote
   *  sweep). The gateway kills requests at ~10s; the two legs measured 3–4s
   *  (warm screener) and 3.7–5.1s (4,311-symbol v7 sweep), so 8s leaves the
   *  serialization and response headroom. */
  private readonly HEATMAP_BUDGET_MS = 8_000;

  /** Market heat-map feed — EVERY actively-traded NASDAQ/NYSE stock above a
   *  $100M market cap (client spec), with live intraday change and sector,
   *  largest cap first. Sourced from the v7 batch quote (reliable on the
   *  server); sector comes from the screener snapshot, translated into the same
   *  TRBC buckets the curated map uses.
   *
   *  This is the page the full expansion suits best: every column it renders
   *  comes from the batch quote plus the screener's inline sector, so 4,311 rows
   *  cost 9 batch requests rather than 4,311 per-symbol ones. Measured payload
   *  for the full set: ~803 KB of JSON. */
  async getMarketHeatmap(): Promise<MarketStatRow[]> {
    return this.cachedTool(
      "heatmap",
      async () => {
        const deadline = Date.now() + this.HEATMAP_BUDGET_MS;
        const syms = await this.loadUniverse(this.UNIVERSE_BUDGET_MS);
        const quotes = await this.getQuoteBatch(syms, { deadlineMs: deadline });
        return Array.from(quotes.values())
          // The floor is enforced on the cap we PUBLISH, not just the one the
          // screener selected on. The two occasionally disagree (Yahoo priced
          // TRIB at a $9M cap on a screener row that qualified at >$100M —
          // different share counts for the same ADR), and a tile labelled $9M on
          // a page that promises "$100M and above" is a contradiction the client
          // would see. When they disagree, the smaller wins and the row is out.
          .filter((r) => (r.marketCap ?? 0) >= UNIVERSE_MIN_MARKET_CAP && r.price > 0)
          // Authoritative sector (Yahoo omits it on the fast quote path) so the
          // heatmap groups cleanly with no "Other" bucket.
          .map((r) => ({ ...r, sector: this.sectorFor(r.symbol, r.sector) ?? "Other" }))
          .sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
      },
      20,
      // A sweep cut short by the budget is well-formed but incomplete, so it is
      // served and cached only briefly — the next request resumes against the
      // now-warm per-symbol quote cache and converges on the full universe.
      // 90% rather than 100%: Yahoo has no quote for a handful of screener names
      // (4 of 4,311 measured), which is not a reason to keep rebuilding.
      (rows) =>
        this.universeIsDynamic() &&
        rows.length >= Math.round(this.universe().length * 0.9),
    );
  }

  /** Dividends — yield, rate, payout and ex-date for every dividend payer in
   *  the universe, highest yield first. */
  async getDividends(): Promise<DividendRow[]> {
    return this.cachedTool(
      "dividends",
      () => this.buildDividends(),
      15,
      // Ex-Div Date is the one column bound by the per-symbol request budget, so
      // it decides whether this build is worth caching for the full TTL.
      //
      // The threshold is expressed over the ENRICHABLE PREFIX, not the whole
      // table, because the universe expansion changed what "complete" can mean:
      // 227 payers out of 287 names were all reachable inside one budget, but
      // the $100M+ universe has ~1,900 payers and the ex-date sources are
      // per-symbol (Yahoo summary) or per-calendar-day (FMP). Measuring blanks
      // across all 1,900 would mark EVERY build partial forever, which pins the
      // 90-second TTL on and turns the page into a rebuild storm — the opposite
      // of what the short TTL is for. So we ask the honest question: are the
      // rows we could reach filled? The table is sorted highest-yield first and
      // enrichment runs in that order, so this is also the part users see.
      (rows) => {
        const prefix = rows.slice(0, this.DIV_ENRICH_MAX_ROWS);
        return (
          prefix.filter((r) => r.exDividendDate == null).length <=
          Math.max(5, Math.round(prefix.length * 0.05))
        );
      },
    );
  }
  /** How many payers one request's enrichment phase is expected to reach. Not a
   *  cap on the table — every payer is still listed — only the window the
   *  completeness check above is measured over. Sized to what the measured
   *  budget actually covers (Yahoo summary sweep at concurrency 10 for ~3.2s
   *  plus the FMP ex-date day-walk). */
  private readonly DIV_ENRICH_MAX_ROWS = 250;
  /** Wall-clock ceiling for the whole dividends enrichment phase (FMP calendar
   *  + P/E top-up + Yahoo summary sweep). The gateway kills requests at ~10s,
   *  so the sweep takes what fits and the arithmetic fallback covers the rest —
   *  the table is never left with blank cells because time ran out. */
  private readonly DIV_ENRICH_BUDGET_MS = 5_000;
  /** Ceiling for the quote leg that builds the rows themselves, so the universe
   *  sweep and the enrichment phase together stay under the gateway limit. */
  private readonly DIV_QUOTE_BUDGET_MS = 4_000;
  /** Slice of that budget held back for the FMP ex-date day-walk, so a slow
   *  Yahoo sweep can't consume the whole thing and leave the top-up no room. */
  private readonly DIV_FMP_RESERVE_MS = 1_800;
  /** Headroom between the ex-date walk's internal deadline and the outer
   *  timeout, so the round already in flight can land instead of having its
   *  results discarded. Sized to one calendar-day request (measured ~0.5s). */
  private readonly DIV_WALK_SLACK_MS = 800;
  private async buildDividends(): Promise<DividendRow[]> {
    // Yield, rate, price and cap all come from the BATCH quote, so the row set
    // scales to the whole $100M+ universe: ~1,900 dividend payers versus the 227
    // the curated list could show. Only Payout Ratio and Ex-Div Date are
    // per-symbol, and those stay budget-bounded — see the note above.
    const syms = await this.loadUniverse(this.UNIVERSE_BUDGET_MS);
    // Deadline taken AFTER the universe load, not before it: the quote leg needs
    // its own budget, and starting the clock first meant a slow snapshot could
    // leave it with none — measured as a build that returned ZERO dividend rows.
    const quotes = await this.getQuoteBatch(syms, {
      deadlineMs: Date.now() + this.DIV_QUOTE_BUDGET_MS,
    });
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
        sector: this.sectorFor(sym, q?.sector ?? ref?.sector ?? null),
        price,
        changePct: q?.changePct ?? null,
        peRatio: q?.peRatio ?? null,
        dividendYield: yieldPct,
        dividendRate: rate,
        payoutRatio: null,
        exDividendDate: null,
        marketCap: q?.marketCap ?? ref?.marketCap ?? null,
      });
    }
    rows.sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0));

    // EVERY payer gets enriched, not just the first screenful. This used to
    // fetch summaries for rows.slice(0, 40) only, which left ~82% of the table
    // with empty "Payout Ratio" and "Ex-Div Date" cells — both rendered columns.
    // Three sources are layered so the columns fill as completely as possible
    // while the whole enrichment phase stays inside one wall-clock budget:
    //
    //  1. Yahoo quoteSummary (PRIMARY) — the authoritative payout ratio and
    //     ex-date, swept over EVERY payer highest-yield-first. This is the
    //     source that always worked; it was simply only ever asked for 40
    //     symbols. Free on a warm instance: the per-symbol summaryCache is
    //     shared with Short Interest, which sweeps the same universe.
    //  2. FMP's dividend calendar (TOP-UP) — for the payers the sweep didn't
    //     reach. Walked one day at a time because the ranged form silently
    //     truncates at 4,000 rows and a single day is already ~1,800; see
    //     FmpService.CALENDAR_ROW_CAP.
    //  3. Arithmetic derivation — payout ratio IS dividend-per-share ÷ EPS, and
    //     EPS falls out of price ÷ P/E, so any row the feeds missed is still
    //     fillable from values already on the row, with no network call at all.
    //     This is what takes the payout column to zero blanks.
    const deadline = Date.now() + this.DIV_ENRICH_BUDGET_MS;
    const budgetLeft = () => Math.max(0, deadline - Date.now());

    // P/E first: it is both a rendered column and the EPS input for the
    // derivation below. Usually a cache hit — getQuoteBatch above already ran
    // the same fill over these symbols.
    await this.fillPeRatios(rows, 200, Math.min(1_200, budgetLeft()));

    try {
      const summaries = await this.summaryBatch(rows.map((r) => r.symbol), {
        concurrency: 10,
        // Reserve the tail of the budget for the FMP top-up below.
        deadlineMs: deadline - this.DIV_FMP_RESERVE_MS,
      });
      for (const r of rows) {
        const sd = summaries.get(r.symbol)?.summaryDetail;
        if (!sd) continue;
        // Yahoo reports payoutRatio as a fraction, and reports a flat 0 when it
        // simply has no figure — which for a confirmed payer means "unknown",
        // so those fall through to the derivation instead of rendering "0.0%".
        const pr = Number(sd.payoutRatio?.raw);
        if (Number.isFinite(pr) && pr > 0) r.payoutRatio = +(pr * 100).toFixed(1);
        const ex = Number(sd.exDividendDate?.raw);
        if (Number.isFinite(ex) && ex > 0) {
          r.exDividendDate = new Date(ex * 1000).toISOString().slice(0, 10);
        }
      }
    } catch {
      /* summary unavailable — the FMP top-up and the derivation below stand */
    }

    // Only the payers still without an ex-date are asked for, which lets the
    // day-walk exit as soon as it has resolved them instead of burning the
    // whole window.
    const needExDate = rows.filter((r) => !r.exDividendDate).map((r) => r.symbol);
    if (this.fmp?.enabled && needExDate.length && budgetLeft() > 400) {
      // The walk's OWN deadline must land strictly before the outer timeout, or
      // the timeout wins the race and throws away everything the walk found:
      // summaryBatch-style loops stop starting rounds at their deadline but must
      // still finish the round already in flight. Previously both were set to
      // the same instant, so the walk contributed exactly zero rows in
      // production — a delta of 0, not a small delta. The slack gives the last
      // round room to land. (Its findings also accumulate in FmpService's
      // exDivCache regardless, so a discarded return value is no longer a
      // total loss on the next build.)
      //
      // maxDays is the MEASURED requirement, not a guess: walking single days
      // back from today over the universe resolves 28 tickers at 12 weekdays,
      // 68 at 30, and 220 at 64 — dividend ex-dates sit on a ~91-day cycle, so
      // nothing short of a full quarter covers the table. maxDays only sizes the
      // candidate list; the deadline still decides how far it actually gets, so
      // asking for 64 costs nothing when the budget binds first.
      const exDates = await this.withTimeout(
        this.fmp.getExDividendDates(needExDate, {
          maxDays: 64,
          concurrency: 10,
          deadlineMs: deadline - this.DIV_WALK_SLACK_MS,
        }),
        budgetLeft(),
        new Map<string, string>(),
      );
      for (const r of rows) {
        if (r.exDividendDate) continue;
        const d = exDates.get(r.symbol);
        if (d) r.exDividendDate = d;
      }
    }

    for (const r of rows) {
      if (r.payoutRatio != null) continue;
      // payout = DPS / EPS, and EPS = price / P/E → DPS × P/E ÷ price. Skipped
      // when P/E is unknown or non-positive: a loss-making payer has no
      // meaningful payout ratio and must stay an em-dash.
      const pe = r.peRatio;
      if (!pe || pe <= 0 || !r.price || !r.dividendRate) continue;
      const derived = ((r.dividendRate * pe) / r.price) * 100;
      if (Number.isFinite(derived) && derived > 0) r.payoutRatio = +derived.toFixed(1);
    }
    return rows;
  }

  /** Short Interest — shares short, % of float, days-to-cover and the
   *  month-over-month change, most-shorted first.
   *
   *  THE ONE MARKET-WIDE PAGE THAT CANNOT TAKE THE FULL $100M+ EXPANSION.
   *  Every figure it renders (sharesShort, sharesShortPriorMonth,
   *  shortPercentOfFloat, shortRatio) exists in exactly one place we can reach:
   *  Yahoo's `quoteSummary.defaultKeyStatistics`, which serves ONE SYMBOL PER
   *  REQUEST. There is no batch form, and FMP's stable tier publishes no short
   *  interest at all. Measured cost of a per-symbol sweep: ~20 symbols per
   *  second at concurrency 6, i.e. ~3.5 minutes for 4,311 names — 20x over the
   *  gateway's ~10s limit.
   *
   *  So this page walks the universe INCREMENTALLY instead: each request sweeps
   *  a budgeted slice, every symbol it fetches lands in the shared 30-minute
   *  summaryCache, and rows accumulate across requests. Coverage therefore grows
   *  from the curated ~283 toward the cap-ordered universe on a warm instance
   *  and resets when the instance is recycled. Genuinely completing this page
   *  over the whole universe needs the sweep moved OFF the request path — a
   *  scheduled job writing to a persistent table, the same shape as
   *  backtest-cache / gov-contract-cache. That is deferred work, not something
   *  a request can be made to do.
   */
  async getShortInterest(): Promise<ShortInterestRow[]> {
    return this.cachedTool("short-interest", () => this.buildShortInterest());
  }
  /** Symbols one short-interest build will ASK for. Deliberately far below the
   *  universe size: the summary sweep is the binding constraint, and asking for
   *  thousands would only mean discarding most of the list at the deadline. */
  private readonly SHORT_INTEREST_MAX_SYMBOLS = 600;
  /** Slice of the request the per-symbol summary sweep may consume. */
  private readonly SHORT_INTEREST_BUDGET_MS = 5_000;
  private async buildShortInterest(): Promise<ShortInterestRow[]> {
    // Largest caps first (loadUniverse orders by market cap), so the slice this
    // build can afford is the part of the market users actually look up.
    const syms = (await this.loadUniverse(this.UNIVERSE_BUDGET_MS)).slice(
      0,
      this.SHORT_INTEREST_MAX_SYMBOLS,
    );
    const [quotes, summaries] = await Promise.all([
      this.getQuoteBatch(syms, { deadlineMs: Date.now() + this.DIV_QUOTE_BUDGET_MS }),
      this.summaryBatch(syms, {
        concurrency: 10,
        deadlineMs: Date.now() + this.SHORT_INTEREST_BUDGET_MS,
      }),
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
        sector: this.sectorFor(sym, q?.sector ?? ref?.sector ?? null),
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
  /** Names the league table is scored over. Each one costs TWO requests (rating
   *  history + 5 years of closes), so this stays a bounded slice of the universe
   *  rather than following it to 4,311: a firm ranking converges on the same
   *  ordering long before then, and an unbounded background sweep would occupy
   *  the instance for the rest of its life. Cap-ordered, so it is the coverage
   *  that matters. */
  private readonly FIRM_UNIVERSE_MAX = 500;

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
    const universe = this.universe().slice(0, this.FIRM_UNIVERSE_MAX);
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
      (sym) => this.sectorFor(sym),
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
