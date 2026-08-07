import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';
import { XMLParser } from 'fast-xml-parser';

export interface SecFilingHit {
  accessionNo: string;
  cik: string;
  ticker: string | null;
  companyName: string;
  formType: string;
  filedAt: string;
  primaryDoc: string;
}

/**
 * Form 4 transaction codes we persist.
 *
 * P/S (open-market buy/sell) drive every score and leaderboard — everything
 * else is kept so the "What Are Insiders Doing?" summary can distinguish a
 * conviction purchase from a routine grant or an option exercise:
 *   A  award / grant of stock as compensation
 *   M  exercise of a derivative (options) · X exercise of an in-the-money one
 *   F  shares surrendered to cover tax or the exercise price
 *   C  conversion of a derivative
 *   G  gift
 *   J  other acquisition or disposition — how private placements usually appear
 */
const KEPT_CODES = new Set(['P', 'S', 'A', 'M', 'X', 'F', 'C', 'G', 'J']);

export interface ParsedTransaction {
  insiderName: string;
  /** SEC reporting-person CIK — the canonical person key (spec §6.3.1).
   *  10-digit zero-padded string, or null when the filing lacks it. */
  reportingOwnerCik: string | null;
  rawTitle: string;
  isDirector: boolean;
  isOfficer: boolean;
  transactionDate: string;
  transactionCode: string;
  /** 'A' acquired or 'D' disposed — the only reliable direction signal for
   *  ambiguous codes like J (other acquisition/disposition). */
  acquiredDisposed: string;
  sharesBought: number;
  pricePerShare: number;
  postHoldings: number;
}

export interface ParsedForm4 {
  issuerCik: string;
  issuerName: string;
  issuerTicker: string | null;
  /** Reporting-owner filing address from the Form 4. Note: this is the
   *  address on the filing (very often the issuer's c/o address), not
   *  necessarily the insider's home. State is a US postal code for US filers;
   *  foreign filers populate stateDescription with a country/region. */
  ownerCity: string | null;
  ownerState: string | null;
  ownerStateDescription: string | null;
  transactions: ParsedTransaction[];
}

@Injectable()
export class SecClient {
  private readonly http: AxiosInstance;
  private readonly xml: XMLParser;

  constructor() {
    const userAgent = process.env.SEC_USER_AGENT || 'IQS Dashboard contact@iqs.local';
    this.http = axios.create({
      timeout: 20000,
      // Force IPv4 — Node intermittently resolves SEC hosts to IPv6 and fails
      // (AggregateError/ETIMEDOUT) while IPv4 works.
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate',
        Host: undefined,
      },
    });
    this.xml = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '@_',
      parseTagValue: true,
      trimValues: true,
    });
  }

  async searchRecentForm4(daysBack = 7, maxTotal = 4000): Promise<SecFilingHit[]> {
    const url = 'https://efts.sec.gov/LATEST/search-index';
    const pageSize = 100;
    const out: SecFilingHit[] = [];
    const seen = new Set<string>();
    const fmt = (d: Date) => d.toISOString().slice(0, 10);

    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const chunkDays = 4;
    const totalChunks = Math.ceil(daysBack / chunkDays);

    for (let c = 0; c < totalChunks && out.length < maxTotal; c++) {
      const endDate = new Date(today.getTime() - c * chunkDays * 86400000);
      const startDate = new Date(today.getTime() - (c + 1) * chunkDays * 86400000 + 86400000);
      const dateFrom = fmt(startDate);
      const dateTo = fmt(endDate);

      for (let from = 0; from < 2000; from += pageSize) {
        const params = {
          q: '',
          dateRange: 'custom',
          startdt: dateFrom,
          enddt: dateTo,
          forms: '4',
          from,
          size: pageSize,
        };
        let data: any;
        try {
          ({ data } = await this.http.get(url, { params }));
        } catch {
          break;
        }
        const hits = data?.hits?.hits || [];
        if (!hits.length) break;

        for (const h of hits) {
          const src = h._source || {};
          const accessionNo = (h._id || '').split(':')[0] || src.adsh || '';
          if (!accessionNo || seen.has(accessionNo)) continue;
          seen.add(accessionNo);
          const cik = Array.isArray(src.ciks) ? src.ciks[0] : src.ciks || '';
          const ticker = Array.isArray(src.tickers) ? src.tickers[0] : src.tickers || null;
          const name = Array.isArray(src.display_names)
            ? (src.display_names[0] || '').replace(/\s+\(.*\)\s*$/, '')
            : src.display_names || '';
          const primaryDoc = (h._id || '').split(':')[1] || '';
          out.push({
            accessionNo,
            cik: String(cik).replace(/^0+/, ''),
            ticker: ticker ? String(ticker).toUpperCase() : null,
            companyName: name,
            formType: src.form || '4',
            filedAt: src.file_date || '',
            primaryDoc,
          });
          if (out.length >= maxTotal) break;
        }
        if (hits.length < pageSize) break;
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return out;
  }

  buildFilingDocUrl(cik: string, accessionNo: string, primaryDoc: string): string {
    const accClean = accessionNo.replace(/-/g, '');
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accClean}/${primaryDoc}`;
  }

  buildFilingIndexUrl(cik: string, accessionNo: string): string {
    const accClean = accessionNo.replace(/-/g, '');
    return `https://www.sec.gov/Archives/edgar/data/${cik}/${accClean}/`;
  }

  async resolveForm4DocUrl(cik: string, accessionNo: string): Promise<string | null> {
    try {
      const indexUrl = this.buildFilingIndexUrl(cik, accessionNo) + 'index.json';
      const { data } = await this.http.get(indexUrl);
      const items: any[] = data?.directory?.item || [];
      const xmlItem = items.find((i) => /\.xml$/i.test(i.name) && !/index/i.test(i.name));
      if (!xmlItem) return null;
      return this.buildFilingDocUrl(cik, accessionNo, `xslF345X05/${xmlItem.name}`);
    } catch {
      return null;
    }
  }

  async fetchForm4Xml(cik: string, accessionNo: string, primaryDoc: string): Promise<string | null> {
    const docUrl = this.buildFilingDocUrl(cik, accessionNo, primaryDoc);
    const directXml = docUrl.endsWith('.xml') ? docUrl : null;
    if (directXml) {
      const { data } = await this.http.get(directXml, { responseType: 'text' });
      return data;
    }
    const indexUrl = this.buildFilingIndexUrl(cik, accessionNo) + 'index.json';
    const { data } = await this.http.get(indexUrl);
    const items: any[] = data?.directory?.item || [];
    const xmlItem = items.find((i) => /\.xml$/i.test(i.name) && !/index/i.test(i.name));
    if (!xmlItem) return null;
    const xmlUrl = this.buildFilingDocUrl(cik, accessionNo, xmlItem.name);
    const { data: xml } = await this.http.get(xmlUrl, { responseType: 'text' });
    return xml;
  }

  parseForm4(xml: string): ParsedForm4 | null {
    const parsed = this.xml.parse(xml);
    const doc = parsed.ownershipDocument || parsed?.['ownershipDocument'];
    if (!doc) return null;

    const issuer = doc.issuer || {};
    const issuerCik = String(issuer?.issuerCik || '').replace(/^0+/, '');
    const issuerName = String(issuer?.issuerName || '').trim();
    const issuerTicker = issuer?.issuerTradingSymbol ? String(issuer.issuerTradingSymbol).toUpperCase().trim() : null;

    const reportingOwner = doc.reportingOwner;
    const ownerArr = Array.isArray(reportingOwner) ? reportingOwner : [reportingOwner].filter(Boolean);
    const owner = ownerArr[0] || {};
    const insiderName = owner?.reportingOwnerId?.rptOwnerName || 'Unknown';
    // Canonical person key (spec §6.3.1) — zero-padded to the SEC's 10 digits.
    const rawOwnerCik = String(owner?.reportingOwnerId?.rptOwnerCik ?? '').replace(/\D/g, '');
    const reportingOwnerCik = rawOwnerCik ? rawOwnerCik.padStart(10, '0') : null;
    const relationship = owner?.reportingOwnerRelationship || {};
    const isDirector = String(relationship?.isDirector || '').trim() === '1' || relationship?.isDirector === true;
    const isOfficer = String(relationship?.isOfficer || '').trim() === '1' || relationship?.isOfficer === true;
    const rawTitle = relationship?.officerTitle || (isDirector ? 'Director' : '');

    // Reporting-owner filing address (city/state/country hints).
    const addr = owner?.reportingOwnerAddress || {};
    const ownerCity = addr?.rptOwnerCity ? String(addr.rptOwnerCity).trim() : null;
    const ownerState = addr?.rptOwnerState ? String(addr.rptOwnerState).trim().toUpperCase() : null;
    const ownerStateDescription = addr?.rptOwnerStateDescription
      ? String(addr.rptOwnerStateDescription).trim()
      : null;

    const txs: any[] = [];
    const ndt = doc.nonDerivativeTable?.nonDerivativeTransaction;
    if (ndt) {
      if (Array.isArray(ndt)) txs.push(...ndt);
      else txs.push(ndt);
    }

    const results: ParsedTransaction[] = [];
    for (const tx of txs) {
      const code = tx?.transactionCoding?.transactionCode?.value ?? tx?.transactionCoding?.transactionCode;
      const codeStr = typeof code === 'object' ? code?.value : code;
      const acqDisp = tx?.transactionAmounts?.transactionAcquiredDisposedCode?.value;
      const shares = Number(tx?.transactionAmounts?.transactionShares?.value || 0);
      const price = Number(tx?.transactionAmounts?.transactionPricePerShare?.value || 0);
      const date = tx?.transactionDate?.value;
      const post = Number(tx?.postTransactionAmounts?.sharesOwnedFollowingTransaction?.value || 0);

      const codeU = String(codeStr).toUpperCase();
      const acqDispU = String(acqDisp).toUpperCase();
      // Grants, option exercises and tax withholdings routinely report a $0
      // price, so price may be zero for anything that isn't an open-market
      // trade — only the share count is genuinely required.
      if (!shares) continue;
      if (!KEPT_CODES.has(codeU)) continue;
      if ((codeU === 'P' || codeU === 'S') && !price) continue;

      results.push({
        insiderName,
        reportingOwnerCik,
        rawTitle: String(rawTitle || ''),
        isDirector: !!isDirector,
        isOfficer: !!isOfficer,
        transactionDate: String(date),
        transactionCode: codeU,
        acquiredDisposed: acqDispU === 'D' ? 'D' : 'A',
        sharesBought: shares,
        pricePerShare: price,
        postHoldings: post,
      });
    }
    return {
      issuerCik,
      issuerName,
      issuerTicker,
      ownerCity,
      ownerState,
      ownerStateDescription,
      transactions: results,
    };
  }

  async getCompanyProfile(cik: string): Promise<{ name: string; ticker: string | null; sic: string | null }> {
    const padded = cik.padStart(10, '0');
    const url = `https://data.sec.gov/submissions/CIK${padded}.json`;
    const { data } = await this.http.get(url);
    return {
      name: data?.name || '',
      ticker: (data?.tickers && data.tickers[0]) || null,
      sic: data?.sic || null,
    };
  }

  // ── Per-ticker Form 4 lookup (live) ──────────────────────────────────
  private tickerCik: Map<string, string> | null = null;

  /** Resolve a ticker → 10-digit issuer CIK from SEC's ticker map (cached). */
  private async loadTickerCik(): Promise<Map<string, string>> {
    if (this.tickerCik) return this.tickerCik;
    const m = new Map<string, string>();
    try {
      const { data } = await this.http.get('https://www.sec.gov/files/company_tickers.json');
      for (const k of Object.keys(data || {})) {
        const e = data[k];
        if (e?.ticker && e?.cik_str != null) {
          m.set(String(e.ticker).toUpperCase(), String(e.cik_str).padStart(10, '0'));
        }
      }
    } catch {
      /* leave empty — caller handles */
    }
    this.tickerCik = m;
    return m;
  }

  /** Most recent open-market insider transactions (buys AND sells) for a
   *  ticker, fetched live from SEC EDGAR. Parses up to `maxFilings` recent
   *  Form 4s. Returns [] if the ticker can't be resolved. */
  async getRecentForm4ByTicker(
    ticker: string,
    maxFilings = 14,
  ): Promise<(ParsedTransaction & { filingUrl: string })[]> {
    const cikMap = await this.loadTickerCik();
    const cik10 = cikMap.get(ticker.toUpperCase());
    if (!cik10) return [];
    const cikNum = String(Number(cik10));
    let recent: any;
    try {
      const { data } = await this.http.get(
        `https://data.sec.gov/submissions/CIK${cik10}.json`,
      );
      recent = data?.filings?.recent;
    } catch {
      return [];
    }
    if (!recent?.form) return [];

    // Collect the most recent Form 4 accessions.
    const jobs: { acc: string; doc: string }[] = [];
    for (let i = 0; i < recent.form.length && jobs.length < maxFilings; i++) {
      if (recent.form[i] === '4') {
        // primaryDocument is the XSL-rendered viewer (e.g. "xslF345X06/form4.xml")
        // — strip the xsl folder to hit the raw, parseable XML.
        const doc = String(recent.primaryDocument[i] || '').replace(/^xsl[^/]*\//i, '');
        jobs.push({ acc: recent.accessionNumber[i], doc });
      }
    }

    const out: (ParsedTransaction & { filingUrl: string })[] = [];
    // Small concurrency to keep SEC happy.
    for (let i = 0; i < jobs.length; i += 4) {
      const chunk = jobs.slice(i, i + 4);
      const parsedChunk = await Promise.all(
        chunk.map(async ({ acc, doc }) => {
          try {
            const xml = await this.fetchForm4Xml(cikNum, acc, doc);
            if (!xml) return null;
            const parsed = this.parseForm4(xml);
            if (!parsed) return null;
            const accnd = acc.replace(/-/g, '');
            // SEC filing detail page so the link opens the Form 4 itself,
            // not the bare archive folder listing.
            const filingUrl = `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accnd}/${acc}-index.htm`;
            return parsed.transactions.map((t) => ({ ...t, filingUrl }));
          } catch {
            return null;
          }
        }),
      );
      for (const arr of parsedChunk) if (arr) out.push(...arr);
    }
    // Newest first.
    out.sort((a, b) => (a.transactionDate < b.transactionDate ? 1 : -1));
    return out;
  }
}
