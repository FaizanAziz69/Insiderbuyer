import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { classifyTransaction, liquidityGate, ExclusionReason } from './exclusions';
import { scoreTrade, TradeInputs, num } from './trade-score';
import { scoreCompany, ScoredTrade } from './company-score';
import { gradeFor, badgesFor, BadgeKey } from './trade-grade';
import { IQS2_CONFIG, WEIGHTS_LAUNCH, TradeWeights } from './config';

/**
 * IQS 2.0 shadow scoring (brief Phase 2: "computed shadow-only (not public)",
 * exit criterion "Daily shadow scores for full universe").
 *
 * Everything is written to its own tables so IQS 1.0 is untouched and can be
 * compared against — the brief's "freeze IQS 1.0 values in the database
 * (column, not overwrite)" requirement is satisfied by simply not writing to
 * the v1 tables at all.
 *
 * Determinism (acceptance §5): the score for an as-of date is a pure function
 * of the archived filings plus the price series, and every input we used is
 * persisted alongside the score, so a recompute reproduces it.
 */
@Injectable()
export class Iqs2Service {
  private readonly logger = new Logger(Iqs2Service.name);
  private tablesReady = false;
  private running = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private async q(sql: string, params: unknown[] = []) {
    return this.companies.query(sql, params);
  }

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    await this.q(`CREATE TABLE IF NOT EXISTS iqs2_trade_scores (
      tx_id uuid PRIMARY KEY,
      company_id uuid NOT NULL,
      insider_key varchar(255) NOT NULL,
      transaction_date date NOT NULL,
      scored boolean NOT NULL,
      reason varchar(48),
      detail text,
      trade_score numeric(8,3),
      grade varchar(2),
      grade_percentile numeric(8,6),
      badges jsonb,
      components jsonb,
      inputs jsonb,
      as_of date NOT NULL,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(
      `CREATE INDEX IF NOT EXISTS iqs2_trade_company_idx ON iqs2_trade_scores (company_id, transaction_date DESC)`,
    );
    await this.q(
      `CREATE INDEX IF NOT EXISTS iqs2_trade_insider_idx ON iqs2_trade_scores (insider_key)`,
    );
    // Added after the table shipped, so they are patched in rather than
    // assumed — an existing install has the table without them.
    for (const col of [
      'grade varchar(2)',
      'grade_percentile numeric(8,6)',
      'badges jsonb',
    ]) {
      await this.q(
        `ALTER TABLE iqs2_trade_scores ADD COLUMN IF NOT EXISTS ${col}`,
      );
    }
    await this.q(
      `CREATE INDEX IF NOT EXISTS iqs2_trade_grade_idx ON iqs2_trade_scores (transaction_date DESC, grade)`,
    );
    await this.q(`CREATE TABLE IF NOT EXISTS iqs2_company_scores (
      company_id uuid NOT NULL,
      as_of date NOT NULL,
      score numeric(6,2),
      raw numeric(14,4),
      multiplier numeric(6,3),
      percentile numeric(8,6),
      calibrated numeric(8,3),
      penalties jsonb,
      distinct_buyers int,
      counted_trades int,
      unscored_reason varchar(40),
      weights jsonb,
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (company_id, as_of)
    )`);
    await this.q(
      `CREATE INDEX IF NOT EXISTS iqs2_company_score_idx ON iqs2_company_scores (as_of, score DESC)`,
    );
    this.tablesReady = true;
  }

  /* ── price helpers ──────────────────────────────────────────────────── */

  /** Ascending closes for a symbol, cached in price_history_cache. */
  private async bars(symbol: string, fromISO: string): Promise<Array<{ t: number; c: number }>> {
    const sym = (symbol || '').toUpperCase();
    if (!sym) return [];
    try {
      const rows = await this.fmp.getEodBars(sym, { from: fromISO, light: true, adjusted: true });
      return rows
        .map((b: any) => ({ t: new Date(b.date ?? b.t).getTime(), c: Number(b.close ?? b.c) }))
        .filter((p) => Number.isFinite(p.t) && Number.isFinite(p.c) && p.c > 0)
        .sort((a, b) => a.t - b.t);
    } catch {
      return [];
    }
  }

  /** Percentage return between the closes nearest two dates. */
  private returnBetween(
    series: Array<{ t: number; c: number }>,
    fromMs: number,
    toMs: number,
  ): number | null {
    if (series.length < 2) return null;
    const at = (ms: number) => {
      let best: { t: number; c: number } | null = null;
      for (const p of series) {
        if (p.t <= ms) best = p;
        else break;
      }
      return best;
    };
    const a = at(fromMs);
    const b = at(toMs);
    if (!a || !b || a.c <= 0) return null;
    return ((b.c - a.c) / a.c) * 100;
  }

  /** Daily volatility in percent over the trailing series. */
  private dailyVolPct(series: Array<{ t: number; c: number }>): number | null {
    if (series.length < 30) return null;
    const rets: number[] = [];
    for (let i = 1; i < series.length; i++) {
      const prev = series[i - 1].c;
      if (prev > 0) rets.push(((series[i].c - prev) / prev) * 100);
    }
    if (rets.length < 20) return null;
    const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
    const varc = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / (rets.length - 1);
    const sd = Math.sqrt(varc);
    return Number.isFinite(sd) && sd > 0 ? sd : null;
  }

  /* ── the run ────────────────────────────────────────────────────────── */

  /**
   * Compute shadow scores for the whole universe as of `asOf` (default today).
   * `limit` exists for smoke runs; a full run is the daily cron.
   */
  async computeAll(opts: { asOf?: string; limit?: number; weights?: TradeWeights } = {}) {
    if (this.running) return { skipped: true, reason: 'already running' };
    this.running = true;
    const started = Date.now();
    const weights = opts.weights ?? WEIGHTS_LAUNCH;
    try {
      await this.ensureTables();
      const asOf = opts.asOf ? new Date(opts.asOf) : new Date();
      const asOfISO = asOf.toISOString().slice(0, 10);
      const windowStart = new Date(asOf.getTime() - IQS2_CONFIG.windowDays * 86400000);
      // 24 months of history is needed for the routine-vs-opportunistic count.
      const historyStart = new Date(asOf.getTime() - 730 * 86400000);

      // Every transaction we may need: the scoring window plus the 24-month
      // behavioural history behind it, in one query.
      const txs: any[] = await this.q(
        `SELECT t.id, t.company_id AS "companyId", t."insiderName", t."insiderCik",
                t.role, t."rawTitle", t."transactionCode", t."plannedBuy",
                t."acquiredDisposed", t."transactionDate",
                t."sharesBought"::float8 AS "sharesBought",
                t."pricePerShare"::float8 AS "pricePerShare",
                t."totalValue"::float8 AS "totalValue",
                t."previousHoldings"::float8 AS "previousHoldings",
                c.ticker, c.sector, c.industry,
                c."marketCap"::float8 AS "marketCap",
                c."lastPrice"::float8 AS "lastPrice",
                c."dilutionPctTtm"::float8 AS "dilutionPctTtm"
           FROM insider_transactions t
           JOIN companies c ON c.id = t.company_id
          WHERE t."transactionDate" >= $1 AND t."transactionDate" <= $2`,
        [historyStart.toISOString().slice(0, 10), asOfISO],
      );

      // Identity resolution: one insider across issuers is one track record.
      const keyOf = (t: any) =>
        (t.insiderCik && String(t.insiderCik).trim()) ||
        `name:${String(t.insiderName || '').trim().toLowerCase()}`;

      // Workstream A on everything, so nothing is silently dropped.
      const decisions = new Map<string, ReturnType<typeof classifyTransaction>>();
      for (const t of txs) decisions.set(t.id, classifyTransaction(t));

      const scoredHistory = txs.filter((t) => decisions.get(t.id)!.scored);
      // Trade Grades are percentile-ranked against a TRAILING YEAR of graded
      // purchases (follow-up brief), while the company roll-up stays on its
      // 90-day window. Only ~3k code-P purchases survive Workstream A in a
      // year, so scoring the whole year costs one extra price fetch per
      // company rather than an order of magnitude more work.
      const gradeStart = new Date(asOf.getTime() - IQS2_CONFIG.gradeWindowDays * 86400000);
      const inGradeWindow = scoredHistory.filter(
        (t) => new Date(t.transactionDate).getTime() >= gradeStart.getTime(),
      );
      const inWindow = inGradeWindow.filter(
        (t) => new Date(t.transactionDate).getTime() >= windowStart.getTime(),
      );

      // Behavioural aggregates from OUR archive (no vendor needed).
      const buys24mByInsider = new Map<string, any[]>();
      for (const t of scoredHistory) {
        const k = keyOf(t);
        if (!buys24mByInsider.has(k)) buys24mByInsider.set(k, []);
        buys24mByInsider.get(k)!.push(t);
      }

      /** Cohen–Malloy–Pomorski: same calendar month in ≥3 consecutive prior years. */
      const routine = (k: string, when: Date): boolean => {
        const all = buys24mByInsider.get(k) || [];
        const month = when.getMonth();
        const year = when.getFullYear();
        let streak = 0;
        for (let back = 1; back <= 3; back++) {
          const hit = all.some((t) => {
            const d = new Date(t.transactionDate);
            return d.getMonth() === month && d.getFullYear() === year - back;
          });
          if (hit) streak++;
          else break;
        }
        return streak >= 3;
      };

      // Companies in play, and their price context (one fetch per symbol).
      const companyIds = Array.from(new Set(inGradeWindow.map((t) => t.companyId)));
      const limited = opts.limit ? companyIds.slice(0, opts.limit) : companyIds;
      const byCompany = new Map<string, any[]>();
      for (const t of inGradeWindow) {
        if (!limited.includes(t.companyId)) continue;
        if (!byCompany.has(t.companyId)) byCompany.set(t.companyId, []);
        byCompany.get(t.companyId)!.push(t);
      }

      // Ownership + net-buyer context reuses the v1 pipeline's own numbers.
      const ownershipRows: any[] = await this.q(
        `SELECT DISTINCT ON (s.company_id) s.company_id AS "companyId",
                s."insiderOwnershipPct"::float8 AS "ownershipPct"
           FROM iqs_scores s ORDER BY s.company_id, s."asOfDate" DESC`,
      );
      const ownershipByCompany = new Map<string, number | null>(
        ownershipRows.map((r) => [r.companyId, num(r.ownershipPct)]),
      );

      const sellers90d: any[] = await this.q(
        `SELECT company_id AS "companyId", COUNT(DISTINCT "insiderName")::int AS n
           FROM insider_transactions
          WHERE "transactionCode" = 'S' AND "transactionDate" >= $1
          GROUP BY company_id`,
        [windowStart.toISOString().slice(0, 10)],
      );
      const sellerCount = new Map<string, number>(sellers90d.map((r) => [r.companyId, r.n]));

      const priceFrom = new Date(asOf.getTime() - 400 * 86400000).toISOString().slice(0, 10);
      const results: Array<{
        companyId: string;
        ticker: string | null;
        trades: ScoredTrade[];
        adjusted: number;
        unscored: string | null;
        perTrade: Array<{ tx: any; breakdown: ReturnType<typeof scoreTrade> }>;
        shareGrowth: number | null;
      }> = [];

      for (const companyId of byCompany.keys()) {
        const group = byCompany.get(companyId)!;
        const first = group[0];

        const gate = liquidityGate({
          lastPrice: first.lastPrice,
          medianDollarVolume30d: null, // volume feed lands with Workstream D
        });

        const series = await this.bars(first.ticker, priceFrom);
        const vol = this.dailyVolPct(series);
        const sixMonthsAgo = asOf.getTime() - 182 * 86400000;
        const stock6m = this.returnBetween(series, sixMonthsAgo, asOf.getTime());

        const distinctBuyers = new Set(group.map(keyOf)).size;
        const netBuyers = distinctBuyers - (sellerCount.get(companyId) || 0);

        const perTrade = group.map((t) => {
          const k = keyOf(t);
          const when = new Date(t.transactionDate);
          const priorBuys = (buys24mByInsider.get(k) || []).filter(
            (x) => new Date(x.transactionDate).getTime() < when.getTime(),
          );
          const input: TradeInputs = {
            dollars: num(t.totalValue),
            sharesBought: num(t.sharesBought),
            priorHoldings: num(t.previousHoldings),
            // Track record needs forward returns on prior buys — the archive
            // backfill lands with Workstream D, so this stays at the neutral
            // prior rather than inventing a number.
            medianForwardReturnPct: null,
            priorBuyCount: priorBuys.length,
            role: t.role,
            rawTitle: t.rawTitle,
            buysTrailing24m: priorBuys.length,
            routinePattern: routine(k, when),
            stockReturn6mPct: stock6m,
            sectorReturn6mPct: null,
            dailyVolPct: vol,
            priceToBookPercentile: null,
            negativeBookValue: null,
            marketCap: num(t.marketCap),
            ownershipFraction:
              ownershipByCompany.get(companyId) != null
                ? (ownershipByCompany.get(companyId) as number) / 100
                : null,
            netDistinctBuyers: netBuyers,
          };
          // Badge context, all of it decided by filing data.
          const priorAtCompany = priorBuys.filter((x) => x.companyId === companyId);
          const lastAtCompany = priorAtCompany.length
            ? Math.max(...priorAtCompany.map((x) => new Date(x.transactionDate).getTime()))
            : null;
          const firstBuy =
            lastAtCompany === null ||
            when.getTime() - lastAtCompany >
              IQS2_CONFIG.firstBuyGapYears * 365 * 86400000;
          const clusterBuyers30d = new Set(
            group
              .filter(
                (x) =>
                  Math.abs(new Date(x.transactionDate).getTime() - when.getTime()) <=
                  30 * 86400000,
              )
              .map(keyOf),
          ).size;
          // companies.dilutionPctTtm is already a FRACTION — getDilutionTtm
          // returns latest/prior - 1, so AAPL reads -0.0166 for its ~1.7%
          // buyback. Dividing by 100 (as an earlier reading of ACON's 563 as
          // a percent did) made the penalty 100x too small and effectively
          // switched it off: 272 companies clear the 25% cap as fractions,
          // only 12 did under the divided value.
          const shareGrowthTtm = num(t.dilutionPctTtm);

          const breakdown = scoreTrade(input, weights);
          const badges = badgesFor({
            dollars: input.dollars,
            holdingsRatio:
              (num(t.previousHoldings) ?? 0) > 0
                ? (num(t.sharesBought) ?? 0) / (num(t.previousHoldings) as number)
                : null,
            hasPriorPosition: (num(t.previousHoldings) ?? 0) > 0,
            contrarianZ: breakdown.detail.contrarianZ as number | null,
            role: t.role,
            rawTitle: t.rawTitle,
            clusterBuyers30d,
            firstBuy,
            shareGrowthTtm,
          });
          return { tx: t, breakdown, input, badges, shareGrowthTtm };
        });

        // The roll-up is a 90-day product even though the grade population is
        // a year, so the older trades are scored and graded but never counted
        // into a company score.
        const trades: ScoredTrade[] = perTrade
          .filter(
            (p) => new Date(p.tx.transactionDate).getTime() >= windowStart.getTime(),
          )
          .map((p) => ({
            score: p.breakdown.score,
            ageDays: Math.max(
              0,
              Math.floor((asOf.getTime() - new Date(p.tx.transactionDate).getTime()) / 86400000),
            ),
            insiderKey: keyOf(p.tx),
          }));

        // Provisional roll-up to get this company's M×Raw for the universe.
        const provisional = scoreCompany({
          trades,
          shareGrowthTtm: null,
          universeRaw: [],
        });

        results.push({
          companyId,
          ticker: first.ticker,
          trades,
          adjusted: provisional.raw * provisional.multiplier,
          unscored: gate,
          perTrade: perTrade as any,
          // Already a fraction (see the note on shareGrowthTtm above).
          shareGrowth: num(first.dilutionPctTtm),
        });
      }

      // Calibration basis: every company's M×Raw for this as-of date.
      const universeRaw = results.filter((r) => !r.unscored).map((r) => r.adjusted);

      // Trade Grades: percentile-rank every graded purchase in the trailing
      // year against the others, then map to a letter. Ties take the midpoint
      // so a run of identical scores does not all land in the top band.
      const allTradeScores = results
        .flatMap((r) => r.perTrade as any[])
        .map((p) => p.breakdown.score)
        .sort((a, b) => a - b);
      const percentileOfScore = (v: number): number => {
        if (!allTradeScores.length) return 0;
        let below = 0;
        let equal = 0;
        for (const x of allTradeScores) {
          if (x < v) below++;
          else if (x === v) equal++;
          else break;
        }
        return (below + equal / 2) / allTradeScores.length;
      };

      // A recompute is AUTHORITATIVE for its as-of date. Without this, a
      // company that stops qualifying — because an exclusion rule newly
      // catches its only buyer — keeps the score from the previous run
      // forever, which is how Republic Services held the top of the board on
      // 50 purchases that had just been excluded. It also gives the brief's
      // determinism criterion its meaning: re-running a date reproduces that
      // date, it does not merge with what was there before.
      await this.q(`DELETE FROM iqs2_company_scores WHERE as_of = $1`, [asOfISO]);

      let written = 0;
      for (const r of results) {
        const final = scoreCompany({
          trades: r.trades,
          shareGrowthTtm: r.shareGrowth,
          universeRaw,
        });
        await this.q(
          `INSERT INTO iqs2_company_scores
             (company_id, as_of, score, raw, multiplier, percentile, calibrated,
              penalties, distinct_buyers, counted_trades, unscored_reason, weights, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10,$11,$12::jsonb, now())
           ON CONFLICT (company_id, as_of) DO UPDATE SET
             score = EXCLUDED.score, raw = EXCLUDED.raw, multiplier = EXCLUDED.multiplier,
             percentile = EXCLUDED.percentile, calibrated = EXCLUDED.calibrated,
             penalties = EXCLUDED.penalties, distinct_buyers = EXCLUDED.distinct_buyers,
             counted_trades = EXCLUDED.counted_trades, unscored_reason = EXCLUDED.unscored_reason,
             weights = EXCLUDED.weights, "updatedAt" = now()`,
          [
            r.companyId,
            asOfISO,
            r.unscored ? null : final.score,
            final.raw,
            final.multiplier,
            final.percentile,
            final.calibrated,
            JSON.stringify(final.penalties),
            final.distinctBuyers,
            final.countedTrades,
            r.unscored,
            JSON.stringify(weights),
          ],
        );
        written++;
      }

      // Per-trade rows: every transaction in the grade window, scored or
      // excluded — the explainer renders the decision for all of them.
      const scoredByTx = new Map<string, any>();
      for (const r of results) for (const p of r.perTrade as any[]) scoredByTx.set(p.tx.id, p);

      const rows: any[][] = [];
      for (const t of txs) {
        const d = decisions.get(t.id)!;
        const when = new Date(t.transactionDate).getTime();
        if (when < gradeStart.getTime()) continue;
        const hit = scoredByTx.get(t.id);
        const pct = hit ? percentileOfScore(hit.breakdown.score) : null;
        rows.push([
          t.id,
          t.companyId,
          keyOf(t),
          new Date(t.transactionDate).toISOString().slice(0, 10),
          d.scored,
          d.reason,
          d.detail,
          hit ? hit.breakdown.score : null,
          pct === null ? null : gradeFor(pct),
          pct,
          JSON.stringify(hit ? (hit.badges as BadgeKey[]) : []),
          JSON.stringify(hit ? hit.breakdown.components : null),
          JSON.stringify(hit ? hit.input : null),
          asOfISO,
        ]);
      }

      // Batched upsert: one statement per 200 rows. The row-at-a-time loop
      // this replaces was the whole cost of a run.
      const COLS = 14;
      let txWritten = 0;
      for (let i = 0; i < rows.length; i += 200) {
        const chunk = rows.slice(i, i + 200);
        const values = chunk
          .map(
            (_, n) =>
              `(${Array.from({ length: COLS }, (__, k) => `$${n * COLS + k + 1}`).join(',')})`,
          )
          .join(',');
        await this.q(
          `INSERT INTO iqs2_trade_scores
             (tx_id, company_id, insider_key, transaction_date, scored, reason, detail,
              trade_score, grade, grade_percentile, badges, components, inputs, as_of)
           VALUES ${values}
           ON CONFLICT (tx_id) DO UPDATE SET
             scored = EXCLUDED.scored, reason = EXCLUDED.reason, detail = EXCLUDED.detail,
             trade_score = EXCLUDED.trade_score, grade = EXCLUDED.grade,
             grade_percentile = EXCLUDED.grade_percentile, badges = EXCLUDED.badges,
             components = EXCLUDED.components, inputs = EXCLUDED.inputs,
             as_of = EXCLUDED.as_of, "updatedAt" = now()`,
          chunk.flat(),
        );
        txWritten += chunk.length;
      }

      const ms = Date.now() - started;
      this.logger.log(
        `IQS 2.0 shadow run ${asOfISO}: ${written} companies, ${txWritten} transactions, ${ms}ms`,
      );
      return { asOf: asOfISO, companies: written, transactions: txWritten, ms };
    } finally {
      this.running = false;
    }
  }

  /**
   * Daily full-universe recompute. The brief requires it to finish by 6:30am
   * ET; 05:45 UTC is well ahead of that and clear of the v1 recalc.
   */
  @Cron('45 5 * * *')
  async dailyRefresh() {
    try {
      await this.computeAll();
      // Compute alone would leave the site frozen on whatever was last
      // published by hand: the score every page reads lives in iqs_scores,
      // and nothing else writes it now that v2 is the published model.
      await this.publish();
    } catch (e: any) {
      this.logger.error(`IQS 2.0 daily run failed: ${e?.message || e}`);
    }
  }

  /**
   * Publish IQS 2.0 into the score the whole site already reads.
   *
   * George, 2026-09-02: the new score goes live everywhere, and into the
   * EXISTING column rather than a parallel one — so `iqs_scores.iqs` (which
   * /rankings, /insiders/hot, company pages, movers, lists and the home rail
   * all read) becomes the v2 number, and no query anywhere has to change.
   *
   * The whole published row is moved to v2 together — score, counted buys and
   * distinct buyers — because a v2 score beside a v1 buy-count would be two
   * methodologies in one row. Companies whose only buyers are now excluded
   * therefore land at 0 counted buys and drop off the board, which is the
   * honest outcome: under the published rules they have no insider buying.
   *
   * Reversible: `POST /iqs/recalculate` rewrites these columns from the v1
   * model, and every v2 value is kept in iqs2_company_scores regardless.
   */
  async publish(): Promise<{ updated: number; cleared: number; asOf: string }> {
    await this.ensureTables();
    const [latest] = await this.q(`SELECT MAX(as_of) AS d FROM iqs2_company_scores`);
    const asOf = latest?.d ? new Date(latest.d).toISOString().slice(0, 10) : null;
    if (!asOf) return { updated: 0, cleared: 0, asOf: '' };

    // Scored companies take the v2 number on their latest v1 row.
    const updated = await this.q(
      `UPDATE iqs_scores s
          SET iqs = v2.score,
              "transactionCount" = v2.counted_trades,
              "distinctBuyers" = v2.distinct_buyers
         FROM iqs2_company_scores v2
        WHERE v2.as_of = $1
          AND v2.score IS NOT NULL
          AND s.company_id = v2.company_id
          AND s."asOfDate" = (
            SELECT MAX(x."asOfDate") FROM iqs_scores x WHERE x.company_id = s.company_id
          )
        RETURNING s.id`,
      [asOf],
    );

    // Every other published row. Under the v2 rules a company with no
    // qualifying officer/director purchase in the trailing 90 days simply has
    // no score, and that is most of what is left here — including names the
    // v2 run never wrote a row for at all because none of their filings
    // survived Workstream A (NVDA and AAPL both sat at 23 with zero counted
    // buys). Leaving them alone would keep a retired methodology's number on
    // a live page, so the whole board moves to v2 together or not at all.
    const cleared = await this.q(
      `UPDATE iqs_scores s
          SET "transactionCount" = 0, "distinctBuyers" = 0, iqs = 0
        WHERE s."asOfDate" = (
                SELECT MAX(x."asOfDate") FROM iqs_scores x WHERE x.company_id = s.company_id
              )
          -- Either half may already be zero from an earlier partial publish,
          -- so this cannot key on the count alone: NVDA kept iqs 23 with a
          -- count of 0 because a previous run had zeroed only the count.
          AND (s."transactionCount" > 0 OR s.iqs > 0)
          AND NOT EXISTS (
                SELECT 1 FROM iqs2_company_scores v2
                 WHERE v2.company_id = s.company_id
                   AND v2.as_of = $1
                   AND v2.score IS NOT NULL
              )
        RETURNING s.id`,
      [asOf],
    );

    // TypeORM's query() returns [rows, affectedCount] for UPDATE ... RETURNING,
    // so .length on the result is always 2 and reads like a failed publish.
    const rowCount = (r: unknown): number => {
      if (!Array.isArray(r)) return 0;
      const [rows, affected] = r as [unknown, unknown];
      if (Array.isArray(rows)) return typeof affected === 'number' ? affected : rows.length;
      return r.length;
    };
    const updatedN = rowCount(updated);
    const clearedN = rowCount(cleared);
    this.logger.log(
      `IQS 2.0 published: ${updatedN} scored, ${clearedN} cleared (as of ${asOf})`,
    );
    return { updated: updatedN, cleared: clearedN, asOf };
  }

  /**
   * "Top Insider Buys" — the ranked TRANSACTION list (follow-up brief). The
   * company board ranks issuers by IQS; this ranks individual purchases by
   * Trade Grade, then by dollar value inside a grade.
   */
  async topBuys(opts: {
    period?: string;
    grade?: string;
    badge?: string;
    sector?: string;
    minMarketCap?: number;
    maxMarketCap?: number;
    limit?: number;
  }) {
    await this.ensureTables();
    const days = opts.period === '24h' ? 1 : opts.period === '30d' ? 30 : 7;
    const limit = Math.min(Math.max(opts.limit ?? 100, 1), 500);

    const params: unknown[] = [days];
    const where: string[] = [
      't.scored = true',
      't.grade IS NOT NULL',
      't.transaction_date >= CURRENT_DATE - $1::int',
    ];
    if (opts.grade === 'A') where.push("t.grade IN ('A+','A')");
    else if (opts.grade === 'B') where.push("t.grade IN ('A+','A','B')");
    if (opts.badge) {
      params.push(JSON.stringify([opts.badge]));
      where.push(`t.badges @> $${params.length}::jsonb`);
    }
    if (opts.sector) {
      params.push(opts.sector);
      where.push(`(c.sector ILIKE $${params.length} OR c.industry ILIKE $${params.length})`);
    }
    if (opts.minMarketCap != null) {
      params.push(opts.minMarketCap);
      where.push(`c."marketCap" >= $${params.length}`);
    }
    if (opts.maxMarketCap != null) {
      params.push(opts.maxMarketCap);
      where.push(`c."marketCap" <= $${params.length}`);
    }
    params.push(limit);

    const rows = await this.q(
      `SELECT t.tx_id AS "txId", t.transaction_date AS "date", t.grade,
              t.trade_score::float8 AS "tradeScore", t.badges,
              t.grade_percentile::float8 AS percentile,
              x."insiderName", x."rawTitle", x.role,
              x."sharesBought"::float8 AS shares, x."pricePerShare"::float8 AS price,
              x."totalValue"::float8 AS value, x."filingUrl" AS "filingUrl",
              x."accessionNumber" AS accession,
              c.ticker, c.name, c.sector, c."marketCap"::float8 AS "marketCap"
         FROM iqs2_trade_scores t
         JOIN insider_transactions x ON x.id = t.tx_id
         JOIN companies c ON c.id = t.company_id
        WHERE ${where.join(' AND ')}
        ORDER BY CASE t.grade WHEN 'A+' THEN 6 WHEN 'A' THEN 5 WHEN 'B' THEN 4
                              WHEN 'C' THEN 3 WHEN 'D' THEN 2 ELSE 1 END DESC,
                 x."totalValue" DESC
        LIMIT $${params.length}`,
      params,
    );
    return { period: opts.period ?? '7d', count: rows.length, rows };
  }

  /** Trade grades + badges for one company's filings (ticker page column). */
  async gradesForTicker(tickerRaw: string) {
    await this.ensureTables();
    const ticker = (tickerRaw || '').trim().toUpperCase();
    if (!ticker) return { rows: [] };
    const rows = await this.q(
      `SELECT t.tx_id AS "txId", t.grade, t.trade_score::float8 AS "tradeScore", t.badges,
              t.transaction_date AS "date"
         FROM iqs2_trade_scores t
         JOIN companies c ON c.id = t.company_id
        WHERE UPPER(c.ticker) = $1 AND t.scored = true AND t.grade IS NOT NULL
        ORDER BY t.transaction_date DESC LIMIT 500`,
      [ticker],
    );
    return { ticker, rows };
  }

  async status() {
    await this.ensureTables();
    const [row] = await this.q(
      `SELECT COUNT(*)::int AS companies,
              COUNT(score)::int AS scored,
              MAX(as_of) AS latest,
              MAX("updatedAt") AS computed_at
         FROM iqs2_company_scores
        WHERE as_of = (SELECT MAX(as_of) FROM iqs2_company_scores)`,
    );
    const reasons = await this.q(
      `SELECT reason, COUNT(*)::int AS n FROM iqs2_trade_scores
        WHERE scored = false GROUP BY reason ORDER BY n DESC`,
    );
    return { ...(row || {}), exclusions: reasons, running: this.running };
  }

  /** Full explainer payload for one ticker (Workstream E's data source). */
  async explain(tickerRaw: string) {
    await this.ensureTables();
    const ticker = (tickerRaw || '').trim().toUpperCase();
    if (!ticker) return { found: false };
    const [company] = await this.q(
      `SELECT id, ticker, name, sector, industry, "marketCap"::float8 AS "marketCap",
              "lastPrice"::float8 AS "lastPrice" FROM companies WHERE UPPER(ticker) = $1 LIMIT 1`,
      [ticker],
    );
    if (!company) return { found: false, ticker };
    const [score] = await this.q(
      `SELECT * FROM iqs2_company_scores WHERE company_id = $1 ORDER BY as_of DESC LIMIT 1`,
      [company.id],
    );
    const trades = await this.q(
      `SELECT t.*, x."insiderName", x."transactionCode", x."totalValue"::float8 AS "totalValue"
         FROM iqs2_trade_scores t
         JOIN insider_transactions x ON x.id = t.tx_id
        WHERE t.company_id = $1
        ORDER BY t.transaction_date DESC LIMIT 200`,
      [company.id],
    );
    return { found: true, ticker, company, score: score || null, trades };
  }
}
