import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface IpoRow {
  symbol: string;
  name: string;
  exchange: string | null;
  price: string | null; // proposed/priced share price
  shares: string | null;
  dollarValue: string | null;
  date: string | null; // priced or expected date (ISO yyyy-mm-dd)
  status: 'Priced' | 'Upcoming' | 'Filed';
}

function toIso(d: string | null): string | null {
  if (!d) return null;
  // Nasdaq returns either "6/16/2026" or "2026-06-16"
  if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  const m = d.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    const [, mo, day, yr] = m;
    return `${yr}-${mo.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  return d;
}

@Injectable()
export class IpoService {
  private readonly logger = new Logger(IpoService.name);
  private readonly http: AxiosInstance;
  private cache: { ts: number; key: string; data: IpoRow[] } | null = null;
  private readonly CACHE_MS = 60 * 60_000;

  constructor() {
    this.http = axios.create({
      timeout: 8_000,
      headers: {
        'User-Agent': 'Mozilla/5.0',
        Accept: 'application/json, text/plain, */*',
      },
    });
  }

  /** Recent + upcoming IPOs from Nasdaq's calendar (current and next month). */
  async getCalendar(): Promise<IpoRow[]> {
    const now = new Date();
    const key = now.toISOString().slice(0, 7);
    if (this.cache && this.cache.key === key && Date.now() - this.cache.ts < this.CACHE_MS) {
      return this.cache.data;
    }

    const months = [
      key,
      new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString().slice(0, 7),
    ];
    const out: IpoRow[] = [];
    try {
      for (const month of months) {
        const { data } = await this.http.get(
          `https://api.nasdaq.com/api/ipo/calendar?date=${month}`,
        );
        const d = data?.data || {};
        for (const r of d?.priced?.rows || []) {
          out.push({
            symbol: String(r.proposedTickerSymbol || r.symbol || ''),
            name: String(r.companyName || ''),
            exchange: r.proposedExchange || null,
            price: r.proposedSharePrice || null,
            shares: r.sharesOffered || null,
            dollarValue: r.dollarValueOfSharesOffered || null,
            date: toIso(r.pricedDate || null),
            status: 'Priced',
          });
        }
        for (const r of d?.upcoming?.upcomingTable?.rows || d?.upcoming?.rows || []) {
          out.push({
            symbol: String(r.proposedTickerSymbol || r.symbol || ''),
            name: String(r.companyName || ''),
            exchange: r.proposedExchange || null,
            price: r.proposedSharePrice || null,
            shares: r.sharesOffered || null,
            dollarValue: r.dollarValueOfSharesOffered || null,
            date: toIso(r.expectedPriceDate || r.pricedDate || null),
            status: 'Upcoming',
          });
        }
      }
      if (!out.length) throw new Error('Nasdaq returned no IPO rows');
      // Newest priced first, then upcoming by soonest date.
      out.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      this.cache = { ts: Date.now(), key, data: out };
      return out;
    } catch (err: any) {
      this.logger.warn(`Nasdaq IPO fetch failed: ${err?.message || err}.`);
      // Serve last good cache if we have one; otherwise an empty list.
      return this.cache?.data ?? [];
    }
  }
}
