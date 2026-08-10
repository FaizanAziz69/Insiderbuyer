import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AnalystPriceTarget } from '../entities/analyst-target.entity';
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

  constructor(
    @InjectRepository(AnalystPriceTarget)
    private readonly repo: Repository<AnalystPriceTarget>,
    private readonly fmp: FmpService,
    private readonly market: MarketStatsService,
  ) {}

  /** Pull the latest notes and upsert. One FMP request. */
  async refresh(): Promise<{ fetched: number; inserted: number }> {
    if (!this.fmp.enabled) return { fetched: 0, inserted: 0 };
    const rows = await this.fmp.priceTargetLatest();
    let inserted = 0;
    for (const r of rows) {
      const publishedDate = new Date(r.publishedDate);
      if (Number.isNaN(publishedDate.getTime())) continue;
      try {
        const res = await this.repo.upsert(
          {
            analystName: r.analystName,
            analystCompany: r.analystCompany,
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
                analystName: r.analystName,
                analystCompany: r.analystCompany,
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

  /** Refresh at most every 20 minutes when the page is being viewed. */
  private async maybeRefresh(): Promise<void> {
    if (Date.now() - this.lastRefreshAt < this.REFRESH_MIN_MS) return;
    try {
      await this.refresh();
    } catch (e: any) {
      this.logger.warn(`analyst refresh failed: ${e?.message || e}`);
    }
  }

  async getTopAnalysts(limit = 50): Promise<{
    rows: TopAnalystRow[];
    coverage: { ratings: number; analysts: number; since: string | null };
  }> {
    await this.maybeRefresh();

    const all = await this.repo.find({ order: { publishedDate: 'DESC' } });
    if (!all.length) {
      return { rows: [], coverage: { ratings: 0, analysts: 0, since: null } };
    }

    // Close history once per symbol involved (in-memory cached downstream).
    const symbols = Array.from(new Set(all.map((t) => t.symbol)));
    const hist = new Map<string, Array<{ t: number; c: number }>>();
    const CONC = 6;
    for (let i = 0; i < symbols.length; i += CONC) {
      const chunk = symbols.slice(i, i + CONC);
      const got = await Promise.all(
        chunk.map((s) => this.market.getCloseHistory(s, '2y').catch(() => [])),
      );
      got.forEach((h, j) => {
        if (h.length) hist.set(chunk[j], h);
      });
    }
    const now = Date.now();

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
      const sec = SECTOR_BY_TICKER[t.symbol];
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
    return {
      rows: rows.slice(0, limit),
      coverage: {
        ratings: all.length,
        analysts: byAnalyst.size,
        since: oldest ? new Date(oldest.publishedDate).toISOString().slice(0, 10) : null,
      },
    };
  }
}

export { MIN_SEASONING_DAYS };
