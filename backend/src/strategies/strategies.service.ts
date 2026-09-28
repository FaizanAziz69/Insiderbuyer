import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { StrategyBacktestService, type StrategyRun } from './strategy-backtest.service';
import { StrategyDataService } from './strategy-data.service';
import { ALL_STRATEGIES, strategyBySlug } from './registry';
import { RECORD_BADGE, type RecordType } from './strategy-types';

/**
 * Brief v8's serving layer: materialize every strategy nightly (§6), and answer
 * the index and detail pages from what was materialized.
 *
 * §4.1 is enforced here rather than left to the frontend. A performance figure
 * leaves this service carrying a record type, always, and the internal panel
 * refuses to return a curve until a real paper or live record exists — "No
 * placeholder or illustrative curve ever appears on the public page."
 */
@Injectable()
export class StrategiesService {
  private readonly log = new Logger(StrategiesService.name);

  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly engine: StrategyBacktestService,
    private readonly data: StrategyDataService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companyRepo.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.data.ensureTables();
    await this.q(`CREATE TABLE IF NOT EXISTS strategy_runs (
      slug        text NOT NULL,
      version     text NOT NULL,
      record_type text NOT NULL,
      from_date   date NOT NULL,
      to_date     date NOT NULL,
      rebalances  int  NOT NULL DEFAULT 0,
      metrics     jsonb,
      equity      jsonb,
      holdings    jsonb,
      log         jsonb,
      turnover    numeric(10,4),
      costs_paid  numeric(10,6),
      hit_rate    numeric(6,4),
      periods_held int NOT NULL DEFAULT 0,
      notes       jsonb,
      -- §6: parameters are frozen before the first published run and
      -- version-stamped. Storing them WITH the run is what makes the
      -- acceptance test possible: holdings reproducible from published rules.
      params      jsonb,
      ran_at      timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, version)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS strategy_runs_ran_idx ON strategy_runs (ran_at DESC)`);
  }

  /** Materialize one strategy. Backtest only — nothing else has a record yet. */
  async runOne(slug: string, opts: { from?: string; to?: string } = {}): Promise<StrategyRun | null> {
    const def = strategyBySlug(slug);
    if (!def) return null;
    await this.ensureTables();
    const ctx = await this.engine.buildContext();
    const to = opts.to ?? new Date().toISOString().slice(0, 10);
    const from = opts.from ?? new Date(Date.now() - 5 * 365 * 86_400_000).toISOString().slice(0, 10);
    const run = await this.engine.run(def, ctx, { from, to });
    await this.q(
      `INSERT INTO strategy_runs (slug, version, record_type, from_date, to_date, rebalances,
                                  metrics, equity, holdings, log, turnover, costs_paid, hit_rate, notes, params, ran_at, periods_held)
       VALUES ($1,$2,'backtest',$3::date,$4::date,$5,$6::jsonb,$7::jsonb,$8::jsonb,$9::jsonb,$10,$11,$12,$13::jsonb,$14::jsonb, now(), $15)
       ON CONFLICT (slug, version) DO UPDATE SET
         record_type = 'backtest', from_date = EXCLUDED.from_date, to_date = EXCLUDED.to_date,
         rebalances = EXCLUDED.rebalances, metrics = EXCLUDED.metrics, equity = EXCLUDED.equity,
         holdings = EXCLUDED.holdings, log = EXCLUDED.log, turnover = EXCLUDED.turnover,
         costs_paid = EXCLUDED.costs_paid, hit_rate = EXCLUDED.hit_rate, notes = EXCLUDED.notes,
         params = EXCLUDED.params, ran_at = now(), periods_held = EXCLUDED.periods_held`,
      [
        def.slug, def.version, from, to, run.rebalances,
        JSON.stringify(run.metrics), JSON.stringify(run.equity), JSON.stringify(run.holdings),
        JSON.stringify(run.log), run.turnover, run.costsPaid, run.hitRate,
        JSON.stringify(run.notes), JSON.stringify(def.params), run.periodsHeld,
      ],
    );
    return run;
  }

  /** Nightly recompute (§6). Sequential: one engine, one price map, one box. */
  async runAll(opts: { from?: string; to?: string } = {}): Promise<{ ran: number; failed: string[] }> {
    await this.ensureTables();
    const failed: string[] = [];
    let ran = 0;
    for (const def of ALL_STRATEGIES) {
      try {
        await this.runOne(def.slug, opts);
        ran++;
      } catch (e: any) {
        this.log.warn(`${def.slug} failed: ${e?.message || e}`);
        failed.push(def.slug);
      }
    }
    this.log.log(`Strategy library: ${ran}/${ALL_STRATEGIES.length} materialized, ${failed.length} failed.`);
    return { ran, failed };
  }

  /** §5.1's index — cards, sorted by Sortino unless asked otherwise. */
  async index(): Promise<any> {
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT slug, version, record_type, from_date::text AS from_date, to_date::text AS to_date,
              metrics, equity, turnover, hit_rate, ran_at
         FROM strategy_runs`,
    ).catch(() => []);
    const byslug = new Map(rows.map((r) => [r.slug, r]));
    const cards = ALL_STRATEGIES.map((def) => {
      const r = byslug.get(def.slug);
      const m = r?.metrics || null;
      return {
        slug: def.slug,
        name: def.name,
        dataset: def.dataset,
        version: def.version,
        rebalanceDays: def.rebalanceDays,
        rulesPlain: def.rulesPlain,
        recordType: (r?.record_type ?? 'backtest') as RecordType,
        recordBadge: RECORD_BADGE[(r?.record_type ?? 'backtest') as RecordType],
        startDate: r?.from_date ?? null,
        // §5.1's sparkline against the S&P 500. Thinned so a card payload is a
        // card payload and not a full equity series.
        spark: Array.isArray(r?.equity)
          ? r.equity.filter((_: any, i: number) => i % Math.ceil(r.equity.length / 40 || 1) === 0)
              .map((e: any) => ({ v: e.value, b: e.benchmark }))
          : [],
        cagr: m?.cagr ?? null,
        sortino: m?.sortino ?? null,
        sharpe: m?.sharpe ?? null,
        maxDrawdown: m?.maxDrawdown ?? null,
        totalReturn: m?.totalReturn ?? null,
        benchmarkTotalReturn: m?.benchmarkTotalReturn ?? null,
        turnover: r?.turnover != null ? Number(r.turnover) : null,
        hitRate: r?.hit_rate != null ? Number(r.hit_rate) : null,
        ranAt: r?.ran_at ?? null,
        /**
         * No result to publish. Either the rule set never held anything, or it
         * held so briefly there is nothing to judge. A card in this state shows
         * the reason instead of a CAGR of zero, which would sit in a sorted
         * column beside strategies that actually traded.
         */
        thin: !r || Number(r.periods_held ?? 0) < 4,
      };
    });
    return {
      generatedAt: new Date().toISOString(),
      defaultSort: 'sortino',
      datasets: ['Congress', 'Insiders', 'Lobbying', 'Contracts', 'Funds', 'Sector'],
      recordTypes: ['backtest', 'paper', 'live'],
      cards,
      internal: await this.internalPanel(),
      disclaimer:
        'Every strategy on this page is computed by our own engine from our own data. Figures marked HYPOTHETICAL — BACKTEST are simulated, not traded, and past simulated performance does not predict future results. Nothing here is investment advice or an offer to manage money.',
    };
  }

  /** §5.2's detail page. */
  async detail(slug: string): Promise<any | null> {
    const def = strategyBySlug(slug);
    if (!def) return null;
    await this.ensureTables();
    const rows: any[] = await this.q(
      `SELECT * FROM strategy_runs WHERE slug = $1 ORDER BY ran_at DESC LIMIT 1`,
      [slug],
    ).catch(() => []);
    const r = rows[0] || null;
    const recordType = (r?.record_type ?? 'backtest') as RecordType;
    return {
      slug: def.slug,
      name: def.name,
      dataset: def.dataset,
      version: def.version,
      rebalanceDays: def.rebalanceDays,
      disclosureLagDays: def.disclosureLagDays,
      rulesPlain: def.rulesPlain,
      // §6: the exact parameter set, version-stamped, published.
      params: def.params,
      limitations: def.limitations,
      recordType,
      recordBadge: RECORD_BADGE[recordType],
      from: r?.from_date ?? null,
      to: r?.to_date ?? null,
      rebalances: r?.rebalances ?? 0,
      equity: r?.equity ?? [],
      metrics: r?.metrics ?? null,
      turnover: r?.turnover != null ? Number(r.turnover) : null,
      hitRate: r?.hit_rate != null ? Number(r.hit_rate) : null,
      costsPaid: r?.costs_paid != null ? Number(r.costs_paid) : null,
      notes: r?.notes ?? [],
      ranAt: r?.ran_at ?? null,
      // Premium (§5.3). Stripped by the controller for everyone else.
      holdings: r?.holdings ?? [],
      rebalanceLog: r?.log ?? [],
    };
  }

  /**
   * §4 — the internal Conviction Quant panel, and §4.1's hardest rule.
   *
   * "Until the paper phase starts, the internal panel renders an explicit
   * 'Track record begins [date] — methodology here' state instead of any curve.
   * No placeholder or illustrative curve ever appears on the public page."
   *
   * So this returns a curve only when real executed or paper orders exist. It
   * does not fall back to a backtest of the internal strategy, because a
   * backtest curve in the slot reserved for a track record is precisely the
   * thing the rule forbids — however it is labelled.
   */
  async internalPanel(): Promise<any> {
    const [orders, snaps] = await Promise.all([
      this.q<Array<{ n: string; first: string | null }>>(
        `SELECT COUNT(*)::text AS n, MIN(created_at)::text AS first FROM quant_orders`,
      ).catch(() => [{ n: '0', first: null }]),
      this.q<Array<{ n: string }>>(`SELECT COUNT(*)::text AS n FROM quant_snapshots`).catch(() => [{ n: '0' }]),
    ]);
    const orderCount = Number(orders[0]?.n || 0);
    if (orderCount === 0) {
      return {
        state: 'not-started',
        recordType: null,
        recordBadge: null,
        equity: null,
        headline: 'Track record begins when the paper phase starts',
        detail:
          'The internal Conviction Quant portfolio has not begun trading, so there is no track record to show. ' +
          'No curve appears here until real paper or live orders exist — a simulated line in this position would ' +
          'read as a record, and it would not be one.',
        methodologyHref: '/index-ibcx',
        snapshotsHeld: Number(snaps[0]?.n || 0),
      };
    }
    return {
      state: 'paper',
      recordType: 'paper' as RecordType,
      recordBadge: RECORD_BADGE.paper,
      startedAt: orders[0]?.first ?? null,
      orders: orderCount,
      methodologyHref: '/index-ibcx',
      detail:
        'Simulated live trading of the internal strategy. Orders are recorded before the market opens and ' +
        'priced at the following close; this is not a live proprietary record and is badged as paper.',
    };
  }
}
