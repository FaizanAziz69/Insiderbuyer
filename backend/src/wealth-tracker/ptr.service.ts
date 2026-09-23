import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { assetClassOf, sideOf, PtrTrade } from './reconstruction';
import { RosterService } from './roster.service';

/**
 * Periodic Transaction Reports, the deep table.
 *
 * `ct_disclosures` (Brief v5) and `congressional_transactions` (the legacy
 * feed) both drop rows without a ticker and neither keeps the asset type, so
 * neither can carry a reconstruction: a member's options, bonds and exchanges
 * are part of their activity even though only stock rows are priced. This
 * table keeps every row FMP returns, normalised once.
 *
 * Source depth: FMP's by-name endpoints return each member's complete record
 * (measured 2026-09-23: Gottheimer to 2017-01-03, Warner to 2017-10-18,
 * Pelosi to 2018-07-27). Both feeds carry the bioguide in `senateID`, which
 * is how a surname query resolves to exactly the right person — two
 * McCormicks stay two members.
 *
 * Row identity: a hash of the facts that make a trade distinct. Filers do
 * report several identical lots on one day (a family trust buying the same
 * range of the same stock four times), so identical rows within one fetch are
 * numbered rather than collapsed.
 */

export interface StoredTrade extends PtrTrade {
  bioguide: string;
  owner: string | null;
  assetDescription: string;
  rawType: string;
  rawAssetType: string;
  sourceUrl: string | null;
}

const OWNERS: Record<string, string> = { self: 'self', spouse: 'spouse', joint: 'joint', child: 'dependent', dependent: 'dependent' };

export function normaliseTicker(raw: unknown): string | null {
  const s = String(raw || '').trim().toUpperCase();
  if (!s || s === '--' || s === 'N/A' || s === 'NONE') return null;
  if (!/^[A-Z0-9.\-/]{1,12}$/.test(s)) return null;
  return s;
}

export function normaliseRow(r: any, bioguide: string): StoredTrade | null {
  const date = String(r?.transactionDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const disclosed = /^\d{4}-\d{2}-\d{2}/.test(String(r?.disclosureDate || '')) ? String(r.disclosureDate).slice(0, 10) : null;
  const ticker = normaliseTicker(r?.symbol);
  const { side, full } = sideOf(r?.type);
  const nums = String(r?.amount || '').replace(/[$,]/g, '').match(/\d+(\.\d+)?/g) || [];
  const amountMin = nums[0] != null ? Number(nums[0]) : null;
  const amountMax = nums[1] != null ? Number(nums[1]) : amountMin;
  const ownerRaw = String(r?.owner || '').trim().toLowerCase();
  const owner = ownerRaw ? OWNERS[ownerRaw] || 'unknown' : null;
  return {
    id: '',
    bioguide,
    ticker,
    assetClass: assetClassOf(r?.assetType, ticker),
    side,
    full,
    amountMin,
    amountMax,
    date,
    disclosed,
    owner,
    assetDescription: String(r?.assetDescription || '').trim().slice(0, 300),
    rawType: String(r?.type || '').trim().slice(0, 40),
    rawAssetType: String(r?.assetType || '').trim().slice(0, 40),
    sourceUrl: r?.link ? String(r.link).slice(0, 500) : null,
  };
}

/** Assign ids: hash of the distinguishing facts, numbered within identical groups. */
export function assignIds(rows: StoredTrade[]): StoredTrade[] {
  const seen = new Map<string, number>();
  for (const t of rows) {
    const key = [t.bioguide, t.ticker || '', t.date, t.rawType, t.amountMin ?? '', t.amountMax ?? '', t.owner || '', t.assetDescription.toLowerCase()].join('|');
    const n = seen.get(key) || 0;
    seen.set(key, n + 1);
    t.id = createHash('sha1').update(`${key}#${n}`).digest('hex').slice(0, 32);
  }
  return rows;
}

@Injectable()
export class PtrService {
  private readonly log = new Logger(PtrService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly roster: RosterService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS wt_trades (
      id text PRIMARY KEY,
      bioguide text NOT NULL,
      ticker text,
      asset_class text NOT NULL,
      asset_description text NOT NULL DEFAULT '',
      raw_type text NOT NULL DEFAULT '',
      raw_asset_type text NOT NULL DEFAULT '',
      side text NOT NULL,
      full_sale boolean NOT NULL DEFAULT false,
      owner text,
      amount_min numeric(18,2),
      amount_max numeric(18,2),
      transaction_date date NOT NULL,
      disclosure_date date,
      source_url text,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_trades_member_date_idx ON wt_trades (bioguide, transaction_date)`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_trades_ticker_idx ON wt_trades (ticker)`);
  }

  private async upsert(rows: StoredTrade[]): Promise<number> {
    if (!rows.length) return 0;
    const BATCH = 500;
    let written = 0;
    for (let i = 0; i < rows.length; i += BATCH) {
      const chunk = rows.slice(i, i + BATCH);
      const values: any[] = [];
      const tuples = chunk.map((t, k) => {
        const b = k * 15;
        values.push(
          t.id, t.bioguide, t.ticker, t.assetClass, t.assetDescription, t.rawType, t.rawAssetType, t.side, t.full,
          t.owner, t.amountMin, t.amountMax, t.date, t.disclosed, t.sourceUrl,
        );
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15})`;
      });
      await this.q(
        `INSERT INTO wt_trades (id,bioguide,ticker,asset_class,asset_description,raw_type,raw_asset_type,side,full_sale,owner,amount_min,amount_max,transaction_date,disclosure_date,source_url)
         VALUES ${tuples.join(',')}
         ON CONFLICT (id) DO UPDATE SET disclosure_date = COALESCE(EXCLUDED.disclosure_date, wt_trades.disclosure_date),
           source_url = COALESCE(EXCLUDED.source_url, wt_trades.source_url)`,
        values,
      );
      written += chunk.length;
    }
    return written;
  }

  /** Group raw FMP rows by bioguide, keep the members we track, normalise. */
  private prepare(raw: any[], known: Map<string, { name: string }>): { rows: StoredTrade[]; names: Map<string, string> } {
    const byMember = new Map<string, StoredTrade[]>();
    const names = new Map<string, string>();
    for (const r of raw) {
      const bid = String(r?.senateID || '').trim();
      if (!bid || !known.has(bid)) continue;
      const t = normaliseRow(r, bid);
      if (!t) continue;
      const arr = byMember.get(bid) || [];
      arr.push(t);
      byMember.set(bid, arr);
      if (!names.has(bid)) {
        const nm = `${r?.firstName || ''} ${r?.lastName || ''}`.trim();
        if (nm) names.set(bid, nm);
      }
    }
    const rows: StoredTrade[] = [];
    for (const arr of byMember.values()) rows.push(...assignIds(arr));
    return { rows, names };
  }

  private async knownMembers(): Promise<Map<string, { name: string }>> {
    const members = await this.roster.all();
    return new Map(members.map((m) => [m.bioguide, { name: m.name }]));
  }

  /**
   * Full backfill: one by-name call per distinct surname, both chambers.
   * ~850 surnames → ~1,700 calls; a few minutes at CONCURRENCY.
   */
  async ingestAll(opts: { concurrency?: number; limitSurnames?: number; onProgress?: (done: number, total: number) => void } = {}): Promise<{ surnames: number; rows: number; members: number }> {
    await this.ensureTables();
    const known = await this.knownMembers();
    let surnames = await this.roster.surnames();
    if (opts.limitSurnames) surnames = surnames.slice(0, opts.limitSurnames);
    const concurrency = opts.concurrency ?? 3;
    let done = 0;
    let rows = 0;
    const touched = new Set<string>();
    let cursor = 0;
    const worker = async () => {
      while (cursor < surnames.length) {
        const last = surnames[cursor++];
        try {
          const raw = await this.fmp.getCongressRaw(last);
          const { rows: prepared, names } = this.prepare([...raw.senate, ...raw.house], known);
          rows += await this.upsert(prepared);
          for (const t of prepared) touched.add(t.bioguide);
          for (const [bid, nm] of names) await this.roster.setFmpName(bid, nm);
        } catch (e: any) {
          this.log.warn(`PTR ingest for surname "${last}" failed: ${e?.message || e}`);
        }
        done++;
        opts.onProgress?.(done, surnames.length);
        if (done % 100 === 0) this.log.log(`PTR backfill ${done}/${surnames.length} surnames, ${rows} rows so far.`);
      }
    };
    await Promise.all(Array.from({ length: concurrency }, worker));
    await this.refreshTrackedSince();
    this.log.log(`PTR backfill done: ${surnames.length} surnames, ${rows} rows, ${touched.size} members with trades.`);
    return { surnames: surnames.length, rows, members: touched.size };
  }

  /** Nightly: the latest-disclosure pages, merged in. */
  async ingestLatest(pages = 4): Promise<{ rows: number }> {
    await this.ensureTables();
    const known = await this.knownMembers();
    const raw = await this.fmp.getCongressLatestRaw(pages);
    const { rows: prepared, names } = this.prepare([...raw.senate, ...raw.house], known);
    const rows = await this.upsert(prepared);
    for (const [bid, nm] of names) await this.roster.setFmpName(bid, nm);
    await this.refreshTrackedSince();
    return { rows };
  }

  /** "tracked since" = the member's earliest disclosed transaction. */
  async refreshTrackedSince(): Promise<void> {
    await this.q(`UPDATE wt_members m SET tracked_since = s.first_date
      FROM (SELECT bioguide, MIN(transaction_date) AS first_date FROM wt_trades GROUP BY bioguide) s
      WHERE s.bioguide = m.bioguide AND (m.tracked_since IS NULL OR m.tracked_since <> s.first_date)`);
  }

  /** Every trade, oldest first, for the engine. */
  async allTrades(): Promise<StoredTrade[]> {
    await this.ensureTables();
    const rows = await this.q<any[]>(`SELECT id, bioguide, ticker, asset_class, asset_description, raw_type, raw_asset_type, side, full_sale, owner,
      amount_min, amount_max, to_char(transaction_date,'YYYY-MM-DD') AS date, to_char(disclosure_date,'YYYY-MM-DD') AS disclosed, source_url
      FROM wt_trades ORDER BY bioguide, transaction_date, id`);
    return rows.map((r) => ({
      id: r.id,
      bioguide: r.bioguide,
      ticker: r.ticker,
      assetClass: r.asset_class,
      side: r.side,
      full: !!r.full_sale,
      amountMin: r.amount_min != null ? Number(r.amount_min) : null,
      amountMax: r.amount_max != null ? Number(r.amount_max) : null,
      date: r.date,
      disclosed: r.disclosed,
      owner: r.owner,
      assetDescription: r.asset_description,
      rawType: r.raw_type,
      rawAssetType: r.raw_asset_type,
      sourceUrl: r.source_url,
    }));
  }

  async tradesFor(bioguide: string, limit = 500): Promise<StoredTrade[]> {
    const rows = await this.q<any[]>(`SELECT id, bioguide, ticker, asset_class, asset_description, raw_type, raw_asset_type, side, full_sale, owner,
      amount_min, amount_max, to_char(transaction_date,'YYYY-MM-DD') AS date, to_char(disclosure_date,'YYYY-MM-DD') AS disclosed, source_url
      FROM wt_trades WHERE bioguide = $1 ORDER BY transaction_date DESC, id LIMIT $2`, [bioguide, limit]);
    return rows.map((r) => ({
      id: r.id, bioguide: r.bioguide, ticker: r.ticker, assetClass: r.asset_class, side: r.side, full: !!r.full_sale,
      amountMin: r.amount_min != null ? Number(r.amount_min) : null, amountMax: r.amount_max != null ? Number(r.amount_max) : null,
      date: r.date, disclosed: r.disclosed, owner: r.owner, assetDescription: r.asset_description, rawType: r.raw_type,
      rawAssetType: r.raw_asset_type, sourceUrl: r.source_url,
    }));
  }

  async counts(): Promise<{ trades: number; members: number; tickers: number; firstDate: string | null; lastDate: string | null }> {
    await this.ensureTables();
    const r = (await this.q<any[]>(`SELECT count(*)::int AS trades, count(DISTINCT bioguide)::int AS members,
      count(DISTINCT ticker)::int AS tickers, to_char(min(transaction_date),'YYYY-MM-DD') AS first_date,
      to_char(max(transaction_date),'YYYY-MM-DD') AS last_date FROM wt_trades`))[0];
    return { trades: r?.trades || 0, members: r?.members || 0, tickers: r?.tickers || 0, firstDate: r?.first_date || null, lastDate: r?.last_date || null };
  }
}
