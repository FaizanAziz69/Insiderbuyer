import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { XMLParser } from 'fast-xml-parser';
import { PersonaHolding } from './persona-data';

/**
 * Live 13F-HR holdings pulled from SEC EDGAR for the institutional "famous
 * investor" personas that actually file 13Fs. 13F is a QUARTERLY filing (due
 * ~45 days after quarter-end), so this is "latest reported", not intraday —
 * but it is real SEC data, not hardcoded samples.
 *
 * Personas that are individuals / family offices (Bezos, Trump) do not file
 * 13Fs, so they keep their curated lists (see PERSONA_HOLDINGS).
 */
const PERSONA_CIK: Record<string, string> = {
  'warren-buffett': '0001067983', // Berkshire Hathaway Inc
  'ray-dalio': '0001350694', // Bridgewater Associates, LP
  'eric-sprott': '0001512920', // Sprott Inc (current 13F filer)
};

/**
 * Individual insiders don't file 13Fs — their US positions are disclosed on
 * their own Form 4s, whose newest filing per issuer carries the running
 * balance (sharesOwnedFollowingTransaction). Merged ON TOP of the 13F rows:
 * this is how Eric Sprott's personal 37M-share HYMC stake (held via 2176423
 * Ontario Ltd, absent from Sprott Inc's 13F) reaches his list — the client
 * flagged it missing 2026-08-19.
 */
const PERSONA_FORM4_CIK: Record<string, string> = {
  // Eric Sprott personally; 2176423 Ontario Ltd (CIK 1925668) co-files the
  // exact same Form 4s, so one CIK covers both reporting persons.
  'eric-sprott': '0001491714',
};

/** Corporate-form tokens dropped from both sides before name matching. */
const DROP = new Set([
  'INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'COS',
  'LTD', 'LIMITED', 'PLC', 'LP', 'LLC', 'LLP', 'THE', 'COM', 'CL', 'CLASS',
  'NEW', 'HLDG', 'HLDGS', 'HOLDING', 'HOLDINGS', 'TR', 'TRUST', 'SA', 'NV',
  'ADR', 'ADS', 'SP', 'SPON', 'SPONSORED', 'OF', 'DEL', 'DE', 'MD', 'USA',
  'SWITZ', 'LTDSWITZ',
]);

/** Common 13F abbreviations → full words so they match company_tickers titles. */
const EXPAND: Record<string, string> = {
  FINL: 'FINANCIAL',
  GRP: 'GROUP',
  SVCS: 'SERVICES',
  SVC: 'SERVICE',
  INTL: 'INTERNATIONAL',
  MTRS: 'MOTORS',
  COMM: 'COMMUNICATIONS',
  COMMUNICATION: 'COMMUNICATIONS',
  TECH: 'TECHNOLOGIES',
  TECHNOLOGY: 'TECHNOLOGIES',
  PHARMACEUTICAL: 'PHARMACEUTICALS',
  SYS: 'SYSTEMS',
  IND: 'INDUSTRIES',
  PETE: 'PETROLEUM',
  PETRO: 'PETROLEUM',
  AMER: 'AMERICA',
};

function normTokens(raw: string): string[] {
  return raw
    .toUpperCase()
    .replace(/['’.]/g, '') // drop apostrophes/periods (MOODY'S → MOODYS)
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => EXPAND[t] || t)
    .filter((t) => !DROP.has(t));
}

/** Reduced match key — corporate forms stripped, abbreviations expanded. */
function normKey(raw: string): string {
  return normTokens(raw).join(' ');
}

function titleCase(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/\b(Inc|Corp|Co|Ltd|Plc|Llc|Lp)\b/g, (m) => m);
}

@Injectable()
export class ThirteenFService {
  private readonly log = new Logger('ThirteenFService');
  private readonly http: AxiosInstance;
  private readonly xml: XMLParser;
  private readonly cache = new Map<string, { ts: number; rows: PersonaHolding[] }>();
  private tickerIndex: Map<string, string> | null = null;
  private readonly TTL_MS = 24 * 60 * 60 * 1000;

  constructor() {
    const ua =
      process.env.SEC_USER_AGENT ||
      'InsiderBuying research contact@insiderbuying.com';
    this.http = axios.create({
      timeout: 25000,
      // Force IPv4 — Node intermittently resolves SEC hosts to an IPv6 address
      // that fails (AggregateError/ETIMEDOUT) while curl/IPv4 work fine.
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': ua, 'Accept-Encoding': 'gzip, deflate' },
    });
    this.xml = new XMLParser({
      ignoreAttributes: true,
      parseTagValue: true,
      trimValues: true,
      removeNSPrefix: true,
    });
  }

  hasCik(slug: string): boolean {
    return !!PERSONA_CIK[slug] || !!PERSONA_FORM4_CIK[slug];
  }

  /** Latest reported holdings for a persona — the full 13F book plus, where
   *  the persona is also an individual Form 4 filer, their personal insider
   *  positions (which win over a fund-side 13F line in the same name). Null
   *  if not a filer / fetch failed (caller falls back to the curated list). */
  async getHoldings(slug: string): Promise<PersonaHolding[] | null> {
    const cik = PERSONA_CIK[slug];
    const f4cik = PERSONA_FORM4_CIK[slug];
    if (!cik && !f4cik) return null;
    const cached = this.cache.get(slug);
    if (cached && Date.now() - cached.ts < this.TTL_MS) return cached.rows;
    try {
      let thirteenF: PersonaHolding[] = [];
      if (cik) {
        try {
          thirteenF = await this.fetchLatest(cik);
        } catch (e: any) {
          this.log.warn(`13F fetch failed for ${slug}: ${e?.message || e}`);
        }
      }
      let personal: PersonaHolding[] = [];
      if (f4cik) {
        try {
          personal = await this.fetchForm4Holdings(f4cik);
        } catch (e: any) {
          this.log.warn(`Form 4 fetch failed for ${slug}: ${e?.message || e}`);
        }
      }
      const personalTickers = new Set(personal.map((p) => p.ticker));
      const rows = [
        ...personal,
        ...thirteenF.filter((r) => !personalTickers.has(r.ticker)),
      ];
      if (rows.length) {
        this.cache.set(slug, { ts: Date.now(), rows });
        return rows;
      }
      return null;
    } catch (e: any) {
      this.log.warn(`holdings fetch failed for ${slug}: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * An individual filer's current US positions from their own Form 4s: walk
   * the recent filings newest-first, take the FIRST filing seen per issuer,
   * and read the final post-transaction balance per ownership bucket (direct
   * vs each indirect nature — later lines in a filing overwrite earlier ones,
   * then the buckets sum). dollarValue is left 0 — Form 4 carries no position
   * value, so stock-lists prices it from the live quote.
   */
  private async fetchForm4Holdings(cik: string): Promise<PersonaHolding[]> {
    const cik10 = cik.padStart(10, '0');
    const cikNum = String(Number(cik));
    const sub = await this.http.get(
      `https://data.sec.gov/submissions/CIK${cik10}.json`,
    );
    const recent = sub.data?.filings?.recent;
    if (!recent) return [];

    const seen = new Set<string>();
    const out: PersonaHolding[] = [];
    let opened = 0;
    for (let i = 0; i < recent.form.length && opened < 40; i++) {
      const form = String(recent.form[i]);
      if (form !== '4' && form !== '4/A') continue;
      opened++;
      const accnd = String(recent.accessionNumber[i]).replace(/-/g, '');
      const filed = String(recent.filingDate[i]);
      try {
        const folder = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accnd}`;
        const list = await this.http.get(`${folder}/index.json`);
        const items: any[] = list.data?.directory?.item || [];
        const doc = items.find(
          (it) => /\.xml$/i.test(it.name) && !/primary/i.test(it.name),
        );
        if (!doc) continue;
        const xmlRes = await this.http.get(`${folder}/${doc.name}`, {
          responseType: 'text',
        });
        const od = this.xml.parse(xmlRes.data)?.ownershipDocument;
        if (!od) continue;
        const ticker = String(od.issuer?.issuerTradingSymbol || '')
          .trim()
          .toUpperCase();
        if (!ticker || ticker === 'NONE' || seen.has(ticker)) continue;
        seen.add(ticker);

        const table = od.nonDerivativeTable;
        const asArray = (v: any) => (Array.isArray(v) ? v : v ? [v] : []);
        const entries = [
          ...asArray(table?.nonDerivativeTransaction),
          ...asArray(table?.nonDerivativeHolding),
        ];
        const byNature = new Map<string, number>();
        for (const e of entries) {
          const raw =
            e?.postTransactionAmounts?.sharesOwnedFollowingTransaction;
          const shares = Number(raw?.value ?? raw) || 0;
          const diRaw = e?.ownershipNature?.directOrIndirectOwnership;
          const natRaw = e?.ownershipNature?.natureOfOwnership;
          const di = String(diRaw?.value ?? diRaw ?? 'D');
          const nat = String(natRaw?.value ?? natRaw ?? '');
          if (shares > 0) byNature.set(`${di}|${nat}`, shares);
        }
        const total = Array.from(byNature.values()).reduce((a, b) => a + b, 0);
        if (total > 0) {
          out.push({
            ticker,
            name: titleCase(String(od.issuer?.issuerName || ticker)),
            sector: '',
            sharesHeld: total,
            dollarValue: 0,
            lastReported: filed,
          });
        }
      } catch {
        continue; // one unreadable filing must not sink the rest
      }
    }
    return out;
  }

  private async fetchLatest(cik: string): Promise<PersonaHolding[]> {
    const cik10 = cik.padStart(10, '0');
    const cikNum = String(Number(cik));

    const sub = await this.http.get(
      `https://data.sec.gov/submissions/CIK${cik10}.json`,
    );
    const recent = sub.data?.filings?.recent;
    if (!recent) return [];
    let idx = -1;
    for (let i = 0; i < recent.form.length; i++) {
      if (String(recent.form[i]).startsWith('13F-HR')) {
        idx = i;
        break;
      }
    }
    if (idx < 0) return [];
    const accnd = String(recent.accessionNumber[idx]).replace(/-/g, '');
    const filed = String(recent.filingDate[idx]);
    const folder = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accnd}`;

    const list = await this.http.get(`${folder}/index.json`);
    const items: any[] = list.data?.directory?.item || [];
    // The information table is the .xml that is NOT the cover page primary_doc.
    const info = items.find(
      (it) =>
        /\.xml$/i.test(it.name) &&
        it.name.toLowerCase() !== 'primary_doc.xml',
    );
    if (!info) return [];

    const xmlRes = await this.http.get(`${folder}/${info.name}`, {
      responseType: 'text',
    });
    const parsed = this.xml.parse(xmlRes.data);
    const tables = this.findInfoTables(parsed);
    if (!tables.length) return [];

    const tickIndex = await this.loadTickerIndex();

    // Aggregate by resolved ticker (a manager can hold a name across share
    // classes / multiple rows).
    const byKey = new Map<
      string,
      { ticker: string; name: string; shares: number; value: number }
    >();
    for (const t of tables) {
      const name = String(t.nameOfIssuer ?? '').trim();
      if (!name) continue;
      const value = Number(t.value) || 0; // post-2023 filings report whole dollars
      const shares = Number(t?.shrsOrPrnAmt?.sshPrnamt ?? t?.sshPrnamt) || 0;
      if (value <= 0) continue;
      const ticker = this.resolveTicker(name, tickIndex);
      const key = ticker || `name:${normKey(name)}`;
      const prev = byKey.get(key);
      if (prev) {
        prev.shares += shares;
        prev.value += value;
      } else {
        byKey.set(key, { ticker: ticker || '', name: titleCase(name), shares, value });
      }
    }

    // FULL book, not a teaser — the client asked for the complete portfolio
    // (2026-08-19). Was .slice(0, 30), which hid 80% of Sprott Inc's 268 lines.
    const rows: PersonaHolding[] = Array.from(byKey.values())
      .sort((a, b) => b.value - a.value)
      .map((h) => ({
        ticker: h.ticker,
        name: h.name,
        sector: '', // 13F carries no sector; stock-lists enriches from Insider Score data
        sharesHeld: h.shares,
        dollarValue: h.value,
        lastReported: filed,
      }));
    return rows;
  }

  /** Walk the parsed XML for any array/object of infoTable entries. */
  private findInfoTables(node: any): any[] {
    if (!node || typeof node !== 'object') return [];
    if (node.infoTable) {
      return Array.isArray(node.infoTable) ? node.infoTable : [node.infoTable];
    }
    for (const k of Object.keys(node)) {
      const found = this.findInfoTables(node[k]);
      if (found.length) return found;
    }
    return [];
  }

  /** SEC company_tickers.json → reduced-name → ticker index (cached). */
  private async loadTickerIndex(): Promise<Map<string, string>> {
    if (this.tickerIndex) return this.tickerIndex;
    const res = await this.http.get(
      'https://www.sec.gov/files/company_tickers.json',
    );
    const m = new Map<string, string>();
    for (const k of Object.keys(res.data || {})) {
      const e = res.data[k];
      if (!e?.title || !e?.ticker) continue;
      const key = normKey(String(e.title));
      // First writer wins — company_tickers is ordered by market relevance.
      if (key && !m.has(key)) m.set(key, String(e.ticker).toUpperCase());
    }
    this.tickerIndex = m;
    return m;
  }

  private resolveTicker(
    issuer: string,
    index: Map<string, string>,
  ): string | null {
    const key = normKey(issuer);
    if (!key) return null;
    const exact = index.get(key);
    if (exact) return exact;
    // Fallback: progressively trim trailing tokens (handles extra descriptors
    // like "DEL", "MD", "USA" the 13F sometimes appends). Never trim down to a
    // single token: "SPROTT FOCUS TR" and "SPROTT ASSET MANAGEMENT LP" both
    // collapsed to "SPROTT" and inflated the SII line by $200M+ — distinct
    // issuers sharing a first word must fail to resolve, not merge.
    const toks = key.split(' ');
    for (let n = toks.length - 1; n >= 2; n--) {
      const hit = index.get(toks.slice(0, n).join(' '));
      if (hit) return hit;
    }
    return null;
  }
}
