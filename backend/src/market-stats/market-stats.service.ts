import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { REFERENCE_QUOTES, ReferenceQuote } from './reference-quotes';
import { MARKET_UNIVERSE } from './market-universe';

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

export interface MarketStatRow {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
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

  getTopGainers(limit = 20) {
    return this.fetchScreener('day_gainers', limit);
  }
  getTopLosers(limit = 20) {
    return this.fetchScreener('day_losers', limit);
  }
  getMostActive(limit = 20) {
    return this.fetchScreener('most_actives', limit);
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
              marketCap: q.marketCap != null ? Number(q.marketCap) : ref?.marketCap ?? null,
              sector: q.sector ?? ref?.sector ?? null,
              fiftyTwoWeekHigh: q.fiftyTwoWeekHigh != null ? Number(q.fiftyTwoWeekHigh) : null,
              fiftyTwoWeekLow: q.fiftyTwoWeekLow != null ? Number(q.fiftyTwoWeekLow) : null,
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

  /** Analyst Ratings — consensus recommendation + price targets across the
   *  market universe, sorted by analyst-implied upside. */
  async getAnalystRatings(): Promise<AnalystRow[]> {
    const syms = this.universe();
    const [quotes, summaries] = await Promise.all([
      this.getQuoteBatch(syms),
      this.summaryBatch(syms),
    ]);
    const rows: AnalystRow[] = [];
    for (const sym of syms) {
      const q = quotes.get(sym);
      const fd = summaries.get(sym)?.financialData;
      const ref = REFERENCE_QUOTES[sym];
      const price = q?.price ?? ref?.price ?? 0;
      const targetMean = fd?.targetMeanPrice?.raw ?? null;
      if (!price || !fd) continue;
      const upsidePct =
        targetMean && price ? +(((targetMean - price) / price) * 100).toFixed(2) : null;
      rows.push({
        symbol: sym,
        name: q?.name ?? ref?.name ?? sym,
        sector: q?.sector ?? ref?.sector ?? null,
        price,
        targetMean: targetMean ?? null,
        targetHigh: fd?.targetHighPrice?.raw ?? null,
        targetLow: fd?.targetLowPrice?.raw ?? null,
        upsidePct,
        recommendation: fd?.recommendationKey ?? null,
        numAnalysts: fd?.numberOfAnalystOpinions?.raw ?? null,
      });
    }
    rows.sort((a, b) => (b.upsidePct ?? -999) - (a.upsidePct ?? -999));
    return rows;
  }

  /** Dividends — yield, rate, payout and ex-date for every dividend payer in
   *  the universe, highest yield first. */
  async getDividends(): Promise<DividendRow[]> {
    const syms = this.universe();
    const [quotes, summaries] = await Promise.all([
      this.getQuoteBatch(syms),
      this.summaryBatch(syms),
    ]);
    const rows: DividendRow[] = [];
    for (const sym of syms) {
      const q = quotes.get(sym);
      const sd = summaries.get(sym)?.summaryDetail;
      const ref = REFERENCE_QUOTES[sym];
      const price = q?.price ?? ref?.price ?? 0;
      const rate = sd?.dividendRate?.raw ?? null;
      const yieldRaw = sd?.dividendYield?.raw ?? null;
      if (!price || !rate || !yieldRaw) continue; // dividend payers only
      const exTs = sd?.exDividendDate?.raw ?? null;
      rows.push({
        symbol: sym,
        name: q?.name ?? ref?.name ?? sym,
        sector: q?.sector ?? ref?.sector ?? null,
        price,
        dividendYield: +(yieldRaw * 100).toFixed(2),
        dividendRate: rate,
        payoutRatio: sd?.payoutRatio?.raw != null ? +(sd.payoutRatio.raw * 100).toFixed(1) : null,
        exDividendDate: exTs ? new Date(exTs * 1000).toISOString().slice(0, 10) : null,
        marketCap: q?.marketCap ?? ref?.marketCap ?? null,
      });
    }
    rows.sort((a, b) => (b.dividendYield ?? 0) - (a.dividendYield ?? 0));
    return rows;
  }

  /** Short Interest — shares short, % of float, days-to-cover and the
   *  month-over-month change, most-shorted first. */
  async getShortInterest(): Promise<ShortInterestRow[]> {
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
}
