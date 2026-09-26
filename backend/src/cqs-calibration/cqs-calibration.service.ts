import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { nameKey } from '../congress-trades/influence-map.service';
import {
  CQS_COMPONENT_WEIGHTS,
  clamp,
  isExcludedSecurity,
  scoreC1ClusterBreadth,
  scoreC2PositionSize,
  scoreC7Freshness,
  scoreC8NetDirection,
} from '../cqs/cqs-math';

/**
 * Brief v9 §5 — the calibration harness.
 *
 * The brief's three demands, quoted:
 *
 *  - "Weights and thresholds are fitted on a training window only (disclosure
 *    history through Dec 2023), using point-in-time data: a trade enters the
 *    score on its FILING date, never its transaction date. Anything else is
 *    lookahead."
 *  - "Test: forward returns of CQS deciles at 1, 3, 6 and 12 months, measured
 *    from filing date, vs. sector-matched benchmarks. The score is valid only
 *    if higher deciles monotonically outperform lower deciles in the holdout
 *    (2024 → present)."
 *  - "Component ablation: each component removed in turn; any whose removal
 *    doesn't degrade holdout decile spread is dropped or down-weighted."
 *
 * This module is deliberately separate from CqsService. The live scorer reads
 * today's committee rosters, today's contract flags, today's Brief v7 member
 * grades and today's member medians — all of which are single-valued "current
 * state" tables with no history. Calling it with an as-of date in 2019 would
 * silently score 2019 clusters with 2026 knowledge, which is exactly the
 * lookahead the brief forbids. So the historical walk re-derives a REDUCED
 * score here, from the only inputs the database can honestly rewind.
 *
 * ── What the historical score contains, and what it does not ──────────────
 *
 * INCLUDED (computable point-in-time from congressional_transactions alone):
 *   C1 cluster breadth   — distinct filed buyers in the window
 *   C2 position size     — disclosure bands, per member, summed and capped
 *   C7 freshness         — days from transaction to the as-of date
 *   C8 net direction     — filed buy dollars vs filed sell dollars
 *
 * EXCLUDED, and never silently:
 *   C3 committee influence — committee seats/roles are stored as a current
 *     roster, not as dated snapshots. A member who chairs Armed Services today
 *     was a back-bencher in 2017; using today's seat is lookahead.
 *   C4 contract alignment  — the contract/CTS flag table (ct_flags) holds the
 *     current intersection set with no as-of dimension, and on production it
 *     has a handful of rows in total, so it is both unrewindable and nearly
 *     empty.
 *   C5 buyer track record  — Brief v7 member grades are recomputed from the
 *     member's WHOLE history including trades made after the as-of date. A
 *     2019 cluster graded with a 2026 grade is the purest form of lookahead
 *     available in this codebase.
 *   C6 relative conviction — the member's median band is likewise a
 *     whole-history statistic.
 *
 * Together the four excluded components carry 50% of the live weight, so the
 * reduced score is NOT the production CQS and a decile test on it validates
 * only the half that could be rewound. Every result object returned from here
 * carries that sentence in `limitations`. Do not report a §5 pass without it.
 */

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
/** The brief's training cut. Everything from 2024-01-01 is holdout. */
export const TRAIN_END = '2023-12-31';
export const HOLDOUT_START = '2024-01-01';

/** The four components this harness can compute without lookahead. */
export const REDUCED_COMPONENTS = [
  'c1ClusterBreadth',
  'c2PositionSize',
  'c7Freshness',
  'c8NetDirection',
] as const;
export type ReducedComponent = (typeof REDUCED_COMPONENTS)[number];

export const EXCLUDED_COMPONENTS = [
  'c3CommitteeInfluence',
  'c4ContractAlignment',
  'c5BuyerTrackRecord',
  'c6RelativeConviction',
] as const;

export const HORIZON_MONTHS = [1, 3, 6, 12] as const;
export type HorizonMonths = (typeof HORIZON_MONTHS)[number];

export interface CalibrationRunOpts {
  from?: string;
  to?: string;
  limitWeeks?: number;
  after?: string;
  label?: string;
}

export interface CalibrationRunResult {
  ok: boolean;
  error?: string;
  weeksDone: number;
  cursor: string | null;
  remaining: number;
  done: boolean;
  from: string;
  to: string;
  rowsWritten: number;
  tickersConsidered: number;
  excludedSecurities: number;
  /** Disclosures we could not place in time: no reportedDate, so never PIT-knowable. */
  droppedNoFilingDate: number;
  componentsIncluded: string[];
  componentsExcluded: string[];
  limitations: string[];
}

interface PitTx {
  ticker: string;
  companyName: string;
  politicianName: string;
  party: string | null;
  action: string;
  amountMin: number | null;
  amountMax: number | null;
  transactionMs: number;
  reportedMs: number;
}

interface ScoredRow {
  asOf: string;
  ticker: string;
  cqs: number;
  components: Record<string, number>;
}

interface StoredRow {
  asOf: string;
  ticker: string;
  cqs: number;
  decile: number;
  components: Record<string, number>;
}

export interface DecileStat {
  decile: number;
  n: number;
  meanReturnPct: number;
  meanExcessPct: number;
  medianReturnPct: number;
}

export interface HorizonStats {
  months: number;
  observations: number;
  /** Observations dropped because the horizon ends after our last price bar. */
  truncated: number;
  deciles: DecileStat[];
  spreadPct: number | null;
  monotonic: boolean;
  rankCorrelation: number | null;
}

const DEFAULT_FROM = '2015-01-02';
const DEFAULT_LIMIT_WEEKS = 26;
/** Below this many scored names an as-of date cannot be split into deciles. */
const DEFAULT_MIN_CROSS_SECTION = 20;

@Injectable()
export class CqsCalibrationService {
  private readonly logger = new Logger(CqsCalibrationService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  /** Every numeric that reaches us from node-postgres is a STRING. */
  private num(v: any): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  private ymd(ms: number): string {
    return new Date(ms).toISOString().slice(0, 10);
  }

  private parseDate(s: string | null | undefined): number | null {
    if (!s) return null;
    const ms = Date.parse(`${String(s).slice(0, 10)}T00:00:00Z`);
    return Number.isFinite(ms) ? ms : null;
  }

  private limitations(): string[] {
    return [
      'REDUCED SCORE: the historical walk uses only C1, C2, C7 and C8 (50% of the live CQS weight, renormalised to 100). C3, C4, C5 and C6 are excluded because committee rosters, contract flags, Brief v7 member grades and member medians are stored as current state with no point-in-time history — using today\'s values on a 2019 as-of date would be lookahead.',
      'Multipliers (insider overlap, legislative catalyst, contrarian entry, liquidity normalisation, filing lag) are NOT applied historically: IQS, the legislative calendar and the 52-week context are not stored point-in-time either.',
      'The influence qualification trigger from §1 is not applied historically (it reads the same non-PIT flag table), so the historical universe is the size trigger plus the cluster trigger only. The historical universe is therefore slightly narrower than production.',
      'Benchmarks are sector COHORTS of the scored names on the same as-of date, not sector index total returns: no sector index price series is stored. Excess return is relative to scored peers, so it cannot detect the whole scored population drifting with the market.',
      'Prices come from pit_price_series, which is dividend-unadjusted daily closes for the symbols we hold; delisted or never-ingested tickers simply produce no observation, which biases the surviving sample upward.',
    ];
  }

  // ── Schema ────────────────────────────────────────────────────────────

  async ensureTables(): Promise<{ ok: boolean; error?: string }> {
    try {
      await this.q(`CREATE TABLE IF NOT EXISTS cqs_calibration_runs (
        id bigserial PRIMARY KEY,
        label text,
        started_at timestamptz NOT NULL DEFAULT now(),
        finished_at timestamptz,
        status text NOT NULL DEFAULT 'running',
        params jsonb,
        result jsonb
      )`);
      await this.q(`CREATE TABLE IF NOT EXISTS cqs_pit_scores (
        as_of date NOT NULL,
        ticker text NOT NULL,
        cqs numeric(8,2) NOT NULL DEFAULT 0,
        decile int,
        components jsonb,
        PRIMARY KEY (as_of, ticker)
      )`);
      await this.q(
        `CREATE INDEX IF NOT EXISTS cqs_pit_scores_asof_idx ON cqs_pit_scores (as_of)`,
      );
      await this.q(
        `CREATE INDEX IF NOT EXISTS cqs_pit_scores_decile_idx ON cqs_pit_scores (decile)`,
      );
      return { ok: true };
    } catch (e: any) {
      this.logger.error(`CQS calibration: cannot create tables — ${e?.message}`);
      return { ok: false, error: `cannot create calibration tables: ${e?.message}` };
    }
  }

  // ── The point-in-time walk ────────────────────────────────────────────

  /**
   * Weekly as-of dates (Fridays) between `from` and `to`, resumable.
   *
   * Chunked like every other backfill here: pass `after` (the cursor the last
   * slice returned) and `limitWeeks`, and an external driver walks the decade
   * in slices without ever holding a decade of rows in memory.
   */
  async run(opts: CalibrationRunOpts = {}): Promise<CalibrationRunResult> {
    const base = (ok: boolean, error?: string): CalibrationRunResult => ({
      ok,
      error,
      weeksDone: 0,
      cursor: opts.after || null,
      remaining: 0,
      done: false,
      from: opts.from || DEFAULT_FROM,
      to: opts.to || this.ymd(Date.now()),
      rowsWritten: 0,
      tickersConsidered: 0,
      excludedSecurities: 0,
      droppedNoFilingDate: 0,
      componentsIncluded: [...REDUCED_COMPONENTS],
      componentsExcluded: [...EXCLUDED_COMPONENTS],
      limitations: this.limitations(),
    });

    const ensured = await this.ensureTables();
    if (!ensured.ok) return base(false, ensured.error);

    const fromMs = this.parseDate(opts.from) ?? this.parseDate(DEFAULT_FROM)!;
    const toMs = this.parseDate(opts.to) ?? Date.now();
    if (!(toMs > fromMs)) return base(false, '`to` must be after `from`.');
    const limitWeeks = Math.max(1, Math.min(520, Number(opts.limitWeeks) || DEFAULT_LIMIT_WEEKS));

    const allFridays = this.fridays(fromMs, toMs);
    const afterMs = this.parseDate(opts.after);
    const pending = afterMs == null ? allFridays : allFridays.filter((ms) => ms > afterMs);
    const slice = pending.slice(0, limitWeeks);

    const out = base(true);
    out.from = this.ymd(fromMs);
    out.to = this.ymd(toMs);

    if (!slice.length) {
      out.cursor = allFridays.length ? this.ymd(allFridays[allFridays.length - 1]) : null;
      out.done = true;
      return out;
    }

    const runId = await this.openRun(opts);

    try {
      // One fetch for the whole slice: the earliest window start through the
      // last as-of date. Looping a query per week over a decade is 520 round
      // trips; this is two.
      const windowStartMs = slice[0] - WINDOW_DAYS * DAY;
      const sliceEndMs = slice[slice.length - 1];
      const { txs, droppedNoFilingDate } = await this.loadPitTransactions(
        this.ymd(windowStartMs),
        this.ymd(sliceEndMs),
      );
      out.droppedNoFilingDate = droppedNoFilingDate;

      const consideredTickers = new Set<string>();
      let excluded = 0;
      let rowsWritten = 0;

      for (const asOfMs of slice) {
        const asOf = this.ymd(asOfMs);
        const res = this.scoreAsOf(txs, asOfMs);
        excluded += res.excluded;
        for (const t of res.considered) consideredTickers.add(t);
        if (res.rows.length) {
          const stored = this.assignDeciles(res.rows);
          rowsWritten += await this.persist(asOf, stored);
        }
        out.weeksDone++;
        out.cursor = asOf;
      }

      out.rowsWritten = rowsWritten;
      out.tickersConsidered = consideredTickers.size;
      out.excludedSecurities = excluded;
      out.remaining = Math.max(0, pending.length - slice.length);
      out.done = out.remaining === 0;

      await this.closeRun(runId, 'ok', out);
      return out;
    } catch (e: any) {
      this.logger.error(`CQS calibration run failed: ${e?.message}`);
      await this.closeRun(runId, 'error', { error: String(e?.message || e) });
      return base(false, `calibration run failed: ${e?.message}`);
    }
  }

  /** Every Friday in [from, to] inclusive. */
  private fridays(fromMs: number, toMs: number): number[] {
    const out: number[] = [];
    const d = new Date(fromMs);
    // 5 = Friday in UTC day numbering.
    const shift = (5 - d.getUTCDay() + 7) % 7;
    let ms = fromMs + shift * DAY;
    while (ms <= toMs) {
      out.push(ms);
      ms += 7 * DAY;
    }
    return out;
  }

  /**
   * Disclosures as they were KNOWN, not as they happened.
   *
   * `"reportedDate" <= asOf` is the whole point of §5: a PTR filed 45 days
   * after the trade does not exist to a reader on the trade date. Rows with no
   * reportedDate at all cannot be placed in time, so they are dropped and
   * counted rather than assumed to have been filed promptly.
   */
  private async loadPitTransactions(
    fromDate: string,
    toDate: string,
  ): Promise<{ txs: PitTx[]; droppedNoFilingDate: number }> {
    const rows: any[] = await this.q(
      `SELECT upper(trim(t.ticker)) AS ticker,
              t."companyName"      AS company_name,
              t."politicianName"   AS politician_name,
              t.party              AS party,
              t.action             AS action,
              t."amountMin"        AS amount_min,
              t."amountMax"        AS amount_max,
              to_char(t."transactionDate", 'YYYY-MM-DD') AS transaction_date,
              to_char(t."reportedDate", 'YYYY-MM-DD')    AS reported_date
         FROM congressional_transactions t
        WHERE t.ticker <> ''
          AND t."transactionDate" >= $1::date
          AND t."transactionDate" <= $2::date
          AND t."reportedDate" IS NOT NULL
          AND t."reportedDate" <= $2::date`,
      [fromDate, toDate],
    );

    const [missing]: any[] = await this.q(
      `SELECT count(*)::int AS n
         FROM congressional_transactions t
        WHERE t.ticker <> ''
          AND t."transactionDate" >= $1::date
          AND t."transactionDate" <= $2::date
          AND t."reportedDate" IS NULL`,
      [fromDate, toDate],
    );

    const txs: PitTx[] = [];
    for (const r of rows) {
      const transactionMs = this.parseDate(r.transaction_date);
      const reportedMs = this.parseDate(r.reported_date);
      if (transactionMs == null || reportedMs == null) continue;
      txs.push({
        ticker: String(r.ticker || '').toUpperCase().trim(),
        companyName: String(r.company_name || ''),
        politicianName: String(r.politician_name || ''),
        party: r.party == null ? null : String(r.party),
        action: String(r.action || ''),
        amountMin: this.num(r.amount_min),
        amountMax: this.num(r.amount_max),
        transactionMs,
        reportedMs,
      });
    }
    return { txs, droppedNoFilingDate: this.num(missing?.n) ?? 0 };
  }

  /**
   * The reduced CQS for one as-of date.
   *
   * A disclosure is in the window when BOTH its transaction is inside the
   * trailing 90 days and its filing date has already passed. The second
   * condition is what makes this point-in-time.
   */
  private scoreAsOf(
    all: PitTx[],
    asOfMs: number,
  ): { rows: ScoredRow[]; excluded: number; considered: string[] } {
    const asOf = this.ymd(asOfMs);
    const windowStart = asOfMs - WINDOW_DAYS * DAY;

    const byTicker = new Map<string, PitTx[]>();
    let excluded = 0;
    const excludedSeen = new Set<string>();
    for (const t of all) {
      if (t.reportedMs > asOfMs) continue; // not yet filed — invisible on this date
      if (t.transactionMs > asOfMs || t.transactionMs < windowStart) continue;
      if (!t.ticker) continue;
      if (isExcludedSecurity(t.ticker, t.companyName)) {
        if (!excludedSeen.has(t.ticker)) {
          excludedSeen.add(t.ticker);
          excluded++;
        }
        continue;
      }
      const list = byTicker.get(t.ticker);
      if (list) list.push(t);
      else byTicker.set(t.ticker, [t]);
    }

    const rows: ScoredRow[] = [];
    for (const [ticker, txs] of byTicker) {
      const buys = txs.filter((t) => t.action === 'Buy');
      if (!buys.length) continue;
      const sells = txs.filter((t) => t.action === 'Sell');

      const distinctBuyers = new Set(buys.map((b) => nameKey(b.politicianName)));
      const sizeTrigger = buys.some((b) => (b.amountMin ?? 0) >= 100_001);
      const clusterTrigger =
        distinctBuyers.size >= 2 && buys.some((b) => (b.amountMin ?? 0) >= 15_001);
      // The §1 influence trigger is skipped — see `limitations`.
      if (!sizeTrigger && !clusterTrigger) continue;

      const members = new Map<string, { party: string | null; floors: number[] }>();
      let buyValue = 0;
      for (const b of buys) {
        const floor = b.amountMin ?? 15_001;
        const ceil = b.amountMax ?? floor * 2;
        buyValue += (floor + ceil) / 2;
        const key = nameKey(b.politicianName);
        const m = members.get(key);
        if (m) {
          m.floors.push(floor);
          if (!m.party && b.party) m.party = b.party;
        } else {
          members.set(key, { party: b.party || null, floors: [floor] });
        }
      }

      let sellValue = 0;
      for (const s of sells) {
        const floor = s.amountMin ?? 15_001;
        const ceil = s.amountMax ?? floor * 2;
        sellValue += (floor + ceil) / 2;
      }

      let r = 0;
      let d = 0;
      for (const m of members.values()) {
        const p = String(m.party || '').toUpperCase().charAt(0);
        if (p === 'R') r++;
        else if (p === 'D') d++;
      }
      const isBipartisan = r > 0 && d > 0;

      const lastBuyMs = Math.max(...buys.map((b) => b.transactionMs));
      const daysSinceTx = Math.max(0, Math.floor((asOfMs - lastBuyMs) / DAY));

      const components: Record<ReducedComponent, number> = {
        c1ClusterBreadth: scoreC1ClusterBreadth(members.size, isBipartisan),
        c2PositionSize: scoreC2PositionSize([...members.values()].map((m) => m.floors)),
        c7Freshness: scoreC7Freshness(daysSinceTx),
        c8NetDirection: scoreC8NetDirection(buyValue, sellValue),
      };

      rows.push({
        asOf,
        ticker,
        cqs: this.reducedScore(components),
        components,
      });
    }

    return { rows, excluded, considered: [...byTicker.keys()] };
  }

  /**
   * The live weights, restricted to the four PIT components and renormalised
   * so the reduced score still reads 0–100. The relative importance of C1 vs
   * C2 vs C7 vs C8 is untouched; only the missing half's weight is redistributed
   * proportionally. `zeroed` drops one component for the ablation.
   */
  reducedScore(
    components: Partial<Record<ReducedComponent, number>>,
    zeroed?: ReducedComponent | null,
  ): number {
    let den = 0;
    let num = 0;
    for (const key of REDUCED_COMPONENTS) {
      if (zeroed && key === zeroed) continue;
      const w = CQS_COMPONENT_WEIGHTS[key];
      den += w;
      num += w * (Number(components[key]) || 0);
    }
    if (!(den > 0)) return 0;
    return clamp(num / den, 0, 100);
  }

  /**
   * Deciles are assigned WITHIN an as-of date — a cross-sectional rank, so a
   * quiet week and a busy week contribute the same ten buckets and the test
   * measures ranking skill, not the level of the score.
   */
  private assignDeciles(rows: ScoredRow[]): StoredRow[] {
    const sorted = [...rows].sort((a, b) => a.cqs - b.cqs);
    const n = sorted.length;
    return sorted.map((r, i) => ({
      ...r,
      decile: n <= 1 ? 1 : clamp(Math.floor((i * 10) / n) + 1, 1, 10),
    }));
  }

  private async persist(asOf: string, rows: StoredRow[]): Promise<number> {
    if (!rows.length) return 0;
    const CHUNK = 500;
    let written = 0;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const values: string[] = [];
      const params: any[] = [];
      for (const r of chunk) {
        const p = params.length;
        values.push(`($${p + 1}::date, $${p + 2}, $${p + 3}::numeric, $${p + 4}::int, $${p + 5}::jsonb)`);
        params.push(asOf, r.ticker, r.cqs, r.decile, JSON.stringify(r.components));
      }
      await this.q(
        `INSERT INTO cqs_pit_scores (as_of, ticker, cqs, decile, components)
         VALUES ${values.join(', ')}
         ON CONFLICT (as_of, ticker) DO UPDATE
           SET cqs = EXCLUDED.cqs, decile = EXCLUDED.decile, components = EXCLUDED.components`,
        params,
      );
      written += chunk.length;
    }
    return written;
  }

  private async openRun(opts: CalibrationRunOpts): Promise<number | null> {
    try {
      const rows: any[] = await this.q(
        `INSERT INTO cqs_calibration_runs (label, status, params) VALUES ($1, 'running', $2::jsonb) RETURNING id`,
        [opts.label || 'pit-walk', JSON.stringify(opts)],
      );
      return this.num(rows?.[0]?.id);
    } catch (e: any) {
      this.logger.warn(`CQS calibration: cannot record run — ${e?.message}`);
      return null;
    }
  }

  private async closeRun(id: number | null, status: string, result: any): Promise<void> {
    if (id == null) return;
    try {
      await this.q(
        `UPDATE cqs_calibration_runs SET status = $2, finished_at = now(), result = $3::jsonb WHERE id = $1`,
        [id, status, JSON.stringify(result)],
      );
    } catch (e: any) {
      this.logger.warn(`CQS calibration: cannot close run ${id} — ${e?.message}`);
    }
  }

  // ── Evaluation ────────────────────────────────────────────────────────

  /**
   * Forward returns of the stored deciles at 1/3/6/12 months, training window
   * and holdout reported separately, per §5.
   *
   * The clock starts on the AS-OF date, which under the walk above is a date
   * on which every contributing trade had already been filed — so "measured
   * from filing date" in the brief is honoured by construction.
   */
  async evaluate(opts: { minCrossSection?: number } = {}): Promise<any> {
    const ensured = await this.ensureTables();
    if (!ensured.ok) return { ok: false, error: ensured.error, limitations: this.limitations() };

    const minCross = Math.max(0, Number(opts.minCrossSection ?? DEFAULT_MIN_CROSS_SECTION));

    let rows: StoredRow[];
    try {
      const raw: any[] = await this.q(
        `SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, ticker, cqs, decile, components
           FROM cqs_pit_scores ORDER BY as_of, ticker`,
      );
      rows = raw.map((r) => ({
        asOf: String(r.as_of),
        ticker: String(r.ticker),
        cqs: this.num(r.cqs) ?? 0,
        decile: this.num(r.decile) ?? 0,
        components: (r.components && typeof r.components === 'object' ? r.components : {}) as Record<string, number>,
      }));
    } catch (e: any) {
      this.logger.error(`CQS calibration: cannot read cqs_pit_scores — ${e?.message}`);
      return { ok: false, error: `cannot read cqs_pit_scores: ${e?.message}`, limitations: this.limitations() };
    }

    if (!rows.length) {
      return {
        ok: false,
        error: 'no point-in-time scores stored yet — POST /cqs-calibration/admin/run first.',
        limitations: this.limitations(),
      };
    }

    return this.evaluateRows(rows, minCross, null);
  }

  /** Shared by evaluate() and ablate(): rows in, split statistics out.
   *
   *  `cache` lets the ablation load the price series ONCE for five passes.
   *  Reloading a few thousand jsonb bar arrays per pass is the shape that has
   *  already caused one out-of-memory restart on this box (the FMP bar cache). */
  private async evaluateRows(
    rows: StoredRow[],
    minCross: number,
    zeroed: ReducedComponent | null,
    cache?: {
      prices?: Map<string, Array<[number, number, number]>>;
      sectors?: Map<string, string>;
    },
  ): Promise<any> {
    const tickers = [...new Set(rows.map((r) => r.ticker))];
    const prices = cache?.prices ?? (await this.loadPriceSeries(tickers));
    const sectors = cache?.sectors ?? (await this.loadSectors(tickers));

    // Drop thin cross-sections: fewer than `minCross` names cannot be decile'd.
    const byDate = new Map<string, StoredRow[]>();
    for (const r of rows) {
      const list = byDate.get(r.asOf);
      if (list) list.push(r);
      else byDate.set(r.asOf, [r]);
    }
    let thinDates = 0;
    const usable: StoredRow[] = [];
    for (const [, list] of byDate) {
      if (list.length < minCross) {
        thinDates++;
        continue;
      }
      for (const r of list) usable.push(r);
    }

    const splits = {
      training: usable.filter((r) => r.asOf <= TRAIN_END),
      holdout: usable.filter((r) => r.asOf >= HOLDOUT_START),
    };

    const out: any = {
      ok: true,
      zeroedComponent: zeroed,
      scored: rows.length,
      asOfDates: byDate.size,
      thinDatesDropped: thinDates,
      minCrossSection: minCross,
      priceCoverage: {
        tickers: tickers.length,
        withSeries: prices.size,
        missing: tickers.length - prices.size,
      },
      trainEnd: TRAIN_END,
      holdoutStart: HOLDOUT_START,
      componentsIncluded: [...REDUCED_COMPONENTS],
      componentsExcluded: [...EXCLUDED_COMPONENTS],
      limitations: this.limitations(),
      splits: {} as Record<string, any>,
    };

    for (const [name, list] of Object.entries(splits)) {
      const horizons: HorizonStats[] = [];
      for (const months of HORIZON_MONTHS) {
        horizons.push(this.horizonStats(list, months, prices, sectors));
      }
      out.splits[name] = {
        observations: list.length,
        firstAsOf: list.length ? list[0].asOf : null,
        lastAsOf: list.length ? list[list.length - 1].asOf : null,
        horizons,
      };
    }

    const holdout = out.splits.holdout?.horizons as HorizonStats[] | undefined;
    out.verdict = this.verdict(holdout);
    return out;
  }

  private horizonStats(
    rows: StoredRow[],
    months: number,
    prices: Map<string, Array<[number, number, number]>>,
    sectors: Map<string, string>,
  ): HorizonStats {
    // 1. Raw forward return per observation.
    interface Obs {
      asOf: string;
      decile: number;
      ret: number;
      sector: string;
    }
    const obs: Obs[] = [];
    let truncated = 0;
    for (const r of rows) {
      const pts = prices.get(r.ticker);
      if (!pts?.length) continue;
      const startMs = this.parseDate(r.asOf);
      if (startMs == null) continue;
      const endMs = this.addMonths(startMs, months);
      const p0 = this.closeAtOrBefore(pts, startMs);
      const p1 = this.closeAtOrBefore(pts, endMs);
      // A horizon that runs past our last bar is not a zero return, it is no
      // observation at all. Counting it as flat is how a backtest flatters
      // itself at the recent end, where the holdout lives.
      const lastBarMs = pts[pts.length - 1][0];
      if (endMs > lastBarMs) {
        truncated++;
        continue;
      }
      if (p0 == null || p1 == null || !(p0 > 0)) continue;
      obs.push({
        asOf: r.asOf,
        decile: r.decile,
        ret: ((p1 - p0) / p0) * 100,
        sector: sectors.get(r.ticker) || 'Unknown',
      });
    }

    // 2. Sector-cohort benchmark: the equal-weight mean of the scored names in
    //    the same sector on the same as-of date. See `limitations` — this is a
    //    peer cohort, not a sector index.
    const cohort = new Map<string, { sum: number; n: number }>();
    for (const o of obs) {
      const k = `${o.asOf}|${o.sector}`;
      const c = cohort.get(k);
      if (c) {
        c.sum += o.ret;
        c.n++;
      } else cohort.set(k, { sum: o.ret, n: 1 });
    }

    const buckets = new Map<number, number[]>();
    const excessBuckets = new Map<number, number[]>();
    for (const o of obs) {
      const c = cohort.get(`${o.asOf}|${o.sector}`);
      // A cohort of one IS the observation, so its excess is definitionally
      // zero and would dilute the spread. Fall back to the whole as-of cross
      // section in that case.
      let bench: number;
      if (c && c.n > 1) bench = (c.sum - o.ret) / (c.n - 1);
      else {
        const same = obs.filter((x) => x.asOf === o.asOf && x !== o);
        bench = same.length ? same.reduce((a, x) => a + x.ret, 0) / same.length : 0;
      }
      const d = clamp(o.decile, 1, 10);
      const arr = buckets.get(d);
      if (arr) arr.push(o.ret);
      else buckets.set(d, [o.ret]);
      const ex = excessBuckets.get(d);
      if (ex) ex.push(o.ret - bench);
      else excessBuckets.set(d, [o.ret - bench]);
    }

    const deciles: DecileStat[] = [];
    for (let d = 1; d <= 10; d++) {
      const raw = buckets.get(d) || [];
      const ex = excessBuckets.get(d) || [];
      if (!raw.length) continue;
      deciles.push({
        decile: d,
        n: raw.length,
        meanReturnPct: this.round(this.mean(raw)),
        meanExcessPct: this.round(this.mean(ex)),
        medianReturnPct: this.round(this.median(raw)),
      });
    }

    const top = deciles.find((d) => d.decile === 10);
    const bottom = deciles.find((d) => d.decile === 1);
    const spread =
      top && bottom ? this.round(top.meanExcessPct - bottom.meanExcessPct) : null;

    let monotonic = deciles.length >= 2;
    for (let i = 1; i < deciles.length; i++) {
      if (deciles[i].meanExcessPct < deciles[i - 1].meanExcessPct) {
        monotonic = false;
        break;
      }
    }

    return {
      months,
      observations: obs.length,
      truncated,
      deciles,
      spreadPct: spread,
      monotonic,
      rankCorrelation: this.spearman(
        deciles.map((d) => d.decile),
        deciles.map((d) => d.meanExcessPct),
      ),
    };
  }

  private verdict(holdout: HorizonStats[] | undefined): any {
    if (!holdout?.length) {
      return { passes: false, reason: 'no holdout observations' };
    }
    const scored = holdout.filter((h) => h.observations > 0);
    if (!scored.length) return { passes: false, reason: 'no holdout observations' };
    const allMonotonic = scored.every((h) => h.monotonic);
    const allPositiveSpread = scored.every((h) => (h.spreadPct ?? 0) > 0);
    return {
      passes: allMonotonic && allPositiveSpread,
      monotonicHorizons: scored.filter((h) => h.monotonic).map((h) => h.months),
      positiveSpreadHorizons: scored
        .filter((h) => (h.spreadPct ?? 0) > 0)
        .map((h) => h.months),
      reason: allMonotonic && allPositiveSpread
        ? 'higher deciles outperform lower deciles monotonically at every holdout horizon — on the REDUCED score only (see limitations).'
        : 'the holdout is not monotonic at every horizon, so §5 does not consider the score validated.',
    };
  }

  // ── Ablation ──────────────────────────────────────────────────────────

  /**
   * §5's third demand: "each component removed in turn; any whose removal
   * doesn't degrade holdout decile spread is dropped or down-weighted."
   *
   * Only the four PIT components can be ablated. A component whose ablation is
   * not reported here has not been tested — it was never in the historical
   * score to begin with.
   */
  async ablate(opts: { months?: number; minCrossSection?: number } = {}): Promise<any> {
    const ensured = await this.ensureTables();
    if (!ensured.ok) return { ok: false, error: ensured.error, limitations: this.limitations() };

    const months = (HORIZON_MONTHS as readonly number[]).includes(Number(opts.months))
      ? Number(opts.months)
      : 6;
    const minCross = Math.max(0, Number(opts.minCrossSection ?? DEFAULT_MIN_CROSS_SECTION));

    let rows: StoredRow[];
    try {
      const raw: any[] = await this.q(
        `SELECT to_char(as_of, 'YYYY-MM-DD') AS as_of, ticker, cqs, decile, components
           FROM cqs_pit_scores ORDER BY as_of, ticker`,
      );
      rows = raw.map((r) => ({
        asOf: String(r.as_of),
        ticker: String(r.ticker),
        cqs: this.num(r.cqs) ?? 0,
        decile: this.num(r.decile) ?? 0,
        components: (r.components && typeof r.components === 'object' ? r.components : {}) as Record<string, number>,
      }));
    } catch (e: any) {
      this.logger.error(`CQS calibration: cannot read cqs_pit_scores — ${e?.message}`);
      return { ok: false, error: `cannot read cqs_pit_scores: ${e?.message}`, limitations: this.limitations() };
    }
    if (!rows.length) {
      return {
        ok: false,
        error: 'no point-in-time scores stored yet — POST /cqs-calibration/admin/run first.',
        limitations: this.limitations(),
      };
    }

    const allTickers = [...new Set(rows.map((r) => r.ticker))];
    const cache = {
      prices: await this.loadPriceSeries(allTickers),
      sectors: await this.loadSectors(allTickers),
    };

    const baselineRows = this.rescore(rows, null);
    const baseline = await this.evaluateRows(baselineRows, minCross, null, cache);
    const baseSpread = this.spreadAt(baseline, months);

    const results: any[] = [];
    for (const comp of REDUCED_COMPONENTS) {
      const ablated = await this.evaluateRows(this.rescore(rows, comp), minCross, comp, cache);
      const spread = this.spreadAt(ablated, months);
      const delta =
        baseSpread != null && spread != null ? this.round(spread - baseSpread) : null;
      results.push({
        component: comp,
        liveWeight: CQS_COMPONENT_WEIGHTS[comp],
        holdoutSpreadPct: spread,
        deltaVsBaseline: delta,
        // "Doesn't degrade" = removal left the spread the same or better.
        degradesWhenRemoved: delta != null ? delta < 0 : null,
        recommendation:
          delta == null
            ? 'no holdout evidence — cannot judge'
            : delta < 0
              ? 'keep: removal narrows the holdout spread'
              : 'drop or down-weight: removal does not degrade the holdout spread',
      });
    }

    return {
      ok: true,
      horizonMonths: months,
      baselineHoldoutSpreadPct: baseSpread,
      components: results,
      untestedComponents: [...EXCLUDED_COMPONENTS],
      componentsIncluded: [...REDUCED_COMPONENTS],
      limitations: [
        ...this.limitations(),
        'Ablation covers only the four PIT components. C3-C6 carry 50% of the live weight and have NOT been ablation-tested, so §5 is satisfied for half the score.',
      ],
    };
  }

  private spreadAt(evaluation: any, months: number): number | null {
    const hs: HorizonStats[] = evaluation?.splits?.holdout?.horizons || [];
    const h = hs.find((x) => x.months === months);
    return h?.spreadPct ?? null;
  }

  /** Recompute score and deciles from the stored components, one weight zeroed. */
  private rescore(rows: StoredRow[], zeroed: ReducedComponent | null): StoredRow[] {
    const byDate = new Map<string, StoredRow[]>();
    for (const r of rows) {
      const cqs = this.reducedScore(r.components as any, zeroed);
      const next = { ...r, cqs };
      const list = byDate.get(r.asOf);
      if (list) list.push(next);
      else byDate.set(r.asOf, [next]);
    }
    const out: StoredRow[] = [];
    for (const [, list] of byDate) {
      const sorted = [...list].sort((a, b) => a.cqs - b.cqs);
      const n = sorted.length;
      sorted.forEach((r, i) => {
        out.push({ ...r, decile: n <= 1 ? 1 : clamp(Math.floor((i * 10) / n) + 1, 1, 10) });
      });
    }
    out.sort((a, b) => (a.asOf < b.asOf ? -1 : a.asOf > b.asOf ? 1 : 0));
    return out;
  }

  // ── Status ────────────────────────────────────────────────────────────

  async status(): Promise<any> {
    const ensured = await this.ensureTables();
    if (!ensured.ok) return { ok: false, error: ensured.error, limitations: this.limitations() };
    try {
      const [scores]: any[] = await this.q(
        `SELECT count(*)::int AS rows,
                count(DISTINCT as_of)::int AS as_of_dates,
                count(DISTINCT ticker)::int AS tickers,
                to_char(min(as_of), 'YYYY-MM-DD') AS first_as_of,
                to_char(max(as_of), 'YYYY-MM-DD') AS last_as_of,
                count(*) FILTER (WHERE as_of <= $1::date)::int AS training_rows,
                count(*) FILTER (WHERE as_of >= $2::date)::int AS holdout_rows
           FROM cqs_pit_scores`,
        [TRAIN_END, HOLDOUT_START],
      );
      const runs: any[] = await this.q(
        `SELECT id, label, status,
                to_char(started_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS started_at,
                to_char(finished_at, 'YYYY-MM-DD"T"HH24:MI:SSZ') AS finished_at,
                params
           FROM cqs_calibration_runs ORDER BY id DESC LIMIT 10`,
      );
      return {
        ok: true,
        scores: {
          rows: this.num(scores?.rows) ?? 0,
          asOfDates: this.num(scores?.as_of_dates) ?? 0,
          tickers: this.num(scores?.tickers) ?? 0,
          firstAsOf: scores?.first_as_of ?? null,
          lastAsOf: scores?.last_as_of ?? null,
          trainingRows: this.num(scores?.training_rows) ?? 0,
          holdoutRows: this.num(scores?.holdout_rows) ?? 0,
        },
        cursor: scores?.last_as_of ?? null,
        recentRuns: runs.map((r) => ({
          id: this.num(r.id),
          label: r.label,
          status: r.status,
          startedAt: r.started_at,
          finishedAt: r.finished_at,
          params: r.params,
        })),
        trainEnd: TRAIN_END,
        holdoutStart: HOLDOUT_START,
        componentsIncluded: [...REDUCED_COMPONENTS],
        componentsExcluded: [...EXCLUDED_COMPONENTS],
        limitations: this.limitations(),
      };
    } catch (e: any) {
      this.logger.error(`CQS calibration status failed: ${e?.message}`);
      return { ok: false, error: `status unavailable: ${e?.message}`, limitations: this.limitations() };
    }
  }

  // ── Prices & sectors ──────────────────────────────────────────────────

  /** pit_price_series stores points as [epochMs, close, volume]. */
  private async loadPriceSeries(
    tickers: string[],
  ): Promise<Map<string, Array<[number, number, number]>>> {
    const out = new Map<string, Array<[number, number, number]>>();
    if (!tickers.length) return out;
    try {
      const spellings = new Map<string, string>();
      for (const t of tickers) {
        spellings.set(t, t);
        if (t.includes('.')) spellings.set(t.replace(/\./g, '-'), t);
      }
      const keys = [...spellings.keys()];
      const CHUNK = 1000;
      for (let i = 0; i < keys.length; i += CHUNK) {
        const rows: any[] = await this.q(
          `SELECT symbol, points FROM pit_price_series WHERE symbol = ANY($1::text[])`,
          [keys.slice(i, i + CHUNK)],
        );
        for (const r of rows) {
          const ticker = spellings.get(String(r.symbol).toUpperCase());
          if (!ticker || out.has(ticker)) continue;
          const raw: any[] = Array.isArray(r.points) ? r.points : [];
          const pts: Array<[number, number, number]> = [];
          for (const p of raw) {
            const t = Number(p?.[0]);
            const c = Number(p?.[1]);
            const v = Number(p?.[2]);
            if (Number.isFinite(t) && Number.isFinite(c) && c > 0) {
              pts.push([t, c, Number.isFinite(v) ? v : 0]);
            }
          }
          pts.sort((a, b) => a[0] - b[0]);
          if (pts.length) out.set(ticker, pts);
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `CQS calibration: pit_price_series unavailable (${e?.message}) — forward returns cannot be computed.`,
      );
    }
    return out;
  }

  private async loadSectors(tickers: string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (!tickers.length) return out;
    try {
      const CHUNK = 1000;
      for (let i = 0; i < tickers.length; i += CHUNK) {
        const rows: any[] = await this.q(
          `SELECT upper(ticker) AS ticker, sector FROM companies WHERE upper(ticker) = ANY($1::text[])`,
          [tickers.slice(i, i + CHUNK)],
        );
        for (const r of rows) {
          const t = String(r.ticker || '').toUpperCase();
          const s = String(r.sector || '').trim();
          if (t && s && !out.has(t)) out.set(t, s);
        }
      }
    } catch (e: any) {
      this.logger.warn(
        `CQS calibration: companies.sector unavailable (${e?.message}) — every name falls into one "Unknown" cohort.`,
      );
    }
    return out;
  }

  private addMonths(ms: number, months: number): number {
    const d = new Date(ms);
    const day = d.getUTCDate();
    d.setUTCMonth(d.getUTCMonth() + months);
    // Month-end rollover: 31 Jan + 1 month must not become 3 March.
    if (d.getUTCDate() < day) d.setUTCDate(0);
    return d.getTime();
  }

  /** Last close at or before `atMs`; null when the series starts later. */
  private closeAtOrBefore(
    pts: Array<[number, number, number]>,
    atMs: number,
  ): number | null {
    let lo = 0;
    let hi = pts.length - 1;
    let found = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (pts[mid][0] <= atMs) {
        found = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return found < 0 ? null : pts[found][1];
  }

  // ── Small statistics ──────────────────────────────────────────────────

  private mean(xs: number[]): number {
    return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
  }

  private median(xs: number[]): number {
    if (!xs.length) return 0;
    const s = [...xs].sort((a, b) => a - b);
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  private round(x: number): number {
    return Math.round(x * 100) / 100;
  }

  /** Pearson correlation on the decile indices — the deciles are already ranks. */
  private spearman(xs: number[], ys: number[]): number | null {
    const n = Math.min(xs.length, ys.length);
    if (n < 3) return null;
    const mx = this.mean(xs.slice(0, n));
    const my = this.mean(ys.slice(0, n));
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < n; i++) {
      const a = xs[i] - mx;
      const b = ys[i] - my;
      num += a * b;
      dx += a * a;
      dy += b * b;
    }
    if (!(dx > 0) || !(dy > 0)) return null;
    return this.round(num / Math.sqrt(dx * dy));
  }
}
