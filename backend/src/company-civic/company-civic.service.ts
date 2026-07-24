import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

export interface QuarterPoint {
  label: string; // e.g. "FY25 Q3"
  amount: number;
}

export interface RevenueSegment {
  name: string;
  revenue: number; // USD
  pct: number; // % of all segments
}

export interface RevenueBreakdown {
  segments: RevenueSegment[];
  geography: RevenueSegment[];
  total: number | null;
  asOf: string | null; // filing period end, e.g. "2026-03-31"
  form: string | null; // "10-Q" | "10-K"
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
  private revenueCache = new Map<string, { ts: number; data: RevenueBreakdown }>();
  private cikMap: Map<string, number> | null = null;
  private cikMapTs = 0;
  private readonly TTL = 12 * 60 * 60_000;

  constructor() {
    this.http = axios.create({
      timeout: 20000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': 'InsiderBuying/1.0', Accept: 'application/json' },
    });
    // SEC requires a descriptive User-Agent with contact info.
    this.sec = axios.create({
      timeout: 20000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': 'InsiderBuying/1.0 (contact@insiderbuying.com)' },
    });
  }

  private readonly sec: AxiosInstance;

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

  // ── Revenue Breakdown (SEC EDGAR — free, no key) ──────────────────────
  //
  // Companies disclose "Disaggregation of Revenue" (ASC 606) and revenue by
  // geography in every 10-Q/10-K. The filing's FilingSummary.xml lists the
  // rendered R##.htm tables, which are uniform enough to parse generically.

  /** Ticker → CIK via SEC's official mapping (cached 24h). */
  private async getCik(ticker: string): Promise<number | null> {
    if (!this.cikMap || Date.now() - this.cikMapTs > 24 * 60 * 60_000) {
      try {
        const { data } = await this.sec.get('https://www.sec.gov/files/company_tickers.json');
        const m = new Map<string, number>();
        for (const v of Object.values<any>(data || {})) {
          if (v?.ticker) m.set(String(v.ticker).toUpperCase(), Number(v.cik_str));
        }
        this.cikMap = m;
        this.cikMapTs = Date.now();
      } catch (e: any) {
        this.log.warn(`SEC ticker map failed: ${e?.message || e}`);
        return null;
      }
    }
    return this.cikMap.get(ticker.toUpperCase()) ?? null;
  }

  /** Parse one rendered R##.htm table into (label → latest-period value) rows.
   *  Handles both shapes: rows named by segment directly, and member-header
   *  rows followed by a "Total net sales / Revenue" value row. */
  private parseRFile(htmlDoc: string): { name: string; value: number }[] {
    const scale = /\$\s*in\s*Millions/i.test(htmlDoc)
      ? 1e6
      : /\$\s*in\s*Thousands/i.test(htmlDoc)
        ? 1e3
        : /\$\s*in\s*Billions/i.test(htmlDoc)
          ? 1e9
          : 1;
    const out: { name: string; value: number }[] = [];
    const seen = new Set<string>();
    let member: string | null = null;
    const trs = htmlDoc.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || [];
    const clean = (s: string) =>
      s
        .replace(/<[^>]+>/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&nbsp;/g, ' ')
        .replace(/&#\d+;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    for (const tr of trs) {
      const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map(clean);
      if (!cells.length) continue;
      const label = cells[0];
      if (!label || /line items|axis|\[|abstract|^x$|definition|namespace|reference/i.test(label)) continue;
      // First numeric cell after the label = latest period.
      let value: number | null = null;
      for (let i = 1; i < cells.length; i++) {
        const c = cells[i];
        if (!c) continue;
        const m = c.match(/^\(?\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\)?$/);
        if (m) {
          value = Number(m[1].replace(/,/g, '')) * scale;
          if (/\(/.test(c)) value = -value;
        }
        break; // only the FIRST data column (latest period)
      }
      if (value == null) {
        // Standalone label row → a dimension member header ("Online stores").
        if (cells.slice(1).every((c) => !c) && label.length < 80) member = label;
        continue;
      }
      const isTotalLabel = /^total|net sales|^revenue|^net revenue|consolidated/i.test(label);
      const name = isTotalLabel && member ? member : label;
      const key = name.toUpperCase();
      if (seen.has(key)) continue; // first occurrence wins (latest period)
      seen.add(key);
      out.push({ name, value });
      member = null;
    }
    return out;
  }

  /** Turn parsed rows into segments + total, dropping total/eliminations rows
   *  and hierarchical children ("YouTube ads | Google Services") whose parent
   *  is also present, which would otherwise double-count. */
  private toSegments(rows: { name: string; value: number }[]): { segments: RevenueSegment[]; total: number | null } {
    const isTotal = (n: string) => /^total|consolidated|^net sales$|^revenue(s)?$|^operating segments$/i.test(n.trim());
    const isNoise = (n: string) =>
      n.length > 60 ||
      /eliminat|intersegment|reconcil|portion of|included in|unearned|deferred|performance obligation|cost of revenue|operating (income|expense|loss)|gross margin|research and development|general and administrative|sales and marketing|depreciation|amortization|segment items|assets|expenditure|hedging/i.test(
        n,
      );
    const totalRow = rows.find((r) => isTotal(r.name));
    let parts = rows.filter((r) => !isTotal(r.name) && !isNoise(r.name) && r.value > 0);
    // Hierarchical rows come through as "Child | Parent". If the parent is
    // present standalone, the child is a sub-breakdown — drop it. Otherwise
    // keep the row but display just the child name.
    const flat = new Set(parts.filter((r) => !r.name.includes(' | ')).map((r) => r.name.toUpperCase()));
    parts = parts
      .filter((r) => {
        const i = r.name.indexOf(' | ');
        return i < 0 || !flat.has(r.name.slice(i + 3).trim().toUpperCase());
      })
      .map((r) => {
        const i = r.name.indexOf(' | ');
        return i < 0 ? r : { ...r, name: r.name.slice(0, i).trim() };
      });
    // Collapse sub-breakdowns without pipes (NVDA: Data Center followed by
    // Hyperscale + AI Clouds that sum to it) — if the rows right after a row
    // sum to its value, they're its children; keep the parent.
    // Require ≥2 children and a near-exact sum (filings add exactly) so a
    // coincidental partial sum can never wrongly swallow real segments.
    for (let i = 0; i < parts.length; i++) {
      for (let j = i + 3; j <= Math.min(parts.length, i + 9); j++) {
        const s = parts.slice(i + 1, j).reduce((a, r) => a + r.value, 0);
        if (s > 0 && Math.abs(s - parts[i].value) / parts[i].value < 0.001) {
          parts.splice(i + 1, j - i - 1);
          break;
        }
      }
    }
    const sum = parts.reduce((s, r) => s + r.value, 0);
    const total = totalRow?.value ?? (sum || null);
    const denom = sum || total || 1;
    const segments = parts
      .sort((a, b) => b.value - a.value)
      .map((r) => ({ name: r.name, revenue: r.value, pct: +((r.value / denom) * 100).toFixed(2) }));
    return { segments, total };
  }

  /** Does this label name a geographic area rather than a product/segment? */
  private isGeoName(n: string): boolean {
    return /^(the )?(united states|u\.s\.?a?\b|americas|north america|south america|latin america|europe|emea|apac|asia|greater china|china|japan|canada|mexico|germany|france|india|korea|taiwan|(the )?(uk|united kingdom)|international|rest of|other countr|other international|foreign|domestic|non-?us|africa|middle east|australia)/i.test(
      n.trim(),
    );
  }

  /** Re-derive % shares after any post-filtering. */
  private rescale(list: RevenueSegment[]): RevenueSegment[] {
    const sum = list.reduce((s, r) => s + r.revenue, 0) || 1;
    return list.map((r) => ({ ...r, pct: +((r.revenue / sum) * 100).toFixed(2) }));
  }

  /** Revenue by segment + geography from the company's latest 10-Q/10-K. */
  async getRevenueBreakdown(ticker: string): Promise<RevenueBreakdown> {
    const key = ticker.toUpperCase();
    const cached = this.revenueCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data;
    const empty: RevenueBreakdown = { segments: [], geography: [], total: null, asOf: null, form: null };
    let out = empty;
    try {
      const cik = await this.getCik(key);
      if (!cik) throw new Error(`no CIK for ${key}`);
      const padded = String(cik).padStart(10, '0');
      const { data: sub } = await this.sec.get(`https://data.sec.gov/submissions/CIK${padded}.json`);
      const r = sub?.filings?.recent;
      let acc = '';
      let asOf: string | null = null;
      let form: string | null = null;
      for (let i = 0; i < (r?.form?.length || 0); i++) {
        if (r.form[i] === '10-Q' || r.form[i] === '10-K') {
          acc = String(r.accessionNumber[i]).replace(/-/g, '');
          asOf = r.reportDate[i] || null;
          form = r.form[i];
          break;
        }
      }
      if (!acc) throw new Error('no 10-Q/10-K found');
      const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}`;
      const { data: fs } = await this.sec.get(`${base}/FilingSummary.xml`, { responseType: 'text' });
      const reports: { file: string; name: string }[] = [];
      for (const rep of String(fs).match(/<Report[^>]*>[\s\S]*?<\/Report>/g) || []) {
        const ln = rep.match(/<LongName>([\s\S]*?)<\/LongName>/)?.[1] || '';
        const fn = rep.match(/<HtmlFileName>([\s\S]*?)<\/HtmlFileName>/)?.[1] || '';
        if (fn) reports.push({ file: fn, name: ln });
      }
      // Reports about deferred/unearned revenue, narratives, reconciliations
      // etc. also mention "revenue" — never pick those.
      const BAD =
        /unearned|deferred revenue|remaining performance|narrative|parenthetical|additional information|reconcil|concentration|warranty|contract (asset|liabilit)|schedule of changes/i;
      const pick = (patterns: RegExp[]): string | null => {
        for (const p of patterns) {
          const hit = reports.find((rep) => p.test(rep.name) && /detail/i.test(rep.name) && !BAD.test(rep.name));
          if (hit) return hit.file;
        }
        return null;
      };
      const segFile = pick([
        /disaggregat.*revenue/i,
        /revenue.*disaggregat/i,
        /revenue.*(product|service|market|platform|category)/i,
        /(revenue|net sales).*segment/i,
        /segment.*(revenue|net sales)/i,
        /segment.*reportable|reportable segment/i,
      ]);
      const geoFile = pick([/revenue.*geograph/i, /geograph.*revenue/i, /(net sales|revenue).*by.*(area|region|country)/i]);
      const [segRows, geoRows] = await Promise.all([
        segFile
          ? this.sec.get(`${base}/${segFile}`, { responseType: 'text' }).then((x) => this.parseRFile(String(x.data)))
          : Promise.resolve([]),
        geoFile && geoFile !== segFile
          ? this.sec.get(`${base}/${geoFile}`, { responseType: 'text' }).then((x) => this.parseRFile(String(x.data)))
          : Promise.resolve([]),
      ]);
      const seg = this.toSegments(segRows);
      const geo = this.toSegments(geoRows);
      // Some filings mix geographic members into the disaggregation table
      // (e.g. META). Split those out so each tab stays coherent.
      let segments = seg.segments.filter((s) => !this.isGeoName(s.name));
      let geography = geo.segments;
      if (geography.length < 2) geography = seg.segments.filter((s) => this.isGeoName(s.name));
      if (geography.length < 2) geography = []; // one region alone is meaningless
      if (segments.length !== seg.segments.length) segments = this.rescale(segments);
      geography = this.rescale(geography);
      out = { segments, geography, total: seg.total, asOf, form };
    } catch (e: any) {
      this.log.warn(`Revenue breakdown failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    this.revenueCache.set(key, { ts: Date.now(), data: out });
    return out;
  }
}
