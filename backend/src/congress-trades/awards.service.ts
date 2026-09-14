import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 2: the contract awards feed.
 *
 * "Ingest federal contract awards daily from USAspending.gov / FPDS-NG APIs:
 * awarding agency + sub-agency, vendor (UEI), award value, date, description,
 * award type (new, modification, IDV)" with a "materiality filter:
 * configurable minimum award value (suggest $1M default) and de-dup of
 * modifications so a $50K paperwork change doesn't fire the engine."
 *
 * USAspending is free and needs no key. Two things about it shape this code:
 *
 *  • "Award Amount" on a contract is the TOTAL obligated over the award's
 *    life, not the value of one action. The Sandia management contract comes
 *    back as $43B against a 2017 start date. Filtering on that number alone
 *    would put decade-old mega-contracts at the top of a feed that is supposed
 *    to be about what happened this week, so the window filters on when the
 *    award was ACTIONED and the amount is recorded for what it is.
 *
 *  • The same award reappears every time it is modified. Rows are keyed on
 *    USAspending's own `generated_internal_id`, so a modification updates the
 *    award we already have instead of creating a second one — which is the
 *    de-dup §2 asks for, done by identity rather than by guessing from
 *    amounts.
 */

const SEARCH_URL = 'https://api.usaspending.gov/api/v2/search/spending_by_award/';
const RECIPIENT_URL = 'https://api.usaspending.gov/api/v2/recipient/';

/** Contract award types. Grants and loans are out of scope: §1 is about
 *  "companies those agencies award contracts to". */
const AWARD_TYPE_CODES = ['A', 'B', 'C', 'D'];

const FIELDS = [
  'Award ID', 'Recipient Name', 'Recipient UEI', 'Awarding Agency',
  'Awarding Sub Agency', 'Award Amount', 'Base Obligation Date', 'Start Date',
  'Description', 'recipient_id', 'generated_internal_id', 'Last Modified Date',
  'Contract Award Type',
];

export interface AwardRow {
  awardKey: string;
  awardId: string | null;
  recipientName: string;
  recipientUei: string | null;
  recipientId: string | null;
  agency: string;
  subAgency: string | null;
  amount: number;
  actionDate: string;
  description: string | null;
  lastModified: string | null;
  /** §2 Stage 2 asks for the "award type (new, modification, IDV)". */
  awardType: string | null;
}

@Injectable()
export class AwardsService {
  private readonly log = new Logger(AwardsService.name);
  private ready = false;

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_awards (
      award_key      text PRIMARY KEY,
      award_id       text,
      recipient_name text NOT NULL,
      recipient_uei  varchar(24),
      recipient_id   text,
      agency         text NOT NULL,
      sub_agency     text,
      amount         numeric(20,2) NOT NULL,
      action_date    date NOT NULL,
      description    text,
      award_type     varchar(48),
      last_modified  timestamptz,
      seen_at        timestamptz NOT NULL DEFAULT now(),
      updated_at     timestamptz NOT NULL DEFAULT now()
    )`);
    // Added after the table shipped, so existing deployments migrate on boot
    // rather than needing a hand-run migration.
    await this.q(`ALTER TABLE ct_awards ADD COLUMN IF NOT EXISTS award_type varchar(48)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_awards_date_idx ON ct_awards (action_date DESC)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_awards_uei_idx ON ct_awards (recipient_uei)`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_awards_agency_idx ON ct_awards (agency)`);

    await this.q(`CREATE TABLE IF NOT EXISTS ct_config (
      key        varchar(48) PRIMARY KEY,
      value      jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    this.ready = true;
  }

  // ── Config (§8: "Materiality threshold + timing window defaults" — George) ─

  async config(): Promise<{ minAwardValue: number; windowDays: number }> {
    await this.ensureTables();
    const row = (await this.q(`SELECT value FROM ct_config WHERE key = 'engine'`))?.[0];
    const v = row?.value || {};
    return {
      // §2's suggested default, changeable without a deploy because §8 leaves
      // the final number with George.
      minAwardValue: Number(v.minAwardValue) > 0 ? Number(v.minAwardValue) : 1_000_000,
      // §2 Stage 3: "trades within 180 days before/after award".
      windowDays: Number(v.windowDays) > 0 ? Number(v.windowDays) : 180,
    };
  }

  async setConfig(next: Record<string, any>, actor: string): Promise<any> {
    await this.ensureTables();
    const cur = await this.config();
    const merged = {
      minAwardValue:
        Number(next?.minAwardValue) > 0 ? Number(next.minAwardValue) : cur.minAwardValue,
      windowDays: Number(next?.windowDays) > 0 ? Number(next.windowDays) : cur.windowDays,
    };
    await this.q(
      `INSERT INTO ct_config (key, value, updated_at) VALUES ('engine', $1::jsonb, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [JSON.stringify(merged)],
    );
    this.log.log(`engine config changed by ${actor}: ${JSON.stringify(merged)}`);
    return merged;
  }

  // ── Ingest ─────────────────────────────────────────────────────────────

  /**
   * Pull NEW awards from the last `days`, above the materiality floor.
   *
   * `new_awards_only` rather than `action_date`, and the difference is the
   * whole point of §2's materiality rule. Filtering on action date returns
   * every award MODIFIED in the window, which is mostly decade-old contracts
   * receiving paperwork: a live run stored 400 of them and only 9 had a base
   * obligation date inside six months. §2 asks for exactly this — "de-dup of
   * modifications so a $50K paperwork change doesn't fire the engine" — and a
   * modification to an award we already hold still updates it through the
   * upsert below.
   *
   * Paged: USAspending caps a page at 100 and reports `hasNext`, and a busy
   * fortnight at $1M+ is thousands of awards, so a single page would quietly
   * truncate the feed.
   */
  async ingest(days = 14, maxPages = 40): Promise<{ fetched: number; stored: number; floor: number }> {
    await this.ensureTables();
    const { minAwardValue } = await this.config();
    const to = new Date();
    const from = new Date(to.getTime() - days * 86_400_000);
    let page = 1;
    let fetched = 0;
    let stored = 0;

    // One builder for the request, because the body used to be written out
    // twice — once for the call and once for its retry — and a filter fixed in
    // one of them would silently not apply to the other.
    const body = (page: number) => ({
      filters: {
        award_type_codes: AWARD_TYPE_CODES,
        time_period: [
          {
            start_date: from.toISOString().slice(0, 10),
            end_date: to.toISOString().slice(0, 10),
            date_type: 'new_awards_only',
          },
        ],
        // `award_amounts`, PLURAL. USAspending accepts the singular without
        // complaint, ignores it, and says so only in a `messages` array nobody
        // reads: a live check came back with $1,211 awards against a $1M floor.
        // §2's materiality filter was not being applied at all.
        award_amounts: [{ lower_bound: minAwardValue }],
      },
      fields: FIELDS,
      limit: 100,
      page,
    });

    while (page <= maxPages) {
      let results: any[] = [];
      let hasNext = false;
      try {
        const { data } = await axios.post(SEARCH_URL, body(page), { timeout: 90_000 });
        results = data?.results || [];
        hasNext = !!data?.page_metadata?.hasNext;
      } catch (e: any) {
        // Sorting by award amount across a multi-day window makes USAspending
        // order the whole result set and it times out at 45s; ingest wants
        // every row anyway, so the sort is gone and the timeout is generous.
        // One retry, because a single slow response should not cost the night.
        this.log.warn(`USAspending page ${page} failed (${e?.message || e}) — retrying once`);
        try {
          const { data } = await axios.post(SEARCH_URL, body(page), { timeout: 120_000 });
          results = data?.results || [];
          hasNext = !!data?.page_metadata?.hasNext;
        } catch (e2: any) {
          this.log.warn(`USAspending page ${page} failed again: ${e2?.message || e2}`);
          break;
        }
      }
      if (!results.length) break;

      for (const r of results) {
        fetched++;
        const row = shape(r);
        if (!row) continue;
        // Belt as well as braces on the materiality floor: this filter was
        // silently dropped by the API once already, and a feed of $1,200
        // awards would bury the leaderboard rather than break it, which is
        // the kind of failure nobody notices.
        if (row.amount < minAwardValue) continue;
        await this.upsert(row);
        stored++;
      }
      if (!hasNext) break;
      page++;
    }

    this.log.log(`awards: ${fetched} fetched, ${stored} stored, floor $${minAwardValue.toLocaleString()}`);
    return { fetched, stored, floor: minAwardValue };
  }

  private async upsert(a: AwardRow): Promise<void> {
    await this.q(
      `INSERT INTO ct_awards
         (award_key, award_id, recipient_name, recipient_uei, recipient_id, agency, sub_agency,
          amount, action_date, description, award_type, last_modified, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12, now())
       ON CONFLICT (award_key) DO UPDATE SET
         -- A modification of an award we already hold updates it in place.
         -- This is the de-dup §2 asks for, done on USAspending's own identity
         -- for the award rather than by comparing amounts and hoping.
         amount = EXCLUDED.amount,
         agency = EXCLUDED.agency,
         sub_agency = EXCLUDED.sub_agency,
         description = COALESCE(EXCLUDED.description, ct_awards.description),
         award_type = COALESCE(EXCLUDED.award_type, ct_awards.award_type),
         last_modified = EXCLUDED.last_modified,
         updated_at = now()`,
      [
        a.awardKey, a.awardId, a.recipientName, a.recipientUei, a.recipientId,
        a.agency, a.subAgency, a.amount, a.actionDate, a.description, a.awardType, a.lastModified,
      ],
    );
  }

  /** Awards we hold, newest first, for the flag engine. */
  async recent(days: number, limit = 5000): Promise<AwardRow[]> {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT award_key, award_id, recipient_name, recipient_uei, recipient_id, agency, sub_agency,
              amount::float8 AS amount, action_date, description, award_type, last_modified
         FROM ct_awards
        WHERE action_date >= (now() - ($1 || ' days')::interval)::date
        ORDER BY action_date DESC
        LIMIT $2`,
      [String(days), limit],
    );
    return rows.map((r) => ({
      awardKey: r.award_key,
      awardId: r.award_id,
      recipientName: r.recipient_name,
      recipientUei: r.recipient_uei,
      recipientId: r.recipient_id,
      agency: r.agency,
      subAgency: r.sub_agency,
      amount: Number(r.amount),
      actionDate: iso(r.action_date)!,
      description: r.description,
      awardType: r.award_type ?? null,
      lastModified: r.last_modified ? iso(r.last_modified) : null,
    }));
  }

  async byKey(awardKey: string): Promise<AwardRow | null> {
    await this.ensureTables();
    const r = (
      await this.q(
        `SELECT award_key, award_id, recipient_name, recipient_uei, recipient_id, agency, sub_agency,
                amount::float8 AS amount, action_date, description, award_type, last_modified
           FROM ct_awards WHERE award_key = $1`,
        [awardKey],
      )
    )?.[0];
    if (!r) return null;
    return {
      awardKey: r.award_key, awardId: r.award_id, recipientName: r.recipient_name,
      recipientUei: r.recipient_uei, recipientId: r.recipient_id, agency: r.agency,
      subAgency: r.sub_agency, amount: Number(r.amount), actionDate: iso(r.action_date)!,
      description: r.description, awardType: r.award_type ?? null,
      lastModified: r.last_modified ? iso(r.last_modified) : null,
    };
  }

  /**
   * The recipient's parent, straight from USAspending.
   *
   * Stage 3 says "Subsidiaries roll up to the listed parent", and this is the
   * first and cheapest place to learn that a vendor has one: a subsidiary's
   * recipient record names the parent and its UEI.
   */
  async parentOf(recipientId: string): Promise<{ name: string | null; uei: string | null } | null> {
    if (!recipientId) return null;
    try {
      const { data } = await axios.get(`${RECIPIENT_URL}${encodeURIComponent(recipientId)}/`, {
        timeout: 25_000,
      });
      const name = data?.parent_name ?? (Array.isArray(data?.parents) ? data.parents[0]?.parent_name : null);
      const uei = data?.parent_uei ?? (Array.isArray(data?.parents) ? data.parents[0]?.parent_uei : null);
      return name || uei ? { name: name ?? null, uei: uei ?? null } : null;
    } catch {
      return null;
    }
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT count(*)::int AS awards,
              count(*) FILTER (WHERE action_date >= (now() - interval '30 days')::date)::int AS last_30d,
              max(action_date) AS newest,
              sum(amount)::float8 AS total_value
         FROM ct_awards`,
    );
    return { ...c, config: await this.config() };
  }
}

function shape(r: any): AwardRow | null {
  const awardKey = String(r?.generated_internal_id || r?.internal_id || '').trim();
  const recipientName = String(r?.['Recipient Name'] || '').trim();
  const agency = String(r?.['Awarding Agency'] || '').trim();
  const amount = Number(r?.['Award Amount']);
  // "Start Date" is the period of PERFORMANCE start, not when the award was
  // made: the Sandia management contract carries 2017 and a stored row came
  // back dated 1984. Stage 3 measures the trade window against when the award
  // happened, so the obligation date is the one that belongs here.
  const actionDate = String(r?.['Base Obligation Date'] || r?.['Start Date'] || '').slice(0, 10);
  if (!awardKey || !recipientName || !agency || !isFinite(amount) || !/^\d{4}-\d{2}-\d{2}$/.test(actionDate)) {
    return null;
  }
  return {
    awardKey,
    awardId: r?.['Award ID'] ? String(r['Award ID']) : null,
    recipientName,
    recipientUei: r?.['Recipient UEI'] ? String(r['Recipient UEI']) : null,
    recipientId: r?.recipient_id ? String(r.recipient_id) : null,
    agency,
    subAgency: r?.['Awarding Sub Agency'] ? String(r['Awarding Sub Agency']) : null,
    amount,
    actionDate,
    description: r?.Description ? String(r.Description).slice(0, 4000) : null,
    awardType: awardTypeOf(r, awardKey),
    lastModified: r?.['Last Modified Date'] ? String(r['Last Modified Date']) : null,
  };
}

/**
 * §2 Stage 2 wants the award type. USAspending returns it as "Contract Award
 * Type" — verified live, it carries values like "DELIVERY ORDER" and "BPA
 * CALL"; the neighbouring "Award Type" field is null for contracts and belongs
 * to assistance awards.
 *
 * When it is absent the identifier still tells us the shape: USAspending
 * prefixes an indefinite-delivery vehicle `CONT_IDV_` and a contract award
 * `CONT_AWD_`, which is the new-versus-IDV distinction the brief names.
 */
function awardTypeOf(r: any, awardKey: string): string | null {
  const stated = r?.['Contract Award Type'];
  if (stated) return String(stated).slice(0, 48);
  if (/^CONT_IDV_/i.test(awardKey)) return 'IDV';
  if (/^CONT_AWD_/i.test(awardKey)) return 'CONTRACT AWARD';
  return null;
}

function iso(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
