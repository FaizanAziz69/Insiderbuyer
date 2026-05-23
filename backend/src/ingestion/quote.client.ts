import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface SecFacts {
  sharesOutstanding: number | null;
  sic: string | null;
  sicDescription: string | null;
}

@Injectable()
export class QuoteClient {
  private readonly http: AxiosInstance;

  constructor() {
    const userAgent = process.env.SEC_USER_AGENT || 'IQS Dashboard contact@iqs.local';
    this.http = axios.create({
      timeout: 20000,
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate',
        Accept: 'application/json',
      },
    });
  }

  async fetchSecFacts(cik: string): Promise<SecFacts | null> {
    if (!cik) return null;
    const padded = cik.padStart(10, '0');
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${padded}.json`;
    const submissionsUrl = `https://data.sec.gov/submissions/CIK${padded}.json`;

    let sicDescription: string | null = null;
    let sic: string | null = null;
    try {
      const { data } = await this.http.get(submissionsUrl);
      sic = data?.sic ? String(data.sic) : null;
      sicDescription = data?.sicDescription || null;
    } catch {
      // submissions may 404 for some CIKs — keep nulls
    }

    let sharesOutstanding: number | null = null;
    try {
      const { data } = await this.http.get(factsUrl);
      const dei = data?.facts?.dei || {};
      const tagPriority = [
        'EntityCommonStockSharesOutstanding',
        'CommonStockSharesOutstanding',
        'EntityListingSharesOutstanding',
      ];
      for (const tag of tagPriority) {
        const node = dei[tag] || data?.facts?.['us-gaap']?.[tag];
        if (!node) continue;
        const units = node.units || {};
        const seriesKey = Object.keys(units)[0];
        const series: any[] = units[seriesKey] || [];
        if (!series.length) continue;
        const sorted = [...series].sort((a, b) => {
          const ae = new Date(a.end || a.filed || 0).getTime();
          const be = new Date(b.end || b.filed || 0).getTime();
          return be - ae;
        });
        const v = Number(sorted[0]?.val);
        if (Number.isFinite(v) && v > 0) {
          sharesOutstanding = v;
          break;
        }
      }
    } catch {
      // facts not available — skip
    }

    if (sharesOutstanding === null && !sic) return null;
    return { sharesOutstanding, sic, sicDescription };
  }
}
