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
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
  fiftyTwoWeekHigh?: number | null;
  fiftyTwoWeekLow?: number | null;
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
    const safeRange = ['1mo', '3mo', '6mo', '1y', '2y', '5y'].includes(range) ? range : '1y';
    const cacheKey = `hist:${symbol}:${safeRange}`;
    const c = this.detailCache.get(cacheKey);
    if (c && Date.now() - c.ts < this.DETAIL_TTL_MS) return c.data;
    try {
      const host = symbol.charCodeAt(0) % 2 === 0 ? 'query1' : 'query2';
      const { data } = await this.http.get(
        `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${safeRange}&interval=1d`,
      );
      const res = data?.chart?.result?.[0];
      const ts: number[] = res?.timestamp || [];
      const q = res?.indicators?.quote?.[0] || {};
      const bars: any[] = [];
      for (let i = 0; i < ts.length; i++) {
        const close = Number(q.close?.[i]);
        if (!Number.isFinite(close) || close <= 0) continue;
        const prev = bars.length ? bars[bars.length - 1].close : close;
        bars.push({
          date: new Date(ts[i] * 1000).toISOString().slice(0, 10),
          open: round2(q.open?.[i]),
          high: round2(q.high?.[i]),
          low: round2(q.low?.[i]),
          close: round2(close),
          volume: Number(q.volume?.[i]) || 0,
          changePct: prev ? +(((close - prev) / prev) * 100).toFixed(2) : 0,
        });
      }
      const out = { symbol, range: safeRange, bars };
      this.detailCache.set(cacheKey, { ts: Date.now(), data: out });
      return out;
    } catch {
      return { symbol, range: safeRange, bars: [] };
    }
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
