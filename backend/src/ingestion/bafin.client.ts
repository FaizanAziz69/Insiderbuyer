import { Injectable, Logger } from '@nestjs/common';
import * as https from 'https';

/** One parsed row of BaFin's public "Directors' Dealings" (Managers'
 *  Transactions, MAR Art. 19) database. Free, machine-readable CSV export —
 *  no key, no login, no bot-wall. See buildExportUrl for the endpoint. */
export interface BafinDealing {
  issuer: string;
  bafinId: string;
  isin: string;
  insiderName: string;
  /** Raw "Position / status" — e.g. "Management Board", "Supervisory board",
   *  "Closely associated". */
  position: string;
  instrument: string;
  /** Raw "Nature of transaction" — "Buy" / "Sell" / "Subscription" / "Other". */
  nature: string;
  /** Average price in EUR (parsed from German "146,21 EUR"). 0 when absent. */
  avgPrice: number;
  /** Aggregated transaction volume in EUR (from "97.334,29 EUR"). */
  volumeEur: number;
  /** ISO yyyy-mm-dd (parsed from DD/MM/YYYY), or null if unparseable. */
  notificationDate: string | null;
  transactionDate: string | null;
  venue: string;
}

/** BaFin's displaytag CSV export. `6578706f7274` = hex "export"; the
 *  `d-4000784-e` param picks the format (1 = CSV, 3 = XML). `locale=en_GB`
 *  yields English column headers. `emittentName` browses issuers by prefix. */
const BAFIN_BASE =
  'https://portal.mvp.bafin.de/database/DealingsInfo/sucheForm.do';

@Injectable()
export class BafinClient {
  private readonly logger = new Logger(BafinClient.name);

  /** Raw HTTPS GET returning the response body as text. Uses Node's
   *  `insecureHTTPParser` because BaFin emits a multi-line Permissions-Policy
   *  header that the strict parser rejects ("Invalid header value char") —
   *  curl/browsers tolerate it. BaFin is a public government portal. */
  private httpGetText(url: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const req = https.get(
        url,
        {
          timeout: 30000,
          insecureHTTPParser: true,
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
            Accept: 'text/csv,text/plain,*/*',
            'Accept-Language': 'en-GB,en;q=0.9',
          },
        },
        (res) => {
          if ((res.statusCode ?? 0) >= 400) {
            res.resume();
            reject(new Error(`HTTP ${res.statusCode}`));
            return;
          }
          const chunks: Buffer[] = [];
          res.on('data', (d) => chunks.push(d as Buffer));
          res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        },
      );
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', reject);
    });
  }

  private buildExportUrl(prefix: string): string {
    const params = new URLSearchParams({
      '6578706f7274': '1',
      locale: 'en_GB',
      'd-4000784-e': '1',
      emittentName: prefix,
    });
    return `${BAFIN_BASE}?${params.toString()}`;
  }

  /** German-formatted money "97.334,29 EUR" → 97334.29 (thousands '.', decimal ','). */
  private parseEur(raw: string): number {
    if (!raw) return 0;
    const cleaned = raw
      .replace(/EUR/gi, '')
      .replace(/\s/g, '')
      .replace(/\./g, '')
      .replace(',', '.')
      .trim();
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : 0;
  }

  /** "02/07/2026" (DD/MM/YYYY) → "2026-07-02". Timestamps ("... 11:10:26")
   *  are truncated to the date. */
  private parseDate(raw: string): string | null {
    if (!raw) return null;
    const m = raw.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})/);
    if (!m) return null;
    return `${m[3]}-${m[2]}-${m[1]}`;
  }

  /** Split a single semicolon-delimited CSV line, honoring "quoted" fields. */
  private splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = !inQuotes;
      } else if (ch === ';' && !inQuotes) {
        out.push(cur);
        cur = '';
      } else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  }

  /** Fetch + parse all dealings for issuers whose name starts with `prefix`
   *  (a single letter A–Z, or a full issuer name). Returns [] on any error so
   *  one bad letter never aborts the sweep. */
  async fetchDealings(prefix: string): Promise<BafinDealing[]> {
    try {
      const data = await this.httpGetText(this.buildExportUrl(prefix));
      if (!data || typeof data !== 'string') return [];
      // Strip UTF-8 BOM, split lines, drop header.
      const lines = data.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
      if (lines.length < 2) return [];
      const rows: BafinDealing[] = [];
      for (let i = 1; i < lines.length; i++) {
        const c = this.splitCsvLine(lines[i]);
        if (c.length < 11) continue;
        const [
          issuer,
          bafinId,
          isin,
          insiderName,
          position,
          instrument,
          nature,
          avgPrice,
          volume,
          notif,
          txn,
          venue,
        ] = c;
        if (!issuer || !isin) continue;
        rows.push({
          issuer,
          bafinId,
          isin: isin.toUpperCase(),
          insiderName,
          position,
          instrument,
          nature,
          avgPrice: this.parseEur(avgPrice),
          volumeEur: this.parseEur(volume),
          notificationDate: this.parseDate(notif),
          transactionDate: this.parseDate(txn),
          venue: venue || '',
        });
      }
      return rows;
    } catch (err: any) {
      this.logger.warn(`BaFin fetch failed for "${prefix}": ${err?.message || err}`);
      return [];
    }
  }

  /** Sweep the database by iterating issuer prefixes. Pass `letters` (e.g.
   *  "ABCDE") to process a subset — the serverless 60s budget can't fetch all
   *  26 in one request, so callers chunk. Deduped by (bafinId+isin+insider+
   *  txnDate+volume) so overlapping prefixes don't double-count. */
  async fetchAllDealings(letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'): Promise<BafinDealing[]> {
    const prefixes = letters.toUpperCase().split('').filter((c) => /[A-Z]/.test(c));
    const seen = new Set<string>();
    const all: BafinDealing[] = [];
    for (const p of prefixes) {
      const rows = await this.fetchDealings(p);
      for (const r of rows) {
        const key = `${r.bafinId}|${r.isin}|${r.insiderName}|${r.transactionDate}|${r.volumeEur}|${r.nature}`;
        if (seen.has(key)) continue;
        seen.add(key);
        all.push(r);
      }
      this.logger.log(`BaFin "${p}": ${rows.length} rows (running total ${all.length})`);
    }
    return all;
  }
}
