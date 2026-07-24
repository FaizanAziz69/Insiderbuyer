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
    const byPeriod = new Map<string, number>();
    try {
      const { data } = await this.http.get('https://lda.senate.gov/api/v1/filings/', {
        params: { client_name: companyName, page_size: 100 },
        headers: { Authorization: `Token ${this.ldaKey}` },
      });
      for (const f of data?.results || []) {
        const amt = Number(f.income ?? f.expenses ?? 0) || 0;
        const yr = f.filing_year;
        const period = f.filing_period_display || f.filing_period || '';
        if (!yr || amt <= 0) continue;
        // Map period → quarter label.
        const qm: Record<string, string> = {
          first_quarter: 'Q1', second_quarter: 'Q2', third_quarter: 'Q3', fourth_quarter: 'Q4',
        };
        const q = qm[f.filing_period] || period;
        const label = `FY${String(yr).slice(2)} ${q}`;
        byPeriod.set(label, (byPeriod.get(label) || 0) + amt);
      }
    } catch (e: any) {
      this.log.warn(`Senate LDA lobbying failed: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    const out = Array.from(byPeriod.entries()).map(([label, amount]) => ({ label, amount }));
    this.lobbyCache.set(key, { ts: Date.now(), data: out });
    return out;
  }
}
