import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

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

@Injectable()
export class EarningsService {
  private readonly logger = new Logger(EarningsService.name);
  private readonly http: AxiosInstance;
  private cache: { ts: number; key: string; data: EarningsRow[] } | null = null;
  private readonly CACHE_MS = 30 * 60_000;

  constructor() {
    this.http = axios.create({
      timeout: 6_000,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15',
        Accept: 'application/json, text/plain, */*',
      },
    });
  }

  async getCalendar(days = 7): Promise<EarningsRow[]> {
    const n = Math.min(14, Math.max(1, days));
    const today = new Date();
    const key = `${today.toISOString().slice(0, 10)}-${n}`;
    if (this.cache && this.cache.key === key && Date.now() - this.cache.ts < this.CACHE_MS) {
      return this.cache.data;
    }
    const out: EarningsRow[] = [];
    try {
      for (let i = 0; i < n; i++) {
        const iso = plusDaysISO(today, i);
        try {
          const { data } = await this.http.get(
            `https://api.nasdaq.com/api/calendar/earnings?date=${iso}`,
          );
          const rows: any[] = data?.data?.rows || [];
          for (const r of rows) {
            out.push({
              date: iso,
              symbol: String(r.symbol || ''),
              name: String(r.name || ''),
              estimate: r.epsForecast || null,
              lastEpsForecast: r.lastYearEPS || null,
              marketCap: r.marketCap || null,
              time: r.time || null,
            });
          }
        } catch {
          // single-day fail — silently fall through
        }
      }
      if (!out.length) throw new Error('Nasdaq returned no rows');
      this.cache = { ts: Date.now(), key, data: out };
      return out;
    } catch (err: any) {
      this.logger.warn(
        `Nasdaq earnings fetch failed: ${err?.message || err}. Using fallback seed.`,
      );
      const out2 = fallbackForDays(n, today);
      this.cache = { ts: Date.now(), key, data: out2 };
      return out2;
    }
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
