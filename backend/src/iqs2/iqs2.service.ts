import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron } from '@nestjs/schedule';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { classifyTransaction, liquidityGate, ExclusionReason } from './exclusions';
import { scoreTrade, TradeInputs, num } from './trade-score';
import { scoreCompany, ScoredTrade } from './company-score';
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
                c."lastPrice"::float8 AS "lastPrice"
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
      const inWindow = scoredHistory.filter(
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
      const companyIds = Array.from(new Set(inWindow.map((t) => t.companyId)));
      const limited = opts.limit ? companyIds.slice(0, opts.limit) : companyIds;
      const byCompany = new Map<string, any[]>();
      for (const t of inWindow) {
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
          return { tx: t, breakdown: scoreTrade(input, weights), input };
        });

        const trades: ScoredTrade[] = perTrade.map((p) => ({
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
          shareGrowth: null,
        });
      }

      // Calibration basis: every company's M×Raw for this as-of date.
      const universeRaw = results.filter((r) => !r.unscored).map((r) => r.adjusted);

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

      // Per-trade rows: every transaction in the window, scored or excluded.
      let txWritten = 0;
      for (const t of txs) {
        const d = decisions.get(t.id)!;
        const when = new Date(t.transactionDate).getTime();
        if (when < windowStart.getTime()) continue;
        const hit = results
          .find((r) => r.companyId === t.companyId)
          ?.perTrade.find((p: any) => p.tx.id === t.id) as any;
        await this.q(
          `INSERT INTO iqs2_trade_scores
             (tx_id, company_id, insider_key, transaction_date, scored, reason, detail,
              trade_score, components, inputs, as_of, "updatedAt")
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11, now())
           ON CONFLICT (tx_id) DO UPDATE SET
             scored = EXCLUDED.scored, reason = EXCLUDED.reason, detail = EXCLUDED.detail,
             trade_score = EXCLUDED.trade_score, components = EXCLUDED.components,
             inputs = EXCLUDED.inputs, as_of = EXCLUDED.as_of, "updatedAt" = now()`,
          [
            t.id,
            t.companyId,
            keyOf(t),
            new Date(t.transactionDate).toISOString().slice(0, 10),
            d.scored,
            d.reason,
            d.detail,
            hit ? hit.breakdown.score : null,
            JSON.stringify(hit ? hit.breakdown.components : null),
            JSON.stringify(hit ? hit.input : null),
            asOfISO,
          ],
        );
        txWritten++;
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
    } catch (e: any) {
      this.logger.error(`IQS 2.0 daily run failed: ${e?.message || e}`);
    }
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
