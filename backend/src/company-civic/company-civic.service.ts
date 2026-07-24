import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

export interface QuarterPoint {
  label: string; // e.g. "FY25 Q3"
  amount: number;
}

/**
 * Free company-level civic datasets for the stock page:
 *  - Government Contracts (USAspending.gov — free, no key)
 *  - Corporate Lobbying   (Senate LDA — free API key via LDA_API_KEY env)
 *
 * Both degrade to [] when unavailable so the stock-page cards show a
 * "no data / not connected" state rather than breaking.
 */
@Injectable()
export class CompanyCivicService {
  private readonly log = new Logger(CompanyCivicService.name);
  private readonly http: AxiosInstance;
  private readonly ldaKey = process.env.LDA_API_KEY || '';

  private contractsCache = new Map<string, { ts: number; data: QuarterPoint[] }>();
  private lobbyCache = new Map<string, { ts: number; data: QuarterPoint[] }>();
  private readonly TTL = 12 * 60 * 60_000;

  constructor() {
    this.http = axios.create({
      timeout: 20000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': 'InsiderBuying/1.0', Accept: 'application/json' },
    });
  }

  /** Quarterly federal contract $ awarded to a company (USAspending.gov). */
  async getGovernmentContracts(companyName: string): Promise<QuarterPoint[]> {
    const key = companyName.toUpperCase();
    const cached = this.contractsCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data;
    let out: QuarterPoint[] = [];
    try {
      const { data } = await this.http.post(
        'https://api.usaspending.gov/api/v2/search/spending_over_time/',
        {
          group: 'quarter',
          filters: {
            recipient_search_text: [companyName],
            award_type_codes: ['A', 'B', 'C', 'D'], // contract award types
            time_period: [{ start_date: '2019-01-01', end_date: '2026-12-31' }],
          },
        },
      );
      out = (data?.results || [])
        .map((r: any): QuarterPoint => ({
          label: `FY${String(r.time_period?.fiscal_year ?? '').slice(2)} Q${r.time_period?.quarter ?? ''}`,
          amount: Number(r.aggregated_amount) || 0,
        }))
        .filter((p: QuarterPoint) => p.amount > 0);
    } catch (e: any) {
      this.log.warn(`USAspending contracts failed: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    this.contractsCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  get lobbyingEnabled(): boolean {
    return !!this.ldaKey;
  }

  /** Quarterly corporate lobbying spend for a company (Senate LDA). Requires
   *  LDA_API_KEY (free from lda.senate.gov); returns [] without it. */
  async getLobbying(companyName: string): Promise<QuarterPoint[]> {
    if (!this.ldaKey) return [];
    const key = companyName.toUpperCase();
    const cached = this.lobbyCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data;
    // period code → { short label, within-year order }
    const P: Record<string, { q: string; o: number }> = {
      first_quarter: { q: 'Q1', o: 1 },
      mid_year: { q: 'H1', o: 2 },
      second_quarter: { q: 'Q2', o: 2 },
      third_quarter: { q: 'Q3', o: 3 },
      fourth_quarter: { q: 'Q4', o: 4 },
      year_end: { q: 'H2', o: 4 },
    };
    const agg = new Map<string, { label: string; sort: number; amount: number }>();
    // The LDA API ignores `ordering`, so query recent years explicitly.
    const thisYear = new Date().getUTCFullYear();
    const years = [0, 1, 2, 3, 4, 5].map((d) => thisYear - d);
    try {
      const pages = await Promise.all(
        years.map((yr) =>
          this.http
            .get('https://lda.senate.gov/api/v1/filings/', {
              params: { client_name: companyName, filing_year: yr, page_size: 100 },
              headers: { Authorization: `Token ${this.ldaKey}` },
            })
            .then((r) => r.data?.results || [])
            .catch(() => []),
        ),
      );
      for (const f of pages.flat()) {
        const amt = Number(f.income ?? f.expenses ?? 0) || 0;
        const yr = Number(f.filing_year);
        if (!yr || amt <= 0) continue;
        const p = P[f.filing_period] || { q: String(f.filing_period || ''), o: 5 };
        const label = `FY${String(yr).slice(2)} ${p.q}`;
        const e = agg.get(label) || { label, sort: yr * 10 + p.o, amount: 0 };
        e.amount += amt;
        agg.set(label, e);
      }
    } catch (e: any) {
      this.log.warn(`Senate LDA lobbying failed: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    // Chronological, most-recent 12 periods.
    const out = Array.from(agg.values())
      .sort((a, b) => a.sort - b.sort)
      .slice(-12)
      .map(({ label, amount }) => ({ label, amount }));
    this.lobbyCache.set(key, { ts: Date.now(), data: out });
    return out;
  }
}
