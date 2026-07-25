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
  prevRevenue: number | null; // same period a year earlier (from the filing's comparative column)
  yoyPct: number | null;
}

export interface RevenueBreakdown {
  segments: RevenueSegment[];
  geography: RevenueSegment[];
  total: number | null;
  asOf: string | null; // filing period end, e.g. "2026-03-31"
  form: string | null; // "10-Q" | "10-K"
}

export interface WhaleHolding {
  institution: string;
  shares: number;
  value: number; // USD
  change: number | null; // share change vs the filer's previous 13F (null = unknown)
  pctChange: number | null;
  isNew: boolean; // issuer absent from the filer's previous 13F
  reported: string; // filing date
}

export interface DerivativeHolding {
  institution: string;
  type: 'PUT' | 'CALL';
  shares: number; // principal amount of shares underlying
  value: number; // USD
  reported: string;
}

export interface InstitutionsPage {
  holdings: WhaleHolding[];
  derivatives: DerivativeHolding[];
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
  private whaleCache = new Map<string, { ts: number; data: InstitutionsPage }>();
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

  /** Individual lobbying filings (amount + issue areas) for the Government
   *  tab's instance list — same LDA source as the quarterly chart. */
  async getLobbyingInstances(companyName: string): Promise<{ amount: number; date: string | null; period: string; issues: string }[]> {
    if (!this.ldaKey) return [];
    const key = `inst:${companyName.toUpperCase()}`;
    const cached = this.lobbyCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data as any;
    const out: { amount: number; date: string | null; period: string; issues: string }[] = [];
    try {
      const thisYear = new Date().getUTCFullYear();
      const pages = await Promise.all(
        [0, 1, 2].map((d) =>
          this.http
            .get('https://lda.senate.gov/api/v1/filings/', {
              params: { client_name: companyName, filing_year: thisYear - d, page_size: 25 },
              headers: { Authorization: `Token ${this.ldaKey}` },
            })
            .then((r) => r.data?.results || [])
            .catch(() => []),
        ),
      );
      for (const f of pages.flat()) {
        const amt = Number(f.income ?? f.expenses ?? 0) || 0;
        if (amt <= 0) continue;
        const issues = Array.from(
          new Set((f.lobbying_activities || []).map((a: any) => String(a.general_issue_code_display || '')).filter(Boolean)),
        ).join(' ');
        out.push({
          amount: amt,
          date: f.dt_posted ? String(f.dt_posted).slice(0, 10) : null,
          period: `${f.filing_period_display || ''} ${f.filing_year || ''}`.trim(),
          issues,
        });
      }
      out.sort((a, b) => String(b.date).localeCompare(String(a.date)));
    } catch (e: any) {
      this.log.warn(`LDA instances failed: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    const top = out.slice(0, 20);
    this.lobbyCache.set(key, { ts: Date.now(), data: top as any });
    return top;
  }

  // ── U.S. Patents (USPTO Open Data Portal — free key via USPTO_API_KEY) ──
  // PatentsView was retired into USPTO's ODP (api.uspto.gov); the Patent
  // File Wrapper search covers grants when filtered to rows with grantDate.
  private patentsCache = new Map<string, { ts: number; data: { title: string; date: string }[] }>();
  private readonly usptoKey = process.env.USPTO_API_KEY || process.env.PATENTSVIEW_API_KEY || '';

  get patentsEnabled(): boolean {
    return !!this.usptoKey;
  }

  /** Recent patent grants for the company (USPTO Open Data Portal). */
  async getPatents(companyName: string): Promise<{ title: string; date: string }[]> {
    if (!this.usptoKey) return [];
    const key = companyName.toUpperCase();
    const cached = this.patentsCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data;
    let out: { title: string; date: string }[] = [];
    const base = companyName.replace(/[.,]/g, '').replace(/\b(inc|corp|corporation|company|co|ltd|plc|llc)\b/gi, '').trim() || companyName;
    const lead = base.split(/\s+/)[0].toLowerCase();
    try {
      const { data } = await this.http.get('https://api.uspto.gov/api/v1/patent/applications/search', {
        params: {
          q: `applicationMetaData.firstNamedApplicant:"${base}" AND applicationMetaData.grantDate:[2015-01-01 TO *]`,
          sort: 'applicationMetaData.grantDate desc',
          limit: 50,
        },
        headers: { 'X-API-KEY': this.usptoKey },
      });
      const bag: any[] = data?.patentFileWrapperDataBag || data?.results || [];
      out = bag
        .map((r: any) => {
          const m = r?.applicationMetaData || r;
          return {
            title: String(m?.inventionTitle || ''),
            date: String(m?.grantDate || ''),
            applicant: String(m?.firstNamedApplicant || ''),
          };
        })
        .filter((p) => p.title && p.date && p.applicant.toLowerCase().includes(lead))
        .sort((a, b) => b.date.localeCompare(a.date))
        .slice(0, 40)
        .map(({ title, date }) => ({ title, date }));
    } catch (e: any) {
      this.log.warn(`USPTO ODP patents failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    if (out.length) this.patentsCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  // ── Executive compensation (SEC DEF 14A — Pay vs Performance table) ───
  private compCache = new Map<string, { ts: number; data: any }>();

  /** Best-effort executive-comp summary parsed from the company's latest
   *  DEF 14A "Pay versus Performance" XBRL table (CEO total + avg other
   *  NEOs per year). Returns empty rows when the proxy can't be parsed —
   *  the UI shows an honest empty state, never invented numbers. */
  async getCompensation(ticker: string): Promise<{ rows: { year: number; peoTotal: number | null; avgNeoTotal: number | null }[]; source: string | null }> {
    const key = ticker.toUpperCase();
    const cached = this.compCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data;
    const empty = { rows: [] as { year: number; peoTotal: number | null; avgNeoTotal: number | null }[], source: null as string | null };
    let out = empty;
    try {
      const cik = await this.getCik(key);
      if (!cik) throw new Error('no CIK');
      const padded = String(cik).padStart(10, '0');
      const { data: sub } = await this.sec.get(`https://data.sec.gov/submissions/CIK${padded}.json`);
      const r = sub?.filings?.recent;
      let acc = '';
      for (let i = 0; i < (r?.form?.length || 0); i++) {
        if (String(r.form[i]).startsWith('DEF 14A')) {
          acc = String(r.accessionNumber[i]).replace(/-/g, '');
          break;
        }
      }
      if (!acc) throw new Error('no DEF 14A');
      const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}`;
      const { data: fs } = await this.sec.get(`${base}/FilingSummary.xml`, { responseType: 'text' });
      let file = '';
      for (const rep of String(fs).match(/<Report[^>]*>[\s\S]*?<\/Report>/g) || []) {
        const ln = rep.match(/<LongName>([\s\S]*?)<\/LongName>/)?.[1] || '';
        if (/pay (versus|vs) performance/i.test(ln)) {
          file = rep.match(/<HtmlFileName>([\s\S]*?)<\/HtmlFileName>/)?.[1] || '';
          if (file) break;
        }
      }
      if (!file) throw new Error('no PvP table');
      const { data: html } = await this.sec.get(`${base}/${file}`, { responseType: 'text' });
      const rows: { year: number; peoTotal: number | null; avgNeoTotal: number | null }[] = [];
      for (const tr of String(html).match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) || []) {
        const cells = (tr.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) || []).map((c) =>
          c.replace(/<[^>]+>/g, ' ').replace(/&nbsp;|&#\d+;/g, ' ').replace(/\s+/g, ' ').trim(),
        );
        if (!cells.length) continue;
        const year = Number(cells[0]);
        if (!Number.isInteger(year) || year < 2015 || year > 2030) continue;
        const nums = cells
          .slice(1)
          .map((c) => c.match(/^\$?\s*\(?([\d,]{4,})\)?$/)?.[1])
          .filter(Boolean)
          .map((n) => Number(String(n).replace(/,/g, '')));
        if (!nums.length) continue;
        if (!rows.some((x) => x.year === year)) {
          rows.push({ year, peoTotal: nums[0] ?? null, avgNeoTotal: nums[2] ?? nums[1] ?? null });
        }
      }
      rows.sort((a, b) => b.year - a.year);
      if (rows.length) out = { rows: rows.slice(0, 5), source: 'SEC DEF 14A (Pay vs Performance disclosure)' };
    } catch (e: any) {
      this.log.warn(`Compensation parse failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    if (out.rows.length) this.compCache.set(key, { ts: Date.now(), data: out });
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
  private parseRFile(htmlDoc: string): { name: string; value: number; prev: number | null }[] {
    const scale = /\$\s*in\s*Millions/i.test(htmlDoc)
      ? 1e6
      : /\$\s*in\s*Thousands/i.test(htmlDoc)
        ? 1e3
        : /\$\s*in\s*Billions/i.test(htmlDoc)
          ? 1e9
          : 1;
    const out: { name: string; value: number; prev: number | null }[] = [];
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
      // First numeric cell after the label = latest period; the next numeric
      // cell is the filing's comparative column (same period a year earlier).
      let value: number | null = null;
      let prev: number | null = null;
      let sawData = false;
      for (let i = 1; i < cells.length && prev == null; i++) {
        const c = cells[i];
        if (!c) continue;
        const m = c.match(/^\(?\$?\s*\(?\s*([\d,]+(?:\.\d+)?)\)?$/);
        if (!m) {
          if (!sawData) break; // first data cell isn't numeric → not a value row
          continue;
        }
        let n = Number(m[1].replace(/,/g, '')) * scale;
        if (/\(/.test(c)) n = -n;
        if (!sawData) {
          value = n;
          sawData = true;
        } else {
          prev = n;
        }
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
      out.push({ name, value, prev });
      member = null;
    }
    return out;
  }

  /** Turn parsed rows into segments + total, dropping total/eliminations rows
   *  and hierarchical children ("YouTube ads | Google Services") whose parent
   *  is also present, which would otherwise double-count. */
  private toSegments(rows: { name: string; value: number; prev: number | null }[]): { segments: RevenueSegment[]; total: number | null } {
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
      .map((r) => ({
        name: r.name,
        revenue: r.value,
        pct: +((r.value / denom) * 100).toFixed(2),
        prevRevenue: r.prev,
        yoyPct: r.prev != null && r.prev > 0 ? +(((r.value - r.prev) / r.prev) * 100).toFixed(1) : null,
      }));
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
    // Cache only real results — a transient SEC failure must retry on the
    // next request instead of pinning an empty card for the TTL.
    if (out.segments.length || out.geography.length) this.revenueCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  // ── Whale Activity (SEC 13F filings — free, no key) ───────────────────
  //
  // Institutions report holdings quarterly on Form 13F. EDGAR full-text
  // search finds recent 13F-HR info tables naming the issuer; we sum the
  // issuer's rows in each filer's table and diff against that filer's
  // previous 13F for the share change.

  /** "Amazon.com, Inc." → "AMAZON COM INC" (how 13F info tables name issuers). */
  private toIssuerName(companyName: string): string {
    return companyName
      .toUpperCase()
      .replace(/\./g, ' ')
      .replace(/[,'&()]/g, ' ')
      .replace(/\bCORPORATION\b/g, 'CORP')
      .replace(/\bINCORPORATED\b/g, 'INC')
      .replace(/\bCOMPANY\b/g, 'CO')
      .replace(/\bLIMITED\b/g, 'LTD')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** Sum an issuer's (shares, value $) across one 13F info-table XML —
   *  common shares and PUT/CALL option rows separately. */
  private sumInfoTable(
    xml: string,
    issuer: string,
  ): { shares: number; value: number; puts: { shares: number; value: number }; calls: { shares: number; value: number } } | null {
    const rows = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/gi) || [];
    const out = { shares: 0, value: 0, puts: { shares: 0, value: 0 }, calls: { shares: 0, value: 0 } };
    let found = false;
    for (const r of rows) {
      const name = r.match(/nameOfIssuer>([\s\S]*?)</i)?.[1]?.toUpperCase().replace(/\s+/g, ' ').trim() || '';
      if (!name.startsWith(issuer) && !issuer.startsWith(name)) continue;
      const sh = Number(r.match(/sshPrnamt>(\d+)</i)?.[1] || 0);
      const val = Number(r.match(/value>(\d+)</i)?.[1] || 0);
      const pc = r.match(/putCall>\s*(put|call)/i)?.[1]?.toLowerCase();
      if (pc === 'put') {
        out.puts.shares += sh;
        out.puts.value += val;
      } else if (pc === 'call') {
        out.calls.shares += sh;
        out.calls.value += val;
      } else {
        out.shares += sh;
        out.value += val;
      }
      found = true;
    }
    return found ? out : null;
  }

  /** The filer's previous 13F position in this issuer (null = couldn't tell,
   *  {shares:0,...} = previous filing had no rows for it → NEW position). */
  private async previousPosition(
    filerCik: string,
    currentAcc: string,
    issuer: string,
  ): Promise<{ shares: number; value: number } | null> {
    try {
      const padded = filerCik.padStart(10, '0');
      const { data: sub } = await this.sec.get(`https://data.sec.gov/submissions/CIK${padded}.json`);
      const r = sub?.filings?.recent;
      let prevAcc = '';
      for (let i = 0; i < (r?.form?.length || 0); i++) {
        if (!/^13F-HR/.test(r.form[i])) continue;
        const acc = String(r.accessionNumber[i]);
        if (acc.replace(/-/g, '') === currentAcc) continue;
        prevAcc = acc.replace(/-/g, '');
        break;
      }
      if (!prevAcc) return null;
      const base = `https://www.sec.gov/Archives/edgar/data/${Number(filerCik)}/${prevAcc}`;
      const { data: idx } = await this.sec.get(`${base}/index.json`);
      const files: string[] = (idx?.directory?.item || []).map((f: any) => String(f.name));
      const table =
        files.find((f) => /info.?table.*\.xml$/i.test(f)) ||
        files.find((f) => /\.xml$/i.test(f) && !/primary_doc/i.test(f));
      if (!table) return null;
      const { data: xml } = await this.sec.get(`${base}/${table}`, { responseType: 'text' });
      return this.sumInfoTable(String(xml), issuer) ?? { shares: 0, value: 0 };
    } catch {
      return null;
    }
  }

  /** Full institutional-ownership dataset for a stock (SEC 13F): recent stock
   *  positions with QoQ change plus PUT/CALL derivative positions. */
  async getInstitutions(companyName: string, ticker: string): Promise<InstitutionsPage> {
    const key = ticker.toUpperCase();
    const cached = this.whaleCache.get(key);
    if (cached && Date.now() - cached.ts < this.TTL) return cached.data;
    const out: InstitutionsPage = { holdings: [], derivatives: [] };
    const issuer = this.toIssuerName(companyName);
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - 120 * 24 * 60 * 60_000).toISOString().slice(0, 10);
      const { data: fts } = await this.sec.get('https://efts.sec.gov/LATEST/search-index', {
        params: { q: `"${issuer}"`, forms: '13F-HR', dateRange: 'custom', startdt: start, enddt: end },
      });
      const hits: any[] = fts?.hits?.hits || [];
      const seenFiler = new Set<string>();
      const picks: { acc: string; file: string; cik: string; name: string; date: string }[] = [];
      for (const h of hits.sort((a, b) => String(b._source?.file_date).localeCompare(String(a._source?.file_date)))) {
        const [accDashed, file] = String(h._id || '').split(':');
        const s = h._source || {};
        const cik = String(s.cik || (s.display_names?.[0]?.match(/CIK (\d+)/)?.[1] ?? '')).replace(/^0+/, '');
        const name = String(s.display_names?.[0] || '').replace(/\s*\(CIK.*$/, '').trim();
        if (!accDashed || !file || !cik || !name || seenFiler.has(cik)) continue;
        seenFiler.add(cik);
        picks.push({ acc: accDashed.replace(/-/g, ''), file, cik, name, date: String(s.file_date || '') });
        if (picks.length >= 24) break;
      }
      // Chunks of 6 keep us inside SEC's ~10 req/s fair-use limit.
      for (let c = 0; c < picks.length; c += 6) {
        const rows = await Promise.all(
          picks.slice(c, c + 6).map(async (p) => {
            try {
              const url = `https://www.sec.gov/Archives/edgar/data/${Number(p.cik)}/${p.acc}/${p.file}`;
              const { data: xml } = await this.sec.get(url, { responseType: 'text' });
              const cur = this.sumInfoTable(String(xml), issuer);
              if (!cur) return null;
              const prev = cur.shares > 0 ? await this.previousPosition(p.cik, p.acc, issuer) : null;
              return { p, cur, prev };
            } catch {
              return null;
            }
          }),
        );
        for (const r of rows) {
          if (!r) continue;
          const { p, cur, prev } = r;
          if (cur.shares > 0) {
            out.holdings.push({
              institution: p.name,
              shares: cur.shares,
              value: cur.value,
              change: prev ? cur.shares - prev.shares : null,
              pctChange: prev && prev.shares > 0 ? +(((cur.shares - prev.shares) / prev.shares) * 100).toFixed(1) : null,
              isNew: prev != null && prev.shares === 0,
              reported: p.date,
            });
          }
          for (const t of ['puts', 'calls'] as const) {
            if (cur[t].shares > 0) {
              out.derivatives.push({
                institution: p.name,
                type: t === 'puts' ? 'PUT' : 'CALL',
                shares: cur[t].shares,
                value: cur[t].value,
                reported: p.date,
              });
            }
          }
        }
      }
    } catch (e: any) {
      this.log.warn(`Institutions failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    if (out.holdings.length || out.derivatives.length) this.whaleCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  /** Compact slice for the stock-page Whale Activity card. */
  async getWhaleActivity(companyName: string, ticker: string): Promise<WhaleHolding[]> {
    return (await this.getInstitutions(companyName, ticker)).holdings.slice(0, 8);
  }
}
