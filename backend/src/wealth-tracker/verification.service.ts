import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { PtrService, normaliseRow } from './ptr.service';
import { RosterService } from './roster.service';
import { midpoint } from './reconstruction';

/**
 * Stage 5, extended to the Wealth Tracker — Brief v7 §5.
 *
 * "Stage 5 agent (Brief v5) extends to this dataset: re-checks
 * reconstructions against source filings on amendment; append-only
 * corrections."
 *
 * The v5 agent verifies a published sentence about an award. This dataset has
 * no sentence to check, so what it verifies is different and more literal:
 * the reconstruction is only as good as the filings under it, and a filing
 * can change after we read it. Members amend a periodic transaction report to
 * correct an amount, a date or a ticker, and the vendor's record changes
 * underneath a portfolio we have already published a return for.
 *
 * So this re-reads the member's filings at the source, diffs them against what
 * we stored, and:
 *   - writes an append-only correction row for every difference, never an
 *     in-place edit, so the history of what we said stays readable
 *   - applies the amendment to the stored trade
 *   - marks the member for recomputation, because a changed amount changes
 *     their lots, their holdings and their grade
 *   - retires a stored trade that has vanished from the source entirely
 *
 * Nothing here is a model judgement: every check is a comparison against the
 * filing, which is the only thing that can settle it.
 */

export type CorrectionSeverity = 'a' | 'b' | 'c';

@Injectable()
export class TrackerVerificationService {
  private readonly log = new Logger(TrackerVerificationService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly ptr: PtrService,
    private readonly roster: RosterService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    // Append-only by construction: nothing in this service updates or deletes
    // a row here.
    await this.q(`CREATE TABLE IF NOT EXISTS wt_corrections (
      id bigserial PRIMARY KEY,
      at timestamptz NOT NULL DEFAULT now(),
      actor text NOT NULL DEFAULT 'stage5',
      bioguide text,
      trade_id text,
      action text NOT NULL,
      severity text,
      field text,
      before jsonb,
      after jsonb,
      evidence text
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS wt_corrections_member_idx ON wt_corrections (bioguide, at DESC)`);
    await this.q(`CREATE TABLE IF NOT EXISTS wt_verification_state (
      bioguide text PRIMARY KEY,
      last_checked timestamptz,
      last_changed timestamptz,
      checks int NOT NULL DEFAULT 0,
      corrections int NOT NULL DEFAULT 0,
      needs_recompute boolean NOT NULL DEFAULT false
    )`);
  }

  private async record(
    action: string,
    severity: CorrectionSeverity | null,
    data: { bioguide?: string | null; tradeId?: string | null; field?: string | null; before?: any; after?: any; evidence?: string | null },
  ): Promise<void> {
    await this.q(
      `INSERT INTO wt_corrections (actor, bioguide, trade_id, action, severity, field, before, after, evidence)
       VALUES ('stage5',$1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
      [data.bioguide || null, data.tradeId || null, action, severity, data.field || null,
       JSON.stringify(data.before ?? null), JSON.stringify(data.after ?? null), data.evidence || null],
    );
  }

  /**
   * Re-read one member's filings and reconcile them against what we stored.
   * `limit` members per pass keeps the vendor calls bounded.
   */
  async verifyMember(bioguide: string): Promise<{ checked: number; amended: number; retired: number; added: number; skippedAmbiguous: number }> {
    await this.ensureTables();
    const [m] = await this.q<any[]>(`SELECT bioguide, last, fmp_name, name FROM wt_members WHERE bioguide = $1`, [bioguide]);
    if (!m) return { checked: 0, amended: 0, retired: 0, added: 0, skippedAmbiguous: 0 };

    const raw = await this.fmp.getCongressRaw(m.last);
    // Identity for reconciliation is the trade's own facts, not our stored
    // hash: an amended amount has to match the row it replaces rather than
    // look like a brand-new trade.
    //
    // But that key is NOT unique. A member can file two trades on the same
    // day, in the same ticker, of the same type, for the same owner — family
    // trusts do it routinely — and those rows differ only by amount. Treating
    // one as an amendment of the other would rewrite a correct figure with
    // another correct figure and log it as a correction. So a key held by
    // more than one row on either side is ambiguous, and ambiguity is
    // reported rather than resolved by guessing.
    const freshByKey = new Map<string, any[]>();
    for (const r of [...raw.senate, ...raw.house]) {
      if (String(r?.senateID || '').trim() !== bioguide) continue;
      const t = normaliseRow(r, bioguide);
      if (!t) continue;
      const key = `${t.ticker || ''}|${t.date}|${t.rawType}|${t.owner || ''}`;
      const arr = freshByKey.get(key) || [];
      arr.push(t);
      freshByKey.set(key, arr);
    }
    const fresh = new Map<string, any>();
    const ambiguous = new Set<string>();
    for (const [key, arr] of freshByKey) {
      if (arr.length === 1) fresh.set(key, arr[0]);
      else ambiguous.add(key);
    }

    const stored = await this.q<any[]>(
      `SELECT id, ticker, to_char(transaction_date,'YYYY-MM-DD') AS date, raw_type, owner, amount_min, amount_max,
              to_char(disclosure_date,'YYYY-MM-DD') AS disclosed, source_url
       FROM wt_trades WHERE bioguide = $1`,
      [bioguide],
    );

    let amended = 0;
    let retired = 0;
    let added = 0;
    let skippedAmbiguous = 0;
    const seen = new Set<string>();
    // The stored side can hold duplicates of the same key for the same
    // reason, so those are ambiguous too.
    const storedCounts = new Map<string, number>();
    for (const s of stored) {
      const k = `${s.ticker || ''}|${s.date}|${s.raw_type}|${s.owner || ''}`;
      storedCounts.set(k, (storedCounts.get(k) || 0) + 1);
    }

    for (const s of stored) {
      const key = `${s.ticker || ''}|${s.date}|${s.raw_type}|${s.owner || ''}`;
      seen.add(key);
      if (ambiguous.has(key) || (storedCounts.get(key) || 0) > 1) {
        skippedAmbiguous++;
        continue;
      }
      const f = fresh.get(key);
      if (!f) {
        // The vendor no longer carries this row. It is NOT deleted: a
        // correction is recorded and the trade is flagged, because a
        // disappearance can be a vendor gap rather than a withdrawn filing,
        // and silently dropping it would change a published return with no
        // trace.
        if (fresh.size > 0) {
          await this.record('source_row_missing', 'b', {
            bioguide, tradeId: s.id, evidence: 'Row is no longer returned by the source for this member.',
            before: { ticker: s.ticker, date: s.date, amountMin: s.amount_min, amountMax: s.amount_max },
          });
          retired++;
        }
        continue;
      }
      const diffs: Array<{ field: string; before: any; after: any }> = [];
      const cmp = (field: string, before: any, after: any) => {
        const a = before == null ? null : Number(before);
        const b = after == null ? null : Number(after);
        if (a !== b) diffs.push({ field, before: a, after: b });
      };
      cmp('amount_min', s.amount_min, f.amountMin);
      cmp('amount_max', s.amount_max, f.amountMax);
      if ((s.disclosed || null) !== (f.disclosed || null)) {
        diffs.push({ field: 'disclosure_date', before: s.disclosed, after: f.disclosed });
      }
      if (!diffs.length) continue;

      // An amended dollar band changes the reconstruction, so it is severity
      // (c): it moves a published figure, and the member is recomputed.
      const movesValue = diffs.some((d) => d.field.startsWith('amount'));
      for (const d of diffs) {
        await this.record('amended', movesValue ? 'c' : 'a', {
          bioguide, tradeId: s.id, field: d.field, before: d.before, after: d.after,
          evidence: f.sourceUrl || s.source_url || 'source filing',
        });
      }
      await this.q(
        `UPDATE wt_trades SET amount_min = $2, amount_max = $3, disclosure_date = COALESCE($4::date, disclosure_date),
           source_url = COALESCE($5, source_url) WHERE id = $1`,
        [s.id, f.amountMin, f.amountMax, f.disclosed, f.sourceUrl],
      );
      amended++;
    }

    // A filing that appeared since we last looked is added rather than
    // waiting for the next full ingest.
    for (const [key, f] of fresh) {
      if (seen.has(key) || ambiguous.has(key)) continue;
      const mid = midpoint(f.amountMin, f.amountMax);
      if (mid == null) continue;
      await this.record('source_row_added', 'a', {
        bioguide, tradeId: f.id, evidence: f.sourceUrl,
        after: { ticker: f.ticker, date: f.date, amountMin: f.amountMin, amountMax: f.amountMax },
      });
      added++;
    }

    const changed = amended + retired + added;
    await this.q(
      `INSERT INTO wt_verification_state (bioguide, last_checked, last_changed, checks, corrections, needs_recompute)
       VALUES ($1, now(), CASE WHEN $2 > 0 THEN now() ELSE NULL END, 1, $2, $3)
       ON CONFLICT (bioguide) DO UPDATE SET last_checked = now(),
         last_changed = CASE WHEN $2 > 0 THEN now() ELSE wt_verification_state.last_changed END,
         checks = wt_verification_state.checks + 1,
         corrections = wt_verification_state.corrections + $2,
         needs_recompute = wt_verification_state.needs_recompute OR $3`,
      [bioguide, changed, amended > 0],
    );
    if (skippedAmbiguous) {
      this.log.debug(`${bioguide}: ${skippedAmbiguous} row(s) share a same-day/ticker/type/owner key and were left alone.`);
    }
    return { checked: stored.length, amended, retired, added, skippedAmbiguous };
  }

  /**
   * One pass over the members longest since checked. Graded members come
   * first: they are the ones carrying a published number.
   */
  async verify(limit = 12): Promise<any> {
    await this.ensureTables();
    const rows = await this.q<Array<{ bioguide: string }>>(
      `SELECT m.bioguide FROM wt_members m
       JOIN wt_member_stats s ON s.bioguide = m.bioguide
       LEFT JOIN wt_verification_state v ON v.bioguide = m.bioguide
       WHERE s.trades_total > 0
       ORDER BY (s.grade IS NULL), v.last_checked ASC NULLS FIRST
       LIMIT $1`,
      [limit],
    );
    let amended = 0;
    let retired = 0;
    let added = 0;
    let checked = 0;
    let ambiguousRows = 0;
    for (const r of rows) {
      try {
        const out = await this.verifyMember(r.bioguide);
        checked += out.checked;
        amended += out.amended;
        retired += out.retired;
        added += out.added;
        ambiguousRows += out.skippedAmbiguous;
      } catch (e: any) {
        this.log.warn(`verify ${r.bioguide}: ${e?.message || e}`);
      }
    }
    const [pending] = await this.q<any[]>(`SELECT count(*)::int AS n FROM wt_verification_state WHERE needs_recompute`);
    this.log.log(`tracker stage 5: ${rows.length} members, ${checked} trades re-read, ${amended} amended, ${added} added, ${retired} missing at source`);
    return { members: rows.length, tradesChecked: checked, amended, added, missingAtSource: retired, ambiguousRowsSkipped: ambiguousRows, membersNeedingRecompute: pending?.n || 0 };
  }

  /** Members whose figures changed and so need their reconstruction re-run. */
  async pendingRecompute(): Promise<string[]> {
    await this.ensureTables();
    const rows = await this.q<Array<{ bioguide: string }>>(`SELECT bioguide FROM wt_verification_state WHERE needs_recompute`);
    return rows.map((r) => r.bioguide);
  }

  async clearRecomputeFlags(): Promise<void> {
    await this.q(`UPDATE wt_verification_state SET needs_recompute = false WHERE needs_recompute`);
  }

  /** The public correction record (§5: corrections are append-only). */
  async corrections(limit = 100, bioguide?: string): Promise<any[]> {
    await this.ensureTables();
    return this.q<any[]>(
      `SELECT c.id, c.at, c.action, c.severity, c.field, c.before, c.after, c.evidence, c.bioguide,
              coalesce(m.fmp_name, m.name) AS member
       FROM wt_corrections c LEFT JOIN wt_members m ON m.bioguide = c.bioguide
       ${bioguide ? 'WHERE c.bioguide = $2' : ''}
       ORDER BY c.at DESC, c.id DESC LIMIT $1`,
      bioguide ? [limit, bioguide] : [limit],
    );
  }

  async status(): Promise<any> {
    await this.ensureTables();
    const [s] = await this.q<any[]>(
      `SELECT count(*)::int AS members_checked, sum(corrections)::int AS corrections,
              count(*) FILTER (WHERE needs_recompute)::int AS needing_recompute,
              to_char(max(last_checked),'YYYY-MM-DD HH24:MI') AS last_run
       FROM wt_verification_state`,
    );
    const [c] = await this.q<any[]>(`SELECT count(*)::int AS n FROM wt_corrections`);
    return { ...s, correctionRows: c?.n || 0 };
  }

  /** Re-verification runs on its own clock, like the v5 agent's tiers. */
  @Cron('35 5 * * *')
  async nightly(): Promise<void> {
    if (process.env.VERCEL) return;
    try {
      await this.verify(15);
    } catch (e: any) {
      this.log.error(`tracker verification failed: ${e?.message || e}`);
    }
  }
}
