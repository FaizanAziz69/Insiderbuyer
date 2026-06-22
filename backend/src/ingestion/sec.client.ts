import { Injectable } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
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

export interface ParsedTransaction {
  insiderName: string;
  rawTitle: string;
  isDirector: boolean;
  isOfficer: boolean;
  transactionDate: string;
  transactionCode: string;
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

      for (let from = 0; from < 400; from += pageSize) {
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

      if (!shares || !price) continue;
      // P/A = open-market purchase, S/D = open-market sale. Everything else
      // (grants, awards, option exercises, gifts) is noise for our purposes.
      const codeU = String(codeStr).toUpperCase();
      const acqDispU = String(acqDisp).toUpperCase();
      const isBuy = codeU === 'P' && acqDispU === 'A';
      const isSell = codeU === 'S' && acqDispU === 'D';
      if (!isBuy && !isSell) continue;

      results.push({
        insiderName,
        rawTitle: String(rawTitle || ''),
        isDirector: !!isDirector,
        isOfficer: !!isOfficer,
        transactionDate: String(date),
        transactionCode: String(codeStr).toUpperCase(),
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
}
