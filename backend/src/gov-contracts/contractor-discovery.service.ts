import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Company } from '../entities/company.entity';
import { CONTRACTORS } from './gov-contracts-map';

/**
 * Who actually holds federal contracts, discovered rather than hand-listed.
 *
 * `gov-contracts-map.ts` is 41 companies typed out by hand. Everything
 * downstream inherits that ceiling: `gov_contract_cache` has 41 rows, so the
 * Brief v5 flag engine can only ever fire on 41 tickers, `ct_flags` holds five
 * rows, and CQS component C4 (contract alignment, 15% of the score) is
 * therefore 0 for every stock on the board. No stock can reach an A grade, so
 * the gold-tier ring in Brief v9 §3 has never once appeared.
 *
 * USAspending publishes the recipient list itself — free, no key, ranked by
 * obligated dollars, keyed by UEI. This walks that list and matches it to our
 * own tickers.
 *
 * THE MATCHING RULE, AND WHY IT IS THIS STRICT
 *
 * A previous attempt matched recipient names by substring and had to be
 * thrown away: "Bank" pulled Coast Guard awards onto Bank of Nova Scotia and
 * "INTEL" pulled FAA awards onto Intel. Under Brief v9 §8 a wrong link is not
 * a cosmetic bug — it publishes a fabricated oversight claim on a live row.
 *
 * So there is no fuzzy matching here at all:
 *   - both sides are normalised (case, punctuation, corporate suffixes), then
 *     compared for EXACT equality;
 *   - a name that normalises to fewer than MIN_KEY_CHARS is refused outright;
 *   - if one recipient matches two tickers, or one ticker matches two parent
 *     recipients, BOTH are dropped and the collision is reported.
 * Coverage is therefore partial by design. Partial and correct beats complete
 * and wrong, and a company with no federal business scoring 0 on C4 is the
 * right answer rather than a gap.
 */

const USA = 'https://api.usaspending.gov/api/v2';
/** Below this many characters a normalised name is too generic to trust. */
const MIN_KEY_CHARS = 6;
/** Recipients below this in trailing obligations are not worth a row. */
const MIN_AMOUNT = 1_000_000;

/** Suffixes and noise words that differ between SEC and SAM registrations for
 *  the same company, so they cannot be allowed to break an exact match. */
const SUFFIXES = [
  'INCORPORATED', 'INC', 'CORPORATION', 'CORP', 'COMPANY', 'COMPANIES', 'CO',
  'LIMITED', 'LTD', 'PLC', 'LLC', 'LLP', 'LP', 'NV', 'SA', 'AG', 'SE',
  'HOLDINGS', 'HOLDING', 'GROUP', 'GROUPE', 'INTERNATIONAL', 'INTL',
  'TECHNOLOGIES', 'TECHNOLOGY', 'INDUSTRIES', 'ENTERPRISES', 'SYSTEMS',
  'PARTNERS', 'TRUST', 'CLASS', 'COMMON', 'STOCK', 'THE', 'AND', 'OF',
  'USA', 'US', 'AMERICA', 'AMERICAN', 'NEW',
];
const SUFFIX_SET = new Set(SUFFIXES);

export function normaliseName(raw: string | null | undefined): string {
  if (!raw) return '';
  const cleaned = String(raw)
    .toUpperCase()
    .replace(/&/g, ' AND ')
    .replace(/[^A-Z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const kept = cleaned.split(' ').filter((w) => w && !SUFFIX_SET.has(w));
  // Everything was a suffix ("The Company"): fall back to the cleaned string
  // rather than returning an empty key that would match every other empty one.
  return (kept.length ? kept.join(' ') : cleaned).trim();
}

export interface DiscoveredMatch {
  ticker: string;
  companyName: string;
  recipientName: string;
  uei: string | null;
  amount: number;
  key: string;
  /** How many SAM registrations this company holds under the same name. */
  registrations?: number;
}

export interface DiscoveryResult {
  scanned: number;
  candidates: number;
  matched: number;
  collisions: Array<{ key: string; tickers?: string[]; recipients?: string[] }>;
  skippedShortKey: number;
  written: number;
  dryRun: boolean;
  sample: DiscoveredMatch[];
}

@Injectable()
export class ContractorDiscoveryService {
  private readonly log = new Logger(ContractorDiscoveryService.name);
  private ready = false;

  /** USAspending is slow on the ranked-recipient endpoint; the default axios
   *  timeout gives up long before it answers. */
  private readonly http: AxiosInstance = axios.create({ timeout: 120_000 });

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS gov_contractor_map (
      ticker         varchar(12) PRIMARY KEY,
      recipient_name text NOT NULL,
      uei            varchar(24),
      match_key      text NOT NULL,
      amount         numeric(20,2) DEFAULT 0,
      source         text NOT NULL DEFAULT 'discovered',
      discovered_at  timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS gov_contractor_map_amt ON gov_contractor_map (amount DESC)`);
    this.ready = true;
  }

  /**
   * Monthly re-discovery — REPORT ONLY.
   *
   * New matches are not written automatically and that is deliberate. A match
   * here asserts that a listed company holds federal contracts, which under
   * §8 becomes a published claim about oversight; the strict rules make a bad
   * match unlikely, not impossible. So the cron logs what it WOULD add and a
   * person runs the write.
   */
  @Cron('0 4 1 * *')
  async monthlyReport(): Promise<void> {
    if (process.env.VERCEL) return;
    const before = await this.q<any[]>(`SELECT ticker FROM gov_contractor_map`).catch(() => []);
    const known = new Set((before || []).map((r: any) => r.ticker));
    const res = await this.discover({ pages: 60, limit: 100, dryRun: true }).catch((e) => {
      this.log.warn(`monthly discovery failed: ${e?.message || e}`);
      return null;
    });
    if (!res) return;
    const fresh = res.sample.filter((m) => !known.has(m.ticker));
    this.log.log(
      `contractor discovery (monthly, report only): ${res.matched} matched, ${fresh.length} NOT yet in the map` +
        (fresh.length ? ` — ${fresh.map((f) => f.ticker).join(', ')}. POST /gov-contracts/admin/discover {"dryRun":false} to accept.` : ''),
    );
  }

  /** One page of USAspending's ranked parent-recipient list. */
  private async recipientPage(page: number, limit: number): Promise<any[]> {
    const { data } = await this.http.post(`${USA}/recipient/duns/`, {
      order: 'desc',
      sort: 'amount',
      page,
      limit,
      award_type: 'contracts',
    });
    return data?.results || [];
  }

  /**
   * Walk the ranked recipient list and match it to our tickers.
   *
   * `dryRun` reports what WOULD be written and writes nothing — the way every
   * scoring-input change in this codebase is checked before it ships.
   */
  async discover(opts: { pages?: number; limit?: number; dryRun?: boolean } = {}): Promise<DiscoveryResult> {
    await this.ensureTables();
    const pages = Math.max(1, Math.min(opts.pages ?? 20, 200));
    const limit = Math.max(1, Math.min(opts.limit ?? 100, 500));
    const dryRun = opts.dryRun !== false;

    // Our side, keyed by normalised name. A key held by two tickers is
    // ambiguous before USAspending is even consulted, so it is dropped here.
    const byKey = new Map<string, { ticker: string; name: string }>();
    const ourCollisions = new Set<string>();
    const rows = await this.q<any[]>(
      `SELECT ticker, name FROM companies WHERE ticker IS NOT NULL AND ticker <> '' AND name IS NOT NULL`,
    );
    for (const r of rows) {
      const key = normaliseName(r.name);
      if (key.replace(/ /g, '').length < MIN_KEY_CHARS) continue;
      if (byKey.has(key) && byKey.get(key)!.ticker !== r.ticker) {
        ourCollisions.add(key);
        continue;
      }
      byKey.set(key, { ticker: r.ticker, name: r.name });
    }
    for (const k of ourCollisions) byKey.delete(k);

    const hits = new Map<string, DiscoveredMatch[]>();
    let scanned = 0;
    let candidates = 0;
    let skippedShortKey = 0;

    for (let p = 1; p <= pages; p++) {
      let page: any[];
      try {
        page = await this.recipientPage(p, limit);
      } catch (e: any) {
        this.log.warn(`recipient page ${p} failed: ${e?.message || e}`);
        break;
      }
      if (!page.length) break;
      for (const r of page) {
        scanned++;
        const amount = Number(r.amount) || 0;
        if (amount < MIN_AMOUNT) continue;
        // 'P' is the parent registration — the level a listed company sits at.
        if (r.recipient_level && r.recipient_level !== 'P') continue;
        const key = normaliseName(r.name);
        if (key.replace(/ /g, '').length < MIN_KEY_CHARS) {
          skippedShortKey++;
          continue;
        }
        const ours = byKey.get(key);
        if (!ours) continue;
        candidates++;
        const list = hits.get(ours.ticker);
        const match: DiscoveredMatch = {
          ticker: ours.ticker,
          companyName: ours.name,
          recipientName: r.name,
          uei: r.uei || null,
          amount,
          key,
        };
        if (list) list.push(match);
        else hits.set(ours.ticker, [match]);
      }
    }

    // Several UEIs under ONE ticker is not ambiguity — it is one company with
    // several SAM registrations. Every match here already agreed on the
    // normalised legal name (that is how it matched at all), so the entity is
    // not in doubt; only the registration is. The first cut of this treated a
    // second UEI as a collision and dropped the row, which threw away Lockheed
    // Martin (three registrations), General Dynamics, Leidos, McKesson and
    // SAIC — the largest federal contractors in the file. Amounts are summed
    // across registrations and the largest one supplies the display name.
    const collisions: DiscoveryResult['collisions'] = [];
    for (const k of ourCollisions) collisions.push({ key: k, tickers: ['(two of our companies share this name)'] });
    const final: DiscoveredMatch[] = [];
    for (const [, list] of hits) {
      const ordered = list.sort((a, b) => b.amount - a.amount);
      const total = ordered.reduce((sum, m) => sum + m.amount, 0);
      final.push({ ...ordered[0], amount: total, registrations: ordered.length });
    }
    final.sort((a, b) => b.amount - a.amount);

    let written = 0;
    if (!dryRun && final.length) {
      for (let i = 0; i < final.length; i += 200) {
        const chunk = final.slice(i, i + 200);
        const values: string[] = [];
        const params: any[] = [];
        for (const m of chunk) {
          const n = params.length;
          values.push(`($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},'discovered',now())`);
          params.push(m.ticker, m.recipientName, m.uei, m.key, m.amount);
        }
        await this.q(
          `INSERT INTO gov_contractor_map (ticker, recipient_name, uei, match_key, amount, source, discovered_at)
           VALUES ${values.join(',')}
           ON CONFLICT (ticker) DO UPDATE SET
             recipient_name = EXCLUDED.recipient_name, uei = EXCLUDED.uei,
             match_key = EXCLUDED.match_key, amount = EXCLUDED.amount,
             source = EXCLUDED.source, discovered_at = now()`,
          params,
        );
        written += chunk.length;
      }
      // The curated list stays authoritative where it exists: it was checked
      // by a person, and several of its entries use a recipient string that
      // deliberately differs from the legal name (RTX → "RAYTHEON").
      for (const c of CONTRACTORS) {
        await this.q(
          `INSERT INTO gov_contractor_map (ticker, recipient_name, uei, match_key, amount, source, discovered_at)
           VALUES ($1,$2,NULL,$3,0,'curated',now())
           ON CONFLICT (ticker) DO UPDATE SET
             recipient_name = EXCLUDED.recipient_name, source = 'curated', discovered_at = now()`,
          [c.ticker, c.recipient, normaliseName(c.recipient)],
        );
      }
    }

    const out: DiscoveryResult = {
      scanned,
      candidates,
      matched: final.length,
      collisions: collisions.slice(0, 25),
      skippedShortKey,
      written,
      dryRun,
      sample: final.slice(0, 30),
    };
    this.log.log(
      `contractor discovery: scanned ${scanned}, matched ${final.length}, collisions ${collisions.length}${dryRun ? ' (DRY RUN)' : `, written ${written}`}`,
    );
    return out;
  }

  /** The universe the USAspending refresh should walk: curated ∪ discovered. */
  async universe(): Promise<Array<{ ticker: string; recipient: string }>> {
    await this.ensureTables();
    const rows = await this.q<any[]>(
      `SELECT ticker, recipient_name FROM gov_contractor_map ORDER BY amount DESC NULLS LAST, ticker`,
    );
    if (rows.length) return rows.map((r) => ({ ticker: r.ticker, recipient: r.recipient_name }));
    return CONTRACTORS.map((c) => ({ ticker: c.ticker, recipient: c.recipient }));
  }
}
