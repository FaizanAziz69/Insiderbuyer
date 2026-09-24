import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CqsScore } from '../entities/cqs-score.entity';
import { CongressionalTransaction } from '../entities/congressional-transaction.entity';
import { Company } from '../entities/company.entity';
import { FlagEngineService } from '../congress-trades/flag-engine.service';
import { nameKey } from '../congress-trades/influence-map.service';
import {
  assembleCqsScore,
  isExcludedSecurity,
  scoreC1ClusterBreadth,
  scoreC2PositionSize,
  scoreC3CommitteeInfluence,
  scoreC4ContractAlignment,
  scoreC5BuyerTrackRecord,
  scoreC6RelativeConviction,
  scoreC7Freshness,
  scoreC8NetDirection,
} from './cqs-math';

export interface CqsLeaderboardQuery {
  limit?: number;
  offset?: number;
  sector?: string;
  party?: 'R' | 'D' | 'I' | 'bipartisan' | string;
  grade?: string;
  minScore?: number;
  overlapOnly?: boolean;
  search?: string;
}

const DAY = 86_400_000;
const WINDOW_DAYS = 90;
/** STOCK Act deadline: a PTR is due 45 days after the transaction. */
const STOCK_ACT_DEADLINE_DAYS = 45;
/** Rows older than this are pruned so the table stays one row per stock per recent day. */
const KEEP_DAYS = 45;

type Tx = CongressionalTransaction & { amountMin: any; amountMax: any };

/**
 * Congress Quality Score — Brief v9 scoring service.
 *
 * One row per qualifying stock per day. Everything it needs is gathered in a
 * handful of set-based queries up front rather than per ticker: the first cut
 * loaded the whole congressional_transactions table into Node and filtered the
 * 90-day window in JavaScript, then ran three more queries for every ticker it
 * kept. On this box that is the shape that has already caused one out-of-memory
 * restart (the FMP bar cache), and it is avoidable.
 */
@Injectable()
export class CqsService {
  private readonly logger = new Logger(CqsService.name);

  constructor(
    @InjectRepository(CqsScore)
    private readonly cqsRepo: Repository<CqsScore>,
    @InjectRepository(CongressionalTransaction)
    private readonly txRepo: Repository<CongressionalTransaction>,
    @InjectRepository(Company)
    private readonly companyRepo: Repository<Company>,
    private readonly flagEngine: FlagEngineService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companyRepo.query(sql, params) as Promise<T>;
  }

  private num(v: any): number | null {
    if (v == null) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Recalculation ───────────────────────────────────────────────────────
  async recalculateAll(asOfDate?: string): Promise<{
    computed: number;
    considered: number;
    excluded: number;
  }> {
    const todayStr = asOfDate || new Date().toISOString().slice(0, 10);
    const asOfMs = new Date(`${todayStr}T00:00:00Z`).getTime();
    const windowStart = new Date(asOfMs - WINDOW_DAYS * DAY)
      .toISOString()
      .slice(0, 10);

    // 1. The window, filtered in SQL.
    const recent: Tx[] = await this.txRepo
      .createQueryBuilder('t')
      .where('t.transactionDate >= :start', { start: windowStart })
      .andWhere('t.transactionDate <= :end', { end: todayStr })
      .andWhere("t.ticker <> ''")
      .getMany();

    // 2. Group by ticker, dropping the securities §1 excludes.
    const byTicker = new Map<string, Tx[]>();
    let excluded = 0;
    for (const t of recent) {
      const sym = String(t.ticker || '').toUpperCase().trim();
      if (!sym) continue;
      if (isExcludedSecurity(sym, t.companyName)) {
        excluded++;
        continue;
      }
      const list = byTicker.get(sym);
      if (list) list.push(t);
      else byTicker.set(sym, [t]);
    }

    // 3. Qualification (§1), so the expensive lookups run only on the survivors.
    const flagsByTicker = await this.loadFlags([...byTicker.keys()]);
    const qualified = new Map<string, Tx[]>();
    for (const [ticker, txs] of byTicker) {
      const buys = txs.filter((t) => t.action === 'Buy');
      if (!buys.length) continue;

      const distinctBuyers = new Set(buys.map((b) => nameKey(b.politicianName)));
      const sizeTrigger = buys.some((b) => (this.num(b.amountMin) ?? 0) >= 100_001);
      const clusterTrigger =
        distinctBuyers.size >= 2 &&
        buys.some((b) => (this.num(b.amountMin) ?? 0) >= 15_001);
      // Influence trigger: a flag whose member is one of the buyers here.
      const flags = flagsByTicker.get(ticker) || [];
      const buyerKeys = new Set([...distinctBuyers]);
      const influenceTrigger =
        flags.some((f) => buyerKeys.has(nameKey(f.member))) &&
        buys.some((b) => (this.num(b.amountMin) ?? 0) >= 15_001);

      if (sizeTrigger || clusterTrigger || influenceTrigger) qualified.set(ticker, txs);
    }

    const tickers = [...qualified.keys()];
    if (!tickers.length) {
      this.logger.log('CQS: no qualifying stocks in the trailing 90 days.');
      return { computed: 0, considered: byTicker.size, excluded };
    }

    // 4. Everything else, in set-based queries.
    const [companies, iqs, grades, medians, priorBuys, series] = await Promise.all([
      this.loadCompanies(tickers),
      this.loadIqs(tickers),
      this.loadMemberGrades(),
      this.loadMemberMedianBands(),
      this.loadPriorBuys(tickers, windowStart),
      this.loadPriceSeries(tickers),
    ]);

    let computed = 0;
    for (const ticker of tickers) {
      const txs = qualified.get(ticker)!;
      const row = this.scoreTicker({
        ticker,
        txs,
        todayStr,
        asOfMs,
        flags: flagsByTicker.get(ticker) || [],
        company: companies.get(ticker) || null,
        iqs: iqs.get(ticker) ?? null,
        grades,
        medians,
        priorBuys,
        series: series.get(ticker) || null,
      });
      // Upsert, not save: the row carries no id and the table has a unique
      // index on (ticker, asOfDate, windowDays), so a second run on the same
      // day would otherwise insert a duplicate and hit the constraint.
      await this.cqsRepo.upsert(row, ['ticker', 'asOfDate', 'windowDays']);
      computed++;
    }

    // A stock that has fallen out of qualification must leave the board, not
    // keep the row an earlier run wrote today. Without this, today's index
    // serves the union of every run made today: the first recalculation after
    // this fix left AMZN, MSB, SFM and TMO on the board, all of which had
    // qualified only through the old influence trigger.
    await this.q(
      `DELETE FROM cqs_scores WHERE "asOfDate" = $1::date AND "windowDays" = $2 AND ticker <> ALL($3::text[])`,
      [todayStr, WINDOW_DAYS, tickers],
    );
    await this.q(`DELETE FROM cqs_scores WHERE "asOfDate" < $1::date - $2::int`, [
      todayStr,
      KEEP_DAYS,
    ]);

    this.logger.log(
      `CQS ${todayStr}: scored ${computed} of ${byTicker.size} tickers (${excluded} excluded securities).`,
    );
    return { computed, considered: byTicker.size, excluded };
  }

  /** One stock, one day. Pure assembly over data already in memory. */
  private scoreTicker(ctx: {
    ticker: string;
    txs: Tx[];
    todayStr: string;
    asOfMs: number;
    flags: any[];
    company: Company | null;
    iqs: number | null;
    grades: Map<string, string | null>;
    medians: Map<string, number>;
    priorBuys: Set<string>;
    series: Array<{ t: number; c: number }> | null;
  }): CqsScore {
    const { ticker, txs, todayStr, asOfMs, flags, company, iqs, series } = ctx;
    const buys = txs.filter((t) => t.action === 'Buy');
    const sells = txs.filter((t) => t.action === 'Sell');

    // ── Members, party mix, dollars ──────────────────────────────────────
    // Party mix is a count of MEMBERS, not of transactions: three members who
    // filed 23 disclosures between them are "3", not "22R 1D".
    const members = new Map<
      string,
      {
        name: string;
        party: string | null;
        chamber: string | null;
        photoUrl: string | null;
        floors: number[];
        estValue: number;
      }
    >();
    let totalEstBuyValue = 0;
    for (const b of buys) {
      const key = nameKey(b.politicianName);
      const floor = this.num(b.amountMin) ?? 15_001;
      const ceil = this.num(b.amountMax) ?? floor * 2;
      const mid = (floor + ceil) / 2;
      totalEstBuyValue += mid;
      const m = members.get(key);
      if (m) {
        m.floors.push(floor);
        m.estValue += mid;
        if (!m.party && b.party) m.party = b.party;
        if (!m.photoUrl && b.photoUrl) m.photoUrl = b.photoUrl;
      } else {
        members.set(key, {
          name: b.politicianName,
          party: b.party || null,
          chamber: b.chamber || null,
          photoUrl: b.photoUrl || null,
          floors: [floor],
          estValue: mid,
        });
      }
    }

    const partyCounts = { R: 0, D: 0, I: 0 };
    for (const m of members.values()) {
      const p = String(m.party || '').toUpperCase().charAt(0);
      if (p === 'R') partyCounts.R++;
      else if (p === 'D') partyCounts.D++;
      else partyCounts.I++;
    }
    const isBipartisan = partyCounts.R > 0 && partyCounts.D > 0;

    const sellValue = sells.reduce((acc, s) => {
      const floor = this.num(s.amountMin) ?? 15_001;
      const ceil = this.num(s.amountMax) ?? floor * 2;
      return acc + (floor + ceil) / 2;
    }, 0);

    const allFloors = buys.map((b) => this.num(b.amountMin) ?? 15_001);
    const maxBandFloor = allFloors.length ? Math.max(...allFloors) : 0;

    // ── Timing ───────────────────────────────────────────────────────────
    const buyTimes = buys
      .map((b) => new Date(b.transactionDate).getTime())
      .filter((t) => Number.isFinite(t));
    const firstBuyMs = buyTimes.length ? Math.min(...buyTimes) : null;
    const lastBuyMs = buyTimes.length ? Math.max(...buyTimes) : null;
    const daysSinceTx =
      lastBuyMs == null ? 999 : Math.max(0, Math.floor((asOfMs - lastBuyMs) / DAY));

    const lags: number[] = [];
    let lastFilingMs: number | null = null;
    for (const b of buys) {
      const tx = new Date(b.transactionDate).getTime();
      const rep = b.reportedDate ? new Date(b.reportedDate).getTime() : NaN;
      if (!Number.isFinite(tx) || !Number.isFinite(rep)) continue;
      lags.push(Math.max(0, Math.round((rep - tx) / DAY)));
      lastFilingMs = lastFilingMs == null ? rep : Math.max(lastFilingMs, rep);
    }
    const avgLag = lags.length ? lags.reduce((a, b) => a + b, 0) / lags.length : null;
    const maxLag = lags.length ? Math.max(...lags) : null;
    const hasLateFiling = lags.some((l) => l > STOCK_ACT_DEADLINE_DAYS);

    // ── Influence: only the seats of members who actually bought here ────
    const buyerKeys = new Set([...members.keys()]);
    const ownFlags = flags.filter((f) => buyerKeys.has(nameKey(f.member)));
    const seats = ownFlags.map((f) => ({ role: f.role as string, relevance: 1 }));
    const committees = [...new Set(ownFlags.map((f) => f.committee).filter(Boolean))];
    const highestRole = seats.length
      ? [...seats].sort((a, b) => roleRank(b.role) - roleRank(a.role))[0].role
      : null;
    const contractValue12m = ownFlags.reduce(
      (a, f) => a + (this.num(f.awardValue ?? f.award_value) ?? 0),
      0,
    );
    const bestCts = ownFlags.reduce<number | null>((mx, f) => {
      const s = this.num(f.score);
      return s == null ? mx : mx == null ? s : Math.max(mx, s);
    }, null);

    // ── Price-derived: ROI, 52-week high ─────────────────────────────────
    const lastClose = series?.length ? series[series.length - 1].c : null;
    const priceOn = (ms: number | null): number | null => {
      if (!series?.length || ms == null) return null;
      let best: number | null = null;
      for (const p of series) {
        if (p.t <= ms) best = p.c;
        else break;
      }
      return best;
    };
    const roiPct = (from: number | null): number | null =>
      from != null && from > 0 && lastClose != null
        ? ((lastClose - from) / from) * 100
        : null;

    const perBuyRoi: Array<{ roi: number; est: number }> = [];
    for (const b of buys) {
      const px = priceOn(new Date(b.transactionDate).getTime());
      const r = roiPct(px);
      if (r == null) continue;
      const floor = this.num(b.amountMin) ?? 15_001;
      const ceil = this.num(b.amountMax) ?? floor * 2;
      perBuyRoi.push({ roi: r, est: (floor + ceil) / 2 });
    }
    const avgClusterRoi = perBuyRoi.length
      ? perBuyRoi.reduce((a, x) => a + x.roi, 0) / perBuyRoi.length
      : null;
    const estPnl = perBuyRoi.length
      ? perBuyRoi.reduce((a, x) => a + (x.est * x.roi) / 100, 0)
      : null;
    // Headline trade ROI = the largest disclosed buy, the one a reader looks for.
    const topBuy = buys.reduce<Tx | null>(
      (mx, b) =>
        mx == null || (this.num(b.amountMin) ?? 0) > (this.num(mx.amountMin) ?? 0) ? b : mx,
      null,
    );
    const tradeRoi = topBuy
      ? roiPct(priceOn(new Date(topBuy.transactionDate).getTime()))
      : null;
    const sinceFilingRoi = roiPct(priceOn(lastFilingMs));

    let pctVs52wHigh: number | null = null;
    if (series?.length && lastClose != null) {
      const cutoff = asOfMs - 365 * DAY;
      let hi = 0;
      for (const p of series) if (p.t >= cutoff && p.c > hi) hi = p.c;
      if (hi > 0) pctVs52wHigh = ((lastClose - hi) / hi) * 100;
    }

    // ── Components ───────────────────────────────────────────────────────
    const c1 = scoreC1ClusterBreadth(members.size, isBipartisan);
    const c2 = scoreC2PositionSize([...members.values()].map((m) => m.floors));
    const c3 = scoreC3CommitteeInfluence(seats);
    const revenue = null; // no revenue on the security master yet — materiality stays neutral
    const c4 = scoreC4ContractAlignment(
      bestCts,
      revenue && contractValue12m ? contractValue12m / revenue : null,
    );
    const buyerGrades = [...members.entries()].map(([key, m]) => ({
      grade: ctx.grades.get(key) ?? null,
      weight: m.estValue,
    }));
    const c5 = scoreC5BuyerTrackRecord(buyerGrades);
    // C6 reads the member who made the largest buy, against their own habit.
    const topBuyerKey = topBuy ? nameKey(topBuy.politicianName) : null;
    const c6 = scoreC6RelativeConviction(
      maxBandFloor,
      topBuyerKey ? (ctx.medians.get(topBuyerKey) ?? null) : null,
      topBuyerKey ? !ctx.priorBuys.has(`${topBuyerKey}|${ticker}`) : false,
    );
    const c7 = scoreC7Freshness(daysSinceTx);
    const c8 = scoreC8NetDirection(totalEstBuyValue, sellValue);

    const assembled = assembleCqsScore(
      {
        c1ClusterBreadth: c1,
        c2PositionSize: c2,
        c3CommitteeInfluence: c3,
        c4ContractAlignment: c4,
        c5BuyerTrackRecord: c5,
        c6RelativeConviction: c6,
        c7Freshness: c7,
        c8NetDirection: c8,
      },
      {
        iqsScore: iqs,
        // No legislative-calendar source yet (Brief v9 §9 open item) — reported
        // as unavailable rather than as "checked and did not fire".
        hasLegislativeCatalyst: null,
        priceVs52wHighPct: pctVs52wHigh,
        clusterVsAdvPct: null, // price_history_cache carries closes, not volume
        marketCap: this.num(company?.marketCap),
        maxFilingLagDays: maxLag,
      },
    );

    const row = this.cqsRepo.create({
      ticker,
      asOfDate: todayStr,
      windowDays: WINDOW_DAYS,
      companyName: company?.name || buys[0]?.companyName || ticker,
      cqs: assembled.cqs,
      grade: assembled.grade,
      isGoldRing: assembled.isGoldRing,
      c1ClusterBreadth: c1,
      c2PositionSize: c2,
      c3CommitteeInfluence: c3,
      c4ContractAlignment: c4,
      c5BuyerTrackRecord: c5,
      c6RelativeConviction: c6,
      c7Freshness: c7,
      c8NetDirection: c8,
      multiplierInsiderOverlap: assembled.multipliersResult.insiderOverlap,
      multiplierLegislativeCatalyst: assembled.multipliersResult.legislativeCatalyst,
      multiplierContrarianEntry: assembled.multipliersResult.contrarianEntry,
      multiplierLiquidityNorm: assembled.multipliersResult.liquidityNorm,
      multiplierFilingLag: assembled.multipliersResult.filingLag,
      multipliersUnavailable: assembled.multipliersResult.unavailable,
      distinctMembers: members.size,
      isBipartisan,
      partyCounts,
      totalEstBuyValue,
      largestSingleBand: maxBandFloor > 0 ? bandLabel(maxBandFloor) : null,
      buyCount: buys.length,
      sellCount: sells.length,
      committees: committees.length ? committees : null,
      highestRole,
      contractValue12m: contractValue12m || null,
      contractCount12m: ownFlags.length,
      bestCtsScore: bestCts,
      buyers: [...members.values()]
        .sort((a, b) => b.estValue - a.estValue)
        .map((m) => ({
          name: m.name,
          party: m.party,
          chamber: m.chamber,
          grade: ctx.grades.get(nameKey(m.name)) ?? null,
          estValue: Math.round(m.estValue),
          largestBand: Math.max(...m.floors),
          photoUrl: m.photoUrl,
        })),
      firstBuyDate: firstBuyMs ? new Date(firstBuyMs).toISOString().slice(0, 10) : null,
      lastBuyDate: lastBuyMs ? new Date(lastBuyMs).toISOString().slice(0, 10) : null,
      lastFilingDate: lastFilingMs
        ? new Date(lastFilingMs).toISOString().slice(0, 10)
        : null,
      avgFilingLagDays: avgLag,
      maxFilingLagDays: maxLag,
      hasLateFiling,
      pctVs52wHigh,
      tradeRoiPct: tradeRoi,
      sinceFilingRoiPct: sinceFilingRoi,
      avgClusterRoiPct: avgClusterRoi,
      estPnlUsd: estPnl,
      dataCompleteness: completeness({
        hasFlags: ownFlags.length > 0,
        hasGrades: buyerGrades.some((b) => b.grade != null),
        hasPrices: series != null && series.length > 0,
        hasLags: lags.length > 0,
      }),
      sector: company?.sector || null,
      marketCap: this.num(company?.marketCap),
      lastPrice: lastClose ?? this.num(company?.lastPrice),
    });
    return row;
  }

  // ── Bulk loaders ────────────────────────────────────────────────────────
  private async loadFlags(tickers: string[]): Promise<Map<string, any[]>> {
    const out = new Map<string, any[]>();
    if (!tickers.length) return out;
    try {
      await this.flagEngine.ensureTables();
      const rows: any[] = await this.q(
        `SELECT member, ticker, committee, role, agency,
                award_value::float8 AS "awardValue", score::float8 AS score
           FROM ct_flags
          WHERE status = 'verified' AND ticker = ANY($1::text[])`,
        [tickers],
      );
      for (const r of rows) {
        const list = out.get(r.ticker);
        if (list) list.push(r);
        else out.set(r.ticker, [r]);
      }
    } catch (e: any) {
      this.logger.warn(`CQS: ct_flags unavailable (${e?.message}) — C3/C4 score 0.`);
    }
    return out;
  }

  private async loadCompanies(tickers: string[]): Promise<Map<string, Company>> {
    const rows = await this.companyRepo
      .createQueryBuilder('c')
      .where('c.ticker IN (:...tickers)', { tickers })
      .getMany();
    return new Map(rows.map((c) => [c.ticker.toUpperCase(), c]));
  }

  /** Latest 90-day Insider Score per ticker, for the overlap multiplier. */
  private async loadIqs(tickers: string[]): Promise<Map<string, number>> {
    const rows: any[] = await this.q(
      `SELECT DISTINCT ON (c.ticker) c.ticker, s.iqs::float8 AS iqs
         FROM iqs_scores s
         JOIN companies c ON c.id = s.company_id
        WHERE c.ticker = ANY($1::text[]) AND s."windowDays" = 90
        ORDER BY c.ticker, s."asOfDate" DESC`,
      [tickers],
    );
    return new Map(rows.map((r) => [String(r.ticker).toUpperCase(), Number(r.iqs)]));
  }

  /** Brief v7 Performance Grade per member, keyed the same way trades are. */
  private async loadMemberGrades(): Promise<Map<string, string | null>> {
    const out = new Map<string, string | null>();
    try {
      const rows: any[] = await this.q(
        `SELECT m.name, m.fmp_name, s.grade
           FROM wt_member_stats s
           JOIN wt_members m ON m.bioguide = s.bioguide
          WHERE s.grade IS NOT NULL`,
      );
      for (const r of rows) {
        out.set(nameKey(r.name), r.grade);
        if (r.fmp_name) out.set(nameKey(r.fmp_name), r.grade);
      }
    } catch (e: any) {
      this.logger.warn(`CQS: wt_member_stats unavailable (${e?.message}) — C5 neutral.`);
    }
    return out;
  }

  /** Each member's own median buy band floor — the C6 baseline. */
  private async loadMemberMedianBands(): Promise<Map<string, number>> {
    const rows: any[] = await this.q(
      `SELECT "politicianName" AS name,
              percentile_cont(0.5) WITHIN GROUP (ORDER BY "amountMin")::float8 AS median
         FROM congressional_transactions
        WHERE action = 'Buy' AND "amountMin" IS NOT NULL
        GROUP BY "politicianName"`,
    );
    const out = new Map<string, number>();
    for (const r of rows) {
      const m = Number(r.median);
      if (Number.isFinite(m) && m > 0) out.set(nameKey(r.name), m);
    }
    return out;
  }

  /** member|ticker pairs bought BEFORE the window — anything absent is a first purchase. */
  private async loadPriorBuys(
    tickers: string[],
    windowStart: string,
  ): Promise<Set<string>> {
    const rows: any[] = await this.q(
      `SELECT DISTINCT "politicianName" AS name, upper(ticker) AS ticker
         FROM congressional_transactions
        WHERE action = 'Buy' AND "transactionDate" < $1::date AND upper(ticker) = ANY($2::text[])`,
      [windowStart, tickers],
    );
    return new Set(rows.map((r) => `${nameKey(r.name)}|${r.ticker}`));
  }

  /** Dividend-adjusted closes from the shared cache — no network at scoring time. */
  private async loadPriceSeries(
    tickers: string[],
  ): Promise<Map<string, Array<{ t: number; c: number }>>> {
    const out = new Map<string, Array<{ t: number; c: number }>>();
    try {
      const spellings = new Map<string, string>();
      for (const t of tickers) {
        spellings.set(t, t);
        if (t.includes('.')) spellings.set(t.replace(/\./g, '-'), t);
      }
      const rows: any[] = await this.q(
        `SELECT symbol, points FROM price_history_cache WHERE symbol = ANY($1::text[])`,
        [[...spellings.keys()]],
      );
      for (const r of rows) {
        const ticker = spellings.get(String(r.symbol).toUpperCase());
        if (!ticker || out.has(ticker)) continue;
        const pts = Array.isArray(r.points) ? r.points : [];
        if (pts.length) out.set(ticker, pts);
      }
    } catch (e: any) {
      this.logger.warn(`CQS: price_history_cache unavailable (${e?.message}) — no ROI.`);
    }
    return out;
  }

  // ── Reads ───────────────────────────────────────────────────────────────
  /**
   * The index. Only the most recent scoring date is served: the table keeps a
   * short history for the score-jump alert, and without this filter yesterday's
   * row for every stock comes back alongside today's and the board shows each
   * ticker twice.
   */
  async getLeaderboard(query: CqsLeaderboardQuery): Promise<{
    rows: any[];
    total: number;
    asOfDate: string | null;
  }> {
    const limit = Math.min(Math.max(Number(query.limit) || 100, 1), 500);
    const offset = Math.max(Number(query.offset) || 0, 0);

    const [latest] = await this.q<Array<{ d: string | null }>>(
      `SELECT max("asOfDate")::text AS d FROM cqs_scores WHERE "windowDays" = $1`,
      [WINDOW_DAYS],
    );
    const asOfDate = latest?.d || null;
    if (!asOfDate) return { rows: [], total: 0, asOfDate: null };

    const qb = this.cqsRepo
      .createQueryBuilder('cqs')
      .where('cqs.asOfDate = :asOf', { asOf: asOfDate })
      .andWhere('cqs.windowDays = :w', { w: WINDOW_DAYS });

    if (query.sector) qb.andWhere('cqs.sector ILIKE :sector', { sector: `%${query.sector}%` });
    if (query.grade) qb.andWhere('cqs.grade = :grade', { grade: query.grade });
    if (query.minScore != null && Number.isFinite(Number(query.minScore)))
      qb.andWhere('cqs.cqs >= :minScore', { minScore: Number(query.minScore) });
    if (query.overlapOnly) qb.andWhere('cqs.multiplierInsiderOverlap > 1');
    if (query.party) {
      const p = String(query.party).toUpperCase();
      if (p === 'BIPARTISAN') qb.andWhere('cqs.isBipartisan = true');
      else if (p === 'R' || p === 'D' || p === 'I')
        qb.andWhere(`(cqs."partyCounts" ->> '${p}')::int > 0`);
    }
    if (query.search)
      qb.andWhere('(cqs.ticker ILIKE :s OR cqs.companyName ILIKE :s)', {
        s: `%${query.search}%`,
      });

    // Ties break on freshness, per §6.
    qb.orderBy('cqs.cqs', 'DESC').addOrderBy('cqs.c7Freshness', 'DESC');

    const [rows, total] = await qb.take(limit).skip(offset).getManyAndCount();
    return { rows: rows.map((r) => shapeRow(r)), total, asOfDate };
  }

  async getByTicker(ticker: string): Promise<any | null> {
    const row = await this.cqsRepo.findOne({
      where: { ticker: ticker.toUpperCase().trim(), windowDays: WINDOW_DAYS },
      order: { asOfDate: 'DESC' },
    });
    return row ? shapeRow(row) : null;
  }

  async status(): Promise<{ rows: number; asOfDate: string | null; graded: number }> {
    const [r] = await this.q<Array<any>>(
      `SELECT count(*)::int AS rows, max("asOfDate")::text AS "asOfDate",
              count(*) FILTER (WHERE grade IN ('A+','A'))::int AS graded
         FROM cqs_scores`,
    );
    return r || { rows: 0, asOfDate: null, graded: 0 };
  }
}

/** chair > vice/sub > ranking > member, for picking the seat to display. */
function roleRank(role: string | null | undefined): number {
  const r = String(role || '').toLowerCase();
  if (r.includes('sub')) return 2;
  if (r.includes('chair')) return 4;
  if (r.includes('ranking')) return 3;
  if (r.includes('vice')) return 2;
  return 1;
}

function bandLabel(floor: number): string {
  if (floor >= 50_000_001) return '$50,000,001+';
  if (floor >= 25_000_001) return '$25,000,001 – $50,000,000';
  if (floor >= 5_000_001) return '$5,000,001 – $25,000,000';
  if (floor >= 1_000_001) return '$1,000,001 – $5,000,000';
  if (floor >= 500_001) return '$500,001 – $1,000,000';
  if (floor >= 250_001) return '$250,001 – $500,000';
  if (floor >= 100_001) return '$100,001 – $250,000';
  if (floor >= 50_001) return '$50,001 – $100,000';
  if (floor >= 15_001) return '$15,001 – $50,000';
  return '$1,001 – $15,000';
}

/** Share of the evidence the score could actually read, mirroring the IQS field. */
function completeness(p: {
  hasFlags: boolean;
  hasGrades: boolean;
  hasPrices: boolean;
  hasLags: boolean;
}): number {
  // Cluster, size, freshness and direction always have their inputs; the four
  // optional feeds are what varies.
  const have = [p.hasFlags, p.hasGrades, p.hasPrices, p.hasLags].filter(Boolean).length;
  return Number((0.6 + (have / 4) * 0.4).toFixed(3));
}

/**
 * Postgres returns `numeric` as a STRING through node-postgres, so an entity
 * typed `number` arrives at the client as "63.00". The board then asked
 * `typeof cqs === 'number'`, which was false for every row, and every stock on
 * a working index rendered "No recent buying". Numbers leave this service as
 * numbers.
 */
function shapeRow(r: CqsScore): any {
  const n = (v: any) => (v == null ? null : Number(v));
  return {
    ...r,
    cqs: n(r.cqs),
    c1ClusterBreadth: n(r.c1ClusterBreadth),
    c2PositionSize: n(r.c2PositionSize),
    c3CommitteeInfluence: n(r.c3CommitteeInfluence),
    c4ContractAlignment: n(r.c4ContractAlignment),
    c5BuyerTrackRecord: n(r.c5BuyerTrackRecord),
    c6RelativeConviction: n(r.c6RelativeConviction),
    c7Freshness: n(r.c7Freshness),
    c8NetDirection: n(r.c8NetDirection),
    multiplierInsiderOverlap: n(r.multiplierInsiderOverlap),
    multiplierLegislativeCatalyst: n(r.multiplierLegislativeCatalyst),
    multiplierContrarianEntry: n(r.multiplierContrarianEntry),
    multiplierLiquidityNorm: n(r.multiplierLiquidityNorm),
    multiplierFilingLag: n(r.multiplierFilingLag),
    totalEstBuyValue: n(r.totalEstBuyValue),
    marketCap: n(r.marketCap),
    lastPrice: n(r.lastPrice),
    tradeRoiPct: n(r.tradeRoiPct),
    sinceFilingRoiPct: n(r.sinceFilingRoiPct),
    avgClusterRoiPct: n(r.avgClusterRoiPct),
    estPnlUsd: n(r.estPnlUsd),
    bestCtsScore: n(r.bestCtsScore),
    contractValue12m: n(r.contractValue12m),
    avgFilingLagDays: n(r.avgFilingLagDays),
    maxFilingLagDays: n(r.maxFilingLagDays),
    pctVs52wHigh: n(r.pctVs52wHigh),
    dataCompleteness: n(r.dataCompleteness),
  };
}
