import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

/** A normalized congressional disclosure (Senate or House). */
export interface FmpCongressTrade {
  politicianName: string;
  chamber: 'Senate' | 'House';
  party: string | null;
  ticker: string | null;
  companyName: string;
  action: 'Buy' | 'Sell';
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  reportedDate: string;
}

/** A normalized insider Form 4 transaction from FMP's market-wide feed. */
export interface FmpInsiderTrade {
  ticker: string;
  insiderName: string;
  typeOfOwner: string;
  isBuy: boolean;
  shares: number;
  price: number;
  transactionDate: string;
  filingDate: string;
  url: string;
}

/**
 * Financial Modeling Prep client (free "stable" tier). Provides the data SEC
 * EDGAR alone can't give us cleanly: market-wide insider trades and
 * congressional (Senate + House) disclosures. Requires FMP_API_KEY in env;
 * methods return [] when the key is missing so the app degrades gracefully.
 */
@Injectable()
export class FmpService {
  private readonly log = new Logger(FmpService.name);
  private readonly http: AxiosInstance;
  private readonly key = process.env.FMP_API_KEY || '';
  private readonly base = 'https://financialmodelingprep.com/stable';

  constructor() {
    this.http = axios.create({
      timeout: 15000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': 'InsiderBuying/1.0', Accept: 'application/json' },
    });
  }

  get enabled(): boolean {
    return !!this.key;
  }

  /** Last failure seen by get() — surfaced by diagnostics endpoints. */
  lastError: string | null = null;

  private async get(path: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.key) return [];
    try {
      const { data } = await this.http.get(`${this.base}/${path}`, {
        params: { ...params, apikey: this.key },
      });
      if (!Array.isArray(data)) {
        this.lastError = `${path}: non-array response ${JSON.stringify(data).slice(0, 160)}`;
        return [];
      }
      return data;
    } catch (e: any) {
      const body = typeof e?.response?.data === 'string' ? e.response.data.slice(0, 160) : '';
      this.lastError = `${path}: ${e?.response?.status || ''} ${e?.message || e} ${body}`;
      this.log.warn(`FMP ${this.lastError}`);
      return [];
    }
  }

  // ── Congressional ────────────────────────────────────────────────────
  private parseAmount(a: string): { min: number | null; max: number | null } {
    if (!a) return { min: null, max: null };
    const nums = a.replace(/[$,]/g, '').match(/\d+/g);
    if (!nums?.length) return { min: null, max: null };
    return { min: Number(nums[0]), max: nums[1] ? Number(nums[1]) : Number(nums[0]) };
  }

  private mapCongress(r: any, chamber: 'Senate' | 'House'): FmpCongressTrade | null {
    const t = String(r.type || '').toLowerCase();
    const action: 'Buy' | 'Sell' | null = t.includes('purchase')
      ? 'Buy'
      : t.includes('sale') || t.includes('sell')
        ? 'Sell'
        : null;
    if (!action) return null; // skip exchanges/receives
    const { min, max } = this.parseAmount(r.amount);
    const name =
      `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.office || 'Unknown';
    return {
      politicianName: name,
      chamber,
      party: r.party || null, // FMP latest feed omits party
      ticker: r.symbol ? String(r.symbol).toUpperCase() : null,
      companyName: r.assetDescription || r.symbol || '',
      action,
      amountMin: min,
      amountMax: max,
      transactionDate: r.transactionDate || r.disclosureDate,
      reportedDate: r.disclosureDate || r.transactionDate,
    };
  }

  /** Latest Senate + House disclosures, merged & normalized.
   *  Free tier serves 100 rows on page 0 ONLY (pages 1+ are restricted), so
   *  ask for the full page; history is accumulated by the caller over time. */
  async getCongressional(pages = 1): Promise<FmpCongressTrade[]> {
    if (!this.key) return [];
    const out: FmpCongressTrade[] = [];
    for (let p = 0; p < pages; p++) {
      // NOTE: `limit` above 25 is a premium parameter, but OMITTING it
      // returns the full 100-row page on the free tier.
      const [senate, house] = await Promise.all([
        this.get('senate-latest', { page: p }),
        this.get('house-latest', { page: p }),
      ]);
      for (const r of senate) {
        const m = this.mapCongress(r, 'Senate');
        if (m) out.push(m);
      }
      for (const r of house) {
        const m = this.mapCongress(r, 'House');
        if (m) out.push(m);
      }
      if (!senate.length && !house.length) break;
    }
    return out;
  }

  // ── Insider (market-wide latest feed) ─────────────────────────────────
  private insiderCache: {
    ts: number;
    map: Map<string, { val: number; sh: number; last: string }>;
  } | null = null;
  private readonly INSIDER_TTL_MS = 6 * 60 * 60_000; // 6h — free tier is 250 calls/DAY

  /** Volume-weighted insider BUY cost + last buy date per ticker, derived from
   *  FMP's market-wide latest insider feed (cached 30 min). Covers any stock
   *  that recently had open-market insider buys — far beyond our SEC subset. */
  async getInsiderCostBasisMap(): Promise<
    Map<string, { avgCost: number | null; lastBuyDate: string | null }>
  > {
    const out = new Map<string, { avgCost: number | null; lastBuyDate: string | null }>();
    if (!this.key) return out;
    if (!this.insiderCache || Date.now() - this.insiderCache.ts > this.INSIDER_TTL_MS) {
      const trades = await this.getInsiderLatest(1); // free tier serves page 0 only
      const agg = new Map<string, { val: number; sh: number; last: string }>();
      for (const t of trades) {
        if (!t.isBuy || t.shares <= 0 || t.price <= 0) continue;
        const e = agg.get(t.ticker) || { val: 0, sh: 0, last: '' };
        e.val += t.shares * t.price;
        e.sh += t.shares;
        if ((t.transactionDate || '') > e.last) e.last = t.transactionDate || '';
        agg.set(t.ticker, e);
      }
      this.insiderCache = { ts: Date.now(), map: agg };
    }
    for (const [k, e] of this.insiderCache.map) {
      out.set(k, {
        avgCost: e.sh > 0 ? +(e.val / e.sh).toFixed(2) : null,
        lastBuyDate: e.last || null,
      });
    }
    return out;
  }

  /** Latest insider Form 4 transactions across the whole market. */
  async getInsiderLatest(pages = 3): Promise<FmpInsiderTrade[]> {
    if (!this.key) return [];
    const out: FmpInsiderTrade[] = [];
    for (let p = 0; p < pages; p++) {
      // No `limit` param — free tier rejects limit>25 but serves 100 without it.
      const rows = await this.get('insider-trading/latest', { page: p });
      if (!rows.length) break;
      for (const r of rows) {
        const shares = Number(r.securitiesTransacted) || 0;
        const price = Number(r.price) || 0;
        if (!r.symbol || shares <= 0) continue;
        out.push({
          ticker: String(r.symbol).toUpperCase(),
          insiderName: r.reportingName || '',
          typeOfOwner: r.typeOfOwner || '',
          // P-Purchase / acquisitionOrDisposition "A" = acquired (buy)
          isBuy: /purchase/i.test(r.transactionType || '') || r.acquisitionOrDisposition === 'A',
          shares,
          price,
          transactionDate: r.transactionDate,
          filingDate: r.filingDate,
          url: r.url || '',
        });
      }
    }
    return out;
  }
}
