import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { PitService, PitFacts } from './pit.service';
import { DEFAULT_CONFIG, QuantConfig, mergeConfig } from './config';
import { ConvictionTrade, Gate1Result, fundRank, gate1, gate2 } from './ranking';
import { Candidate, TargetPortfolio, buildTargetPortfolio, drawdownProtocol, scaleToBook } from './portfolio';
import { riskMetrics } from './risk';
import { ExecutionService } from './execution.service';

/**
 * L2/L3 orchestration — Brief v6.
 *
 * One nightly pass: rank the universe through both gates, build ONE target
 * portfolio, then scale it to each book. Everything it writes is a snapshot,
 * so any ranking can be reproduced and explained later, which is what §4
 * means by "the research interface must show WHY a name ranks where it does".
 *
 * Sector flow is computed here rather than read from the Hot Sectors cache:
 * that cache holds only the current session, and a sleeve rule that cannot be
 * evaluated historically cannot be backtested.
 */

const DAY = 86_400_000;

export interface SectorFlow {
  sector: string;
  netFlowPct: number;
  drawdownFromHigh: number;
  inflow: boolean;
  contrarian: boolean;
}

@Injectable()
export class QuantService {
  private readonly log = new Logger(QuantService.name);
  private running: { step: string; startedAt: string; progress?: string } | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly pit: PitService,
    private readonly fmp: FmpService,
    private readonly execution: ExecutionService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.pit.ensureTables();
    await this.execution.ensureTables();
    await this.q(`CREATE TABLE IF NOT EXISTS quant_rankings (
      snapshot_id text NOT NULL,
      as_of date NOT NULL,
      symbol text NOT NULL,
      sector text,
      gate1_pass boolean NOT NULL,
      gate1_failed jsonb NOT NULL DEFAULT '[]'::jsonb,
      quality_score double precision NOT NULL DEFAULT 0,
      conviction_score double precision NOT NULL DEFAULT 0,
      fund_rank double precision NOT NULL DEFAULT 0,
      market_cap double precision,
      adv_dollars double precision,
      downside_deviation double precision,
      attribution jsonb NOT NULL DEFAULT '{}'::jsonb,
      PRIMARY KEY (snapshot_id, symbol)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS quant_rankings_asof_idx ON quant_rankings (as_of DESC, fund_rank DESC)`);
    await this.q(`CREATE TABLE IF NOT EXISTS quant_snapshots (
      id text PRIMARY KEY,
      as_of date NOT NULL,
      kind text NOT NULL DEFAULT 'nightly',
      universe int NOT NULL DEFAULT 0,
      passed int NOT NULL DEFAULT 0,
      config jsonb NOT NULL DEFAULT '{}'::jsonb,
      target jsonb,
      books jsonb,
      sector_flows jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS quant_exclusions (
      symbol text PRIMARY KEY,
      reason text NOT NULL DEFAULT 'agency/IR client',
      added_at date NOT NULL DEFAULT current_date,
      expires_on date,
      added_by text
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS quant_index (
      index_id text NOT NULL DEFAULT 'IBCX',
      as_of date NOT NULL,
      level double precision NOT NULL,
      constituents jsonb NOT NULL DEFAULT '[]'::jsonb,
      reconstituted boolean NOT NULL DEFAULT false,
      PRIMARY KEY (index_id, as_of)
    )`);
  }

  // ── Config (§8: every default versioned, editable without a deploy) ────

  async config(): Promise<QuantConfig> {
    await this.ensureTables();
    const rows = await this.q<Array<{ value: any }>>(`SELECT value FROM quant_config WHERE key = 'main'`);
    return rows[0]?.value ? mergeConfig(DEFAULT_CONFIG, rows[0].value) : DEFAULT_CONFIG;
  }

  async setConfig(patch: any, actor = 'admin'): Promise<QuantConfig> {
    await this.ensureTables();
    const [cur] = await this.q<any[]>(`SELECT value, version FROM quant_config WHERE key = 'main'`);
    const nextValue = mergeConfig(cur?.value ? mergeConfig(DEFAULT_CONFIG, cur.value) : DEFAULT_CONFIG, patch);
    const version = (cur?.version || 0) + 1;
    await this.q(
      `INSERT INTO quant_config (key, value, version, updated_by) VALUES ('main', $1::jsonb, $2, $3)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, version = EXCLUDED.version, updated_at = now(), updated_by = EXCLUDED.updated_by`,
      [JSON.stringify(nextValue), version, actor],
    );
    await this.q(`INSERT INTO quant_config_history (key, value, version, changed_by) VALUES ('main', $1::jsonb, $2, $3)`,
      [JSON.stringify(nextValue), version, actor]);
    return nextValue;
  }

  // ── Exclusion list (§5, non-negotiable) ───────────────────────────────

  async exclusions(): Promise<Set<string>> {
    const rows = await this.q<Array<{ symbol: string }>>(
      // Six months after an engagement ends, per §5.
      `SELECT symbol FROM quant_exclusions WHERE expires_on IS NULL OR expires_on >= current_date`,
    );
    return new Set(rows.map((r) => r.symbol.toUpperCase()));
  }

  async addExclusion(symbol: string, reason: string, endsOn: string | null, actor: string): Promise<void> {
    await this.ensureTables();
    // An engagement that ended still excludes for six months.
    const expires = endsOn ? new Date(new Date(endsOn).getTime() + 182 * DAY).toISOString().slice(0, 10) : null;
    await this.q(
      `INSERT INTO quant_exclusions (symbol, reason, expires_on, added_by) VALUES ($1,$2,$3::date,$4)
       ON CONFLICT (symbol) DO UPDATE SET reason = EXCLUDED.reason, expires_on = EXCLUDED.expires_on, added_by = EXCLUDED.added_by`,
      [symbol.toUpperCase(), reason, expires, actor],
    );
    await this.execution.audit('exclusion.added', { actor, symbol, payload: { reason, expires } });
  }

  async removeExclusion(symbol: string, actor: string): Promise<void> {
    await this.q(`DELETE FROM quant_exclusions WHERE symbol = $1`, [symbol.toUpperCase()]);
    await this.execution.audit('exclusion.removed', { actor, symbol });
  }

  // ── Sector flow, computed point-in-time ───────────────────────────────

  /**
   * Net capital flow per sector over a trailing window: the share of member
   * dollar volume that traded on up days minus down days. Sustained inflow
   * tilts the core sleeve; a sector both far below its two-year high and in
   * sustained outflow is the contrarian sleeve's hunting ground.
   */
  async sectorFlows(symbols: string[], asOfMs: number, cfg: QuantConfig, windowDays = 60): Promise<Map<string, SectorFlow>> {
    const rows = await this.q<Array<{ symbol: string; sector: string | null }>>(
      `SELECT symbol, sector FROM pit_securities WHERE symbol = ANY($1)`,
      [symbols],
    );
    const sectorOf = new Map(rows.map((r) => [r.symbol, r.sector || 'Unknown']));
    const agg = new Map<string, { up: number; down: number; total: number; idxNow: number; idxHigh: number }>();

    for (const symbol of symbols) {
      const pts = await this.pit.priceSeries(symbol);
      if (!pts || pts.length < 30) continue;
      const sector = sectorOf.get(symbol) || 'Unknown';
      const a = agg.get(sector) || { up: 0, down: 0, total: 0, idxNow: 0, idxHigh: 0 };
      let end = -1;
      for (let i = 0; i < pts.length; i++) {
        if (pts[i][0] <= asOfMs) end = i;
        else break;
      }
      if (end < 1) continue;
      const start = Math.max(1, end - windowDays + 1);
      for (let i = start; i <= end; i++) {
        const [, c, v] = pts[i];
        const prev = pts[i - 1][1];
        const dv = c * (v || 0);
        if (!(dv > 0) || !(prev > 0)) continue;
        a.total += dv;
        if (c >= prev) a.up += dv;
        else a.down += dv;
      }
      // Sector drawdown proxy: the member's own distance from its two-year
      // high, weighted equally across members.
      const twoYear = asOfMs - 730 * DAY;
      let high = 0;
      for (let i = 0; i <= end; i++) {
        if (pts[i][0] < twoYear) continue;
        if (pts[i][1] > high) high = pts[i][1];
      }
      if (high > 0) {
        a.idxNow += pts[end][1] / high;
        a.idxHigh += 1;
      }
      agg.set(sector, a);
    }

    const out = new Map<string, SectorFlow>();
    for (const [sector, a] of agg) {
      const netFlowPct = a.total > 0 ? (a.up - a.down) / a.total : 0;
      const drawdown = a.idxHigh > 0 ? 1 - a.idxNow / a.idxHigh : 0;
      out.set(sector, {
        sector,
        netFlowPct: Math.round(netFlowPct * 1e4) / 1e4,
        drawdownFromHigh: Math.round(drawdown * 1e4) / 1e4,
        inflow: netFlowPct > 0.02,
        contrarian: drawdown >= cfg.portfolio.contrarianDrawdownThreshold && netFlowPct < 0,
      });
    }
    return out;
  }

  // ── Insider trades for Gate 2 ─────────────────────────────────────────

  private async convictionTrades(symbols: string[], asOf: string, cfg: QuantConfig): Promise<Map<string, ConvictionTrade[]>> {
    const since = new Date(new Date(asOf).getTime() - cfg.conviction.windowMonths * 31 * DAY).toISOString().slice(0, 10);
    const out = new Map<string, ConvictionTrade[]>();
    for (let i = 0; i < symbols.length; i += 500) {
      const chunk = symbols.slice(i, i + 500);
      const rows = await this.q<any[]>(
        `SELECT upper(c.ticker) AS symbol, t."insiderName" AS insider, t.role, t."transactionCode" AS code,
                t."plannedBuy" AS planned, t."transactionDate" AS d,
                t."sharesBought" * t."pricePerShare" AS dollars,
                t."acquiredDisposed" AS ad
         FROM insider_transactions t JOIN companies c ON c.id = t.company_id
         WHERE upper(c.ticker) = ANY($1) AND t."transactionDate" BETWEEN $2::date AND $3::date
           AND t."sharesBought" * t."pricePerShare" > 0`,
        [chunk, since, asOf],
      );
      // `insider_transactions` is the live Form 4 feed and is thin before
      // about 2024, so a historical ranking sees no buying at all and scores
      // every name zero. `historical_insider_buys` is the ten-year store the
      // backtest already relies on: same filings, further back. It carries
      // only purchases, which is all Gate 2 weights positively anyway.
      const older = await this.q<any[]>(
        `SELECT upper(h."symbol") AS symbol, h."insiderName" AS insider, h."typeOfOwner" AS role,
                h."transactionDate" AS d, h."totalValue" AS dollars
         FROM historical_insider_buys h
         WHERE upper(h."symbol") = ANY($1) AND h."transactionDate" BETWEEN $2::date AND $3::date
           AND h."totalValue" > 0`,
        [chunk, since, asOf],
      );
      const seenKey = new Set(rows.map((r) => `${r.symbol}|${r.insider}|${new Date(r.d).toISOString().slice(0, 10)}`));
      for (const o of older) {
        const k = `${o.symbol}|${o.insider}|${new Date(o.d).toISOString().slice(0, 10)}`;
        if (seenKey.has(k)) continue; // already in the live feed
        rows.push({ ...o, code: 'P', planned: false, ad: 'A' });
      }

      // First-buy detection needs the whole record, not just the window.
      const firstSeen = new Map<string, number>();
      for (const r of rows) {
        const k = `${r.symbol}|${r.insider}`;
        const ms = new Date(r.d).getTime();
        if (!firstSeen.has(k) || ms < (firstSeen.get(k) as number)) firstSeen.set(k, ms);
      }
      for (const r of rows) {
        const sym = r.symbol;
        const arr = out.get(sym) || [];
        const ms = new Date(r.d).getTime();
        arr.push({
          insider: r.insider,
          role: r.role,
          code: r.code,
          // A sale flagged as planned (10b5-1, option-related or withholding)
          // is excluded from negative scoring entirely, per §4.
          planned: !!r.planned || r.code === 'M' || r.code === 'F' || r.code === 'A',
          dateMs: ms,
          dollars: Number(r.dollars) || 0,
          insiderIqs: null,
          convictionRatio: null,
          firstBuy: firstSeen.get(`${sym}|${r.insider}`) === ms,
        });
        out.set(sym, arr);
      }
    }
    return out;
  }

  // ── The nightly pass ──────────────────────────────────────────────────

  @Cron('20 6 * * *')
  async nightly(): Promise<void> {
    if (process.env.VERCEL || this.running) return;
    try {
      await this.runRanking({});
    } catch (e: any) {
      this.log.error(`quant nightly failed: ${e?.message || e}`);
    }
  }

  /** What the engine is doing right now, if anything. */
  runState() {
    return this.running;
  }

  start(opts: { asOf?: string; limit?: number }): { started: boolean; running: any } {
    if (this.running) return { started: false, running: this.running };
    void this.runRanking(opts).catch((e) => this.log.error(`ranking failed: ${e?.message || e}`));
    return { started: true, running: this.running };
  }

  /**
   * Rank the universe as of a date and build the target portfolio plus the
   * per-book targets. Every input is read point-in-time, so running this for
   * a past date reproduces what the engine would have decided then.
   */
  async runRanking(opts: { asOf?: string; limit?: number; persist?: boolean }): Promise<any> {
    await this.ensureTables();
    const asOf = opts.asOf || new Date().toISOString().slice(0, 10);
    const asOfMs = new Date(`${asOf}T23:59:59Z`).getTime();
    this.running = { step: 'universe', startedAt: new Date().toISOString() };
    const t0 = Date.now();
    try {
      const cfg = await this.config();
      const excluded = await this.exclusions();

      let universe = await this.pit.universeAsOf(asOf, cfg.universe.countries);
      if (opts.limit) universe = universe.slice(0, opts.limit);

      this.running.step = 'facts';
      const facts = await this.pit.factsAsOf(universe, `${asOf}T23:59:59Z`);
      const withFacts = universe.filter((s) => facts.has(s));

      this.running.step = 'sector-flows';
      const flows = await this.sectorFlows(withFacts, asOfMs, cfg);

      this.running.step = 'gates';
      const trades = await this.convictionTrades(withFacts, asOf, cfg);
      const secRows = await this.q<Array<{ symbol: string; sector: string | null }>>(
        `SELECT symbol, sector FROM pit_securities WHERE symbol = ANY($1)`,
        [withFacts],
      );
      const sectorOf = new Map(secRows.map((r) => [r.symbol, r.sector || 'Unknown']));

      // Sector median gross margin, for the moat proxy's "vs sector" test.
      const marginBySector = new Map<string, number[]>();
      for (const s of withFacts) {
        const f = facts.get(s);
        if (f?.grossMargin == null) continue;
        const sec = sectorOf.get(s) || 'Unknown';
        const arr = marginBySector.get(sec) || [];
        arr.push(f.grossMargin);
        marginBySector.set(sec, arr);
      }
      const sectorMargin = new Map<string, number>();
      for (const [sec, xs] of marginBySector) {
        const sorted = [...xs].sort((a, b) => a - b);
        sectorMargin.set(sec, sorted[Math.floor(sorted.length / 2)]);
      }

      const snapshotId = `snap_${createHash('sha1').update(`${asOf}|${Date.now()}`).digest('hex').slice(0, 12)}`;
      const ranked: Array<{ g1: Gate1Result; conviction: number; rank: number; symbol: string; sector: string; marketCap: number | null; adv: number | null; dd: number | null; attribution: any }> = [];

      let done = 0;
      for (const symbol of withFacts) {
        done++;
        if (done % 250 === 0) this.running.progress = `${done}/${withFacts.length} names`;
        const f = facts.get(symbol) as PitFacts;
        const pts = await this.pit.priceSeries(symbol);
        const trad = pts ? PitService.tradabilityAt(pts, asOfMs) : null;
        const history = await this.pit.historyAsOf(symbol, `${asOf}T23:59:59Z`, 12);
        const sector = sectorOf.get(symbol) || 'Unknown';

        // Market cap point-in-time: shares from the filing against the close
        // on the date, rather than today's cap.
        let marketCap: number | null = null;
        if (trad && f.totalEquity != null && f.netIncome != null) marketCap = null;
        const capRow = await this.q<Array<{ points: Array<[number, number]> }>>(`SELECT points FROM pit_marketcap WHERE symbol = $1`, [symbol]);
        const capPts = capRow[0]?.points;
        if (capPts?.length) {
          for (const [t, v] of capPts) {
            if (t <= asOfMs) marketCap = v;
            else break;
          }
        }

        const g1 = gate1(
          {
            symbol,
            facts: f,
            history,
            marketCap,
            advDollars: trad?.advDollars ?? null,
            sectorGrossMargin: sectorMargin.get(sector) ?? null,
            goingConcern: false,
          },
          cfg,
        );

        const g2 = gate2(symbol, trades.get(symbol) || [], asOfMs, cfg);

        // Downside deviation for §7.2 risk-adjusted sizing.
        let dd: number | null = null;
        if (pts) {
          const rets: number[] = [];
          let end = -1;
          for (let i = 0; i < pts.length; i++) {
            if (pts[i][0] <= asOfMs) end = i;
            else break;
          }
          for (let i = Math.max(1, end - 251); i <= end; i++) {
            const prev = pts[i - 1][1];
            if (prev > 0) rets.push(pts[i][1] / prev - 1);
          }
          if (rets.length > 30) {
            const neg = rets.map((r) => (r < 0 ? r * r : 0));
            dd = Math.sqrt(neg.reduce((a, b) => a + b, 0) / neg.length) * Math.sqrt(252);
          }
        }

        ranked.push({
          g1,
          conviction: g2.score,
          rank: g1.pass ? fundRank(g1.qualityScore, g2.score) : 0,
          symbol,
          sector,
          marketCap,
          adv: trad?.advDollars ?? null,
          dd,
          attribution: { gate1: g1.attribution, gate2: g2.attribution, drivers: g2.drivers, knowableFrom: f.knowableFrom, periodEnd: f.periodEnd },
        });
      }

      this.running.step = 'persist-rankings';
      for (let i = 0; i < ranked.length; i += 200) {
        const chunk = ranked.slice(i, i + 200);
        const values: any[] = [];
        const tuples = chunk.map((r, k) => {
          const b = k * 12;
          values.push(snapshotId, asOf, r.symbol, r.sector, r.g1.pass, JSON.stringify(r.g1.failed),
            r.g1.qualityScore, r.conviction, r.rank, r.marketCap, r.adv, JSON.stringify({ ...r.attribution, downsideDeviation: r.dd }));
          return `($${b + 1},$${b + 2}::date,$${b + 3},$${b + 4},$${b + 5},$${b + 6}::jsonb,$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12}::jsonb)`;
        });
        await this.q(
          `INSERT INTO quant_rankings (snapshot_id,as_of,symbol,sector,gate1_pass,gate1_failed,quality_score,conviction_score,fund_rank,market_cap,adv_dollars,attribution)
           VALUES ${tuples.join(',')} ON CONFLICT (snapshot_id,symbol) DO NOTHING`,
          values,
        );
      }

      this.running.step = 'portfolio';
      const candidates: Candidate[] = ranked
        .filter((r) => r.g1.pass && r.rank > 0)
        .map((r) => {
          const flow = flows.get(r.sector);
          return {
            symbol: r.symbol,
            sector: r.sector,
            fundRank: r.rank,
            convictionScore: r.conviction,
            qualityScore: r.g1.qualityScore,
            marketCap: r.marketCap || 0,
            price: 0,
            advDollars: r.adv || 0,
            downsideDeviation: r.dd,
            sectorInflow: !!flow?.inflow,
            sectorContrarian: !!flow?.contrarian,
            excluded: excluded.has(r.symbol),
            excludedReason: excluded.has(r.symbol) ? 'agency/IR client' : null,
          };
        });

      const target = buildTargetPortfolio(candidates, cfg, asOf);

      // Per-book scaling: one portfolio, two capital bases.
      const priceCache = new Map<string, { price: number; advDollars: number } | null>();
      for (const pos of target.positions) {
        const pts = await this.pit.priceSeries(pos.symbol);
        const t = pts ? PitService.tradabilityAt(pts, asOfMs) : null;
        priceCache.set(pos.symbol, t ? { price: t.close, advDollars: t.advDollars } : null);
      }
      const books = cfg.books.map((b) => scaleToBook(target, b, cfg, (s) => priceCache.get(s) || null));

      await this.q(
        `INSERT INTO quant_snapshots (id, as_of, kind, universe, passed, config, target, books, sector_flows)
         VALUES ($1,$2::date,'nightly',$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8::jsonb)`,
        [snapshotId, asOf, universe.length, candidates.length, JSON.stringify(cfg),
         JSON.stringify(target), JSON.stringify(books), JSON.stringify(Array.from(flows.values()))],
      );
      await this.execution.audit('ranking.completed', { payload: { snapshotId, asOf, universe: universe.length, passed: candidates.length, positions: target.positions.length } });

      const out = {
        snapshotId,
        asOf,
        universe: universe.length,
        withFundamentals: withFacts.length,
        passedGate1: ranked.filter((r) => r.g1.pass).length,
        ranked: candidates.length,
        positions: target.positions.length,
        sleeves: target.sleeveWeights,
        cash: target.cashWeight,
        notes: target.notes,
        books: books.map((b) => ({ bookId: b.bookId, positions: b.positions.length, cash: b.cashWeight, redistributed: b.redistributed, notes: b.notes })),
        seconds: Math.round((Date.now() - t0) / 1000),
      };
      this.log.log(`quant ranking ${asOf}: ${JSON.stringify({ ...out, notes: out.notes.length })}`);
      return out;
    } finally {
      this.running = null;
    }
  }

  /**
   * Rank at each quarter end across a span, so the published index has a
   * curve rather than a single point.
   *
   * This is only honest because L1 is point-in-time: each pass sees the
   * filings that were public on that date and the universe as it was listed
   * then, so a 2024 ranking cannot know what was filed in 2025. Running this
   * against a vendor snapshot of "current" fundamentals would manufacture a
   * backtest out of hindsight, which is the failure §3 is written against.
   */
  async backfillRankings(opts: { from: string; to?: string; limit?: number }): Promise<any> {
    await this.ensureTables();
    const to = opts.to || new Date().toISOString().slice(0, 10);
    const dates: string[] = [];
    const start = new Date(`${opts.from}T00:00:00Z`);
    // Quarter ends: the index reconstitutes quarterly (§6).
    let y = start.getUTCFullYear();
    let q = Math.floor(start.getUTCMonth() / 3);
    for (;;) {
      const endMonth = q * 3 + 3;
      const d = new Date(Date.UTC(y, endMonth, 0));
      const iso = d.toISOString().slice(0, 10);
      if (iso > to) break;
      if (iso >= opts.from) dates.push(iso);
      q++;
      if (q > 3) {
        q = 0;
        y++;
      }
      if (dates.length > 60) break;
    }
    const done: Array<{ asOf: string; ranked: number; positions: number }> = [];
    for (const asOf of dates) {
      try {
        const out = await this.runRanking({ asOf, limit: opts.limit });
        done.push({ asOf, ranked: out.ranked, positions: out.positions });
        this.log.log(`backfill ${asOf}: ${out.ranked} ranked, ${out.positions} positions`);
      } catch (e: any) {
        this.log.warn(`backfill ${asOf} failed: ${e?.message || e}`);
      }
    }
    return { quarters: dates.length, completed: done.length, detail: done };
  }

  // ── Reads ─────────────────────────────────────────────────────────────

  async latestSnapshot(): Promise<any | null> {
    await this.ensureTables();
    const [row] = await this.q<any[]>(`SELECT * FROM quant_snapshots ORDER BY as_of DESC, created_at DESC LIMIT 1`);
    return row || null;
  }

  async rankings(opts: { limit?: number; snapshotId?: string; passedOnly?: boolean }): Promise<any> {
    await this.ensureTables();
    const snap = opts.snapshotId
      ? (await this.q<any[]>(`SELECT * FROM quant_snapshots WHERE id = $1`, [opts.snapshotId]))[0]
      : await this.latestSnapshot();
    if (!snap) return { snapshot: null, rows: [] };
    const rows = await this.q<any[]>(
      `SELECT symbol, sector, gate1_pass, gate1_failed, quality_score, conviction_score, fund_rank, market_cap, adv_dollars, attribution
       FROM quant_rankings WHERE snapshot_id = $1 ${opts.passedOnly ? 'AND gate1_pass = true' : ''}
       ORDER BY fund_rank DESC, quality_score DESC LIMIT $2`,
      [snap.id, Math.min(Math.max(opts.limit || 100, 1), 1000)],
    );
    return {
      snapshot: { id: snap.id, asOf: snap.as_of, universe: snap.universe, passed: snap.passed, createdAt: snap.created_at },
      target: snap.target,
      books: snap.books,
      sectorFlows: snap.sector_flows,
      rows,
    };
  }

  /** Full factor record for one name as of a date — the §3 admin requirement. */
  async explain(symbol: string, asOf?: string): Promise<any> {
    await this.ensureTables();
    const sym = symbol.toUpperCase();
    const rows = await this.q<any[]>(
      `SELECT r.*, s.as_of FROM quant_rankings r JOIN quant_snapshots s ON s.id = r.snapshot_id
       WHERE r.symbol = $1 ${asOf ? 'AND s.as_of <= $2::date' : ''} ORDER BY s.as_of DESC LIMIT 1`,
      asOf ? [sym, asOf] : [sym],
    );
    const facts = await this.pit.historyAsOf(sym, `${asOf || new Date().toISOString().slice(0, 10)}T23:59:59Z`, 8);
    return { symbol: sym, ranking: rows[0] || null, fundamentals: facts };
  }

  async bookState(): Promise<any> {
    await this.ensureTables();
    const cfg = await this.config();
    const rows = await this.q<any[]>(`SELECT * FROM quant_book_state`);
    const positions = await this.q<any[]>(`SELECT * FROM quant_positions WHERE shares <> 0 ORDER BY book_id, symbol`);
    const books = cfg.books.map((b) => {
      const st = rows.find((r) => r.book_id === b.id);
      const equity = st ? Number(st.equity) || b.capital : b.capital;
      const hwm = st ? Number(st.high_water_mark) || b.capital : b.capital;
      const dd = drawdownProtocol(equity, hwm, (st?.drawdown_state as any) || 'normal', cfg);
      return {
        ...b,
        cash: st ? Number(st.cash) : b.capital,
        equity,
        drawdown: dd,
        positions: positions.filter((p) => p.book_id === b.id).map((p) => ({ symbol: p.symbol, shares: Number(p.shares), avgCost: p.avg_cost ? Number(p.avg_cost) : null })),
      };
    });
    return { books, config: { cashBuffer: cfg.portfolio.cashBuffer, killSwitch: cfg.execution.killSwitch, broker: cfg.execution.broker, requireApproval: cfg.execution.requireApproval } };
  }

  async status(): Promise<any> {
    await this.ensureTables();
    const pit = await this.pit.status();
    const snap = await this.latestSnapshot();
    const [orders] = await this.q<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE status='pending_approval')::int AS pending FROM quant_orders`);
    const [excl] = await this.q<any[]>(`SELECT count(*)::int AS n FROM quant_exclusions WHERE expires_on IS NULL OR expires_on >= current_date`);
    return {
      pit,
      lastSnapshot: snap ? { id: snap.id, asOf: snap.as_of, universe: snap.universe, passed: snap.passed, createdAt: snap.created_at } : null,
      orders,
      exclusions: excl?.n || 0,
      running: this.running,
    };
  }
}
