import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { nameKey } from '../congress-trades/influence-map.service';
import { agencyKey } from '../congress-trades/jurisdiction';

/**
 * POINT-IN-TIME SNAPSHOT STORE — the missing as-of dimension under Brief v9 §5.
 *
 * WHY THIS EXISTS
 *
 * §5 calibration can score C1/C2/C7/C8 historically because their inputs are
 * already dated: a trade has a transaction date, a price has a bar date. It
 * cannot score C3 (committee influence), C4 (contract alignment), C5 (Brief v7
 * buyer grades) or C6 (relative conviction against a member's own median),
 * because every one of those reads a table that holds CURRENT STATE ONLY:
 *
 *   ct_assignments     — the roster as it stands today. A member who joined
 *                        Armed Services in 2023 looks like they sat there in
 *                        2019 too, because the row carries no term.
 *   gov_contract_cache — one row per ticker, overwritten on each refresh, with
 *                        a trailing-12-month figure that is trailing from NOW.
 *   wt_member_stats    — a grade recomputed from scratch every run.
 *   congressional_transactions medians — computable as-of, but only if you fix
 *                        the cut; nothing records what the median WAS.
 *
 * Scoring a 2019 buy with any of those is lookahead: it hands the model facts
 * that did not exist on the date it is pretending to trade. So §5 excludes
 * them, and the calibration is thinner for it.
 *
 * WHAT THIS DOES AND — JUST AS IMPORTANT — WHAT IT REFUSES TO DO
 *
 * It appends one dated row per (kind, key) per day, so that a year from now
 * the calibration has a real as-of series for all four. It CANNOT recover the
 * past: there is no archive of the 2019 roster in this database, and writing
 * today's roster under a 2019 date would manufacture exactly the lookahead the
 * store exists to prevent. `takeSnapshot` therefore refuses any `asOf` that is
 * not today. The history starts the day this first runs and not one day
 * earlier — which is precisely why it has to start now, since every day it
 * does not run is a day permanently lost.
 *
 * EMPTY IS A FINDING, NOT A FAILURE
 *
 * If a source table is missing or empty the kind records zero rows and says so
 * in `skipped`. It never writes a defaulted payload: a fabricated row is worse
 * than a gap, because a gap is visible to the calibration and a fabrication is
 * not. Nothing here throws either — a snapshot that dies on one bad table
 * loses the other three kinds for that day, and those days do not come back.
 */

export type SnapshotKind = 'seat' | 'agency' | 'grade' | 'median';

export interface SeatPayload {
  committees: Array<{ committee: string; role: string }>;
}
export interface AgencyPayload {
  agencies: string[];
  topAgency: string | null;
  ttmAmount: number;
  count: number;
}
export interface GradePayload {
  grade: string | null;
}
export interface MedianPayload {
  medianBand: number | null;
}

interface SnapRow {
  kind: SnapshotKind;
  key: string;
  payload: unknown;
}

export interface SnapshotResult {
  asOf: string;
  counts: Record<SnapshotKind, number>;
  skipped: Array<{ kind: SnapshotKind; reason: string }>;
  tookMs: number;
}

const KINDS: SnapshotKind[] = ['seat', 'agency', 'grade', 'median'];

/** Rows per INSERT. 500 x 3 params sits well inside Postgres' 65,535 cap. */
const CHUNK = 500;

@Injectable()
export class PitSnapshotsService implements OnModuleInit {
  private readonly log = new Logger(PitSnapshotsService.name);
  private ready = false;

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  /**
   * node-postgres hands back every numeric/bigint column as a STRING, so a
   * payload built straight off a row would store "1234.00" where the reader
   * expects 1234 and every comparison it makes would be a string compare.
   * Every number that reaches a payload goes through here.
   */
  private num(v: unknown): number | null {
    if (v === null || v === undefined || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
    } catch (e: any) {
      this.log.warn(`pit-snapshots init failed: ${e?.message || e}`);
    }
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS cqs_input_snapshots (
      as_of      date NOT NULL,
      kind       text NOT NULL,
      key        text NOT NULL,
      payload    jsonb NOT NULL,
      taken_at   timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (as_of, kind, key)
    )`);
    // The calibration reads "everything of kind X as of date D", never a key
    // scan, so the secondary index leads on kind.
    await this.q(
      `CREATE INDEX IF NOT EXISTS cqs_input_snapshots_kind_asof ON cqs_input_snapshots (kind, as_of)`,
    );
    this.ready = true;
  }

  /** The database's own today, so a box in Karachi and a DB in UTC agree. */
  private async today(): Promise<string> {
    const [r] = await this.q<any[]>(`SELECT current_date::text AS d`);
    return String(r.d);
  }

  /**
   * Write today's truth for all four kinds.
   *
   * `asOf` exists so a caller can pin the date explicitly (a re-run either
   * side of midnight, say) — not so it can be pointed at the past. Idempotent:
   * running it twice in a day overwrites the day's rows rather than doubling
   * them, and `taken_at` moves so you can see it was re-taken.
   */
  async takeSnapshot(asOf?: string): Promise<SnapshotResult> {
    const started = Date.now();
    await this.ensureTables();
    const today = await this.today();
    const date = this.validateAsOf(asOf, today);

    const counts: Record<SnapshotKind, number> = { seat: 0, agency: 0, grade: 0, median: 0 };
    const skipped: Array<{ kind: SnapshotKind; reason: string }> = [];

    const loaders: Array<[SnapshotKind, (d: string) => Promise<SnapRow[]>]> = [
      ['seat', () => this.loadSeats()],
      ['agency', () => this.loadAgencies()],
      ['grade', () => this.loadGrades()],
      ['median', (d) => this.loadMedians(d)],
    ];

    for (const [kind, load] of loaders) {
      try {
        const rows = await load(date);
        if (!rows.length) {
          skipped.push({ kind, reason: 'source returned no rows — nothing written' });
          continue;
        }
        counts[kind] = await this.write(date, rows);
      } catch (e: any) {
        // Deliberately swallowed: one unreadable source must not cost the
        // other three kinds a day of history they can never get back.
        const reason = String(e?.message || e);
        skipped.push({ kind, reason });
        this.log.warn(`pit-snapshots: ${kind} unavailable (${reason}) — zero rows recorded.`);
      }
    }

    const result: SnapshotResult = { asOf: date, counts, skipped, tookMs: Date.now() - started };
    this.log.log(
      `pit-snapshot ${date}: seat=${counts.seat} agency=${counts.agency} ` +
        `grade=${counts.grade} median=${counts.median}` +
        (skipped.length ? ` skipped=${skipped.map((s) => s.kind).join(',')}` : ''),
    );
    return result;
  }

  /**
   * A past `asOf` is refused, not clamped.
   *
   * Everything this store reads is current state with no term attached. Filing
   * it under an earlier date would assert that today's committee seats, today's
   * trailing-12-month contract totals and today's Brief v7 grades were the
   * facts on that date. They were not, and the calibration reading them back
   * would score a historical buy with information nobody had — the single
   * failure mode this whole store exists to prevent. A future date is refused
   * for the mirror-image reason: it claims tomorrow's truth is known today.
   */
  private validateAsOf(asOf: string | undefined, today: string): string {
    if (!asOf) return today;
    const raw = String(asOf).trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
      throw new BadRequestException(`asOf must be an ISO date (YYYY-MM-DD); got "${raw}".`);
    }
    if (raw < today) {
      throw new BadRequestException(
        `Refusing to snapshot ${raw}: the store records what is true TODAY (${today}). ` +
          `Every source it reads (ct_assignments, gov_contract_cache, wt_member_stats, ` +
          `congressional_transactions) holds current state with no as-of dimension, so writing ` +
          `it under a past date would manufacture the lookahead this store exists to prevent. ` +
          `History starts the day the snapshot first ran and cannot be backfilled.`,
      );
    }
    if (raw > today) {
      throw new BadRequestException(
        `Refusing to snapshot ${raw}: that is in the future (today is ${today}), and today's ` +
          `state is not tomorrow's fact.`,
      );
    }
    return raw;
  }

  /* ------------------------------------------------------------- sources */

  /**
   * kind='seat' — who sits where, from the Brief v5 influence map.
   *
   * `key` is the member string exactly as ct_assignments stores it, per the
   * reader's contract: normalising it here would throw away the spelling the
   * reader may need to rejoin, and nameKey() is cheap for it to apply itself.
   * Subcommittee rows are kept as their own entries — ct_assignments carries
   * `is_subcommittee` and `parent`, and collapsing them would lose the seat.
   */
  private async loadSeats(): Promise<SnapRow[]> {
    const rows = await this.q<any[]>(
      `SELECT member, committee, role FROM ct_assignments ORDER BY member, committee`,
    );
    const by = new Map<string, SeatPayload>();
    for (const r of rows) {
      const member = String(r.member || '').trim();
      if (!member || !r.committee) continue;
      let e = by.get(member);
      if (!e) { e = { committees: [] }; by.set(member, e); }
      e.committees.push({ committee: String(r.committee), role: String(r.role || 'member') });
    }
    return [...by].map(([key, payload]) => ({ kind: 'seat' as const, key, payload }));
  }

  /**
   * kind='agency' — which federal agencies award this company work.
   *
   * Two authoritative sources, the same two CQS itself scores C4 from:
   * gov_contract_cache (the curated USAspending roll-up behind
   * /government-contracts) and verified ct_flags rows. Deliberately NOT a name
   * match against raw awards — that is the entity-resolution problem, and
   * guessing at it would file fabricated oversight links into permanent
   * history.
   *
   * `agencies` holds agencyKey-normalised keys, because that is the exact
   * vocabulary ct_jurisdiction's agency side normalises to; a reader joining
   * committee -> agency can compare these directly with no second normaliser.
   * `topAgency` keeps the raw USAspending spelling for display.
   *
   * ct_jurisdiction is read only to record how many of a company's agency keys
   * sit in the current jurisdiction map. It is NOT used to expand a committee
   * into its full agency list: that would file agencies this company has no
   * awards from, which is the fabricated payload the rules forbid.
   */
  private async loadAgencies(): Promise<SnapRow[]> {
    const acc = new Map<string, { agencies: Set<string>; label: string | null; ttm: number; count: number }>();
    const put = (t: string) => {
      let e = acc.get(t);
      if (!e) { e = { agencies: new Set(), label: null, ttm: 0, count: 0 }; acc.set(t, e); }
      return e;
    };

    // ttmAmount is numeric(20,2): a string on arrival, cast in SQL and coerced
    // again in JS so a driver change cannot silently store "0.00".
    const cache = await this.q<any[]>(
      `SELECT ticker, "topAgency", "ttmAmount"::float8 AS ttm
         FROM gov_contract_cache
        WHERE "hasData" AND "ttmAmount" > 0`,
    );
    for (const r of cache) {
      const e = put(String(r.ticker || '').toUpperCase());
      if (r.topAgency) {
        e.agencies.add(agencyKey(String(r.topAgency)));
        e.label = e.label || String(r.topAgency);
      }
      e.ttm += this.num(r.ttm) ?? 0;
    }

    // Verified flags name both the awarding agency and its sub-agency, and
    // USAspending is not consistent about which level it writes, so both count.
    // Missing ct_flags is survivable here — the cache alone is a true payload.
    try {
      const flags = await this.q<any[]>(
        `SELECT ticker, agency, sub_agency FROM ct_flags WHERE status = 'verified'`,
      );
      for (const r of flags) {
        const e = put(String(r.ticker || '').toUpperCase());
        if (r.agency) {
          e.agencies.add(agencyKey(String(r.agency)));
          e.label = e.label || String(r.agency);
        }
        if (r.sub_agency) e.agencies.add(agencyKey(String(r.sub_agency)));
        e.count++;
      }
    } catch (e: any) {
      this.log.warn(`pit-snapshots: ct_flags unavailable (${e?.message}) — agency rows use gov_contract_cache only.`);
    }

    acc.delete('');
    return [...acc].map(([key, v]) => ({
      kind: 'agency' as const,
      key,
      payload: {
        agencies: [...v.agencies].filter(Boolean).sort(),
        topAgency: v.label,
        ttmAmount: v.ttm,
        count: v.count,
      } as AgencyPayload,
    }));
  }

  /**
   * kind='grade' — the Brief v7 performance grade per member.
   *
   * wt_member_stats is keyed by bioguide, so the roster supplies the name. Both
   * spellings are filed (`name` and the FMP spelling), because congressional
   * trades arrive under the FMP one and the reader keys off whichever it has —
   * the same double-keying CQS does at scoring time.
   *
   * A member with a NULL grade IS recorded, with grade: null. That is a true
   * fact — "on the roster, ungraded" — and it is not the same as absence, which
   * means "not tracked at all that day". Collapsing the two would lose the one
   * distinction a dated grade series is for.
   */
  private async loadGrades(): Promise<SnapRow[]> {
    const rows = await this.q<any[]>(
      `SELECT m.name, m.fmp_name, s.grade
         FROM wt_member_stats s
         JOIN wt_members m ON m.bioguide = s.bioguide`,
    );
    const by = new Map<string, string | null>();
    for (const r of rows) {
      const grade = r.grade == null ? null : String(r.grade);
      for (const spelling of [r.name, r.fmp_name]) {
        if (!spelling) continue;
        const k = nameKey(String(spelling));
        if (!k) continue;
        // A graded row wins over an ungraded one where two spellings collide,
        // so a real grade is never overwritten by a null from the same member.
        if (grade !== null || !by.has(k)) by.set(k, grade);
      }
    }
    return [...by].map(([key, grade]) => ({
      kind: 'grade' as const,
      key,
      payload: { grade } as GradePayload,
    }));
  }

  /**
   * kind='median' — each member's own median disclosed buy band, as of the date.
   *
   * C6 measures conviction RELATIVE to how the member normally trades, so the
   * baseline is the member's own median, and it has to be the median they had
   * THEN: a member who has since started writing larger cheques would otherwise
   * make their 2019 buys look timid. The `transactionDate <= asOf` cut is what
   * makes this row dated rather than current.
   *
   * The band is the midpoint of the disclosed range (amountMin..amountMax),
   * since a congressional filing discloses a bracket and not a figure; where
   * only the floor is present the floor stands in for the midpoint.
   *
   * Medians are computed in JS, not with percentile_cont, because the grouping
   * key is nameKey() — "Pelosi, Nancy" and "Hon. Nancy Pelosi" are one member,
   * and a SQL GROUP BY on the raw string would produce two medians and let one
   * arbitrarily overwrite the other.
   *
   * Buys only, matching the C6 baseline the live scorer uses; a sell band says
   * nothing about buying conviction. A member whose buys are all unpriced is
   * still recorded, with medianBand: null.
   */
  private async loadMedians(asOf: string): Promise<SnapRow[]> {
    const rows = await this.q<any[]>(
      `SELECT "politicianName" AS name,
              CASE WHEN "amountMin" IS NULL THEN NULL
                   ELSE (("amountMin" + COALESCE("amountMax", "amountMin")) / 2.0)::float8
              END AS mid
         FROM congressional_transactions
        WHERE action = 'Buy' AND "transactionDate" <= $1::date`,
      [asOf],
    );
    const by = new Map<string, number[]>();
    for (const r of rows) {
      const k = nameKey(String(r.name || ''));
      if (!k) continue;
      let arr = by.get(k);
      if (!arr) { arr = []; by.set(k, arr); }
      const mid = this.num(r.mid);
      if (mid !== null && mid > 0) arr.push(mid);
    }
    return [...by].map(([key, arr]) => ({
      kind: 'median' as const,
      key,
      payload: { medianBand: this.median(arr) } as MedianPayload,
    }));
  }

  /** Even-length medians average the two central values, as percentile_cont does. */
  private median(values: number[]): number | null {
    if (!values.length) return null;
    const a = [...values].sort((x, y) => x - y);
    const mid = a.length >> 1;
    return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
  }

  /* --------------------------------------------------------------- write */

  /** Upsert in chunks. Re-running a day replaces its rows; it never doubles them. */
  private async write(asOf: string, rows: SnapRow[]): Promise<number> {
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const slice = rows.slice(i, i + CHUNK);
      const params: any[] = [asOf];
      const values = slice.map((r) => {
        params.push(r.kind, r.key, JSON.stringify(r.payload));
        const n = params.length;
        return `($1::date, $${n - 2}, $${n - 1}, $${n}::jsonb)`;
      });
      await this.q(
        `INSERT INTO cqs_input_snapshots (as_of, kind, "key", payload)
         VALUES ${values.join(', ')}
         ON CONFLICT (as_of, kind, "key")
         DO UPDATE SET payload = EXCLUDED.payload, taken_at = now()`,
        params,
      );
      written += slice.length;
    }
    return written;
  }

  /* -------------------------------------------------------------- status */

  /**
   * What history exists. `dates` is the number that matters: the calibration
   * can only use as-of inputs over the span this store has actually covered,
   * and on day one that span is one day.
   */
  async status(): Promise<unknown> {
    await this.ensureTables();
    const rows = await this.q<any[]>(
      `SELECT kind,
              count(*)::int                AS rows,
              count(DISTINCT as_of)::int   AS dates,
              min(as_of)::text             AS first_as_of,
              max(as_of)::text             AS last_as_of,
              max(taken_at)                AS last_taken_at
         FROM cqs_input_snapshots
        GROUP BY kind`,
    );
    const byKind = new Map(rows.map((r) => [String(r.kind), r]));
    const kinds = KINDS.map((kind) => {
      const r = byKind.get(kind);
      return {
        kind,
        rows: this.num(r?.rows) ?? 0,
        dates: this.num(r?.dates) ?? 0,
        firstAsOf: r?.first_as_of ?? null,
        lastAsOf: r?.last_as_of ?? null,
        lastTakenAt: r?.last_taken_at ?? null,
      };
    });
    const [all] = await this.q<any[]>(
      `SELECT count(*)::int AS rows,
              count(DISTINCT as_of)::int AS dates,
              min(as_of)::text AS first_as_of,
              max(as_of)::text AS last_as_of
         FROM cqs_input_snapshots`,
    );
    return {
      table: 'cqs_input_snapshots',
      rows: this.num(all?.rows) ?? 0,
      dates: this.num(all?.dates) ?? 0,
      firstAsOf: all?.first_as_of ?? null,
      lastAsOf: all?.last_as_of ?? null,
      kinds,
      note:
        'Point-in-time inputs for Brief v9 §5 C3/C4/C5/C6. History begins at firstAsOf and ' +
        'cannot be backfilled — the sources hold current state only, so dating them earlier ' +
        'would be lookahead.',
    };
  }

  /**
   * 05:50 UTC daily — ahead of the 06:10 CQS recompute, so the day's row
   * records the inputs as the scorer is about to read them, and after the
   * 05:40 legislative-calendar refresh so the two agree on the same day.
   */
  @Cron('50 5 * * *')
  async daily(): Promise<void> {
    await this.takeSnapshot().catch((e) =>
      this.log.warn(`daily snapshot failed: ${e?.message || e}`),
    );
  }
}
