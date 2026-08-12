import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { FmpService } from '../fmp/fmp.service';

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

/** Why a list is empty. "not-disclosed" = we read the filing and the company
 *  genuinely doesn't break revenue down that way; "unavailable" = the SEC
 *  lookup itself failed. The UI must show those differently — an empty table
 *  is honest for the first and a lie for the second. */
export type DataStatus = 'ok' | 'partial' | 'not-disclosed' | 'unavailable';

/** Which upstream produced a list. SEC is always preferred (it cites the exact
 *  filing); FMP fills the gaps where the disclosure exists but isn't tagged in
 *  XBRL. `null` means nothing produced rows. */
export type DataSource = 'sec' | 'fmp' | null;

export interface RevenueBreakdown {
  segments: RevenueSegment[];
  geography: RevenueSegment[];
  total: number | null;
  asOf: string | null; // filing period end, e.g. "2026-03-31"
  form: string | null; // "10-Q" | "10-K"
  // ── additive status fields (frontend may ignore them) ──
  status?: DataStatus; // worst case of the two sections
  segmentsStatus?: DataStatus;
  geographyStatus?: DataStatus;
  segmentsSource?: DataSource;
  geographySource?: DataSource;
  sourceUrl?: string | null; // the filing directory the numbers came from
  geographyAsOf?: string | null; // FMP geography is annual, so it can differ from asOf
  /** False when the rows could not be checked against the period's revenue
   *  total. They are still real disclosed figures, but if the source nested
   *  regions inside an aggregate bucket the shares may double-count, so the UI
   *  should caveat the percentages rather than present them as exact. */
  geographyReconciled?: boolean;
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
  // ── additive status fields (frontend may ignore them) ──
  status?: DataStatus; // 'not-disclosed' = searched EDGAR, no 13F names this issuer
  issuer?: string; // the normalised issuer name we actually searched for
  filersScanned?: number; // 13F filings the EDGAR search gave us
  filersMatched?: number; // …of those, ones whose table we read and that hold this issuer
  filersFailed?: number; // …and ones whose table we never managed to read
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
  private cikMap: Map<string, { cik: number; title: string }> | null = null;
  private cikMapTs = 0;
  private readonly TTL = 12 * 60 * 60_000;
  // A failed SEC lookup is cached too, but only briefly: long enough to stop a
  // hot page re-hammering EDGAR, short enough that a transient hiccup doesn't
  // pin an empty card for half a day.
  private readonly FAIL_TTL = 5 * 60_000;
  private readonly PARTIAL_TTL = 30 * 60_000;

  constructor(private readonly fmp: FmpService) {
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

  /** GET from SEC with a short retry on the statuses SEC uses for throttling
   *  (403/429) and for its own outages (5xx) — those are exactly the errors
   *  that used to be indistinguishable from "this company has no data".
   *  Anything else fails fast. Bulk fan-out calls pass tries:1 so a slow patch
   *  of EDGAR can't multiply into a gateway timeout. */
  private async secGet<T = any>(url: string, opts: { text?: boolean; tries?: number; timeout?: number } = {}): Promise<T> {
    const tries = opts.tries ?? 3;
    let last: any;
    for (let i = 0; i < tries; i++) {
      try {
        const { data } = await this.sec.get(url, {
          ...(opts.text ? { responseType: 'text' as const } : {}),
          ...(opts.timeout ? { timeout: opts.timeout } : {}),
        });
        return data as T;
      } catch (e: any) {
        last = e;
        const s = e?.response?.status;
        const transient = !s || s === 403 || s === 429 || s >= 500;
        if (!transient || i === tries - 1) break;
        await new Promise((r) => setTimeout(r, 250 * 3 ** i)); // 250ms, then 750ms
      }
    }
    throw last;
  }

  /** Is a cache entry still good? Real answers (data, or an honest "not
   *  disclosed") hold for the full TTL; failures expire in minutes.
   *
   *  A 'partial' answer gets its own middling TTL: it is real data worth
   *  serving, but incomplete. This matters because the cache lives in process
   *  memory, so on serverless each instance keeps its own copy — pinning a
   *  degraded sweep for 12h means that one instance serves a short holder list
   *  until it is recycled, which is exactly what production was doing.
   *  Re-sweeping every half hour costs little and lets a bad run heal. */
  private fresh(entry: { ts: number; data: { status?: DataStatus } } | undefined): boolean {
    if (!entry) return false;
    const s = entry.data?.status;
    const ttl = s === 'unavailable' ? this.FAIL_TTL : s === 'partial' ? this.PARTIAL_TTL : this.TTL;
    return Date.now() - entry.ts < ttl;
  }

  /** Squashed comparison of two corporate names, ignoring spacing, punctuation
   *  and the corporate tail: "ExxonMobil Holdings Corp" ≈ "EXXON MOBIL CORP".
   *  Used to tell a predecessor registrant apart from a filing agent. */
  private sameCompany(a: string, b: string): boolean {
    const squash = (s: string) =>
      s
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, '')
        .replace(/(INCORPORATED|CORPORATION|COMPANY|HOLDINGS?|LIMITED|GROUP|TRUST|CLASS[A-C]|PLC|LLC|INC|CORP|LTD|LP|CO|THE|NEW)+$/g, '');
    const x = squash(a);
    const y = squash(b);
    return x.length >= 4 && y.length >= 4 && (x.startsWith(y) || y.startsWith(x));
  }

  /** Registrants other than `cik` that filed this company's own filings. An
   *  accession number is prefixed with its filer's CIK, so a company that has
   *  reorganised under a new registrant — XOM trades under "ExxonMobil
   *  Holdings Corp" (CIK 2115436), whose EDGAR history starts in July 2026 —
   *  still points at the predecessor that holds the proxies and the 13F-era
   *  issuer name. Filing agents appear here too, so names are checked. */
  private async relatedCiks(cik: number, recent: any, selfName: string): Promise<{ cik: number; name: string }[]> {
    const prefixes = new Set<number>();
    for (let i = 0; i < (recent?.accessionNumber?.length || 0) && prefixes.size < 3; i++) {
      const pre = Number(String(recent.accessionNumber[i]).slice(0, 10));
      if (pre && pre !== cik) prefixes.add(pre);
    }
    const out: { cik: number; name: string }[] = [];
    for (const c of prefixes) {
      try {
        const sub = await this.secGet<any>(`https://data.sec.gov/submissions/CIK${String(c).padStart(10, '0')}.json`, { tries: 1 });
        const name = String(sub?.name || '');
        if (this.sameCompany(name, selfName)) out.push({ cik: c, name });
      } catch {
        /* a filing agent we can't read is a filing agent we don't want */
      }
    }
    return out;
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

  /** The most recent DEF 14A for a CIK, plus its Pay-versus-Performance
   *  rendered table. Returns null when the registrant has no proxy at all
   *  (foreign private issuers file 6-K circulars instead) and 'no-pvp' when it
   *  has one but never tagged the PvP table (emerging growth companies are
   *  exempt from Item 402(v)). Those two are real absences, not failures. */
  private async findPvpTable(cik: number): Promise<{ base: string; file: string } | 'no-proxy' | 'no-pvp'> {
    const sub = await this.secGet<any>(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`);
    const r = sub?.filings?.recent;
    let acc = '';
    for (let i = 0; i < (r?.form?.length || 0); i++) {
      if (String(r.form[i]).startsWith('DEF 14A')) {
        acc = String(r.accessionNumber[i]).replace(/-/g, '');
        break;
      }
    }
    if (!acc) return 'no-proxy';
    const base = `https://www.sec.gov/Archives/edgar/data/${cik}/${acc}`;
    const fs = await this.secGet<string>(`${base}/FilingSummary.xml`, { text: true });
    for (const rep of String(fs).match(/<Report[^>]*>[\s\S]*?<\/Report>/g) || []) {
      const ln = rep.match(/<LongName>([\s\S]*?)<\/LongName>/)?.[1] || '';
      if (/pay (versus|vs\.?) performance/i.test(ln)) {
        const file = rep.match(/<HtmlFileName>([\s\S]*?)<\/HtmlFileName>/)?.[1] || '';
        if (file) return { base, file };
      }
    }
    return 'no-pvp';
  }

  /** Per-year exec comp from FMP, already in the Pay-versus-Performance shape. */
  private async compensationFromFmp(ticker: string): Promise<{ year: number; peoTotal: number | null; avgNeoTotal: number | null }[]> {
    if (!this.fmp?.enabled) return [];
    return this.withBudget(`Compensation ${ticker}`, 6000, () => this.fmp.getExecutiveCompensation(ticker), []);
  }

  /** Best-effort executive-comp summary parsed from the company's latest
   *  DEF 14A "Pay versus Performance" XBRL table (CEO total + avg other
   *  NEOs per year). Returns empty rows when the proxy can't be parsed —
   *  the UI shows an honest empty state, never invented numbers — and says
   *  in `status` whether that empty state means "not disclosed" or "we
   *  couldn't reach SEC". */
  async getCompensation(
    ticker: string,
  ): Promise<{
    rows: { year: number; peoTotal: number | null; avgNeoTotal: number | null }[];
    source: string | null;
    status?: DataStatus;
    sourceKind?: DataSource;
    reason?: string;
  }> {
    const key = ticker.toUpperCase();
    const cached = this.compCache.get(key);
    if (this.fresh(cached)) return cached!.data;
    const empty = {
      rows: [] as { year: number; peoTotal: number | null; avgNeoTotal: number | null }[],
      source: null as string | null,
      status: 'unavailable' as DataStatus,
      sourceKind: null as DataSource,
      reason: undefined as string | undefined,
    };
    let out = empty;
    try {
      const entry = await this.getCikEntry(key);
      if (!entry) throw new Error('no CIK');
      const { cik, title } = entry;
      let found = await this.findPvpTable(cik);
      // A registrant with no proxy of its own may be a freshly-created holding
      // company; the predecessor that actually filed its 10-Q still has one.
      if (found === 'no-proxy') {
        const sub = await this.secGet<any>(`https://data.sec.gov/submissions/CIK${String(cik).padStart(10, '0')}.json`);
        for (const rel of await this.relatedCiks(cik, sub?.filings?.recent, title)) {
          const alt = await this.findPvpTable(rel.cik);
          if (typeof alt !== 'string') {
            this.log.log(`Compensation for ${key}: using predecessor registrant ${rel.name} (CIK ${rel.cik})`);
            found = alt;
            break;
          }
        }
      }
      if (typeof found === 'string') {
        // Read the filing index successfully and the disclosure simply isn't
        // there — that is data about the company, not an error.
        out = {
          ...empty,
          status: 'not-disclosed',
          reason: found === 'no-proxy' ? 'no DEF 14A proxy statement on EDGAR' : 'proxy filed without a Pay-versus-Performance table',
        };
        throw new Error(out.reason);
      }
      const { base, file } = found;
      const html = await this.secGet<string>(`${base}/${file}`, { text: true });
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
      out = rows.length
        ? {
            rows: rows.slice(0, 5),
            source: 'SEC DEF 14A (Pay vs Performance disclosure)',
            status: 'ok',
            sourceKind: 'sec',
            reason: undefined,
          }
        : { ...empty, status: 'not-disclosed', reason: 'Pay-versus-Performance table had no readable rows' };
    } catch (e: any) {
      // `out` is already set for the honest "not disclosed" paths above; only
      // an unexpected throw leaves it at the default 'unavailable'.
      this.log.warn(`Compensation parse failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    // SEC found nothing — try FMP before calling it undisclosed. A registrant
    // can be exempt from tagging the PvP table (emerging growth companies) or
    // file no proxy at all while the compensation is still on record.
    if (!out.rows.length) {
      const alt = await this.compensationFromFmp(key);
      if (alt.length) {
        out = {
          rows: alt,
          source: 'FMP (governance executive compensation)',
          status: 'ok',
          sourceKind: 'fmp',
          reason: undefined,
        };
      }
    }
    // Cache real answers for the full TTL, failures only briefly (see fresh()).
    this.compCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  // ── Revenue Breakdown (SEC EDGAR — free, no key) ──────────────────────
  //
  // Companies disclose "Disaggregation of Revenue" (ASC 606) and revenue by
  // geography in every 10-Q/10-K. The filing's FilingSummary.xml lists the
  // rendered R##.htm tables, which are uniform enough to parse generically.

  /** Ticker → { CIK, EDGAR registrant name } via SEC's official mapping
   *  (cached 24h). The title is worth keeping: it is the authoritative
   *  registrant name, so it beats whatever name our own DB happens to hold
   *  (which carries vendor artefacts like "Boeing Company (The)"). */
  private async getCikEntry(ticker: string): Promise<{ cik: number; title: string } | null> {
    if (!this.cikMap || Date.now() - this.cikMapTs > 24 * 60 * 60_000) {
      try {
        const data = await this.secGet<any>('https://www.sec.gov/files/company_tickers.json');
        const m = new Map<string, { cik: number; title: string }>();
        for (const v of Object.values<any>(data || {})) {
          if (v?.ticker) m.set(String(v.ticker).toUpperCase(), { cik: Number(v.cik_str), title: String(v.title || '') });
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

  /** Ticker → CIK via SEC's official mapping (cached 24h). */
  private async getCik(ticker: string): Promise<number | null> {
    return (await this.getCikEntry(ticker))?.cik ?? null;
  }

  // A row label that names a metric rather than a dimension member. Standing
  // alone it is a column/section header, never a segment — and crucially it
  // must not overwrite the member header above it (NVDA's geography table
  // renders "United States" then a nested "Revenues" header then the value).
  private static readonly METRIC_LABEL = /^total\b|^consolidated|net sales|net revenue|gross revenue|^revenue|^sales\b|^operating revenue/i;

  // The rendered R-file footer repeats element documentation as table rows;
  // their labels must never be mistaken for dimension members.
  private static readonly FOOTER_LABEL = /^(data type|balance type|period type|namespace prefix|details name|element|definition|no definition)\b/i;

  // Cells that sit ahead of the numbers in some renderings — footnote markers
  // ("[1]"), unit tags, bare currency symbols. Stepping over them instead of
  // abandoning the row is what makes footnoted members (MSFT's "United
  // States", TYGO's "EMEA"/"Americas") parse at all.
  private static readonly FILLER_CELL = /^(\[[0-9a-z]{1,3}\]|\$|usd \(\$\)|shares|segment|%|—|–|-)$/i;

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
        if (!c || CompanyCivicService.FILLER_CELL.test(c)) continue;
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
        // Metric headers and footer documentation rows are not members: letting
        // them through used to clobber the pending member and drop its value.
        if (
          cells.slice(1).every((c) => !c) &&
          label.length < 80 &&
          !CompanyCivicService.METRIC_LABEL.test(label) &&
          !CompanyCivicService.FOOTER_LABEL.test(label)
        ) {
          member = label;
        }
        continue;
      }
      const isTotalLabel = CompanyCivicService.METRIC_LABEL.test(label);
      const name = isTotalLabel && member ? member : label;
      const key = name.toUpperCase();
      if (seen.has(key)) continue; // first occurrence wins (latest period)
      seen.add(key);
      out.push({ name, value, prev });
      member = null;
    }
    return out;
  }

  // A dimension member that only names its axis, carrying no information of
  // its own. XBRL renders a multi-axis fact as "A | B | C", and filings mix
  // real members with these ("Americas | Operating segments", "Geographic
  // Concentration Risk | Sales Revenue, Net | United States").
  private static readonly GENERIC_MEMBER =
    /^(operating segments?|reportable segments?|business segments?|corporate|corporate and support|consolidation[\w, ]*|intersegment[\w ]*|eliminations?[\w ]*|[\w ]*concentration risk|sales revenue,? net|revenues? benchmark|geographic(al)? (areas?|regions?|distribution)|segment|segments|total)$/i;

  /** Collapse a rendered multi-axis row label to the one part that names
   *  something real, keeping the other real parts so the caller can drop
   *  sub-breakdowns of a segment it already has. Returns null when every part
   *  is axis boilerplate — that row is an axis subtotal, not a segment. */
  private memberLabel(name: string): { display: string; others: string[] } | null {
    const parts = name
      .split(' | ')
      .map((p) => p.trim())
      .filter(Boolean);
    if (!parts.length) return null;
    const real = parts.filter((p) => !CompanyCivicService.GENERIC_MEMBER.test(p));
    if (!real.length) return null;
    return { display: real[0], others: real.slice(1) };
  }

  /** Turn parsed rows into segments + total, dropping total/eliminations rows
   *  and hierarchical children ("YouTube ads | Google Services") whose parent
   *  is also present, which would otherwise double-count. */
  private toSegments(rows: { name: string; value: number; prev: number | null }[]): { segments: RevenueSegment[]; total: number | null } {
    const isTotal = (n: string) =>
      // "Revenue from contract with customer, excluding assessed tax" is the
      // us-gaap element's own label, which renders as a row whenever a fact
      // carries no member — a total, never a segment.
      /^total|consolidated|^net sales$|^revenue(s)?$|^net revenue(s)?$|^gross revenue(s)?$|^sales$|^operating segments$|^revenue from contract with customer, excluding/i.test(
        n.trim(),
      );
    // P&L line items ride along in segment tables (CHE's segment table is a
    // full income statement); none of them is a revenue segment. Deliberately
    // absent: "advertising", which is an expense for most filers but real
    // revenue for DIS and MSFT.
    const isNoise = (n: string) =>
      n.length > 60 ||
      /eliminat|intersegment|reconcil|portion of|included in|unearned|deferred|performance obligation|cost of (revenue|sales|goods)|\bexpenses?\b|operating (income|loss)|gross (margin|profit)|research and development|general and administrative|sales and marketing|depreciation|amortization|segment items|assets|expenditure|hedging|income (before|from operations|tax)|net (income|loss|interest)|interest, net|interest (expense|income)|provision for|number of|implicit price|price concession|long.?lived|equity method|average equity|wages|salaries|stock compensation|share.based compensation|patient care|^labor$|^food$|^utilities$|^rent$/i.test(
        n,
      );
    // Collapse multi-axis labels first. The raw rendered label concatenates
    // every member name, so it routinely exceeds the noise length guard on its
    // own — SHOP's "…| United States" is 62 characters and used to be dropped
    // for that reason alone, leaving a geography table missing its largest row.
    const collapsed: { name: string; value: number; prev: number | null; others: string[] }[] = [];
    for (const r of rows) {
      const m = this.memberLabel(r.name);
      if (!m) continue; // pure axis boilerplate ("Geographic Concentration Risk | Sales Revenue, Net")
      collapsed.push({ name: m.display, value: r.value, prev: r.prev, others: m.others });
    }
    const totalRow = collapsed.find((r) => isTotal(r.name));
    const usable = collapsed.filter((r) => !isTotal(r.name) && !isNoise(r.name) && r.value > 0);
    // Hierarchical rows come through as "Child | Parent" (any number of axes).
    // If any other real member of the row is present standalone, this row is a
    // sub-breakdown of it — drop it. Otherwise display just the leading member.
    const flat = new Set(usable.filter((r) => !r.others.length).map((r) => r.name.toUpperCase()));
    let parts: { name: string; value: number; prev: number | null }[] = [];
    const kept = new Set<string>();
    for (const r of usable) {
      if (r.others.some((o) => flat.has(o.toUpperCase()))) continue;
      // The same member can render once per axis combination (WMT's "Walmart
      // U.S." and "Walmart U.S. | Operating Segments" are one fact, BA repeats
      // each segment once per geography). Keep the first, widest occurrence.
      const k = r.name.toUpperCase();
      if (kept.has(k)) continue;
      kept.add(k);
      parts.push({ name: r.name, value: r.value, prev: r.prev });
    }
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
    return /^(the )?(united states|u\.s\.?a?\b|non-?u\.?s\.?\b|americas|other americas|north america|south america|latin america|europe|emea|apac|asia|greater china|china|japan|canada|mexico|germany|france|india|korea|taiwan|israel|brazil|singapore|netherlands|spain|italy|switzerland|ireland|(the )?(uk|united kingdom)|international|rest of|other countr|other international|foreign|domestic|non-?us|africa|middle east|australia)/i.test(
      n.trim(),
    );
  }

  /** A geography breakdown must reconcile to the filing's own revenue total.
   *  Filings often list a headline split plus individually-significant
   *  countries inside it (XOM discloses U.S., Non-U.S. *and* Canada), and
   *  showing all three would double-count — every percentage on the page would
   *  then be wrong. Keep the largest rows that still fit inside the total. */
  private capToTotal(list: RevenueSegment[], total: number | null): RevenueSegment[] {
    if (!total || total <= 0) return list;
    const sum = list.reduce((s, r) => s + r.revenue, 0);
    if (sum <= total * 1.05) return list;
    const out: RevenueSegment[] = [];
    let running = 0;
    for (const r of [...list].sort((a, b) => b.revenue - a.revenue)) {
      // Stop at the first overflow rather than skipping it: the rows are
      // descending, so once one no longer fits, the remainder are the nested
      // components of a bucket already counted (BA: Europe/Middle East/CANADA
      // all sit inside "Non-US"). Letting a later small row squeeze in would
      // produce a set that reconciles to nothing.
      if (running + r.revenue > total * 1.02) break;
      out.push(r);
      running += r.revenue;
    }
    return out.length >= 2 ? out : list;
  }

  /** Re-derive % shares after any post-filtering. */
  private rescale(list: RevenueSegment[]): RevenueSegment[] {
    const sum = list.reduce((s, r) => s + r.revenue, 0) || 1;
    return list.map((r) => ({ ...r, pct: +((r.revenue / sum) * 100).toFixed(2) }));
  }

  /** Run a fallback lookup under its own time budget. These only ever fire
   *  after the SEC path came back empty, but the endpoint still has to fit the
   *  ~10s gateway, so a slow upstream degrades to "nothing" rather than a 504. */
  private async withBudget<T>(label: string, ms: number, work: () => Promise<T>, fallback: T): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        work(),
        new Promise<T>((resolve) => {
          timer = setTimeout(() => {
            this.log.warn(`${label}: fallback exceeded ${ms}ms budget`);
            resolve(fallback);
          }, ms);
          timer.unref?.();
        }),
      ]);
    } catch (e: any) {
      this.log.warn(`${label}: fallback failed — ${e?.message || e}`);
      return fallback;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /** Geography rows from FMP, mapped into the same RevenueSegment shape the SEC
   *  path emits so the frontend renders one table either way. FMP gives a
   *  single period, so there is no comparative column to derive YoY from —
   *  those fields stay null rather than being guessed at. */
  private async geographyFromFmp(ticker: string): Promise<{ rows: RevenueSegment[]; asOf: string | null; reconciled: boolean }> {
    const none = { rows: [] as RevenueSegment[], asOf: null as string | null, reconciled: false };
    if (!this.fmp?.enabled) return none;
    return this.withBudget(
      `Revenue geography ${ticker}`,
      6000, // generous: this only runs when SEC gave us nothing at all
      async () => {
        const g = await this.fmp.getGeographicRevenue(ticker);
        if (g.rows.length < 2) return none;
        const list: RevenueSegment[] = g.rows.map((r) => ({
          name: r.name,
          revenue: r.revenue,
          pct: 0, // set by rescale() below
          prevRevenue: null,
          yoyPct: null,
        }));
        // Same reconciliation as the SEC path: FMP nests regions inside an
        // aggregate bucket for some filers, and showing both double-counts.
        const capped = this.capToTotal(
          list.sort((a, b) => b.revenue - a.revenue),
          g.total,
        );
        // If the period revenue total was unavailable we cannot verify the rows
        // add up, but they are still disclosed figures — serve them and flag
        // them unreconciled rather than dropping the section entirely.
        if (g.total == null) this.log.warn(`Revenue geography ${ticker}: no period revenue total — rows unreconciled`);
        return { rows: this.rescale(capped.length >= 2 ? capped : list), asOf: g.asOf, reconciled: g.total != null };
      },
      none,
    );
  }

  /** Revenue by segment + geography from the company's latest 10-Q/10-K. */
  async getRevenueBreakdown(ticker: string): Promise<RevenueBreakdown> {
    const key = ticker.toUpperCase();
    const cached = this.revenueCache.get(key);
    if (this.fresh(cached)) return cached!.data;
    const empty: RevenueBreakdown = {
      segments: [],
      geography: [],
      total: null,
      asOf: null,
      form: null,
      status: 'unavailable',
      segmentsStatus: 'unavailable',
      geographyStatus: 'unavailable',
      sourceUrl: null,
    };
    let out = empty;
    try {
      const cik = await this.getCik(key);
      if (!cik) throw new Error(`no CIK for ${key}`);
      const padded = String(cik).padStart(10, '0');
      const sub = await this.secGet<any>(`https://data.sec.gov/submissions/CIK${padded}.json`);
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
      const fs = await this.secGet<string>(`${base}/FilingSummary.xml`, { text: true });
      const reports: { file: string; name: string }[] = [];
      for (const rep of String(fs).match(/<Report[^>]*>[\s\S]*?<\/Report>/g) || []) {
        const ln = rep.match(/<LongName>([\s\S]*?)<\/LongName>/)?.[1] || '';
        const fn = rep.match(/<HtmlFileName>([\s\S]*?)<\/HtmlFileName>/)?.[1] || '';
        if (fn) reports.push({ file: fn, name: ln });
      }
      // Reports about deferred/unearned revenue, narratives, reconciliations
      // etc. also mention "revenue" — never pick those. Asset schedules are
      // excluded too, but only when the report isn't *also* about revenue:
      // AIOT's geographic split lives in "Revenues and Long Lived Assets by
      // Geographical Region".
      const BAD = (n: string) =>
        /unearned|deferred revenue|remaining performance|narrative|parenthetical|additional information|reconcil|warranty|contract (asset|liabilit)|schedule of changes|credit loss|accrued/i.test(
          n,
        ) || (/long.?lived|property and equipment/i.test(n) && !/revenue|net sales/i.test(n));
      // Ordered candidates rather than one guess: the first report whose name
      // matches is often the right one but not always (CHE's "Disaggregated
      // Revenue" table is a gross-to-net bridge, not a segment split), so we
      // parse a few and keep the first that actually yields a breakdown.
      const pickAll = (patterns: RegExp[], limit: number, veto?: RegExp): string[] => {
        const outFiles: string[] = [];
        for (const p of patterns) {
          for (const rep of reports) {
            if (outFiles.length >= limit) return outFiles;
            if (veto?.test(rep.name)) continue;
            if (p.test(rep.name) && /detail/i.test(rep.name) && !BAD(rep.name) && !outFiles.includes(rep.file)) {
              outFiles.push(rep.file);
            }
          }
        }
        return outFiles;
      };
      // Tables that split revenue by product/service/segment. Specific names
      // first: a generic "Segment Information" table is often a segment income
      // statement, so a plainly-named "Revenue (Details)" beats it.
      const segCands = pickAll(
        [
          /disaggregat.*revenue/i,
          /revenue.*disaggregat/i,
          /revenue.*(product|service|market|platform|category|major source)/i,
          /(revenue|net sales).*segment/i,
          /segment.*(revenue|net sales)/i,
          /segment.*reportable|reportable segment/i,
          /\brevenue(s)?\s*\(details\)/i, // plainly-named disaggregation (SNDA)
          /segments?\s*\((segment )?(data|information)/i, // "Segments (Segment Data) (Details)"
          /segment (information|data|reporting)/i,
        ],
        3,
        // A geographic table is never the product/segment split — AIOT's only
        // "Segment Information" table is its regional one.
        /geograph/i,
      );
      // Tables dedicated to a geographic split — every row in one of these is a
      // region, so they are taken whole rather than name-filtered (GOOGL's
      // "Other Americas" is a region no keyword list would recognise).
      const geoCands = pickAll(
        [
          /revenue.*geograph/i,
          /geograph.*revenue/i,
          /(net sales|revenue).*by.*(area|region|country|market)/i,
          /geograph\w*\s*(area|region|market|data|information)/i,
        ],
        2,
      );
      // Fallback sources for geography: filers whose reportable segments *are*
      // regions (AAPL — Americas/Europe/Greater China/Japan/Rest of Asia
      // Pacific) never file a separate geography table, and some filers mix
      // regions into the disaggregation table (META). Rows from these are only
      // accepted when they actually name a region.
      const geoFromSegCands = pickAll([/segment.*reportable|reportable segment/i, /segment (information|data)/i], 2);
      // One fetch per distinct file, all in parallel — R-files are small.
      const files = Array.from(new Set([...segCands, ...geoCands, ...geoFromSegCands])).slice(0, 6);
      const parsedList = await Promise.all(
        files.map((f) =>
          this.secGet<string>(`${base}/${f}`, { text: true, tries: 2 })
            .then((x) => this.toSegments(this.parseRFile(String(x))))
            .catch(() => ({ segments: [] as RevenueSegment[], total: null as number | null })),
        ),
      );
      const parsed = new Map(files.map((f, i) => [f, parsedList[i]]));
      // Prefer a candidate that yields a real breakdown (≥2 parts); fall back
      // to a single-part one only if nothing better exists.
      const best = <T>(cands: string[], rows: (p: { segments: RevenueSegment[]; total: number | null }) => T[]) => {
        let fallback: { file: string; list: T[]; total: number | null } | null = null;
        for (const f of cands) {
          const p = parsed.get(f);
          if (!p) continue;
          const list = rows(p);
          if (list.length >= 2) return { file: f, list, total: p.total };
          if (list.length && !fallback) fallback = { file: f, list, total: p.total };
        }
        return fallback;
      };
      // Geographic members mixed into the disaggregation table (e.g. META) move
      // to the geography tab so each stays coherent.
      const segPick = best(segCands, (p) => p.segments.filter((s) => !this.isGeoName(s.name)));
      const geoPick =
        // A dedicated geography table is taken whole, minus the segment rows
        // filers cross-tabulate into it (DIS reports region × segment in one
        // table, and "Entertainment Segment" is not a region).
        best(geoCands, (p) => p.segments.filter((s) => !/\bsegments?\b/i.test(s.name))) ??
        best([...geoFromSegCands, ...segCands], (p) => p.segments.filter((s) => this.isGeoName(s.name)));
      // A single row is never a breakdown — one region, or one "segment" equal
      // to total revenue, is noise dressed up as data.
      const segments = (segPick?.list.length || 0) >= 2 ? this.rescale(segPick!.list) : [];
      const geoRows = this.capToTotal(geoPick?.list || [], geoPick?.total ?? null);
      const geography = geoRows.length >= 2 ? this.rescale(geoRows) : [];
      // Reaching this point means we read the filing's own index of tables, so
      // an empty list here is the company not disclosing that split — not a
      // failed lookup. That distinction is the whole point of these fields.
      out = {
        segments,
        geography,
        total: segPick?.total ?? parsed.get(files[0])?.total ?? null,
        asOf,
        form,
        segmentsStatus: segments.length ? 'ok' : 'not-disclosed',
        geographyStatus: geography.length ? 'ok' : 'not-disclosed',
        segmentsSource: segments.length ? 'sec' : null,
        geographySource: geography.length ? 'sec' : null,
        sourceUrl: base,
        geographyAsOf: geography.length ? asOf : null,
        geographyReconciled: geography.length ? true : undefined,
        status: segments.length || geography.length ? 'ok' : 'not-disclosed',
      };
    } catch (e: any) {
      this.log.warn(`Revenue breakdown failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    // The FMP fallback sits OUTSIDE the try deliberately. It used to be inside,
    // so a transient SEC error threw straight past it and the endpoint returned
    // 'unavailable' with no geography even though FMP had the rows — that is
    // exactly how WMT came back empty in production while resolving fine
    // locally. FMP is an independent source; an SEC outage is no reason to skip
    // it. Banks and some multi-nationals (JPM, BA, WMT) disclose a geographic
    // split that never reaches XBRL in a dimensioned form, and the site pays
    // for FMP.
    if (!out.geography.length) {
      const alt = await this.geographyFromFmp(key);
      if (alt.rows.length) {
        out = {
          ...out,
          geography: alt.rows,
          geographyStatus: 'ok',
          geographySource: 'fmp',
          geographyAsOf: alt.asOf,
          geographyReconciled: alt.reconciled,
          // Segments may still be missing or genuinely unavailable — recovering
          // geography must not overstate them.
          status: out.segments.length ? 'ok' : out.segmentsStatus === 'unavailable' ? 'partial' : 'ok',
        };
      }
    }
    // Real answers (including an honest "not disclosed") hold for the full TTL;
    // a transient SEC failure expires in minutes instead of pinning an empty
    // card — and is still cached, so a hot page can't re-hammer EDGAR.
    this.revenueCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  // ── Whale Activity (SEC 13F filings — free, no key) ───────────────────
  //
  // Institutions report holdings quarterly on Form 13F. EDGAR full-text
  // search finds recent 13F-HR info tables naming the issuer; we sum the
  // issuer's rows in each filer's table and diff against that filer's
  // previous 13F for the share change.

  /** "Amazon.com, Inc." → "AMAZON COM INC" (how 13F info tables name issuers).
   *
   *  Applied to BOTH sides of every comparison — the name we search EDGAR for
   *  and each nameOfIssuer we read back — so the two always meet in the middle.
   *  Three classes of difference are levelled here:
   *   - punctuation, including the slash in "BOEING CO/THE";
   *   - the article, which our vendor names carry as a suffix ("Boeing Company
   *     (The)") and 13F filers as "/THE". EDGAR's own full-text search tokenises
   *     it, so leaving it in turns the query into a 3-token phrase that only the
   *     minority of filers writing "/THE" can match: searching "BOEING CO THE"
   *     finds 102 filings, "BOEING CO" finds 4,468;
   *   - the security-type tail filers append ("BOEING CO COM", "… CL A"). */
  private toIssuerName(companyName: string): string {
    let s = ` ${companyName.toUpperCase().replace(/[.,'&()/\\+"–—-]/g, ' ')} `.replace(/\s+/g, ' ');
    s = s
      .replace(/ CORPORATION /g, ' CORP ')
      .replace(/ INCORPORATED /g, ' INC ')
      .replace(/ COMPANY /g, ' CO ')
      .replace(/ COMPANIES /g, ' COS ')
      .replace(/ LIMITED /g, ' LTD ')
      .replace(/ PUBLIC LTD CO /g, ' PLC ')
      .replace(/ THE /g, ' ');
    // Strip repeated security-type tails, e.g. "… COM NEW", "… SPON ADR".
    for (let i = 0; i < 3; i++) {
      s = s.replace(/ (COM|COMMON|ORD|SHS|SH|NEW|ADR|ADS|SPON|UNIT|UNITS|WT|WTS|RTS|DEP|PFD|REIT|CL [A-C]|CLASS [A-C]|SER [A-C]) $/g, ' ');
    }
    return s.replace(/\s+/g, ' ').trim();
  }

  /** Does a filer's nameOfIssuer refer to one of the names we're looking for?
   *  Whole-token prefixes only, so "BOEING CO" matches "BOEING CO/THE" and
   *  "BOEING CO COM" but never "BOEING CAPITAL CORP". */
  private issuerMatches(rowName: string, candidates: string[]): boolean {
    const n = this.toIssuerName(rowName);
    if (n.length < 3) return false;
    return candidates.some((c) => c.length >= 4 && (n === c || n.startsWith(`${c} `) || c.startsWith(`${n} `)));
  }

  /** Sum an issuer's (shares, value $) across one 13F info-table XML —
   *  common shares and PUT/CALL option rows separately.
   *
   *  `cusips` is shared across the whole sweep: the first table that matches by
   *  name teaches us the issuer's CUSIP, and every later table can then match on
   *  that instead. CUSIP is the only truly stable key here — filers spell the
   *  same issuer a dozen ways, and after a corporate reorganisation many keep
   *  using the predecessor's name for quarters (13F tables still say "EXXON
   *  MOBIL CORP") while all of them keep the same CUSIP. */
  private sumInfoTable(
    xml: string,
    candidates: string[],
    cusips?: Set<string>,
  ): { shares: number; value: number; puts: { shares: number; value: number }; calls: { shares: number; value: number } } | null {
    const rows = xml.match(/<(?:\w+:)?infoTable>[\s\S]*?<\/(?:\w+:)?infoTable>/gi) || [];
    const out = { shares: 0, value: 0, puts: { shares: 0, value: 0 }, calls: { shares: 0, value: 0 } };
    let found = false;
    for (const r of rows) {
      const name = r.match(/nameOfIssuer>([\s\S]*?)</i)?.[1] || '';
      const cusip = (r.match(/cusip>([\s\S]*?)</i)?.[1] || '').trim().toUpperCase();
      const byName = this.issuerMatches(name, candidates);
      if (!byName && !(cusip && cusips?.has(cusip))) continue;
      if (byName && cusip) cusips?.add(cusip);
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
    candidates: string[],
    cusips: Set<string>,
  ): Promise<{ shares: number; value: number } | null> {
    try {
      const padded = filerCik.padStart(10, '0');
      const sub = await this.secGet<any>(`https://data.sec.gov/submissions/CIK${padded}.json`, { tries: 1 });
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
      const idx = await this.secGet<any>(`${base}/index.json`, { tries: 1 });
      const files: string[] = (idx?.directory?.item || []).map((f: any) => String(f.name));
      const table =
        files.find((f) => /info.?table.*\.xml$/i.test(f)) ||
        files.find((f) => /\.xml$/i.test(f) && !/primary_doc/i.test(f));
      if (!table) return null;
      const xml = await this.secGet<string>(`${base}/${table}`, { text: true, tries: 1 });
      return this.sumInfoTable(String(xml), candidates, cusips) ?? { shares: 0, value: 0 };
    } catch {
      return null;
    }
  }

  /** One EDGAR full-text search for 13F-HR info tables naming an issuer.
   *  Returns the total match count so callers can compare candidate names. */
  private async searchThirteenF(issuer: string): Promise<{ hits: any[]; total: number }> {
    const end = new Date().toISOString().slice(0, 10);
    const start = new Date(Date.now() - 120 * 24 * 60 * 60_000).toISOString().slice(0, 10);
    const fts = await this.secGet<any>(
      `https://efts.sec.gov/LATEST/search-index?q=${encodeURIComponent(`"${issuer}"`)}&forms=13F-HR&dateRange=custom&startdt=${start}&enddt=${end}`,
    );
    return { hits: fts?.hits?.hits || [], total: Number(fts?.hits?.total?.value) || 0 };
  }

  /** Every name this issuer might be filed under, best first.
   *
   *  Our own stored name is only one guess: it can carry vendor artefacts
   *  ("Boeing Company (The)") and it can be the *current* registrant of a
   *  company that 13F filers still name by its predecessor — XOM now files as
   *  "ExxonMobil Holdings Corp" (CIK 2115436), and searching that finds 260
   *  filings against 7,635 for "EXXON MOBIL CORP". So we also take EDGAR's own
   *  registrant title, and — only when the best candidate so far looks too thin
   *  to be a real holder list — the predecessor registrant's name. */
  private async issuerCandidates(companyName: string, ticker: string): Promise<{ names: string[]; search: string; hits: any[] }> {
    const entry = await this.getCikEntry(ticker);
    const names: string[] = [];
    for (const raw of [entry?.title, companyName]) {
      const n = this.toIssuerName(raw || '');
      if (n.length >= 4 && !names.includes(n)) names.push(n);
    }
    if (!names.length) return { names: [], search: '', hits: [] };
    // One search per candidate (2 requests at most) — pick the name EDGAR knows.
    const tried = await Promise.all(
      names.map((n) =>
        this.searchThirteenF(n)
          .then((r) => ({ name: n, ...r }))
          .catch(() => ({ name: n, hits: [] as any[], total: -1 })),
      ),
    );
    if (tried.every((t) => t.total < 0)) throw new Error('EDGAR full-text search unavailable');
    let winner = tried.reduce((a, b) => (b.total > a.total ? b : a));
    // A big listed company has thousands of 13F mentions; a few hundred means we
    // are probably searching a name most filers don't use yet.
    if (winner.total >= 0 && winner.total < 400 && entry) {
      try {
        const sub = await this.secGet<any>(`https://data.sec.gov/submissions/CIK${String(entry.cik).padStart(10, '0')}.json`, { tries: 1 });
        for (const rel of await this.relatedCiks(entry.cik, sub?.filings?.recent, entry.title)) {
          const n = this.toIssuerName(rel.name);
          if (!n || names.includes(n)) continue;
          const alt = await this.searchThirteenF(n).catch(() => ({ hits: [] as any[], total: -1 }));
          names.push(n);
          if (alt.total > winner.total) {
            this.log.log(`Institutions for ${ticker}: predecessor name "${n}" beats "${winner.name}" (${alt.total} vs ${winner.total} filings)`);
            winner = { name: n, ...alt };
          }
        }
      } catch {
        /* predecessor lookup is a bonus, never a requirement */
      }
    }
    return { names, search: winner.name, hits: winner.hits };
  }

  /** Full institutional-ownership dataset for a stock (SEC 13F): recent stock
   *  positions with QoQ change plus PUT/CALL derivative positions.
   *
   *  Bounded by a wall-clock deadline: a full sweep is ~24 info tables plus a
   *  previous-quarter table each, and some filers' tables run to tens of MB
   *  (BNY Mellon files 33,799 rows), which is how this endpoint used to take
   *  6–20s and flap between empty and populated depending on which fetches beat
   *  the timeout. Whatever is ready when the deadline passes is returned, with
   *  `status: 'partial'` rather than a confident-looking empty table. */
  async getInstitutions(companyName: string, ticker: string): Promise<InstitutionsPage> {
    const key = ticker.toUpperCase();
    const cached = this.whaleCache.get(key);
    if (this.fresh(cached)) return cached!.data;
    // Total budget for the whole call, enforced by racing the sweep below rather
    // than only checking between chunks — the axios instance allows 20s per
    // request, so one hung fetch inside a Promise.all could otherwise run long
    // past the gateway limit whatever the between-chunk check said. Production
    // sweeps land in 2–3s, well inside this; the budget is for the degraded
    // case, and the headroom is spent on retries rather than unread filers.
    const deadline = Date.now() + 9000;
    const out: InstitutionsPage = { holdings: [], derivatives: [], status: 'unavailable' };
    let scanned = 0;
    let matched = 0;
    let failed = 0;
    try {
      const { names, search, hits } = await this.issuerCandidates(companyName, key);
      out.issuer = search;
      if (!names.length) throw new Error(`no usable issuer name for ${key}`);
      // The CUSIP learned from the first name match is reused for every later
      // table, so filers spelling the issuer differently still count.
      const cusips = new Set<string>();
      const seenFiler = new Set<string>();
      const picks: { acc: string; file: string; cik: string; name: string; date: string }[] = [];
      for (const h of hits.sort((a, b) => String(b._source?.file_date).localeCompare(String(a._source?.file_date)))) {
        const [accDashed, file] = String(h._id || '').split(':');
        const s = h._source || {};
        const cik = String(s.ciks?.[0] || s.cik || (s.display_names?.[0]?.match(/CIK (\d+)/)?.[1] ?? '')).replace(/^0+/, '');
        const name = String(s.display_names?.[0] || '').replace(/\s*\(CIK.*$/, '').trim();
        if (!accDashed || !file || !cik || !name || seenFiler.has(cik)) continue;
        seenFiler.add(cik);
        picks.push({ acc: accDashed.replace(/-/g, ''), file, cik, name, date: String(s.file_date || '') });
        if (picks.length >= 24) break;
      }
      // Chunks of 8 keep us inside SEC's ~10 req/s fair-use limit. Holdings are
      // appended as they arrive, so whatever has landed when the race below is
      // lost is still returned.
      const sweep = async () => {
        for (let c = 0; c < picks.length; c += 8) {
          if (Date.now() > deadline) break;
          // The previous-quarter diff costs three more requests per filer, so it
          // is only attempted while there is budget left; without it `change`
          // stays null, which already means "unknown" to the frontend.
          const wantPrev = Date.now() < deadline - 3000;
          const rows = await Promise.all(
            picks.slice(c, c + 8).map(async (p) => {
              try {
                const url = `https://www.sec.gov/Archives/edgar/data/${Number(p.cik)}/${p.acc}/${p.file}`;
                // Retry these, and cap each attempt: from a datacenter IP SEC
                // throttles part of the fan-out, and a single-attempt fetch
                // turned every throttled filer into a silent "doesn't hold it".
                // That is how BA, DIS and JPM came back with 0 of 24 filers in
                // production and still labelled themselves 'not-disclosed'.
                const xml = await this.secGet<string>(url, { text: true, tries: 2, timeout: 3500 });
                const cur = this.sumInfoTable(String(xml), names, cusips);
                if (!cur) return 'miss' as const; // read the table; issuer genuinely absent
                const prev = wantPrev && cur.shares > 0 ? await this.previousPosition(p.cik, p.acc, names, cusips) : null;
                return { p, cur, prev };
              } catch {
                return 'fail' as const; // never read the table — evidence of nothing
              }
            }),
          );
          scanned += picks.slice(c, c + 8).length;
          for (const r of rows) {
            if (r === 'fail') {
              failed++;
              continue;
            }
            if (r === 'miss') continue;
            matched++;
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
        return true; // ran to completion
      };
      let timer: NodeJS.Timeout | undefined;
      const finished = await Promise.race([
        sweep(),
        new Promise<false>((resolve) => {
          timer = setTimeout(() => resolve(false), Math.max(0, deadline - Date.now()));
          timer.unref?.();
        }),
      ]);
      if (timer) clearTimeout(timer);
      // 'partial' whenever the sweep was cut short for ANY reason — the deadline,
      // or filers whose tables we never managed to read. Claiming 'ok' on a
      // short list is the worse failure: the page renders 3 holders as the whole
      // picture with no hint that 21 were skipped.
      if (!finished || scanned < picks.length) {
        this.log.warn(`Institutions for ${key}: budget spent after ${scanned}/${picks.length} filers`);
        out.status = 'partial';
      }
      if (failed) {
        this.log.warn(`Institutions for ${key}: ${failed}/${scanned} filer tables unreadable`);
        out.status = 'partial';
      }
      // We got through the EDGAR search and read the tables it pointed at, so an
      // empty result here means no recent 13F names this issuer — a real answer
      // about the company, not a failed lookup. That is the distinction the page
      // could not previously make.
      if (out.status !== 'partial') out.status = out.holdings.length || out.derivatives.length ? 'ok' : 'not-disclosed';
      // …but a sweep that produced nothing AND failed reads is a broken lookup,
      // not a company without holders. Never say 'not-disclosed' for that.
      else if (!out.holdings.length && !out.derivatives.length && failed) out.status = 'unavailable';
    } catch (e: any) {
      // status stays 'unavailable' — the frontend should say "couldn't load",
      // never "no institutional holders".
      this.log.warn(`Institutions failed for ${key}: ${e?.response?.status || ''} ${e?.message || e}`);
    }
    out.filersScanned = scanned;
    out.filersMatched = matched;
    out.filersFailed = failed;
    // Cached either way (see fresh()): real answers for the full TTL, failures
    // for minutes, so a transient SEC outage can't be re-hammered on every hit.
    this.whaleCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  /** Compact slice for the stock-page Whale Activity card. */
  async getWhaleActivity(companyName: string, ticker: string): Promise<WhaleHolding[]> {
    return (await this.getInstitutions(companyName, ticker)).holdings.slice(0, 8);
  }
}
