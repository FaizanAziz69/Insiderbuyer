import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { nameKey } from './influence-map.service';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 1: disclosures and holdings.
 *
 * §2 Stage 1 asks for three things the existing congress table does not carry:
 *
 *  • "current holdings from annual financial disclosures" — the flag condition
 *    in Stage 3 is "member HOLDS or traded", and until now only trades existed.
 *  • "aggregate at household level" — a periodic transaction report says
 *    whether the filer, a spouse, a joint account or a dependent child owns the
 *    asset, and the brief wants those treated as one household.
 *  • the link to the filing itself. §7 P1 accepts only when "every flag's
 *    evidence chain [is] complete and clickable", and a trade leg with no
 *    document to open does not meet that.
 *
 * All three are in the disclosure feed already — `owner` and `link` per row —
 * they were simply not being stored. This service keeps its own table rather
 * than widening `congressional_transactions`, which four other surfaces read.
 *
 * ── On "holdings", precisely ──────────────────────────────────────────────
 *
 * The annual financial disclosure that lists a member's holdings outright is
 * published as a PDF, and no free machine-readable feed of it exists. So a
 * holding here is DERIVED: purchases net of sales in the disclosed record, as
 * at the award date. That is a real position built from real filings, but it
 * is not the same thing as reading the annual form, and it can be wrong for a
 * position acquired before the member took office or disposed of in a way the
 * reports do not capture. Every derived holding says so in its own evidence
 * line, because §5 does not allow a figure to imply a source it does not have.
 */

export type Owner = 'self' | 'spouse' | 'joint' | 'dependent' | 'unknown';

export interface DisclosedTrade {
  id: string;
  member: string;
  bioguide: string | null;
  chamber: 'House' | 'Senate';
  owner: Owner;
  ticker: string;
  action: 'Buy' | 'Sell';
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  disclosureDate: string | null;
  sourceUrl: string | null;
}

export interface HouseholdPosition {
  member: string;
  ticker: string;
  /** Net shares are never disclosed; this is net DOLLARS at range midpoints. */
  netValue: number;
  buys: number;
  sells: number;
  firstBought: string | null;
  lastActivity: string | null;
  /** Which household members' accounts contributed. */
  owners: Owner[];
}

@Injectable()
export class DisclosuresService {
  private readonly log = new Logger(DisclosuresService.name);
  private ready = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_disclosures (
      id           text PRIMARY KEY,
      member       text NOT NULL,
      bioguide     varchar(16),
      chamber      varchar(10) NOT NULL,
      owner        varchar(12) NOT NULL DEFAULT 'unknown',
      ticker       varchar(16) NOT NULL,
      action       varchar(8) NOT NULL,
      amount_min   numeric(18,2),
      amount_max   numeric(18,2),
      transaction_date date NOT NULL,
      disclosure_date  date,
      source_url   text,
      created_at   timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_disclosures_ticker_idx ON ct_disclosures (ticker, transaction_date DESC)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_disclosures_member_idx ON ct_disclosures (lower(member))`);
    this.ready = true;
  }

  // ── Ingest ─────────────────────────────────────────────────────────────

  /** Pull the latest disclosed transactions from both chambers. */
  async ingest(pages = 6): Promise<{ fetched: number; stored: number }> {
    await this.ensureTables();
    const rows = await this.fetchAll(pages);
    let fetched = rows.length;
    let stored = 0;
    for (const r of rows) {
      const shaped = shape(r);
      if (!shaped) continue;
      await this.upsert(shaped);
      stored++;
    }
    this.log.log(`disclosures: ${fetched} fetched, ${stored} stored`);
    return { fetched, stored };
  }

  /** Both chambers come back from one call, already normalised — including the
   *  owner and the filing link, which were added to that mapper for this. */
  private async fetchAll(pages: number): Promise<any[]> {
    try {
      return await this.fmp.getCongressional(pages);
    } catch (e: any) {
      this.log.warn(`disclosure feed failed: ${e?.message || e}`);
      return [];
    }
  }

  private async upsert(t: DisclosedTrade): Promise<void> {
    await this.q(
      `INSERT INTO ct_disclosures
         (id, member, bioguide, chamber, owner, ticker, action, amount_min, amount_max,
          transaction_date, disclosure_date, source_url)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (id) DO UPDATE SET
         -- A report can be amended, and §5 treats the disclosure date as a
         -- fact of its own: both dates are refreshed, never merged.
         amount_min = EXCLUDED.amount_min, amount_max = EXCLUDED.amount_max,
         transaction_date = EXCLUDED.transaction_date,
         disclosure_date = EXCLUDED.disclosure_date,
         source_url = COALESCE(EXCLUDED.source_url, ct_disclosures.source_url)`,
      [
        t.id, t.member, t.bioguide, t.chamber, t.owner, t.ticker, t.action,
        t.amountMin, t.amountMax, t.transactionDate, t.disclosureDate, t.sourceUrl,
      ],
    );
  }

  // ── Reads the flag engine needs ────────────────────────────────────────

  /**
   * Household trades in a ticker around an award date.
   *
   * Household, not filer: §2 Stage 1 says "aggregate at household level", and
   * a spouse's account is disclosed on the member's own report precisely
   * because the law treats it as theirs. Rows carry which account they came
   * from so the evidence chain can say "spouse" rather than implying the
   * member traded personally.
   */
  async householdTrades(ticker: string, awardDate: string, windowDays: number): Promise<DisclosedTrade[]> {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT id, member, bioguide, chamber, owner, ticker, action,
              amount_min::float8 AS amin, amount_max::float8 AS amax,
              transaction_date, disclosure_date, source_url
         FROM ct_disclosures
        WHERE ticker = upper($1)
          AND transaction_date BETWEEN ($2::date - ($3 || ' days')::interval)
                                   AND ($2::date + ($3 || ' days')::interval)
        ORDER BY transaction_date DESC
        LIMIT 400`,
      [ticker, awardDate, String(windowDays)],
    );
    return rows.map(row);
  }

  /**
   * The household's position in a ticker as at a date, net of sales.
   *
   * Returned only when the net is positive: a household that bought and then
   * sold out before the award did not hold it, and publishing them as a holder
   * would be a false statement about a named person.
   */
  async positionAt(member: string, ticker: string, asOf: string): Promise<HouseholdPosition | null> {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT owner, action, amount_min::float8 AS amin, amount_max::float8 AS amax, transaction_date
         FROM ct_disclosures
        WHERE lower(member) = lower($1) AND ticker = upper($2) AND transaction_date <= $3::date
        ORDER BY transaction_date`,
      [member, ticker, asOf],
    );
    if (!rows.length) return null;
    let net = 0;
    let buys = 0;
    let sells = 0;
    let firstBought: string | null = null;
    const owners = new Set<Owner>();
    for (const r of rows) {
      const mid = midpoint(r.amin, r.amax) ?? 0;
      owners.add(r.owner as Owner);
      if (String(r.action).toLowerCase().startsWith('b')) {
        net += mid;
        buys++;
        if (!firstBought) firstBought = iso(r.transaction_date);
      } else {
        net -= mid;
        sells++;
      }
    }
    if (net <= 0) return null;
    return {
      member,
      ticker: ticker.toUpperCase(),
      netValue: Math.round(net),
      buys,
      sells,
      firstBought,
      lastActivity: iso(rows[rows.length - 1].transaction_date),
      owners: [...owners],
    };
  }

  /** That household's typical disclosed trade, for §3's position-size factor. */
  async medianTrade(member: string): Promise<number | null> {
    await this.ensureTables();
    const r = (
      await this.q(
        `SELECT percentile_cont(0.5) WITHIN GROUP (
                  ORDER BY (COALESCE(amount_min,0) + COALESCE(amount_max, amount_min))/2.0
                )::float8 AS med
           FROM ct_disclosures
          WHERE lower(member) = lower($1) AND amount_min IS NOT NULL`,
        [member],
      )
    )?.[0];
    const v = Number(r?.med);
    return isFinite(v) && v > 0 ? v : null;
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT count(*)::int AS disclosures,
              count(DISTINCT member)::int AS members,
              count(DISTINCT ticker)::int AS tickers,
              count(*) FILTER (WHERE owner <> 'self')::int AS household_rows,
              count(*) FILTER (WHERE source_url IS NOT NULL)::int AS with_source_link,
              max(transaction_date) AS newest
         FROM ct_disclosures`,
    );
    return c;
  }
}

/** "Spouse", "Joint", "Self", "Dependent Child" → one of our five. */
export function normaliseOwner(raw: unknown): Owner {
  const t = String(raw || '').toLowerCase();
  if (t.includes('spouse')) return 'spouse';
  if (t.includes('joint')) return 'joint';
  if (t.includes('depend') || t.includes('child')) return 'dependent';
  if (t.includes('self') || t === 'c' || t.includes('filer')) return 'self';
  return 'unknown';
}

/** "$15,001 - $50,000" → { min: 15001, max: 50000 }. */
export function parseRange(raw: unknown): { min: number | null; max: number | null } {
  const s = String(raw || '');
  const nums = [...s.matchAll(/\$?\s*([\d,]+)/g)].map((m) => Number(m[1].replace(/,/g, '')));
  const clean = nums.filter((n) => isFinite(n) && n > 0);
  if (!clean.length) return { min: null, max: null };
  return { min: clean[0], max: clean.length > 1 ? clean[1] : clean[0] };
}

function shape(r: any): DisclosedTrade | null {
  const ticker = String(r?.ticker || '').toUpperCase().trim();
  const transactionDate = String(r?.transactionDate || '').slice(0, 10);
  if (!ticker || !/^\d{4}-\d{2}-\d{2}$/.test(transactionDate)) return null;
  const member = String(r?.politicianName || '').trim();
  if (!member) return null;
  const chamber: 'House' | 'Senate' = r?.chamber === 'Senate' ? 'Senate' : 'House';
  const action: 'Buy' | 'Sell' = r?.action === 'Sell' ? 'Sell' : 'Buy';
  const min = r?.amountMin ?? null;
  const max = r?.amountMax ?? null;
  const owner = normaliseOwner(r?.owner);
  return {
    // Stable across re-ingests: the same filing line must not duplicate.
    id: `${nameKey(member)}|${ticker}|${transactionDate}|${action}|${owner}|${min ?? 0}`,
    member,
    bioguide: r?.bioguideId ? String(r.bioguideId) : null,
    chamber,
    owner,
    ticker,
    action,
    amountMin: min,
    amountMax: max,
    transactionDate,
    disclosureDate: r?.reportedDate ? String(r.reportedDate).slice(0, 10) : null,
    sourceUrl: r?.sourceUrl ?? null,
  };
}

function row(r: any): DisclosedTrade {
  return {
    id: r.id,
    member: r.member,
    bioguide: r.bioguide,
    chamber: r.chamber,
    owner: r.owner,
    ticker: r.ticker,
    action: r.action,
    amountMin: r.amin,
    amountMax: r.amax,
    transactionDate: iso(r.transaction_date)!,
    disclosureDate: iso(r.disclosure_date),
    sourceUrl: r.source_url,
  };
}

function midpoint(min: number | null, max: number | null): number | null {
  if (min == null) return null;
  const v = (Number(min) + Number(max ?? min)) / 2;
  return isFinite(v) ? v : null;
}

function iso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
