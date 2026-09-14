import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import {
  JURISDICTION_SEED,
  JurisdictionRule,
  agencyKey,
  committeeKey,
} from './jurisdiction';
import { CommitteeRole } from './cts';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 1: the influence map.
 *
 * "Every member's committee and subcommittee assignments … with role weight
 * (chair > ranking member > member)" plus "Committee → agency jurisdiction
 * table: a maintained mapping … versioned, human-maintained in admin".
 *
 * The congress module already reads the unitedstates project roster, but it
 * keeps only a flat list of committee NAMES per member: it collapses
 * subcommittees into their parent and drops the member's title. Both are
 * scored inputs here (§3 gives committee role 30% and ranks a subcommittee
 * seat above full-committee-only), so this service reads the same public files
 * and keeps what the scorer needs, rather than weakening a roster four other
 * surfaces already depend on.
 */

const MEMBERSHIP_URL =
  'https://unitedstates.github.io/congress-legislators/committee-membership-current.json';
const COMMITTEES_URL =
  'https://unitedstates.github.io/congress-legislators/committees-current.json';
const LEGISLATORS_URL =
  'https://unitedstates.github.io/congress-legislators/legislators-current.json';

export interface Assignment {
  bioguide: string;
  member: string;
  /** Committee or subcommittee name as published. */
  committee: string;
  /** Parent committee name when this is a subcommittee. */
  parent: string | null;
  isSubcommittee: boolean;
  role: CommitteeRole;
}

export interface JurisdictionHit {
  committee: string;
  parent: string | null;
  isSubcommittee: boolean;
  role: CommitteeRole;
  kind: 'oversight' | 'appropriations';
  /** The rule's own source line, carried into the evidence chain. */
  source: string;
  /** Which version of the table judged this. §2 Stage 3 requires it. */
  tableVersion: number;
}

@Injectable()
export class InfluenceMapService {
  private readonly log = new Logger(InfluenceMapService.name);
  private ready = false;
  private cache: { ts: number; rows: Assignment[] } | null = null;
  private readonly TTL_MS = 12 * 60 * 60 * 1000;

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_assignments (
      bioguide       varchar(16) NOT NULL,
      member         text NOT NULL,
      committee      text NOT NULL,
      parent         text,
      is_subcommittee boolean NOT NULL DEFAULT false,
      role           varchar(16) NOT NULL DEFAULT 'member',
      updated_at     timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (bioguide, committee)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_assignments_member_idx ON ct_assignments (lower(member))`);

    // Versioned, because a published row records the version it was judged
    // against and a later edit must not silently rewrite it (§2 Stage 3).
    await this.q(`CREATE TABLE IF NOT EXISTS ct_jurisdiction (
      id          bigserial PRIMARY KEY,
      version     int NOT NULL,
      committee   text NOT NULL,
      agency      text NOT NULL,
      kind        varchar(16) NOT NULL DEFAULT 'oversight',
      source      text,
      active      boolean NOT NULL DEFAULT true,
      created_by  varchar(64),
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE UNIQUE INDEX IF NOT EXISTS ct_jurisdiction_uniq
      ON ct_jurisdiction (version, lower(committee), lower(agency))`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_jurisdiction_version_idx ON ct_jurisdiction (version) WHERE active`);
    this.ready = true;
  }

  // ── Assignments ────────────────────────────────────────────────────────

  /**
   * Refresh every member's committee and subcommittee seats, with title.
   *
   * The membership file is keyed by committee code; a subcommittee's code is
   * its parent's code with digits appended ("HSAS" → "HSAS28"), which is how
   * the parent is recovered. Titles in that file are free text — "Chair",
   * "Chairman", "Ranking Member", "Vice Chair" — so they are normalised here
   * rather than at every call site.
   */
  async refreshAssignments(): Promise<number> {
    await this.ensureTables();
    const [membership, committees, legislators] = await Promise.all([
      axios.get<Record<string, any[]>>(MEMBERSHIP_URL, { timeout: 30_000 }).then((r) => r.data),
      axios.get<any[]>(COMMITTEES_URL, { timeout: 30_000 }).then((r) => r.data),
      axios.get<any[]>(LEGISLATORS_URL, { timeout: 30_000 }).then((r) => r.data),
    ]);

    const nameByCode = new Map<string, string>();
    const parentByCode = new Map<string, string>();
    for (const c of committees || []) {
      if (!c?.thomas_id) continue;
      nameByCode.set(c.thomas_id, c.name);
      for (const sub of c.subcommittees || []) {
        const code = `${c.thomas_id}${sub.thomas_id}`;
        nameByCode.set(code, sub.name);
        parentByCode.set(code, c.name);
      }
    }

    const memberName = new Map<string, string>();
    for (const l of legislators || []) {
      const bid = l?.id?.bioguide;
      if (!bid) continue;
      const n = l?.name || {};
      memberName.set(bid, String(n.official_full || `${n.first || ''} ${n.last || ''}`).trim());
    }

    const rows: Assignment[] = [];
    for (const [code, mems] of Object.entries(membership || {})) {
      const committee = nameByCode.get(code);
      if (!committee) continue;
      const parent = parentByCode.get(code) ?? null;
      for (const m of (mems as any[]) || []) {
        const bioguide = m?.bioguide;
        if (!bioguide) continue;
        rows.push({
          bioguide,
          member: memberName.get(bioguide) || String(m?.name || bioguide),
          committee,
          parent,
          isSubcommittee: !!parent,
          role: normaliseRole(m?.title),
        });
      }
    }

    // Replace wholesale: a member who left a committee must lose the seat, and
    // an upsert alone would leave the stale row behind scoring forever.
    await this.q(`DELETE FROM ct_assignments`);
    for (const r of rows) {
      await this.q(
        `INSERT INTO ct_assignments (bioguide, member, committee, parent, is_subcommittee, role, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6, now())
         ON CONFLICT (bioguide, committee) DO UPDATE SET
           member = EXCLUDED.member, parent = EXCLUDED.parent,
           is_subcommittee = EXCLUDED.is_subcommittee, role = EXCLUDED.role, updated_at = now()`,
        [r.bioguide, r.member, r.committee, r.parent, r.isSubcommittee, r.role],
      );
    }
    this.cache = null;
    this.log.log(`influence map: ${rows.length} committee seats across ${new Set(rows.map((r) => r.bioguide)).size} members`);
    return rows.length;
  }

  async assignments(): Promise<Assignment[]> {
    await this.ensureTables();
    if (this.cache && Date.now() - this.cache.ts < this.TTL_MS) return this.cache.rows;
    const rows: any[] = await this.q(
      `SELECT bioguide, member, committee, parent, is_subcommittee, role FROM ct_assignments`,
    );
    const out = rows.map((r) => ({
      bioguide: r.bioguide,
      member: r.member,
      committee: r.committee,
      parent: r.parent,
      isSubcommittee: r.is_subcommittee,
      role: r.role as CommitteeRole,
    }));
    this.cache = { ts: Date.now(), rows: out };
    return out;
  }

  /** Seats for one member, matched on name because the trade feed carries a
   *  name and no bioguide. */
  async seatsFor(memberName: string): Promise<Assignment[]> {
    const all = await this.assignments();
    const want = nameKey(memberName);
    return all.filter((a) => nameKey(a.member) === want);
  }

  // ── Jurisdiction table ─────────────────────────────────────────────────

  async currentVersion(): Promise<number> {
    await this.ensureTables();
    const row = (await this.q(`SELECT max(version) AS v FROM ct_jurisdiction WHERE active`))?.[0];
    return Number(row?.v || 0);
  }

  /** Publish the seed as version 1 if the table has never been populated. */
  async seedIfEmpty(): Promise<number> {
    await this.ensureTables();
    if ((await this.currentVersion()) > 0) return 0;
    let n = 0;
    for (const rule of JURISDICTION_SEED) {
      for (const agency of rule.agencies) {
        await this.q(
          `INSERT INTO ct_jurisdiction (version, committee, agency, kind, source, created_by)
           VALUES (1,$1,$2,$3,$4,'seed')
           ON CONFLICT DO NOTHING`,
          [rule.committee, agency, rule.kind, rule.source],
        );
        n++;
      }
    }
    this.log.log(`jurisdiction table seeded at version 1 with ${n} mappings`);
    return n;
  }

  async rules(version?: number): Promise<Array<JurisdictionRule & { version: number }>> {
    await this.ensureTables();
    const v = version ?? (await this.currentVersion());
    const rows: any[] = await this.q(
      `SELECT committee, agency, kind, source, version FROM ct_jurisdiction WHERE active AND version = $1`,
      [v],
    );
    const byCommittee = new Map<string, JurisdictionRule & { version: number }>();
    for (const r of rows) {
      const key = `${r.committee}|${r.kind}`;
      const hit = byCommittee.get(key) ?? {
        committee: r.committee,
        agencies: [],
        kind: r.kind,
        source: r.source,
        version: r.version,
      };
      hit.agencies.push(r.agency);
      byCommittee.set(key, hit);
    }
    return [...byCommittee.values()];
  }

  /**
   * Does this member's committee service give them jurisdiction over the
   * agency that made this award?
   *
   * Returns EVERY qualifying seat, not the first: a member can sit on both the
   * authorising committee and the appropriations subcommittee for the same
   * department, and the strongest seat is what should score. The caller picks.
   */
  async jurisdictionFor(
    memberName: string,
    awardingAgency: string,
    awardingSubAgency: string | null,
  ): Promise<JurisdictionHit[]> {
    const [seats, rules, version] = await Promise.all([
      this.seatsFor(memberName),
      this.rules(),
      this.currentVersion(),
    ]);
    if (!seats.length || !rules.length) return [];

    const agencyKeys = new Set([agencyKey(awardingAgency), agencyKey(awardingSubAgency || '')].filter(Boolean));
    const out: JurisdictionHit[] = [];
    for (const seat of seats) {
      const seatKey = committeeKey(seat.committee);
      for (const rule of rules) {
        if (committeeKey(rule.committee) !== seatKey) continue;
        if (!rule.agencies.some((a) => agencyKeys.has(agencyKey(a)))) continue;
        out.push({
          committee: seat.committee,
          parent: seat.parent,
          isSubcommittee: seat.isSubcommittee,
          role: seat.role,
          kind: rule.kind,
          source: rule.source,
          tableVersion: version,
        });
      }
    }
    return out;
  }

  // ── Admin ──────────────────────────────────────────────────────────────

  /** Add or retire a mapping. Editing always writes into a NEW version so
   *  published rows keep pointing at the table that judged them. */
  async editJurisdiction(
    changes: Array<{ committee: string; agency: string; kind?: string; source?: string; remove?: boolean }>,
    actor: string,
  ): Promise<{ version: number; rows: number }> {
    await this.ensureTables();
    const from = await this.currentVersion();
    const version = from + 1;
    const existing: any[] = await this.q(
      `SELECT committee, agency, kind, source FROM ct_jurisdiction WHERE active AND version = $1`,
      [from],
    );
    const key = (c: string, a: string) => `${c.toLowerCase()}|${a.toLowerCase()}`;
    const map = new Map(existing.map((r) => [key(r.committee, r.agency), r]));
    for (const c of changes || []) {
      if (!c?.committee || !c?.agency) continue;
      if (c.remove) map.delete(key(c.committee, c.agency));
      else
        map.set(key(c.committee, c.agency), {
          committee: c.committee,
          agency: c.agency,
          kind: c.kind === 'appropriations' ? 'appropriations' : 'oversight',
          source: c.source ?? null,
        });
    }
    for (const r of map.values()) {
      await this.q(
        `INSERT INTO ct_jurisdiction (version, committee, agency, kind, source, created_by)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING`,
        [version, r.committee, r.agency, r.kind, r.source, actor],
      );
    }
    this.log.log(`jurisdiction table version ${version} published by ${actor} (${map.size} mappings)`);
    return { version, rows: map.size };
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT (SELECT count(*)::int FROM ct_assignments) AS seats,
              (SELECT count(DISTINCT bioguide)::int FROM ct_assignments) AS members,
              (SELECT count(*)::int FROM ct_assignments WHERE is_subcommittee) AS subcommittee_seats,
              (SELECT count(*)::int FROM ct_jurisdiction WHERE active) AS jurisdiction_rows`,
    );
    return { ...c, jurisdictionVersion: await this.currentVersion() };
  }
}

/** "Chair", "Chairman", "Ranking Member", "Vice Chair" → our four roles. */
export function normaliseRole(title: unknown): CommitteeRole {
  const t = String(title || '').toLowerCase();
  if (/vice\s*chair/.test(t)) return 'viceChair';
  if (/ranking/.test(t)) return 'ranking';
  if (/chair/.test(t)) return 'chair';
  return 'member';
}

/**
 * Names arrive differently from every source — "Nancy Pelosi", "Pelosi,
 * Nancy", "Hon. Nancy Pelosi" — so matching is on first + last, lowercased,
 * with honorifics and middle initials dropped.
 */
export function nameKey(raw: string): string {
  let s = String(raw || '')
    .toLowerCase()
    .replace(/\b(hon|mr|mrs|ms|dr|rep|sen|senator|representative)\.?\b/g, ' ')
    .replace(/[^a-z, ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (s.includes(',')) {
    const [last, first] = s.split(',').map((x) => x.trim());
    s = `${first} ${last}`.trim();
  }
  const parts = s.split(' ').filter((p) => p.length > 1);
  if (parts.length < 2) return s;
  return `${parts[0]} ${parts[parts.length - 1]}`;
}
