import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { existsSync, readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { Company } from '../entities/company.entity';
import { assetClassOf } from './reconstruction';
import { normaliseTicker } from './ptr.service';

/**
 * The pre-2017 House record, from the Clerk rather than the vendor.
 *
 * Measured 2026-09-23: FMP carries the Senate back to 2012 but starts around
 * 2017 for most House members — its by-name endpoint ignores `page`, and
 * house-latest caps at page 100 (about 2022). So the House side of the
 * STOCK Act era is not purchasable from the feed we have; it is published by
 * the Clerk of the House as PDFs.
 *
 * `backend/scripts/house_ptr_backfill.py` downloads and parses those filings
 * on a build machine and writes one JSONL per year under `backend/data/
 * house-ptr/`. Parsing is deliberately NOT done here: it is a one-time read of
 * a record that never changes, and the box does not need a PDF toolchain.
 *
 * Two honesty rules built into the load:
 *  - Scanned paper filings have no text layer and are NOT guessed at. They are
 *    counted and reported, never OCR'd, because a misread digit in a dollar
 *    band is worse than a missing row.
 *  - A filing whose member cannot be resolved to a bioguide is counted and
 *    skipped rather than attached to a namesake.
 *
 * Rows that FMP already supplies are skipped on a loose signature (member,
 * ticker, date, side, band) because the two sources spell the description and
 * the transaction type differently and would otherwise double-count.
 */

interface ArchiveTx {
  ticker: string;
  type: 'Purchase' | 'Sale' | 'Exchange';
  partial: boolean;
  transaction_date: string;
  disclosure_date: string;
  amount_min: number;
  amount_max: number;
  owner: string;
}

interface ArchiveFiling {
  year: number;
  doc_id: string;
  last: string;
  first: string;
  suffix: string;
  state_dst: string;
  filing_date: string;
  url: string;
  no_text: boolean;
  transactions: ArchiveTx[];
}

/** dist/wealth-tracker/… → backend/data/house-ptr */
const DATA_DIRS = [
  join(__dirname, '..', '..', 'data', 'house-ptr'),
  join(__dirname, '..', '..', '..', 'data', 'house-ptr'),
  join(process.cwd(), 'data', 'house-ptr'),
];

function norm(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

@Injectable()
export class HouseArchiveService {
  private readonly log = new Logger(HouseArchiveService.name);

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  private dataDir(): string | null {
    return DATA_DIRS.find((d) => existsSync(d)) || null;
  }

  private read(dir: string, years?: number[]): ArchiveFiling[] {
    const out: ArchiveFiling[] = [];
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()) {
      const year = Number(file.replace('.jsonl', ''));
      if (years?.length && !years.includes(year)) continue;
      for (const line of readFileSync(join(dir, file), 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          out.push(JSON.parse(line));
        } catch {
          /* a truncated final line while the parser is still writing */
        }
      }
    }
    return out;
  }

  /**
   * Every member, keyed by each name form the Clerk index might use.
   *
   * Deliberately NOT restricted to current House members: a representative
   * who later moved to the Senate still filed these reports as a
   * representative, and their roster row now says Senate. Filtering on
   * chamber lost Gary Peters, Bill Cassidy, Tammy Duckworth and Jacky Rosen
   * among others on the first production load.
   */
  private async houseIndex(): Promise<Map<string, string>> {
    const rows = await this.q<Array<{ bioguide: string; first: string; last: string; nickname: string | null; state: string | null; district: string | null }>>(
      `SELECT bioguide, first, last, nickname, state, district FROM wt_members`,
    );
    const idx = new Map<string, string>();
    const put = (k: string, bioguide: string) => {
      if (!k.trim()) return;
      // A key that two members share is ambiguous and must not resolve: two
      // McCormicks stay two members.
      if (idx.has(k) && idx.get(k) !== bioguide) idx.set(k, '');
      else idx.set(k, bioguide);
    };
    for (const m of rows) {
      const last = norm(m.last);
      const firsts = new Set([norm(m.first), norm(m.nickname || ''), norm(m.first).split(' ')[0]].filter(Boolean));
      const state = (m.state || '').toUpperCase();
      const dist = String(m.district ?? '').padStart(2, '0');
      for (const f of firsts) {
        put(`${last}|${f}|${state}${dist}`, m.bioguide);
        put(`${last}|${f}|${state}`, m.bioguide);
        put(`${last}|${f}`, m.bioguide);
      }
      put(`${last}||${state}${dist}`, m.bioguide);
    }
    return idx;
  }

  private resolve(idx: Map<string, string>, f: ArchiveFiling): string | null {
    const last = norm(f.last);
    const first = norm(f.first);
    const firstWord = first.split(' ')[0];
    const sd = (f.state_dst || '').toUpperCase();
    const state = sd.slice(0, 2);
    for (const key of [
      `${last}|${first}|${sd}`,
      `${last}|${firstWord}|${sd}`,
      `${last}|${first}|${state}`,
      `${last}|${firstWord}|${state}`,
      `${last}||${sd}`,
      `${last}|${first}`,
      `${last}|${firstWord}`,
    ]) {
      const hit = idx.get(key);
      if (hit) return hit;
    }
    return null;
  }

  async load(opts: { years?: number[] } = {}): Promise<any> {
    const dir = this.dataDir();
    if (!dir) return { ok: false, error: 'No data/house-ptr directory on this box.' };
    const filings = this.read(dir, opts.years);
    const idx = await this.houseIndex();

    let scanned = 0;
    let unresolved = 0;
    const unresolvedNames = new Map<string, number>();
    const rows: Array<Record<string, any>> = [];
    const byMember = new Set<string>();

    for (const f of filings) {
      if (f.no_text) {
        scanned++;
        continue;
      }
      if (!f.transactions?.length) continue;
      const bioguide = this.resolve(idx, f);
      if (!bioguide) {
        unresolved++;
        const k = `${f.last}, ${f.first} (${f.state_dst})`;
        unresolvedNames.set(k, (unresolvedNames.get(k) || 0) + 1);
        continue;
      }
      byMember.add(bioguide);
      f.transactions.forEach((t, i) => {
        const ticker = normaliseTicker(t.ticker);
        if (!ticker) return;
        const side = t.type === 'Purchase' ? 'buy' : t.type === 'Sale' ? 'sell' : 'exchange';
        rows.push({
          id: createHash('sha1').update(`house-clerk|${f.doc_id}|${i}`).digest('hex').slice(0, 32),
          bioguide,
          ticker,
          asset_class: assetClassOf('Stock', ticker),
          asset_description: `${ticker} (House Clerk filing ${f.doc_id})`.slice(0, 300),
          raw_type: t.partial ? 'Sale (Partial)' : t.type,
          raw_asset_type: 'Stock',
          side,
          full_sale: t.type === 'Sale' && !t.partial,
          owner: t.owner,
          amount_min: t.amount_min,
          amount_max: t.amount_max,
          transaction_date: t.transaction_date,
          disclosure_date: t.disclosure_date,
          source_url: f.url,
        });
      });
    }

    // Skip what the vendor already gave us: same member, ticker, date, side
    // and band. The two sources word the description and type differently, so
    // the stored id can never match and only a loose signature will do.
    const existing = new Set<string>();
    if (byMember.size) {
      const have = await this.q<Array<{ sig: string }>>(
        `SELECT bioguide || '|' || coalesce(ticker,'') || '|' || transaction_date || '|' || side || '|' ||
                coalesce(amount_min,0)::bigint || '|' || coalesce(amount_max,0)::bigint AS sig
         FROM wt_trades WHERE bioguide = ANY($1)`,
        [Array.from(byMember)],
      );
      for (const r of have) existing.add(r.sig);
    }
    const fresh = rows.filter(
      (r) => !existing.has(`${r.bioguide}|${r.ticker}|${r.transaction_date}|${r.side}|${Math.round(r.amount_min)}|${Math.round(r.amount_max)}`),
    );

    let written = 0;
    for (let i = 0; i < fresh.length; i += 500) {
      const chunk = fresh.slice(i, i + 500);
      const values: any[] = [];
      const tuples = chunk.map((r, k) => {
        const b = k * 15;
        values.push(
          r.id, r.bioguide, r.ticker, r.asset_class, r.asset_description, r.raw_type, r.raw_asset_type, r.side,
          r.full_sale, r.owner, r.amount_min, r.amount_max, r.transaction_date, r.disclosure_date, r.source_url,
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15})`;
      });
      await this.q(
        `INSERT INTO wt_trades (id,bioguide,ticker,asset_class,asset_description,raw_type,raw_asset_type,side,full_sale,owner,amount_min,amount_max,transaction_date,disclosure_date,source_url)
         VALUES ${tuples.join(',')} ON CONFLICT (id) DO NOTHING`,
        values,
      );
      written += chunk.length;
    }

    const top = Array.from(unresolvedNames.entries()).sort((a, b) => b[1] - a[1]).slice(0, 10);
    const out = {
      ok: true,
      filings: filings.length,
      scannedNoTextLayer: scanned,
      unresolvedFilings: unresolved,
      unresolvedExamples: top,
      transactionsParsed: rows.length,
      alreadyHeldByVendor: rows.length - fresh.length,
      inserted: written,
      members: byMember.size,
    };
    this.log.log(`House Clerk archive: ${JSON.stringify(out)}`);
    return out;
  }

  /** What the archive holds, without touching the database. */
  async status(): Promise<any> {
    const dir = this.dataDir();
    if (!dir) return { present: false };
    const filings = this.read(dir);
    const byYear: Record<string, { filings: number; scanned: number; transactions: number }> = {};
    for (const f of filings) {
      const y = String(f.year);
      byYear[y] = byYear[y] || { filings: 0, scanned: 0, transactions: 0 };
      byYear[y].filings++;
      if (f.no_text) byYear[y].scanned++;
      byYear[y].transactions += f.transactions?.length || 0;
    }
    return { present: true, dir, byYear };
  }
}
