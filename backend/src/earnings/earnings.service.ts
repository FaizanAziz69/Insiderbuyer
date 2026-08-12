import { Injectable, Logger, Optional } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { FmpService } from '../fmp/fmp.service';

export interface EarningsRow {
  date: string;          // ISO yyyy-mm-dd
  symbol: string;
  name: string;
  estimate: string | null;
  lastEpsForecast: string | null;
  marketCap: string | null;
  time: string | null;   // 'time-pre-market' | 'time-after-hours' | 'time-not-supplied' | string
}

function plusDaysISO(d: Date, n: number): string {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x.toISOString().slice(0, 10);
}

const FALLBACK_BY_OFFSET: Record<number, EarningsRow[]> = {
  0: [
    { date: '', symbol: 'NVDA', name: 'NVIDIA Corp.',        estimate: '$0.92',  lastEpsForecast: '$0.85', marketCap: '$3.55T', time: 'time-after-hours' },
    { date: '', symbol: 'CRM',  name: 'Salesforce',           estimate: '$2.55',  lastEpsForecast: '$2.41', marketCap: '$295B',  time: 'time-after-hours' },
    { date: '', symbol: 'HPQ',  name: 'HP Inc.',              estimate: '$0.85',  lastEpsForecast: '$0.86', marketCap: '$28B',   time: 'time-after-hours' },
  ],
  1: [
    { date: '', symbol: 'COST', name: 'Costco Wholesale',     estimate: '$4.10',  lastEpsForecast: '$3.93', marketCap: '$430B',  time: 'time-after-hours' },
    { date: '', symbol: 'DELL', name: 'Dell Technologies',    estimate: '$2.05',  lastEpsForecast: '$1.93', marketCap: '$84B',   time: 'time-after-hours' },
    { date: '', symbol: 'ULTA', name: 'Ulta Beauty',          estimate: '$5.05',  lastEpsForecast: '$5.21', marketCap: '$18B',   time: 'time-after-hours' },
  ],
  2: [
    { date: '', symbol: 'JPM',  name: 'JPMorgan Chase',       estimate: '$4.50',  lastEpsForecast: '$4.35', marketCap: '$680B',  time: 'time-pre-market' },
    { date: '', symbol: 'WFC',  name: 'Wells Fargo',          estimate: '$1.40',  lastEpsForecast: '$1.31', marketCap: '$215B',  time: 'time-pre-market' },
    { date: '', symbol: 'C',    name: 'Citigroup',            estimate: '$1.65',  lastEpsForecast: '$1.55', marketCap: '$135B',  time: 'time-pre-market' },
  ],
  3: [
    { date: '', symbol: 'NFLX', name: 'Netflix',              estimate: '$5.80',  lastEpsForecast: '$5.40', marketCap: '$405B',  time: 'time-after-hours' },
    { date: '', symbol: 'GS',   name: 'Goldman Sachs',        estimate: '$10.45', lastEpsForecast: '$8.40', marketCap: '$185B',  time: 'time-pre-market' },
    { date: '', symbol: 'BAC',  name: 'Bank of America',      estimate: '$0.90',  lastEpsForecast: '$0.82', marketCap: '$332B',  time: 'time-pre-market' },
  ],
  4: [
    { date: '', symbol: 'PG',   name: 'Procter & Gamble',     estimate: '$1.85',  lastEpsForecast: '$1.81', marketCap: '$395B',  time: 'time-pre-market' },
    { date: '', symbol: 'JNJ',  name: 'Johnson & Johnson',    estimate: '$2.45',  lastEpsForecast: '$2.20', marketCap: '$380B',  time: 'time-pre-market' },
  ],
  5: [
    { date: '', symbol: 'TSLA', name: 'Tesla',                estimate: '$0.65',  lastEpsForecast: '$0.55', marketCap: '$1.02T', time: 'time-after-hours' },
    { date: '', symbol: 'IBM',  name: 'IBM',                  estimate: '$2.45',  lastEpsForecast: '$2.25', marketCap: '$200B',  time: 'time-after-hours' },
  ],
  6: [
    { date: '', symbol: 'MSFT', name: 'Microsoft',            estimate: '$3.10',  lastEpsForecast: '$2.93', marketCap: '$3.10T', time: 'time-after-hours' },
    { date: '', symbol: 'GOOGL',name: 'Alphabet',             estimate: '$2.05',  lastEpsForecast: '$1.89', marketCap: '$2.15T', time: 'time-after-hours' },
    { date: '', symbol: 'META', name: 'Meta Platforms',       estimate: '$5.65',  lastEpsForecast: '$5.16', marketCap: '$1.55T', time: 'time-after-hours' },
  ],
};

function fallbackForDays(days: number, anchor: Date = new Date()): EarningsRow[] {
  const out: EarningsRow[] = [];
  for (let i = 0; i < Math.max(1, days); i++) {
    const iso = plusDaysISO(anchor, i);
    const rows = FALLBACK_BY_OFFSET[i] || [];
    for (const r of rows) out.push({ ...r, date: iso });
  }
  return out;
}

/** Nasdaq spells a missing estimate several ways ('', 'N/A', absent). */
function cleanEps(v: any): string | null {
  const s = String(v ?? '').trim();
  return !s || s === 'N/A' ? null : s;
}

/** Render a numeric EPS estimate in Nasdaq's own notation — "$1.43" for a
 *  profit, "($0.21)" for a loss — so a gap-filled row is indistinguishable
 *  from one Nasdaq supplied itself. Two decimals, same as Nasdaq. */
function formatEps(v: number): string {
  const abs = Math.abs(v).toFixed(2);
  return v < 0 ? `($${abs})` : `$${abs}`;
}

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);
  private readonly http: AxiosInstance;

  /** Result cache for the built calendar window. Same idiom as
   *  MarketStatsService.cachedTool: TTL'd map, only a "healthy" build is
   *  persisted, and a stale-but-fuller previous set beats a thin new one. */
  private windowCache = new Map<string, { exp: number; data: EarningsRow[] }>();
  /** In-flight builds, keyed the same way. A cold serverless instance can take
   *  several concurrent requests (the page plus the earnings-perf endpoints);
   *  without this they would each kick off their own fetch wave. */
  private inflight = new Map<string, Promise<EarningsRow[]>>();
  private readonly CACHE_MS = 3 * 60 * 60_000; // calendar moves a few times/day
  private readonly FALLBACK_CACHE_MS = 5 * 60_000; // retry the real feed soon
  /** One canonical window is built and sliced for every caller — see
   *  getCalendar(). 14 is the largest `days` any caller asks for. */
  private readonly MAX_DAYS = 14;
  /** Days per concurrent wave. Keep this >= MAX_DAYS: one wave means the whole
   *  Nasdaq phase is bounded by a SINGLE request timeout (6s), whereas two
   *  waves of timeouts would total 12s and miss the gateway budget outright.
   *  Nasdaq served all 14 at once without throttling in testing. */
  private readonly DAY_CONCURRENCY = 14;
  /** Hard deadline on the estimate gap-fill. FmpService's own client allows
   *  15s, which alone would blow the ~10s gateway budget. */
  private readonly FMP_BUDGET_MS = 4_000;

  constructor(@Optional() private readonly fmp?: FmpService) {
    this.http = axios.create({
      timeout: 6_000,
      // Force IPv4 and reuse connections: with a fresh TLS handshake per day a
      // single calendar day cost 2–4s, against ~1s on a pooled socket.
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        Accept: 'application/json, text/plain, */*',
      },
    });
  }

  /** Map over items with a bounded number of requests in flight. */
  private async mapPool<T, R>(
    items: T[],
    limit: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const out = new Array<R>(items.length);
    let next = 0;
    const worker = async () => {
      for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i]);
    };
    await Promise.all(
      Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker),
    );
    return out;
  }

  /** One Nasdaq calendar day. Returns [] on failure — a single bad day must not
   *  blank the whole calendar. */
  private async fetchNasdaqDay(iso: string): Promise<EarningsRow[]> {
    try {
      const { data } = await this.http.get(
        `https://api.nasdaq.com/api/calendar/earnings?date=${iso}`,
      );
      const rows: any[] = data?.data?.rows || [];
      return rows.map((r) => ({
        date: iso,
        symbol: String(r.symbol || ''),
        name: String(r.name || ''),
        estimate: cleanEps(r.epsForecast),
        lastEpsForecast: r.lastYearEPS || null,
        marketCap: r.marketCap || null,
        time: r.time || null,
      }));
    } catch {
      // single-day fail — silently fall through
      return [];
    }
  }

  /** EPS estimates from FMP's calendar, keyed by both `SYMBOL@date` and bare
   *  `SYMBOL` (the two feeds occasionally disagree on the report date by a day,
   *  but a company only reports once inside a two-week window). Best-effort:
   *  Nasdaq already carries the row, so a slow or absent FMP costs us the
   *  gap-fill, never the response. */
  private async fetchEstimates(isos: string[]): Promise<Map<string, number>> {
    const empty = new Map<string, number>();
    if (!this.fmp?.enabled || !isos.length) return empty;
    const work = this.fmp
      .getEarningsCalendar(isos[0], isos[isos.length - 1])
      .then((rows) => {
        const m = new Map<string, number>();
        for (const r of rows) {
          if (r.epsEstimated == null || !r.symbol) continue;
          m.set(`${r.symbol}@${r.date}`, r.epsEstimated);
          if (!m.has(r.symbol)) m.set(r.symbol, r.epsEstimated);
        }
        return m;
      })
      .catch(() => empty);
    const deadline = new Promise<Map<string, number>>((resolve) => {
      const t = setTimeout(() => resolve(empty), this.FMP_BUDGET_MS);
      t.unref?.(); // don't hold the serverless event loop open
    });
    return Promise.race([work, deadline]);
  }

  /** Build the whole window: every day from both feeds in one bounded wave. */
  private async buildWindow(anchor: Date, days: number): Promise<EarningsRow[]> {
    const isos = Array.from({ length: days }, (_, i) => plusDaysISO(anchor, i));
    // The days are independent, so they go out concurrently instead of as
    // `days` sequential round-trips — which is what pushed this endpoint past
    // the gateway limit. Nasdaq and FMP are independent of each other too, so
    // the two waves overlap and the window costs roughly one slow request.
    const [byDay, estimates] = await Promise.all([
      this.mapPool(isos, this.DAY_CONCURRENCY, (iso) => this.fetchNasdaqDay(iso)),
      this.fetchEstimates(isos),
    ]);
    const out = byDay.flat();
    let filled = 0;
    for (const r of out) {
      if (r.estimate) continue;
      const sym = r.symbol.toUpperCase();
      const est = estimates.get(`${sym}@${r.date}`) ?? estimates.get(sym);
      // No estimate anywhere means the company genuinely isn't covered — leave
      // it null rather than manufacturing a number.
      if (est == null) continue;
      r.estimate = formatEps(est);
      filled++;
    }
    if (filled) this.logger.log(`Filled ${filled} missing EPS estimates from FMP`);
    return out;
  }

  /** TTL'd, single-flight access to the canonical window. */
  private async cachedWindow(key: string, anchor: Date): Promise<EarningsRow[]> {
    const hit = this.windowCache.get(key);
    if (hit && Date.now() < hit.exp) return hit.data;
    const pending = this.inflight.get(key);
    if (pending) return pending;
    const build = (async () => {
      try {
        const data = await this.buildWindow(anchor, this.MAX_DAYS);
        // Same "healthy result only" gate as MarketStatsService.cachedTool: a
        // throttled wave can come back near-empty, and caching that would pin
        // the page to a stub for the whole TTL.
        const healthy = data.length > 0 && data.length >= (hit?.data.length ?? 0) * 0.6;
        if (healthy) {
          this.windowCache.set(key, { exp: Date.now() + this.CACHE_MS, data });
          return data;
        }
        if (hit) return hit.data; // keep the fuller previous set
        if (data.length) return data; // thin but real — serve it, don't cache it
        throw new Error('Nasdaq returned no rows');
      } finally {
        this.inflight.delete(key);
      }
    })();
    this.inflight.set(key, build);
    return build;
  }

  async getCalendar(days = 7): Promise<EarningsRow[]> {
    const n = Math.min(this.MAX_DAYS, Math.max(1, days));
    const today = new Date();
    // Build ONE MAX_DAYS window and slice it. Concurrent fetching makes 14 days
    // cost the same wall time as 7, and in exchange the 3-, 7- and 14-day
    // callers all share a single cache entry instead of each paying to rebuild.
    const key = `cal:${today.toISOString().slice(0, 10)}`;
    let window: EarningsRow[];
    try {
      window = await this.cachedWindow(key, today);
    } catch (err: any) {
      this.logger.warn(
        `Nasdaq earnings fetch failed: ${err?.message || err}. Using fallback seed.`,
      );
      window = fallbackForDays(this.MAX_DAYS, today);
      // Short TTL on the seed so the real feed is retried in minutes, not hours.
      this.windowCache.set(key, { exp: Date.now() + this.FALLBACK_CACHE_MS, data: window });
    }
    const cutoff = plusDaysISO(today, n);
    return window.filter((r) => r.date < cutoff);
  }

  /** All companies that reported on a specific date (YYYY-MM-DD). Used by the
   *  earnings-performance backtest to find historical report dates. Cached a
   *  day (past dates never change). Returns [] on failure. */
  private dayCache = new Map<string, { ts: number; rows: { symbol: string; name: string }[] }>();

  async fetchDay(iso: string): Promise<{ symbol: string; name: string }[]> {
    const cached = this.dayCache.get(iso);
    if (cached && Date.now() - cached.ts < 24 * 60 * 60 * 1000) return cached.rows;
    // Retry a couple times with backoff — Nasdaq throttles bursts, so a single
    // failure shouldn't permanently blank out that day in the backtest.
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const { data } = await this.http.get(
          `https://api.nasdaq.com/api/calendar/earnings?date=${iso}`,
        );
        const rows = (data?.data?.rows || [])
          .map((r: any) => ({
            symbol: String(r.symbol || '').toUpperCase(),
            name: String(r.name || ''),
          }))
          .filter((r: { symbol: string }) => r.symbol);
        // Only cache a real (non-empty) response; an empty result may be a
        // throttle, which we don't want to remember for 24h.
        if (rows.length) this.dayCache.set(iso, { ts: Date.now(), rows });
        return rows;
      } catch {
        await new Promise((r) => setTimeout(r, 400 * (attempt + 1)));
      }
    }
    return [];
  }
}
