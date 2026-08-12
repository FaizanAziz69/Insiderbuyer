import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { AnalystPriceTarget } from '../entities/analyst-target.entity';
import { BacktestCache, PriceHistoryCache } from '../entities/backtest-cache.entity';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { SECTOR_BY_TICKER } from '../market-stats/market-sectors';
import {
  MIN_SEASONING_DAYS,
  firmSlug,
  scoreRating,
  starScore,
} from '../market-stats/analyst-firms';

export interface TopAnalystRow {
  analyst: string;
  firm: string | null;
  slug: string;
  ratings: number;
  scoredRatings: number;
  /** null until enough of this analyst's calls have seasoned (30d+). */
  successRate: number | null;
  avgReturn: number | null;
  /** Mean (target ÷ price-at-note − 1)%, computable from day one. */
  avgImpliedUpside: number | null;
  lastRatingMs: number | null;
  /** The sector this analyst covers most (from their rated symbols). */
  mainSector: string | null;
  topSymbols: string[];
  /** 0 until the analyst has scored calls. */
  stars: number;
  latest: { symbol: string; priceTarget: number | null; publishedDate: string } | null;
}

/** Implied upside inside ±3% is a reiteration, not a directional call. */
const DIRECTION_DEADZONE = 0.03;
/** Analysts need this many seasoned calls before a success rate is shown. */
const MIN_SCORED = 3;
/** Closes are graded over a two-year window — the same '2y' range this table has
 *  always scored on. Longer stored series are trimmed to it on read. */
const HIST_WINDOW_MS = 2 * 365 * 86_400_000;

/** The whole /analysts/top payload, exactly as the page consumes it, plus the
 *  bookkeeping the cache needs. Persisted to the generic cache table so a cold
 *  serverless instance answers from one SELECT instead of re-running the
 *  close-history sweep (which cannot finish inside the request budget). */
interface StoredBoard {
  rows: TopAnalystRow[];
  coverage: { ratings: number; analysts: number; since: string | null };
  /** false when the history sweep ran out of budget — some calls are still
   *  unscored, so this copy is retried far sooner than a complete one. */
  complete: boolean;
  computedAtMs: number;
}

/**
 * Scoring-window closes for every symbol the board grades, kept as [ms, close]
 * pairs in a single cache row: a rebuild reads a couple of hundred symbols in
 * one query instead of a couple of hundred outbound calls, and the pair form
 * keeps the payload roughly a tenth of the raw series it came from.
 */
interface StoredHist {
  /** symbol → { u: sourced-at ms, p: [epoch-ms, close][] } */
  [symbol: string]: { u: number; p: [number, number][] };
}

/**
 * Individual named analysts — ratings are issued by people, and it is the
 * person who has the track record. Rows accumulate from FMP's latest-notes
 * feed (see AnalystPriceTarget); success rates are measured from each note's
 * posting price to one year later (or today), in the direction the target
 * implied, once the note is at least 30 days old. Nothing is estimated: an
 * analyst without seasoned calls shows a pending state, never a made-up score.
 */
@Injectable()
export class AnalystsService {
  private readonly logger = new Logger(AnalystsService.name);
  private lastRefreshAt = 0;
  /** Poll throttle — keeps well inside the 250-req/day FMP budget. */
  private readonly REFRESH_MIN_MS = 20 * 60_000;

  /** Persisted leaderboard + close-history keys in the generic cache table. */
  private readonly BOARD_KEY = 'top-analysts-v1';
  private readonly HIST_KEY = 'analyst-close-hist-v1';
  /** A complete board holds for half a day — notes arrive on the daily cron. */
  private readonly BOARD_TTL_MS = 12 * 60 * 60_000;
  /** A partial board (sweep truncated) is retried on the next request. */
  private readonly PARTIAL_TTL_MS = 15 * 60_000;
  /** Past this age a complete board stops outranking a partial rebuild. */
  private readonly BOARD_MAX_STALE_MS = 3 * 24 * 60 * 60_000;
  /** Rows stored. The controller caps `limit` at 200, so one payload serves
   *  every request — coverage is computed over the full set regardless. */
  private readonly BOARD_ROWS = 200;
  /** Wall-clock ceiling for a rebuild inside a USER request. Production cuts
   *  requests at ~10s whatever vercel.json declares, so a sweep that outruns
   *  this hands back the stored board and lets the next caller carry on. */
  private readonly REQUEST_BUDGET_MS = 4_000;
  /** Don't let one instance re-attempt a truncated rebuild on every request. */
  private readonly BUILD_RETRY_MS = 60_000;
  /** Snapshot closes older than this are re-fetched (the backtest keeps its own
   *  cache on a 7-day window; scores move with daily closes, so tighter). */
  private readonly PRICE_FRESH_MS = 3 * 24 * 60 * 60_000;
  /** Symbols per shared-cache SELECT — those rows hold FULL series, so a wide
   *  set must not materialise every one of them at once. */
  private readonly HIST_READ_CHUNK = 150;
  /** Yahoo close-history fan-out. Higher than the old 6: these are independent
   *  reads and every sequential round-trip is spent budget. */
  private readonly HIST_CONC = 12;

  private boardMem: StoredBoard | null = null;
  private lastBuildAttemptAt = 0;
  /** Symbols Yahoo returned nothing for this process lifetime — not worth
   *  re-fetching inside a request budget (they are simply unscored, as before). */
  private readonly deadSymbols = new Set<string>();

  constructor(
    @InjectRepository(AnalystPriceTarget)
    private readonly repo: Repository<AnalystPriceTarget>,
    @InjectRepository(Company)
    private readonly companies: Repository<Company>,
    @InjectRepository(BacktestCache)
    private readonly kv: Repository<BacktestCache>,
    @InjectRepository(PriceHistoryCache)
    private readonly prices: Repository<PriceHistoryCache>,
    private readonly fmp: FmpService,
    private readonly market: MarketStatsService,
  ) {}

  /** ticker → clean sector, from the companies table (FMP-sourced), cached
   *  for an hour. Broad coverage so an analyst's Main Sector isn't blank. */
  private sectorMapCache: { ts: number; map: Map<string, string> } | null = null;
  private async tickerSectorMap(): Promise<Map<string, string>> {
    if (this.sectorMapCache && Date.now() - this.sectorMapCache.ts < 60 * 60_000) {
      return this.sectorMapCache.map;
    }
    const map = new Map<string, string>();
    try {
      const rows = await this.companies
        .createQueryBuilder('c')
        .select(['c.ticker', 'c.sector'])
        .where('c.ticker IS NOT NULL AND c.sector IS NOT NULL')
        .getMany();
      for (const c of rows) {
        if (c.ticker && c.sector) map.set(c.ticker.toUpperCase(), c.sector);
      }
    } catch {
      /* companies unavailable → fall back to the static map */
    }
    this.sectorMapCache = { ts: Date.now(), map };
    return map;
  }

  /** Cron/admin tick: accumulate today's notes, then recompute the persisted
   *  leaderboard so page requests never pay for the close-history sweep.
   *  `boardBudgetMs` is a wall-clock ceiling — the cron shares its 60s function
   *  budget with SEC ingestion, so the sweep takes a slice and the next tick
   *  resumes where this one stopped (the closes it gathered are persisted). */
  async refresh(boardBudgetMs = 10_000): Promise<{
    fetched: number;
    inserted: number;
    board: { rows: number; complete: boolean } | null;
  }> {
    const notes = await this.refreshNotes();
    let board: { rows: number; complete: boolean } | null = null;
    try {
      const built = await this.buildBoard(boardBudgetMs, await this.readBoard());
      if (built) board = { rows: built.rows.length, complete: built.complete };
    } catch (e: any) {
      this.logger.warn(`analyst leaderboard refresh failed: ${e?.message || e}`);
    }
    return { ...notes, board };
  }

  /** Pull the latest notes and upsert. One FMP request. */
  private async refreshNotes(): Promise<{ fetched: number; inserted: number }> {
    if (!this.fmp.enabled) return { fetched: 0, inserted: 0 };
    const rows = await this.fmp.priceTargetLatest();
    let inserted = 0;
    for (const r of rows) {
      const publishedDate = new Date(r.publishedDate);
      if (Number.isNaN(publishedDate.getTime())) continue;
      try {
        const res = await this.repo.upsert(
          {
            analystName: this.cleanName(r.analystName),
            analystCompany: this.cleanName(r.analystCompany) || null,
            symbol: r.symbol,
            priceTarget: r.priceTarget,
            priceWhenPosted: r.priceWhenPosted,
            publishedDate,
            newsURL: r.newsURL,
            newsPublisher: r.newsPublisher,
          },
          ['analystName', 'symbol', 'publishedDate'],
        );
        inserted += res.identifiers.filter(Boolean).length ? 1 : 0;
      } catch {
        /* duplicate race — fine */
      }
    }
    this.lastRefreshAt = Date.now();
    this.logger.log(`analyst targets: fetched ${rows.length}`);
    return { fetched: rows.length, inserted };
  }

  /** One-time/periodic deep backfill: named-analyst target history for a
   *  symbol universe (price-target-news per symbol). Gives analysts enough
   *  SEASONED calls (≥30 days old) that success rates and average returns
   *  actually grade instead of sitting on "Pending" with 1 rating. */
  /** FMP feed names arrive HTML-encoded ("O&#039;Shea") — decode before any
   *  write so one analyst can't split into duplicate rows. */
  private cleanName(v: string | null | undefined): string {
    return (v || '')
      .replace(/&#0?39;/g, "'")
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"')
      .trim();
  }

  async backfillHistory(
    symbolsIn?: string[],
    pagesPerSymbol = 3,
  ): Promise<{ symbols: number; fetched: number }> {
    if (!this.fmp.enabled) return { symbols: 0, fetched: 0 };
    let symbols = (symbolsIn || []).map((s) => s.toUpperCase()).filter(Boolean);
    if (!symbols.length) {
      // Default universe: everything we already track + what rankings cover.
      const seen = await this.repo
        .createQueryBuilder('t')
        .select('DISTINCT t.symbol', 'symbol')
        .getRawMany<{ symbol: string }>();
      symbols = seen.map((r) => r.symbol);
    }
    let fetched = 0;
    for (const sym of symbols) {
      try {
        const rows = await this.fmp.priceTargetHistoryForSymbol(sym, pagesPerSymbol);
        fetched += rows.length;
        for (const r of rows) {
          const publishedDate = new Date(r.publishedDate);
          if (Number.isNaN(publishedDate.getTime())) continue;
          try {
            await this.repo.upsert(
              {
                analystName: this.cleanName(r.analystName),
                analystCompany: this.cleanName(r.analystCompany) || null,
                symbol: r.symbol,
                priceTarget: r.priceTarget,
                priceWhenPosted: r.priceWhenPosted,
                publishedDate,
                newsURL: r.newsURL,
                newsPublisher: r.newsPublisher,
              },
              ['analystName', 'symbol', 'publishedDate'],
            );
          } catch {
            /* duplicate race — fine */
          }
        }
      } catch (e: any) {
        this.logger.warn(`backfill ${sym}: ${e?.message || e}`);
      }
    }
    this.logger.log(`analyst history backfill: ${symbols.length} symbols, ${fetched} notes`);
    return { symbols: symbols.length, fetched };
  }

  /** Accumulate notes at most every 20 minutes while the page is being viewed.
   *  Notes only — never the leaderboard sweep — and callers must NOT await it:
   *  a page view must not wait on an FMP round-trip. */
  private async maybeRefresh(): Promise<void> {
    if (Date.now() - this.lastRefreshAt < this.REFRESH_MIN_MS) return;
    this.lastRefreshAt = Date.now(); // set first — never hammer FMP on errors
    try {
      await this.refreshNotes();
    } catch (e: any) {
      this.logger.warn(`analyst refresh failed: ${e?.message || e}`);
    }
  }

  /** One analyst's stored ratings, newest first — feeds the name-click popup.
   *  Matched by the same slug the Top Analysts rows carry (slugified name). */
  async getAnalystRatings(
    slug: string,
    limit = 20,
  ): Promise<{
    analyst: string | null;
    firm: string | null;
    rows: {
      symbol: string;
      priceTarget: number | null;
      priceWhenPosted: number | null;
      impliedUpsidePct: number | null;
      publishedDate: string;
    }[];
  }> {
    // Slug → name: scan distinct analyst names and match on slugified form
    // (names are free-text from the feed; the slug is display-derived).
    const names = await this.repo
      .createQueryBuilder('t')
      .select('DISTINCT t."analystName"', 'name')
      .getRawMany<{ name: string }>();
    const name = names.map((n) => n.name).find((n) => firmSlug(n) === slug) || null;
    if (!name) return { analyst: null, firm: null, rows: [] };
    const targets = await this.repo.find({
      where: { analystName: name },
      order: { publishedDate: 'DESC' },
      take: limit,
    });
    return {
      analyst: name,
      firm: targets.find((t) => t.analystCompany)?.analystCompany ?? null,
      rows: targets.map((t) => {
        const posted = t.priceWhenPosted != null ? Number(t.priceWhenPosted) : null;
        const target = t.priceTarget != null ? Number(t.priceTarget) : null;
        return {
          symbol: t.symbol,
          priceTarget: target,
          priceWhenPosted: posted,
          impliedUpsidePct:
            target != null && posted != null && posted > 0
              ? +(((target - posted) / posted) * 100).toFixed(1)
              : null,
          publishedDate: new Date(t.publishedDate).toISOString().slice(0, 10),
        };
      }),
    };
  }

  /**
   * The Top Analysts payload. Served from the persisted leaderboard: the
   * ranking needs two years of closes for every rated symbol, which is dozens
   * of outbound round-trips — far past the ~10s the production gateway allows,
   * so no user request may compute it. A stored board answers in one SELECT; a
   * stale or absent one triggers a rebuild that is capped by wall clock and
   * falls back to the stored copy rather than overrunning the budget.
   */
  async getTopAnalysts(limit = 50): Promise<{
    rows: TopAnalystRow[];
    coverage: { ratings: number; analysts: number; since: string | null };
  }> {
    // Notes accumulate on their own throttle; deliberately not awaited.
    void this.maybeRefresh().catch(() => undefined);

    const stored = await this.readBoard();
    if (stored && this.boardFresh(stored)) return this.serve(stored, limit);
    if (Date.now() - this.lastBuildAttemptAt < this.BUILD_RETRY_MS && stored) {
      return this.serve(stored, limit);
    }
    this.lastBuildAttemptAt = Date.now();
    let built: StoredBoard | null = null;
    try {
      built = await this.buildBoard(this.REQUEST_BUDGET_MS, stored);
    } catch (e: any) {
      // A failed rebuild must never blank the page when a stored copy exists.
      this.logger.warn(`analyst leaderboard build failed: ${e?.message || e}`);
      if (!stored) throw e;
    }
    return this.serve(built ?? stored, limit);
  }

  /** Slice a board down to the requested page size. Coverage is whole-dataset
   *  and is passed through untouched. */
  private serve(
    board: StoredBoard | null,
    limit: number,
  ): { rows: TopAnalystRow[]; coverage: StoredBoard['coverage'] } {
    if (!board) return { rows: [], coverage: { ratings: 0, analysts: 0, since: null } };
    return { rows: board.rows.slice(0, limit), coverage: board.coverage };
  }

  private boardFresh(board: StoredBoard): boolean {
    const age = Date.now() - board.computedAtMs;
    return age < (board.complete ? this.BOARD_TTL_MS : this.PARTIAL_TTL_MS);
  }

  /** In-memory copy first, then the cache table (one keyed SELECT). */
  private async readBoard(): Promise<StoredBoard | null> {
    if (this.boardMem && this.boardFresh(this.boardMem)) return this.boardMem;
    try {
      const row = await this.kv.findOne({ where: { key: this.BOARD_KEY } });
      const board = (row?.payload as StoredBoard | undefined) ?? null;
      if (board?.rows?.length) {
        this.boardMem = board;
        return board;
      }
    } catch (e: any) {
      this.logger.warn(`analyst board read failed: ${e?.message || e}`);
    }
    return this.boardMem;
  }

  /**
   * Recompute the leaderboard, spending at most `budgetMs` of wall clock. A
   * truncated sweep still persists the closes it did gather, so the next request
   * or cron tick starts further ahead — and `fallback` (the stored board) is
   * kept in place rather than being overwritten by a thinner one.
   */
  private async buildBoard(
    budgetMs: number,
    fallback: StoredBoard | null,
  ): Promise<StoredBoard | null> {
    const deadline = Date.now() + budgetMs;

    // Only the columns the ranking reads — newsURL/newsPublisher are ~600
    // bytes a row of pure transfer cost across thousands of notes.
    const all = await this.repo
      .createQueryBuilder('t')
      .select([
        't.id',
        't.analystName',
        't.analystCompany',
        't.symbol',
        't.priceTarget',
        't.priceWhenPosted',
        't.publishedDate',
      ])
      .orderBy('t.publishedDate', 'DESC')
      .getMany();
    if (!all.length) return null;

    const now = Date.now();
    const { hist, truncated } = await this.closeHistories(this.scorableSymbols(all, now), deadline);
    // A complete stored board beats a partial rebuild, unless it has gone so
    // stale that its rating counts no longer reflect the dataset.
    if (
      truncated &&
      fallback?.complete &&
      now - fallback.computedAtMs < this.BOARD_MAX_STALE_MS
    ) {
      return null;
    }
    const secMap = await this.tickerSectorMap();

    interface Acc {
      analyst: string;
      firm: string | null;
      ratings: number;
      scored: number;
      wins: number;
      retSum: number;
      upsideSum: number;
      upsideCount: number;
      lastMs: number | null;
      pastYear: number;
      symbols: Map<string, number>;
      sectors: Map<string, number>;
      latest: TopAnalystRow['latest'];
    }
    const byAnalyst = new Map<string, Acc>();

    for (const t of all) {
      const key = t.analystName.trim().toLowerCase();
      let a = byAnalyst.get(key);
      if (!a) {
        a = {
          analyst: t.analystName.trim(),
          firm: t.analystCompany,
          ratings: 0,
          scored: 0,
          wins: 0,
          retSum: 0,
          upsideSum: 0,
          upsideCount: 0,
          lastMs: null,
          pastYear: 0,
          symbols: new Map(),
          sectors: new Map(),
          latest: null,
        };
        byAnalyst.set(key, a);
      }
      if (!a.firm && t.analystCompany) a.firm = t.analystCompany;

      const ms = new Date(t.publishedDate).getTime();
      a.ratings += 1;
      a.symbols.set(t.symbol, (a.symbols.get(t.symbol) || 0) + 1);
      const sec = secMap.get(t.symbol.toUpperCase()) || SECTOR_BY_TICKER[t.symbol];
      if (sec) a.sectors.set(sec, (a.sectors.get(sec) || 0) + 1);
      if (a.lastMs == null || ms > a.lastMs) {
        a.lastMs = ms;
        a.latest = {
          symbol: t.symbol,
          priceTarget: t.priceTarget != null ? Number(t.priceTarget) : null,
          publishedDate: new Date(t.publishedDate).toISOString().slice(0, 10),
        };
      }
      if (now - ms <= 365 * 86_400_000) a.pastYear += 1;

      const target = t.priceTarget != null ? Number(t.priceTarget) : null;
      const posted = t.priceWhenPosted != null ? Number(t.priceWhenPosted) : null;
      if (target != null && posted != null && posted > 0) {
        const upside = target / posted - 1;
        a.upsideSum += upside * 100;
        a.upsideCount += 1;

        // Directional call implied by the target; a near-flat target scores
        // nothing. Return measured with the shared firm-scoring math.
        const direction =
          upside > DIRECTION_DEADZONE ? 'bull' : upside < -DIRECTION_DEADZONE ? 'bear' : 'neutral';
        const closes = hist.get(t.symbol);
        if (direction !== 'neutral' && closes?.length) {
          const ret = scoreRating(direction, ms, now, (x) =>
            MarketStatsService.closeOn(closes, x),
          );
          if (ret != null) {
            a.scored += 1;
            a.retSum += ret;
            if (ret > 0) a.wins += 1;
          }
        }
      }
    }

    const rows: TopAnalystRow[] = Array.from(byAnalyst.values()).map((a) => {
      const seasoned = a.scored >= MIN_SCORED;
      const successRate = seasoned ? +((a.wins / a.scored) * 100).toFixed(2) : null;
      const avgReturn = seasoned ? +(a.retSum / a.scored).toFixed(2) : null;
      return {
        analyst: a.analyst,
        firm: a.firm,
        slug: firmSlug(a.analyst),
        ratings: a.ratings,
        scoredRatings: a.scored,
        successRate,
        avgReturn,
        avgImpliedUpside:
          a.upsideCount > 0 ? +(a.upsideSum / a.upsideCount).toFixed(1) : null,
        lastRatingMs: a.lastMs,
        mainSector:
          Array.from(a.sectors.entries()).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
        topSymbols: Array.from(a.symbols.entries())
          .sort((x, y) => y[1] - x[1] || x[0].localeCompare(y[0]))
          .slice(0, 3)
          .map(([s]) => s),
        stars: seasoned
          ? starScore(
              successRate,
              avgReturn,
              a.scored,
              a.lastMs,
              a.ratings > 0 ? a.pastYear / a.ratings : 0,
              now,
            )
          : 0,
        latest: a.latest,
      };
    });

    // Seasoned analysts rank by stars; the rest by activity and recency while
    // their calls age toward the 30-day scoring window.
    rows.sort(
      (x, y) =>
        y.stars - x.stars ||
        (y.successRate ?? -1) - (x.successRate ?? -1) ||
        y.ratings - x.ratings ||
        (y.lastRatingMs ?? 0) - (x.lastRatingMs ?? 0),
    );

    const oldest = all[all.length - 1];
    const board: StoredBoard = {
      rows: rows.slice(0, this.BOARD_ROWS),
      coverage: {
        ratings: all.length,
        analysts: byAnalyst.size,
        since: oldest ? new Date(oldest.publishedDate).toISOString().slice(0, 10) : null,
      },
      complete: !truncated,
      computedAtMs: Date.now(),
    };
    this.boardMem = board;
    try {
      await this.kv.save({ key: this.BOARD_KEY, payload: board });
    } catch (e: any) {
      this.logger.warn(`analyst board write failed: ${e?.message || e}`);
    }
    this.logger.log(
      `analyst leaderboard: ${board.rows.length} rows, ${board.coverage.ratings} ratings` +
        `${truncated ? ' (partial — history sweep truncated)' : ''}`,
    );
    return board;
  }

  /** Symbols whose price history can actually change a score. scoreRating only
   *  consults prices for a seasoned (30d+) directional call with both prices on
   *  it, so every other symbol was being fetched for nothing. */
  private scorableSymbols(all: AnalystPriceTarget[], now: number): string[] {
    const out = new Set<string>();
    for (const t of all) {
      const target = t.priceTarget != null ? Number(t.priceTarget) : null;
      const posted = t.priceWhenPosted != null ? Number(t.priceWhenPosted) : null;
      if (target == null || posted == null || !(posted > 0)) continue;
      if (Math.abs(target / posted - 1) <= DIRECTION_DEADZONE) continue;
      const ms = new Date(t.publishedDate).getTime();
      if (!Number.isFinite(ms) || (now - ms) / 86_400_000 < MIN_SEASONING_DAYS) continue;
      out.add(t.symbol);
    }
    return Array.from(out);
  }

  /**
   * Close history per scorable symbol, cheapest source first:
   *   1. our own snapshot — one keyed SELECT for every symbol at once;
   *   2. price_history_cache, which the backtest already fills for much of the
   *      universe (a read instead of a Yahoo round-trip; never written here —
   *      that table holds FULL series and the backtest reads the same rows);
   *   3. Yahoo, for what is still missing, until the deadline.
   * Whatever the sweep gathers goes back into the snapshot, so a truncated run
   * still leaves the next request/cron tick further ahead. `truncated` says
   * work was left undone, which stops a thin board from being persisted.
   */
  private async closeHistories(
    symbols: string[],
    deadline: number,
  ): Promise<{ hist: Map<string, Array<{ t: number; c: number }>>; truncated: boolean }> {
    const hist = new Map<string, Array<{ t: number; c: number }>>();
    if (!symbols.length) return { hist, truncated: false };
    const cutoff = Date.now() - HIST_WINDOW_MS;
    /** symbol → when its closes were sourced, carried into the snapshot. */
    const asOf = new Map<string, number>();
    const stale: string[] = [];
    let truncated = false;
    let gained = false;

    // null = the snapshot could not be read; gather anyway, but never write a
    // set assembled in the dark over whatever the row actually holds.
    const snap = await this.readHist();
    for (const s of symbols) {
      const e = snap?.[s];
      if (!e?.p?.length) continue;
      const pts = e.p.filter(([t]) => t >= cutoff).map(([t, c]) => ({ t, c }));
      if (!pts.length) continue;
      hist.set(s, pts);
      asOf.set(s, e.u);
      if (Date.now() - e.u > this.PRICE_FRESH_MS) stale.push(s);
    }

    const unseen = symbols.filter((s) => !hist.has(s));
    for (let i = 0; i < unseen.length; i += this.HIST_READ_CHUNK) {
      if (Date.now() > deadline) {
        truncated = true;
        break;
      }
      const chunk = unseen.slice(i, i + this.HIST_READ_CHUNK);
      let rows: PriceHistoryCache[] = [];
      try {
        rows = await this.prices.find({ where: { symbol: In(chunk) } });
      } catch (e: any) {
        this.logger.warn(`shared close-history read failed: ${e?.message || e}`);
        break;
      }
      for (const r of rows) {
        // Trim to the scoring window: those rows carry full history, and the
        // table has always been read here as a two-year series.
        const pts = (r.points || []).filter((p) => p.t >= cutoff);
        if (!pts.length) continue;
        hist.set(r.symbol, pts);
        asOf.set(r.symbol, new Date(r.updatedAt).getTime());
        gained = true;
      }
    }

    // Still-absent symbols first — they score nothing until fetched — then
    // stale refreshes. Dedup preserves that priority order.
    const absent = symbols.filter((s) => !hist.has(s) && !this.deadSymbols.has(s));
    const queue = Array.from(
      new Set([...absent, ...stale.filter((s) => !this.deadSymbols.has(s))]),
    );
    for (let i = 0; i < queue.length; i += this.HIST_CONC) {
      if (Date.now() > deadline) {
        // A stale series still scores, just against closes a few days old; only
        // symbols left with no history at all make the board incomplete.
        truncated = truncated || queue.slice(i).some((s) => !hist.has(s));
        break;
      }
      const chunk = queue.slice(i, i + this.HIST_CONC);
      const got = await Promise.all(
        chunk.map((s) => this.market.getCloseHistory(s, '2y').catch(() => [])),
      );
      got.forEach((h, j) => {
        const sym = chunk[j];
        if (!h.length) {
          // Delisted or blocked — unscored, exactly as before, and not worth
          // re-requesting for the rest of this instance's life.
          this.deadSymbols.add(sym);
          return;
        }
        hist.set(sym, h);
        asOf.set(sym, Date.now());
        gained = true;
      });
    }

    if (gained && snap) await this.saveHist(hist, asOf);
    return { hist, truncated };
  }

  /** The snapshot, read fresh at the start of every build — an in-memory copy
   *  would be from before another instance widened it, and writing that back
   *  would undo its progress. null on a read failure, never a silent {}. */
  private async readHist(): Promise<StoredHist | null> {
    try {
      const row = await this.kv.findOne({ where: { key: this.HIST_KEY } });
      return (row?.payload as StoredHist | undefined) || {};
    } catch (e: any) {
      this.logger.warn(`analyst close-history read failed: ${e?.message || e}`);
      return null;
    }
  }

  /** Persist the sweep's closes. Only the symbols this build actually used are
   *  written, so the snapshot prunes itself as coverage shifts. */
  private async saveHist(
    hist: Map<string, Array<{ t: number; c: number }>>,
    asOf: Map<string, number>,
  ): Promise<void> {
    const snap: StoredHist = {};
    for (const [symbol, pts] of hist) {
      snap[symbol] = {
        u: asOf.get(symbol) ?? Date.now(),
        p: pts.map((p) => [p.t, p.c] as [number, number]),
      };
    }
    try {
      await this.kv.save({ key: this.HIST_KEY, payload: snap });
    } catch (e: any) {
      this.logger.warn(`analyst close-history write failed: ${e?.message || e}`);
    }
  }
}

export { MIN_SEASONING_DAYS };
