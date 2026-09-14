import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { AwardsService } from './awards.service';
import { EntityResolutionService } from './entity-resolution.service';
import { agencyKey } from './jurisdiction';
import { checkCopy } from './cts';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 4: politicians on boards.
 *
 * "[politician P on board of company C] AND [C awarded contract by agency A]
 * AND [P previously served in / oversaw A, or currently holds office with
 * jurisdiction]. Requires a service-history field per person (offices held,
 * agencies led, committee history)."
 *
 * The roster is EDITORIAL, not scraped, and that is a deliberate reading of
 * the brief rather than a shortcut. §6 names DEF 14A and 8-K as the sources,
 * and those documents do identify directors — but whether a given director is
 * "a politician or senior official" and which agency they "previously served
 * in or oversaw" is a judgement about a person's career, made from their
 * biography. Guessing it from a proxy statement would put a claim about a
 * named individual on a public page on the strength of a string match, which
 * is the one thing §5 forbids.
 *
 * So: this service owns the roster, its service history and the flags; the
 * admin owns who goes in it. Every person carries the citation that put them
 * there, and it travels into the evidence chain like every other leg.
 */

export interface ServiceEntry {
  /** "Secretary of Defense", "Senator (Armed Services)", "Administrator, EPA" */
  office: string;
  /** USAspending agency names this office ran or had jurisdiction over. */
  agencies: string[];
  from: string | null;
  to: string | null;
}

@Injectable()
export class BoardRosterService {
  private readonly log = new Logger(BoardRosterService.name);
  private ready = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly awards: AwardsService,
    private readonly vendors: EntityResolutionService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_officials (
      slug            varchar(96) PRIMARY KEY,
      name            text NOT NULL,
      /* Current or former office-holder; a sitting member can also sit on a
         board, and §4's flag condition allows either. */
      still_serving   boolean NOT NULL DEFAULT false,
      service_history jsonb NOT NULL DEFAULT '[]'::jsonb,
      source          text,
      created_by      varchar(64),
      updated_at      timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS ct_board_seats (
      id          bigserial PRIMARY KEY,
      slug        varchar(96) NOT NULL,
      ticker      varchar(16) NOT NULL,
      company     text,
      role        varchar(64) NOT NULL DEFAULT 'Director',
      since       date,
      until       date,
      /* The filing that evidences the seat — DEF 14A or 8-K (§6). */
      source_url  text,
      source_form varchar(16),
      created_by  varchar(64),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS ct_board_seats_uniq
      ON ct_board_seats (slug, ticker, COALESCE(since, '1900-01-01'::date))`);
    this.ready = true;
  }

  // ── Roster admin ───────────────────────────────────────────────────────

  async upsertOfficial(o: {
    name: string;
    stillServing?: boolean;
    serviceHistory?: ServiceEntry[];
    source?: string;
  }, actor: string) {
    await this.ensureTables();
    const slug = slugify(o.name);
    if (!slug) return null;
    await this.q(
      `INSERT INTO ct_officials (slug, name, still_serving, service_history, source, created_by, updated_at)
       VALUES ($1,$2,$3,$4::jsonb,$5,$6, now())
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name, still_serving = EXCLUDED.still_serving,
         service_history = EXCLUDED.service_history, source = COALESCE(EXCLUDED.source, ct_officials.source),
         updated_at = now()`,
      [slug, o.name, !!o.stillServing, JSON.stringify(o.serviceHistory ?? []), o.source ?? null, actor],
    );
    return { slug };
  }

  async upsertSeat(s: {
    name: string;
    ticker: string;
    company?: string;
    role?: string;
    since?: string | null;
    until?: string | null;
    sourceUrl?: string;
    sourceForm?: string;
  }, actor: string) {
    await this.ensureTables();
    const slug = slugify(s.name);
    if (!slug || !s.ticker) return null;
    await this.q(
      `INSERT INTO ct_board_seats (slug, ticker, company, role, since, until, source_url, source_form, created_by, updated_at)
       VALUES ($1,upper($2),$3,$4,$5,$6,$7,$8,$9, now())
       ON CONFLICT (slug, ticker, COALESCE(since, '1900-01-01'::date)) DO UPDATE SET
         company = COALESCE(EXCLUDED.company, ct_board_seats.company),
         role = EXCLUDED.role, until = EXCLUDED.until,
         source_url = COALESCE(EXCLUDED.source_url, ct_board_seats.source_url),
         source_form = COALESCE(EXCLUDED.source_form, ct_board_seats.source_form),
         updated_at = now()`,
      [slug, s.ticker, s.company ?? null, s.role ?? 'Director', s.since ?? null, s.until ?? null,
       s.sourceUrl ?? null, s.sourceForm ?? null, actor],
    );
    return { slug, ticker: s.ticker.toUpperCase() };
  }

  async roster(limit = 200) {
    await this.ensureTables();
    return this.q(
      `SELECT o.slug, o.name, o.still_serving, o.service_history, o.source,
              COALESCE(json_agg(json_build_object(
                'ticker', b.ticker, 'company', b.company, 'role', b.role,
                'since', b.since, 'until', b.until, 'sourceUrl', b.source_url, 'form', b.source_form
              )) FILTER (WHERE b.id IS NOT NULL), '[]'::json) AS seats
         FROM ct_officials o
         LEFT JOIN ct_board_seats b ON b.slug = o.slug
        GROUP BY o.slug, o.name, o.still_serving, o.service_history, o.source
        ORDER BY o.name LIMIT $1`,
      [limit],
    );
  }

  // ── The second flag type ───────────────────────────────────────────────

  /**
   * A board seat becomes a flag when the company wins an award from an agency
   * the director previously ran or oversaw.
   *
   * The seat must be CURRENT at the award date. A director who left the board
   * two years before the contract is not a proximity — including them would
   * inflate the leaderboard with relationships that had already ended.
   */
  async run(days = 180): Promise<{ awards: number; flags: number }> {
    await this.ensureTables();
    const awards = await this.awards.recent(days);
    let flags = 0;

    for (const award of awards) {
      const vendor = await this.vendors.lookup(award.recipientUei, award.recipientName);
      if (!vendor || vendor.status !== 'ticker' || !vendor.ticker) continue;

      const seats: any[] = await this.q(
        `SELECT b.slug, b.ticker, b.company, b.role, b.since, b.until, b.source_url, b.source_form,
                o.name, o.service_history, o.still_serving
           FROM ct_board_seats b JOIN ct_officials o ON o.slug = b.slug
          WHERE b.ticker = $1
            AND (b.since IS NULL OR b.since <= $2::date)
            AND (b.until IS NULL OR b.until >= $2::date)`,
        [vendor.ticker, award.actionDate],
      );

      for (const seat of seats) {
        const history: ServiceEntry[] = seat.service_history || [];
        const agencyKeys = new Set(
          [agencyKey(award.agency), agencyKey(award.subAgency || '')].filter(Boolean),
        );
        const match = history.find((h) => (h.agencies || []).some((a) => agencyKeys.has(agencyKey(a))));
        if (!match) continue;

        const headline =
          `${seat.name} serves as ${seat.role} of ${seat.company || vendor.listedName || vendor.vendorName} ` +
          `(${vendor.ticker}). ${seat.name} previously served as ${match.office}, ` +
          `which covers the ${award.subAgency || award.agency}. That agency awarded ` +
          `$${Math.round(award.amount / 1e6)}M to the company on ${award.actionDate}.`;
        const copy = checkCopy(headline);
        if (!copy.ok) {
          this.log.error(`board headline rejected for ${seat.name}: ${copy.violations.map((v) => v.term).join(', ')}`);
          continue;
        }

        const evidence = {
          boardSeat: {
            source: seat.source_form || 'SEC filing',
            url: seat.source_url,
            role: seat.role,
            since: isoOf(seat.since),
            until: isoOf(seat.until),
          },
          serviceHistory: { office: match.office, from: match.from, to: match.to, agencies: match.agencies },
          award: {
            source: 'USAspending.gov',
            awardId: award.awardId,
            url: `https://www.usaspending.gov/award/${encodeURIComponent(award.awardKey)}`,
            agency: award.agency,
            subAgency: award.subAgency,
            amount: award.amount,
            actionDate: award.actionDate,
          },
          vendorResolution: { method: vendor.method, chain: vendor.evidence },
        };

        await this.q(
          `INSERT INTO ct_flags
             (flag_type, member, ticker, company, award_key, agency, sub_agency, award_value, award_date,
              committee, role, headline, evidence, status, updated_at)
           VALUES ('board',$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,'pending', now())
           ON CONFLICT (member, award_key, ticker, COALESCE(trade_date, '1900-01-01'::date), committee)
           DO UPDATE SET award_value = EXCLUDED.award_value, headline = EXCLUDED.headline,
                         evidence = EXCLUDED.evidence,
                         status = CASE WHEN ct_flags.status = 'retired' THEN 'retired' ELSE 'pending' END,
                         updated_at = now()`,
          [
            seat.name, vendor.ticker, seat.company || vendor.listedName, award.awardKey,
            award.agency, award.subAgency, award.amount, award.actionDate,
            // The "committee" column carries the office for a board flag, so
            // one table holds both flag types without a second schema.
            match.office, 'member', headline, JSON.stringify(evidence),
          ],
        );
        flags++;
      }
    }
    this.log.log(`board flags: ${awards.length} awards scanned, ${flags} flags`);
    return { awards: awards.length, flags };
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT (SELECT count(*)::int FROM ct_officials) AS officials,
              (SELECT count(*)::int FROM ct_officials WHERE jsonb_array_length(service_history) > 0) AS with_history,
              (SELECT count(*)::int FROM ct_board_seats) AS seats`,
    );
    return c;
  }
}

function slugify(name: string): string {
  return String(name || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 96);
}

function isoOf(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
