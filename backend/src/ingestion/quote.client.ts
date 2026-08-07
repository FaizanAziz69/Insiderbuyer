import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';

export interface SecFacts {
  sharesOutstanding: number | null;
  /** Shares outstanding ~12 months before the latest report — for the
   *  trailing-12-month dilution component (IQ Score v2). Null if unavailable. */
  sharesOutstandingYearAgo: number | null;
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
    let sharesOutstandingYearAgo: number | null = null;
    try {
      const { data } = await this.http.get(factsUrl);
      const dei = data?.facts?.dei || {};
      const tagPriority = [
        'EntityCommonStockSharesOutstanding',
        'CommonStockSharesOutstanding',
        'EntityListingSharesOutstanding',
      ];
      // A public company cannot have fewer than ~100k shares outstanding —
      // XBRL facts sometimes carry per-class or nominal figures (CHWY once
      // reported "100"), and accepting one poisons marketCap = shares × price.
      const MIN_PLAUSIBLE_SHARES = 100_000;
      for (const tag of tagPriority) {
        const node = dei[tag] || data?.facts?.['us-gaap']?.[tag];
        if (!node) continue;
        const units = node.units || {};
        // Prefer the actual share-count unit over whatever key happens first.
        const seriesKey =
          Object.keys(units).find((k) => /share/i.test(k)) || Object.keys(units)[0];
        const series: any[] = units[seriesKey] || [];
        if (!series.length) continue;
        const dated = series
          .map((s) => ({ v: Number(s.val), t: new Date(s.end || s.filed || 0).getTime() }))
          .filter(
            (s) => Number.isFinite(s.v) && s.v >= MIN_PLAUSIBLE_SHARES && s.t > 0,
          )
          .sort((a, b) => b.t - a.t);
        if (!dated.length) continue;
        sharesOutstanding = dated[0].v;
        // Value closest to ~365 days before the latest report.
        const target = dated[0].t - 365 * 86400000;
        let best: { v: number; t: number } | null = null;
        for (const d of dated) {
          if (best == null || Math.abs(d.t - target) < Math.abs(best.t - target)) {
            best = d;
          }
        }
        // Only accept if it's genuinely older (≥180d back) so we don't compare
        // two same-quarter values.
        if (best && dated[0].t - best.t >= 180 * 86400000) {
          sharesOutstandingYearAgo = best.v;
        }
        break;
      }
    } catch {
      // facts not available — skip
    }

    if (sharesOutstanding === null && !sic) return null;
    return { sharesOutstanding, sharesOutstandingYearAgo, sic, sicDescription };
  }
}
