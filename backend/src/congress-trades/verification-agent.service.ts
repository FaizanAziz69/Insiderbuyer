import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import Anthropic from '@anthropic-ai/sdk';
import { Company } from '../entities/company.entity';
import { checkCopy } from './cts';
import { nameKey } from './influence-map.service';

/**
 * Top Ranking Congress Trades — Brief v5, Stage 5: the verification agent.
 *
 * "Pre-publish gate: before any row renders publicly, an AI agent
 * independently re-verifies every leg against primary sources … No row
 * publishes without a passing verification timestamp."
 *
 * ── What is deterministic and what the model is for ──────────────────────
 *
 * Re-fetching the award from USAspending and comparing the amount, the agency
 * and the date is arithmetic. A model is not needed for it, must not be
 * trusted with it, and would cost money to do it worse. So every check that
 * CAN be made by comparison is made by comparison, and the model is used for
 * the one thing it is actually better at: reading the row's published prose
 * against the verified facts and saying whether the sentence is supported,
 * neutral, and free of the §5 vocabulary.
 *
 * That split is also what makes §8's cost item answerable — one short model
 * call per row, on prose only, rather than a model re-reading three APIs.
 *
 * ── Severity, exactly as §2 defines it ───────────────────────────────────
 *
 *  (a) data drift  — an amended amount, a corrected award value, a fixed date.
 *                    Auto-corrected to match the primary source and logged.
 *  (b) a leg breaks — position sold, award cancelled, member left the
 *                    committee. The row is retired automatically and why is
 *                    logged.
 *  (c) anything that materially changes a person's ranking, characterization,
 *      or adds a new claim — drafted into a human queue. NEVER self-published.
 *
 * ── Guardrails (§2, verbatim) ────────────────────────────────────────────
 *
 * "the agent corrects only toward what a primary source says — it can never
 * introduce a claim no source supports, never edits outside the affected row,
 * and every action writes an immutable audit entry". The audit table here is
 * append-only by construction: nothing in this service updates or deletes it.
 */

const AWARD_URL = 'https://api.usaspending.gov/api/v2/awards/';

/**
 * How many rows count as "on the public leaderboard" for §2 Stage 5's daily
 * re-verification tier. Matches the depth a reader can reach on the page; any
 * row below it is archive and rotates weekly.
 */
const LEADERBOARD_ROWS = 100;

export type Severity = 'a' | 'b' | 'c';

/** Column names are not reader-facing; a correction note must read as English. */
const FIELD_LABEL: Record<string, string> = {
  award_value: 'Award value',
  award_date: 'Award date',
  agency: 'Awarding agency',
  trade_date: 'Transaction date',
};

@Injectable()
export class VerificationAgentService {
  private readonly log = new Logger(VerificationAgentService.name);
  private ready = false;
  private anthropic: Anthropic | null | undefined;

  constructor(@InjectRepository(Company) private readonly companies: Repository<Company>) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS ct_audit (
      id          bigserial PRIMARY KEY,
      flag_id     bigint,
      actor       varchar(32) NOT NULL,
      action      varchar(32) NOT NULL,
      severity    varchar(2),
      field       varchar(48),
      before      jsonb,
      after       jsonb,
      evidence    text,
      at          timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_audit_flag_idx ON ct_audit (flag_id)`);

    // §2: "anything that materially changes a person's ranking,
    // characterization, or adds a new claim — agent drafts the correction into
    // a human review queue; it never self-publishes changes in this class."
    await this.q(`CREATE TABLE IF NOT EXISTS ct_review_queue (
      id          bigserial PRIMARY KEY,
      flag_id     bigint,
      reason      text NOT NULL,
      proposal    jsonb,
      evidence    text,
      source      varchar(24) NOT NULL DEFAULT 'agent',
      state       varchar(16) NOT NULL DEFAULT 'open',
      resolved_by varchar(64),
      resolved_at timestamptz,
      created_at  timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS ct_review_state_idx ON ct_review_queue (state)`);

    // §5: "a visible 'report an error' path on every flag, triaged by the
    // Stage 5 verification agent".
    await this.q(`CREATE TABLE IF NOT EXISTS ct_reports (
      id          bigserial PRIMARY KEY,
      flag_id     bigint,
      reporter    varchar(200),
      message     text NOT NULL,
      state       varchar(16) NOT NULL DEFAULT 'new',
      triage      text,
      created_at  timestamptz NOT NULL DEFAULT now(),
      handled_at  timestamptz
    )`);
    this.ready = true;
  }

  private client(): Anthropic | null {
    if (this.anthropic !== undefined) return this.anthropic;
    this.anthropic = process.env.ANTHROPIC_API_KEY ? new Anthropic() : null;
    if (!this.anthropic) this.log.warn('ANTHROPIC_API_KEY unset — prose review will abstain.');
    return this.anthropic;
  }

  // ── The gate ───────────────────────────────────────────────────────────

  /**
   * Verify pending rows, and re-verify live ones.
   *
   * §7 P3 sets a 24h latency target for live-row re-verification, which is why
   * published rows are re-checked oldest-verification-first rather than by id:
   * the row closest to breaching the target is always the next one done.
   */
  async verify(
    limit = 60,
    mode: 'pending' | 'live' = 'pending',
    tier: 'daily' | 'weekly' = 'daily',
  ) {
    await this.ensureTables();
    const rows: any[] =
      mode === 'pending'
        ? await this.q(
            `SELECT * FROM ct_flags WHERE status = 'pending' ORDER BY score DESC NULLS LAST LIMIT $1`,
            [limit],
          )
        : tier === 'daily'
          ? // §2 Stage 5 re-checks "daily for rows on the public leaderboard,
            // weekly for archive", so the daily tier is exactly what a reader
            // can currently see: the same ordering the leaderboard query uses,
            // top LEADERBOARD_ROWS. Treating every verified row alike meant a
            // row on page one waited behind an archive of rows nobody was
            // looking at.
            await this.q(
              `SELECT * FROM (
                 SELECT * FROM ct_flags WHERE status = 'verified'
                  ORDER BY score DESC NULLS LAST, award_value DESC
                  LIMIT ${LEADERBOARD_ROWS}
               ) live
               ORDER BY verified_at ASC NULLS FIRST LIMIT $1`,
              [limit],
            )
          : // The archive: everything verified that is NOT on the leaderboard,
            // oldest verification first so a full rotation completes.
            await this.q(
              `SELECT * FROM ct_flags
                WHERE status = 'verified'
                  AND id NOT IN (
                    SELECT id FROM ct_flags WHERE status = 'verified'
                     ORDER BY score DESC NULLS LAST, award_value DESC
                     LIMIT ${LEADERBOARD_ROWS}
                  )
                ORDER BY verified_at ASC NULLS FIRST LIMIT $1`,
              [limit],
            );

    let passed = 0;
    let corrected = 0;
    let retired = 0;
    let queued = 0;

    for (const row of rows) {
      const result = await this.verifyOne(row);
      if (result.action === 'verified') passed++;
      else if (result.action === 'corrected') corrected++;
      else if (result.action === 'retired') retired++;
      else queued++;
    }
    this.log.log(
      `verification (${mode === 'live' ? tier : mode}): ${rows.length} rows — ${passed} passed, ${corrected} corrected, ${retired} retired, ${queued} queued for a human`,
    );
    return { checked: rows.length, passed, corrected, retired, queued };
  }

  private async verifyOne(row: any): Promise<{ action: 'verified' | 'corrected' | 'retired' | 'queued' }> {
    const drift: Array<{ field: string; before: any; after: any }> = [];

    // Leg: the award, re-read from USAspending itself.
    const award = await this.fetchAward(row.award_key);
    if (award === 'gone') {
      await this.retire(row, 'The award record is no longer retrievable from USAspending.');
      return { action: 'retired' };
    }
    if (award) {
      if (award.amount != null && Math.abs(Number(award.amount) - Number(row.award_value)) > 0.5) {
        drift.push({ field: 'award_value', before: Number(row.award_value), after: Number(award.amount) });
      }
      if (award.agency && String(award.agency) !== String(row.agency)) {
        drift.push({ field: 'agency', before: row.agency, after: award.agency });
      }
      if (award.actionDate && award.actionDate !== isoOf(row.award_date)) {
        drift.push({ field: 'award_date', before: isoOf(row.award_date), after: award.actionDate });
      }
    }

    // Leg: the trade still exists as disclosed. A PTR can be amended, and an
    // amendment that removes the transaction breaks the row's first leg.
    if (row.trade_id) {
      // Read the trade back from ct_disclosures, which is where the flag
      // engine now takes it from. This used to query congressional_transactions
      // by a uuid; once Stage 1 moved onto household disclosures the id became
      // a composite key ("member|ticker|date|action|owner|amount"), Postgres
      // refused to cast it to uuid, and the whole verification pass 500'd —
      // which meant NOTHING could ever reach 'verified', and the public
      // leaderboard stayed empty however many real flags the engine produced.
      const t = (
        await this.q(
          `SELECT transaction_date AS d, amount_min::float8 AS amin, amount_max::float8 AS amax
             FROM ct_disclosures WHERE id = $1`,
          [String(row.trade_id)],
        )
      )?.[0];
      if (!t) {
        await this.retire(row, 'The disclosed transaction is no longer present in the filing record.');
        return { action: 'retired' };
      }
      if (isoOf(t.d) !== isoOf(row.trade_date)) {
        drift.push({ field: 'trade_date', before: isoOf(row.trade_date), after: isoOf(t.d) });
      }
    }

    // Leg: the member still sits on the committee that gave jurisdiction.
    //
    // Matched on nameKey, the SAME comparison the flag engine used to build
    // the row. It was an exact string equality, and the two sides do not carry
    // the same name form: the trade feed says "John Karl Fetterman" where the
    // roster says "John Fetterman", "Angus Stanley King" where the roster says
    // "Angus King". Half the members in the first production run — 27 of 54 —
    // had no exact match, so their perfectly good flags were retired on the
    // first pass with "no longer serving on that committee", which was false.
    // Retirement is one-way, so this destroyed real rows silently.
    const candidates: any[] = await this.q(
      `SELECT member FROM ct_assignments WHERE committee = $1`,
      [row.committee],
    );
    const want = nameKey(row.member);
    const seat = candidates.find((c) => nameKey(c.member) === want);
    if (!seat) {
      await this.retire(row, `No longer serving on ${row.committee}; the jurisdiction leg no longer holds.`);
      return { action: 'retired' };
    }

    // §5, again, on the stored sentence — a template change could have let
    // something through since this row was written.
    const copy = checkCopy(row.headline || '');
    if (!copy.ok) {
      await this.queueForHuman(
        row,
        `Published sentence trips the editorial rules: ${copy.violations.map((v) => v.term).join(', ')}.`,
        null,
      );
      return { action: 'queued' };
    }

    // Class (a): drift the agent may fix itself.
    if (drift.length) {
      // A changed award VALUE moves the score, and §2 class (c) reserves
      // anything that "materially changes a person's ranking" for a human. A
      // small correction is drift; a large one is a ranking change wearing
      // drift's clothes.
      const valueDrift = drift.find((d) => d.field === 'award_value');
      const material =
        valueDrift &&
        Number(valueDrift.before) > 0 &&
        Math.abs(Number(valueDrift.after) - Number(valueDrift.before)) / Number(valueDrift.before) > 0.25;

      if (material) {
        await this.queueForHuman(
          row,
          'Award value changed by more than 25%, which moves this row’s ranking.',
          { drift },
        );
        return { action: 'queued' };
      }

      for (const d of drift) {
        await this.q(`UPDATE ct_flags SET ${d.field} = $1, updated_at = now() WHERE id = $2`, [d.after, row.id]);
        await this.audit(row.id, 'agent', 'auto-correct', 'a', d.field, d.before, d.after,
          'Corrected to match the primary source record.');
        // §5: "fix + dated correction note on the page". The audit table is
        // the internal record; this is the half the reader sees, so it travels
        // on the row itself and shows up wherever the row is shown.
        await this.q(
          `UPDATE ct_flags
              SET evidence = jsonb_set(
                    evidence, '{corrections}',
                    COALESCE(evidence->'corrections', '[]'::jsonb) || $1::jsonb, true),
                  updated_at = now()
            WHERE id = $2`,
          [
            JSON.stringify([
              {
                at: new Date().toISOString().slice(0, 10),
                field: d.field,
                from: d.before,
                to: d.after,
                note: `${FIELD_LABEL[d.field] || d.field} updated to match the primary source record.`,
                // The page distinguishes a machine correction from an editor's,
                // because a reader is entitled to know which one moved a figure
                // about a named person.
                actor: 'agent',
              },
            ]),
            row.id,
          ],
        );
      }
      corrected(this.log, row, drift);
    }

    // The model's one job: is the published sentence supported and neutral?
    const prose = await this.reviewProse(row, award);
    if (prose && prose.verdict === 'unsupported') {
      await this.queueForHuman(row, `Prose review: ${prose.reason}`, null);
      return { action: 'queued' };
    }

    // `prose === null` means the review did not run — no key, no credit, an
    // outage. That is NOT the same as "supported", and the row must not be
    // published as though a gate had passed when none did. It is also not a
    // reason to retire a good row, so it goes to the human queue, which is the
    // one place §2 Stage 5 says a judgement about a named person may be made
    // when the agent cannot make it. The next pass with a working model picks
    // it up from there.
    if (!prose) {
      await this.queueForHuman(
        row,
        'The prose review could not run, so the sentence has not been checked against the facts. ' +
          'Read the headline against the evidence chain and release it or send it back.',
        null,
      );
      return { action: 'queued' };
    }

    await this.q(
      `UPDATE ct_flags SET status = 'verified', verified_at = now(), updated_at = now() WHERE id = $1`,
      [row.id],
    );
    await this.audit(row.id, 'agent', drift.length ? 'verified-after-correction' : 'verified', null, null, null, null,
      award ? `Re-read USAspending award ${row.award_key}.` : 'Award record unavailable; other legs re-checked.');
    return { action: drift.length ? 'corrected' : 'verified' };
  }

  /**
   * Ask the model whether the sentence is supported by the facts beneath it.
   *
   * Deliberately narrow: it is shown the row's own verified fields and its
   * published sentence, and asked only whether the sentence states more than
   * those fields support. It is given no ability to rewrite anything — §2's
   * guardrail is that the agent "can never introduce a claim no source
   * supports", and the safest way to honour that is not to let it write.
   */
  private async reviewProse(row: any, award: any): Promise<{ verdict: string; reason: string } | null> {
    const client = this.client();
    if (!client) return null;
    const facts = {
      member: row.member,
      committee: row.committee,
      role: row.role,
      agency: row.sub_agency || row.agency,
      awardValue: Number(row.award_value),
      awardDate: isoOf(row.award_date),
      ticker: row.ticker,
      company: row.company,
      tradeAction: row.trade_action,
      tradeDate: isoOf(row.trade_date),
      awardStillLive: !!award,
    };
    try {
      const res = await client.messages.create({
        model: 'claude-opus-5',
        max_tokens: 300,
        system:
          'You check whether a published sentence is fully supported by the structured facts given with it. ' +
          'The publisher reports the proximity of public records and never alleges wrongdoing. ' +
          'Answer "supported" only if every claim in the sentence appears in the facts. Answer "unsupported" if the ' +
          'sentence asserts motive, knowledge, intent or wrongdoing, states a number or date the facts do not contain, ' +
          'or implies causation between the trade and the award. Reply as JSON: {"verdict":"supported"|"unsupported","reason":"..."}.',
        messages: [
          {
            role: 'user',
            content: `FACTS:\n${JSON.stringify(facts, null, 1)}\n\nSENTENCE:\n${row.headline}`,
          },
        ],
      });
      const text = (res.content.find((b: any) => b.type === 'text') as any)?.text ?? '';
      const m = /\{[\s\S]*\}/.exec(text);
      if (!m) return null;
      const parsed = JSON.parse(m[0]);
      return { verdict: String(parsed.verdict || ''), reason: String(parsed.reason || '') };
    } catch (e: any) {
      // A model outage must not publish an unchecked row, but it must not
      // retire a good one either. Returning null says "no answer", and the
      // caller routes that to the human queue rather than treating silence
      // as approval — for a while it did the opposite, and a billing failure
      // would have published every pending headline unreviewed.
      this.log.warn(`prose review unavailable: ${e?.message || e}`);
      return null;
    }
  }

  private async fetchAward(awardKey: string): Promise<any | 'gone' | null> {
    try {
      const { data } = await axios.get(`${AWARD_URL}${encodeURIComponent(awardKey)}/`, { timeout: 25_000 });
      if (!data) return null;
      return {
        amount: Number(data?.total_obligation ?? data?.base_and_all_options_value ?? NaN),
        agency: data?.awarding_agency?.toptier_agency?.name ?? null,
        actionDate: String(data?.date_signed || data?.period_of_performance_start_date || '').slice(0, 10) || null,
      };
    } catch (e: any) {
      if (e?.response?.status === 404) return 'gone';
      return null;
    }
  }

  // ── Actions ────────────────────────────────────────────────────────────

  private async retire(row: any, why: string) {
    await this.q(`UPDATE ct_flags SET status = 'retired', updated_at = now() WHERE id = $1`, [row.id]);
    await this.audit(row.id, 'agent', 'retire', 'b', null, { status: row.status }, { status: 'retired' }, why);
    this.log.log(`flag ${row.id} retired: ${why}`);
  }

  private async queueForHuman(row: any, reason: string, proposal: any) {
    await this.q(
      `INSERT INTO ct_review_queue (flag_id, reason, proposal, evidence, source)
       VALUES ($1,$2,$3::jsonb,$4,'agent')`,
      [row.id, reason, proposal ? JSON.stringify(proposal) : null, row.headline || null],
    );
    // A row awaiting a human decision must not sit on the public page in the
    // meantime — §2 class (c) is precisely the case where publishing first
    // and asking later is the wrong order.
    await this.q(`UPDATE ct_flags SET status = 'pending', updated_at = now() WHERE id = $1`, [row.id]);
    await this.audit(row.id, 'agent', 'queue', 'c', null, null, proposal ?? null, reason);
  }

  /** Append-only. Nothing in this service ever updates or deletes these rows. */
  private async audit(
    flagId: number | null,
    actor: string,
    action: string,
    severity: Severity | null,
    field: string | null,
    before: any,
    after: any,
    evidence: string | null,
  ) {
    await this.q(
      `INSERT INTO ct_audit (flag_id, actor, action, severity, field, before, after, evidence)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,
      [
        flagId, actor, action, severity, field,
        before == null ? null : JSON.stringify(before),
        after == null ? null : JSON.stringify(after),
        evidence,
      ],
    );
  }

  // ── User-reported errors (§2 Stage 5, §5 corrections channel) ───────────

  async report(flagId: number | null, message: string, reporter?: string) {
    await this.ensureTables();
    const r = (
      await this.q(
        `INSERT INTO ct_reports (flag_id, reporter, message) VALUES ($1,$2,$3) RETURNING id`,
        [flagId, (reporter || '').slice(0, 200) || null, String(message || '').slice(0, 4000)],
      )
    )?.[0];
    // §5: "Reporter gets an automatic status response."
    return {
      id: Number(r?.id),
      received: true,
      message:
        'Thank you — your report has been logged and will be checked against the primary sources. ' +
        'Corrections are applied with a dated note on the page.',
    };
  }

  /**
   * Triage reports: re-verify the row they point at, auto-apply clear-cut
   * mismatches, and queue everything else with its evidence attached.
   */
  async triageReports(limit = 25) {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT * FROM ct_reports WHERE state = 'new' ORDER BY created_at LIMIT $1`,
      [limit],
    );
    let handled = 0;
    for (const rep of rows) {
      const flag = rep.flag_id
        ? (await this.q(`SELECT * FROM ct_flags WHERE id = $1`, [rep.flag_id]))?.[0]
        : null;
      if (!flag) {
        await this.q(
          `UPDATE ct_reports SET state = 'queued', triage = $1, handled_at = now() WHERE id = $2`,
          ['Report does not name a row we hold; passed to a human.', rep.id],
        );
        await this.q(`INSERT INTO ct_review_queue (flag_id, reason, evidence, source) VALUES ($1,$2,$3,'report')`,
          [rep.flag_id, 'Reader report about a row we could not locate.', rep.message]);
        handled++;
        continue;
      }
      const out = await this.verifyOne(flag);
      await this.q(
        `UPDATE ct_reports SET state = $1, triage = $2, handled_at = now() WHERE id = $3`,
        [
          out.action === 'queued' ? 'queued' : 'resolved',
          `Re-verified against primary sources — outcome: ${out.action}.`,
          rep.id,
        ],
      );
      if (out.action === 'verified') {
        // Nothing was wrong. The reader still deserves the finding recorded.
        await this.audit(flag.id, 'agent', 'report-no-change', null, null, null, null, rep.message);
      }
      handled++;
    }
    return { handled };
  }

  // ── Human queue ────────────────────────────────────────────────────────

  async reviewQueue(limit = 50) {
    await this.ensureTables();
    return this.q(
      `SELECT q.id, q.flag_id, q.reason, q.proposal, q.evidence, q.source, q.created_at,
              f.member, f.ticker, f.agency, f.headline, f.score
         FROM ct_review_queue q
         LEFT JOIN ct_flags f ON f.id = q.flag_id
        WHERE q.state = 'open'
        ORDER BY q.created_at
        LIMIT $1`,
      [limit],
    );
  }

  async resolveQueued(id: number, decision: 'publish' | 'retire' | 'dismiss', actor: string, note?: string) {
    await this.ensureTables();
    const row = (await this.q(`SELECT * FROM ct_review_queue WHERE id = $1`, [id]))?.[0];
    if (!row) return null;
    if (row.flag_id) {
      if (decision === 'publish') {
        await this.q(
          `UPDATE ct_flags SET status = 'verified', verified_at = now(), updated_at = now() WHERE id = $1`,
          [row.flag_id],
        );
      } else if (decision === 'retire') {
        await this.q(`UPDATE ct_flags SET status = 'retired', updated_at = now() WHERE id = $1`, [row.flag_id]);
      }
    }
    await this.q(
      `UPDATE ct_review_queue SET state = 'closed', resolved_by = $1, resolved_at = now() WHERE id = $2`,
      [actor, id],
    );
    await this.audit(row.flag_id, actor, `human-${decision}`, 'c', null, null, null, note || row.reason);
    return { ok: true };
  }

  async audits(flagId?: number, limit = 100) {
    await this.ensureTables();
    return this.q(
      `SELECT id, flag_id, actor, action, severity, field, before, after, evidence, at
         FROM ct_audit WHERE ($1::bigint IS NULL OR flag_id = $1)
        ORDER BY at DESC LIMIT $2`,
      [flagId ?? null, Math.min(Math.max(limit, 1), 500)],
    );
  }

  async status() {
    await this.ensureTables();
    const [c] = await this.q(
      `SELECT (SELECT count(*)::int FROM ct_audit) AS audit_entries,
              (SELECT count(*)::int FROM ct_review_queue WHERE state = 'open') AS open_reviews,
              (SELECT count(*)::int FROM ct_reports WHERE state = 'new') AS new_reports,
              (SELECT min(verified_at) FROM ct_flags WHERE status = 'verified') AS oldest_verification`,
    );
    return { ...c, model: process.env.ANTHROPIC_API_KEY ? 'claude-opus-5' : null };
  }
}

function corrected(log: Logger, row: any, drift: Array<{ field: string }>) {
  log.log(`flag ${row.id} auto-corrected: ${drift.map((d) => d.field).join(', ')}`);
}

function isoOf(v: any): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
