import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BlogPost, BlogKind } from '../entities/blog-post.entity';
import {
  ContentGeneratorService,
  GeneratedArticle,
  RankingLite,
} from './content-generator.service';
import { buildAiImageUrl } from './image-url.builder';
import { IqsService } from '../iqs/iqs.service';
import { NewsService } from '../news/news.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { TOPICS } from './topics';

// How many per-stock topic articles to generate per topic per day. With ~28-day
// retention this accumulates to dozens of articles per topic page.
const TOPIC_TICKERS_PER_DAY = 6;

const SECTOR_ROTATION = [
  'Technology',
  'Healthcare',
  'Financial',
  'Energy',
  'Industrials',
  'Consumer Discretionary',
  'Materials',
  'Communication Services',
];

@Injectable()
export class ContentService {
  private readonly logger = new Logger(ContentService.name);
  /** Guards against a manual refresh and the boot/cron refresh running at the
   *  same time (which raced on duplicate slugs). */
  private refreshing = false;

  constructor(
    @InjectRepository(BlogPost)
    private readonly repo: Repository<BlogPost>,
    private readonly generator: ContentGeneratorService,
    private readonly iqs: IqsService,
    private readonly news: NewsService,
    private readonly marketStats: MarketStatsService,
  ) {}

  /** Latest published posts, newest first. */
  async list(opts: { limit?: number; kind?: BlogKind; ticker?: string; topic?: string } = {}) {
    const qb = this.repo
      .createQueryBuilder('p')
      .orderBy('p.generatedAt', 'DESC')
      .limit(opts.limit || 30);
    if (opts.kind) qb.andWhere('p.kind = :k', { k: opts.kind });
    if (opts.ticker) qb.andWhere('UPPER(p.ticker) = :t', { t: opts.ticker.toUpperCase() });
    if (opts.topic) qb.andWhere('p.topic = :tp', { tp: opts.topic.toLowerCase() });
    return qb.getMany();
  }

  async bySlug(slug: string): Promise<BlogPost | null> {
    return this.repo.findOne({ where: { slug } });
  }

  async byTicker(ticker: string, limit = 5): Promise<BlogPost[]> {
    return this.repo.find({
      where: { ticker: ticker.toUpperCase() },
      order: { generatedAt: 'DESC' },
      take: limit,
    });
  }

  /** On-demand AI movement explainer, cached per ticker. Grounded in recent
   *  headlines that mention the company when available. */
  private explainerCache = new Map<
    string,
    { ts: number; data: { title: string; explainer: string } }
  >();
  private readonly EXPLAINER_TTL = 6 * 60 * 60_000;

  async getMovementExplainer(
    symbol: string,
    name: string,
    changePct: number,
  ): Promise<{ title: string; explainer: string }> {
    const key = symbol.toUpperCase();
    const cached = this.explainerCache.get(key);
    if (cached && Date.now() - cached.ts < this.EXPLAINER_TTL) return cached.data;

    // First, prefer an existing AI article for this ticker (already grounded).
    let headlines: string[] = [];
    try {
      const news = await this.news.getLatest();
      const sym = key.toLowerCase();
      const firstWord = (name || '').toLowerCase().split(/[\s,]+/)[0];
      headlines = news
        .filter((n) => {
          const t = (n.title || '').toLowerCase();
          return (
            t.includes(sym) ||
            (firstWord.length > 2 && t.includes(firstWord))
          );
        })
        .map((n) => n.title)
        .slice(0, 6);
    } catch {
      /* news optional */
    }

    const data = await this.generator.generateMovementExplainer({
      symbol: key,
      name,
      changePct,
      headlines,
    });
    if (data.explainer) this.explainerCache.set(key, { ts: Date.now(), data });
    return data;
  }

  /** Run the full daily refresh. Concurrency-locked so a manual trigger and
   *  the boot/cron refresh can't run at once and race on duplicate slugs. */
  async runDailyRefresh(opts?: {
    reset?: boolean;
    staleOnly?: boolean;
    limit?: number;
  }): Promise<{ generated: number; skipped: number; errors: string[] }> {
    if (this.refreshing) {
      this.logger.warn('Daily refresh already in progress — skipping duplicate run.');
      return { generated: 0, skipped: 0, errors: ['refresh already running'] };
    }
    this.refreshing = true;
    try {
      return await this.runDailyRefreshInner(opts);
    } finally {
      this.refreshing = false;
    }
  }

  /** Wipes aged posts, then regenerates the full batch (daily summary, top Insider Score,
   *  ticker deep dives, stock ideas, sector roundup, weekly/cluster/CEO, and
   *  the per-topic news roundups + per-stock topic articles). */
  private async runDailyRefreshInner(opts?: {
    reset?: boolean;
    staleOnly?: boolean;
    limit?: number;
  }): Promise<{ generated: number; skipped: number; errors: string[] }> {
    if (!this.generator.isReady()) {
      this.logger.warn('Content generator not ready — skipping daily refresh.');
      return { generated: 0, skipped: 0, errors: ['ANTHROPIC_API_KEY missing'] };
    }

    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];
    // Batch controls (for regenerating the feed through a new engine within the
    // serverless time budget): `limit` caps generations per call; `reset`
    // deletes today's articles once so subsequent batched calls refill the same
    // slugs. `take(slug)` = "should we (re)generate this slug now?" — true when
    // it's missing and we're still under the per-call cap.
    const cap = opts?.limit && opts.limit > 0 ? opts.limit : Infinity;
    // The verbatim disclosure marks a guide-compliant (current-engine) article.
    const DISCLOSURE =
      'Not investment advice. Summarized from public SEC Form 4 and congressional disclosure data.';
    const take = async (slug: string): Promise<boolean> => {
      if (generated >= cap) return false;
      const existing = await this.repo.findOne({ where: { slug } });
      if (!existing) return true; // missing → generate
      if (opts?.reset) return true; // force this cycle
      // staleOnly: regenerate articles produced by an older engine (no
      // disclosure line) in place — zero downtime, converges as each rewrite
      // gains the disclosure and is then skipped.
      if (opts?.staleOnly && !(existing.body || '').includes(DISCLOSURE)) return true;
      return false; // up-to-date → skip
    };

    // Prune most posts after 7 days so the homepage stays fresh, but let
    // topic-roundup articles live ~28 days so each topic page accumulates a
    // deep, MarketBeat-style archive of dozens of articles.
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const topicCutoff = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000);
    await this.repo
      .createQueryBuilder()
      .delete()
      .where(
        "(kind = 'topic-roundup' AND \"generatedAt\" < :topicCutoff) OR (kind <> 'topic-roundup' AND \"generatedAt\" < :cutoff)",
        { topicCutoff: topicCutoff.toISOString(), cutoff: cutoff.toISOString() },
      )
      .execute();

    // Pull the top of the Insider Score leaderboard once and reuse across all jobs.
    const rankings = await this.iqs.getRankings({ limit: 30, offset: 0 });
    const rows: RankingLite[] = (rankings.rows || []).map((r) => ({
      ticker: r.ticker || '',
      name: r.name || r.ticker || '',
      sector: r.sector,
      iqs: Number(r.iqs) || 0,
      marketCap: r.marketCap,
      totalPurchaseValue: Number(r.totalPurchaseValue) || 0,
      distinctBuyers: r.distinctBuyers,
    })).filter((r) => r.ticker);

    if (rows.length === 0) {
      errors.push('No Insider Score rankings available to generate content from.');
      return { generated, skipped, errors };
    }

    const today = new Date();
    const dayKey = today.toISOString().slice(0, 10);
    const dateLabel = today.toLocaleDateString(undefined, {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });

    // Reset: delete today's day-keyed articles once so batched refresh calls
    // refill the SAME slugs (URLs) through the current engine.
    if (opts?.reset) {
      const del = await this.repo
        .createQueryBuilder()
        .delete()
        .where('slug LIKE :d', { d: `%-${dayKey}` })
        .execute();
      this.logger.log(`Refresh reset: cleared ${del.affected ?? 0} of today's articles.`);
    }

    // Daily summary (only generate if today's is missing / under the cap).
    if (await take(`daily-briefing-${dayKey}`)) {
      try {
        const article = await this.generator.generateDailySummary(rows.slice(0, 10), dateLabel);
        await this.persist({
          slug: `daily-briefing-${dayKey}`,
          kind: 'daily-summary',
          ticker: null,
          sector: null,
          iqsAtGeneration: rows[0]?.iqs ?? null,
          article,
          inputSnapshot: { date: dayKey, top: rows.slice(0, 10) },
        });
        generated++;
      } catch (err) {
        errors.push(`daily-summary: ${(err as Error).message}`);
      }
    } else {
      skipped++;
    }

    // Top Insider Score weekly-style article (rebuilt daily — overwritten by slug).
    if (await take(`top-iqs-picks-${dayKey}`)) {
      try {
        const article = await this.generator.generateTopIqsArticle(rows.slice(0, 5));
        await this.persist({
          slug: `top-iqs-picks-${dayKey}`,
          kind: 'top-iqs',
          ticker: null,
          sector: null,
          iqsAtGeneration: rows[0]?.iqs ?? null,
          article,
          inputSnapshot: { date: dayKey, top5: rows.slice(0, 5) },
        });
        generated++;
      } catch (err) {
        errors.push(`top-iqs: ${(err as Error).message}`);
      }
    } else {
      skipped++;
    }

    // Ticker deep dives for the top 5.
    for (const row of rows.slice(0, 5)) {
      const slug = `ticker-deep-dive-${row.ticker.toLowerCase()}-${dayKey}`;
      if (!(await take(slug))) {
        skipped++;
        continue;
      }
      try {
        const article = await this.generator.generateTickerDeepDive(row);
        await this.persist({
          slug,
          kind: 'ticker-deep-dive',
          ticker: row.ticker.toUpperCase(),
          sector: row.sector ?? null,
          iqsAtGeneration: row.iqs,
          article,
          inputSnapshot: { ticker: row.ticker, snapshot: row },
        });
        generated++;
      } catch (err) {
        errors.push(`ticker-deep-dive ${row.ticker}: ${(err as Error).message}`);
      }
    }

    // Stock-idea cards — short trade-idea blurbs surfaced on the home page.
    // Generate one per top-6 ticker so the home grid always has live content.
    for (const row of rows.slice(0, 6)) {
      const slug = `stock-idea-${row.ticker.toLowerCase()}-${dayKey}`;
      if (!(await take(slug))) {
        skipped++;
        continue;
      }
      try {
        const article = await this.generator.generateStockIdea(row);
        await this.persist({
          slug,
          kind: 'stock-idea',
          ticker: row.ticker.toUpperCase(),
          sector: row.sector ?? null,
          iqsAtGeneration: row.iqs,
          article,
          inputSnapshot: { ticker: row.ticker, snapshot: row },
        });
        generated++;
      } catch (err) {
        errors.push(`stock-idea ${row.ticker}: ${(err as Error).message}`);
      }
    }

    // Sector roundup — rotate sector by day-of-year so each sector gets one
    // article every ~8 days.
    const dayOfYear = Math.floor(
      (today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / 86_400_000,
    );
    const sector = SECTOR_ROTATION[dayOfYear % SECTOR_ROTATION.length];
    const sectorSlug = `sector-roundup-${sector.toLowerCase().replace(/[^a-z]+/g, '-')}-${dayKey}`;
    if (await take(sectorSlug)) {
      const sectorRows = rows.filter((r) =>
        (r.sector || '').toLowerCase().includes(sector.toLowerCase()),
      );
      if (sectorRows.length >= 2) {
        try {
          const article = await this.generator.generateSectorRoundup(sector, sectorRows);
          await this.persist({
            slug: sectorSlug,
            kind: 'sector-roundup',
            ticker: null,
            sector,
            iqsAtGeneration: sectorRows[0]?.iqs ?? null,
            article,
            inputSnapshot: { sector, top: sectorRows.slice(0, 6) },
          });
          generated++;
        } catch (err) {
          errors.push(`sector-roundup ${sector}: ${(err as Error).message}`);
        }
      } else {
        skipped++;
      }
    } else {
      skipped++;
    }

    // Weekly insider activity report — one per ISO week, generated on the
    // first refresh of the week and kept until it ages out.
    const weekKey = isoWeekKey(today);
    const weeklySlug = `weekly-insider-report-${weekKey}`;
    if (await take(weeklySlug)) {
      try {
        const vol = await this.iqs.getVolumeSeries(7);
        const article = await this.generator.generateWeeklyReport(rows.slice(0, 8), {
          totalBuys: vol.totalCount,
          totalValue: vol.totalValue,
          weekLabel: dateLabel,
        });
        await this.persist({
          slug: weeklySlug,
          kind: 'weekly-report',
          ticker: null,
          sector: null,
          iqsAtGeneration: rows[0]?.iqs ?? null,
          article,
          inputSnapshot: { week: weekKey, top: rows.slice(0, 8) },
        });
        generated++;
      } catch (err) {
        errors.push(`weekly-report: ${(err as Error).message}`);
      }
    } else {
      skipped++;
    }

    // Cluster-buying alert — strongest multi-buyer name of the day.
    const clusterRow = rows.find((r) => (r.distinctBuyers ?? 0) >= 2);
    if (clusterRow) {
      const clusterSlug = `cluster-buy-${clusterRow.ticker.toLowerCase()}-${dayKey}`;
      if (await take(clusterSlug)) {
        try {
          const article = await this.generator.generateClusterBuyArticle(clusterRow);
          await this.persist({
            slug: clusterSlug,
            kind: 'cluster-buy',
            ticker: clusterRow.ticker.toUpperCase(),
            sector: clusterRow.sector ?? null,
            iqsAtGeneration: clusterRow.iqs,
            article,
            inputSnapshot: { ticker: clusterRow.ticker, snapshot: clusterRow },
          });
          generated++;
        } catch (err) {
          errors.push(`cluster-buy ${clusterRow.ticker}: ${(err as Error).message}`);
        }
      } else {
        skipped++;
      }
    }

    // CEO buying tracker — roundup of recent chief-executive purchases.
    const ceoSlug = `ceo-buying-tracker-${dayKey}`;
    if (await take(ceoSlug)) {
      try {
        const { rows: trades } = await this.iqs.getAllTrades({ limit: 300, offset: 0 });
        const ceoBuys = trades
          .filter((t: any) => t.role === 'CEO' && t.type === 'BUY')
          .slice(0, 6);
        if (ceoBuys.length >= 1) {
          const article = await this.generator.generateCeoBuyingArticle(ceoBuys as any);
          await this.persist({
            slug: ceoSlug,
            kind: 'ceo-buying',
            ticker: (ceoBuys[0] as any).ticker?.toUpperCase() ?? null,
            sector: (ceoBuys[0] as any).sector ?? null,
            iqsAtGeneration: rows[0]?.iqs ?? null,
            article,
            inputSnapshot: { date: dayKey, ceoBuys },
          });
          generated++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors.push(`ceo-buying: ${(err as Error).message}`);
      }
    } else {
      skipped++;
    }

    // News-topic roundups (AI, Biotech, EV, ETFs, Macro, Markets, M&A, Semis).
    const topicResult = await this.generateTopicRoundups(dayKey, dateLabel, take, () => {
      generated++;
    });
    skipped += topicResult.skipped;
    errors.push(...topicResult.errors);

    this.logger.log(
      `Daily refresh complete — generated=${generated} skipped=${skipped} errors=${errors.length}`,
    );
    return { generated, skipped, errors };
  }

  /** Generate one AI news roundup per topic per day — grounded in real source
   *  headlines + live data for the theme's tickers. Date-stamped slugs make the
   *  article and its image roll over every 24 hours. */
  private async generateTopicRoundups(
    dayKey: string,
    dateLabel: string,
    take: (slug: string) => Promise<boolean>,
    bump: () => void,
  ): Promise<{ generated: number; skipped: number; errors: string[] }> {
    let generated = 0;
    let skipped = 0;
    const errors: string[] = [];

    // Pull all source news once and the Insider Score table once, reuse across topics.
    let allNews: Awaited<ReturnType<NewsService['getLatest']>> = [];
    try {
      allNews = await this.news.getLatest();
    } catch {
      allNews = [];
    }
    const { rows: rankRows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
    const iqsByTicker = new Map(rankRows.map((r) => [r.ticker, Number(r.iqs)]));

    for (const topic of TOPICS) {
      const slug = `topic-${topic.slug}-${dayKey}`;
      // Generate the daily roundup if today's isn't already on file. (Don't
      // `continue` here — the per-stock articles below must still run.)
      if (!(await take(slug))) {
        skipped++;
      } else {
        try {
          const headlines = this.news
            .filter(allNews, { tag: topic.newsTag })
            .slice(0, 8)
            .map((n) => ({ title: n.title, source: n.source }));

          let quotes = new Map<string, any>();
          try {
            quotes = await this.marketStats.getQuoteBatch(topic.tickers);
          } catch {
            quotes = new Map();
          }
          const stocks = topic.tickers.map((t) => {
            const q = quotes.get(t.toUpperCase());
            return {
              ticker: t,
              name: q?.name || t,
              changePct: q ? q.changePct : null,
              iqs: iqsByTicker.get(t) ?? null,
            };
          });

          const article = await this.generator.generateTopicRoundup({
            label: topic.label,
            angle: topic.angle,
            dateLabel,
            headlines,
            stocks,
          });
          await this.persist({
            slug,
            kind: 'topic-roundup',
            ticker: null,
            sector: topic.photoSector,
            topic: topic.slug,
            iqsAtGeneration: null,
            article,
            inputSnapshot: {
              topic: topic.slug,
              headlines,
              tickers: topic.tickers,
            },
          });
          bump();
        } catch (err) {
          errors.push(`topic ${topic.slug}: ${(err as Error).message}`);
        }
      }

      // Per-stock articles for the topic's tickers — fills each topic page
      // with many articles (MarketBeat-style) that accumulate over ~28 days.
      const perTicker = topic.tickers.slice(0, TOPIC_TICKERS_PER_DAY);
      let quotes2 = new Map<string, any>();
      try {
        quotes2 = await this.marketStats.getQuoteBatch(perTicker);
      } catch {
        quotes2 = new Map();
      }
      for (const tk of perTicker) {
        const tkSlug = `topic-${topic.slug}-${tk.toLowerCase()}-${dayKey}`;
        if (!(await take(tkSlug))) {
          skipped++;
          continue;
        }
        try {
          const q = quotes2.get(tk.toUpperCase());
          const tHeadlines = this.news
            .filter(allNews, { tag: topic.newsTag })
            .slice(0, 4)
            .map((n) => ({ title: n.title, source: n.source }));
          const article = await this.generator.generateTopicStockArticle({
            topicLabel: topic.label,
            ticker: tk,
            name: q?.name || tk,
            changePct: q ? q.changePct : null,
            iqs: iqsByTicker.get(tk) ?? null,
            headlines: tHeadlines,
          });
          await this.persist({
            slug: tkSlug,
            kind: 'topic-roundup',
            ticker: tk.toUpperCase(),
            sector: topic.photoSector,
            topic: topic.slug,
            iqsAtGeneration: iqsByTicker.get(tk) ?? null,
            article,
            inputSnapshot: { topic: topic.slug, ticker: tk },
          });
          bump();
        } catch (err) {
          errors.push(`topic ${topic.slug} ${tk}: ${(err as Error).message}`);
        }
      }
    }
    return { generated, skipped, errors };
  }

  private async persist(opts: {
    slug: string;
    kind: BlogKind;
    ticker: string | null;
    sector: string | null;
    topic?: string | null;
    iqsAtGeneration: number | null;
    article: GeneratedArticle;
    inputSnapshot: Record<string, unknown>;
  }) {
    const { slug, kind, ticker, sector, topic, iqsAtGeneration, article, inputSnapshot } = opts;
    const imageUrl = buildAiImageUrl(article.imagePrompt, {
      seed: slug,
      ticker,
      sector,
    });
    const featuredTickers = extractFeaturedTickers(kind, ticker, inputSnapshot);
    // Upsert by slug: overwrite an existing article in place (regeneration)
    // rather than inserting a duplicate that would violate the unique slug.
    const existing = await this.repo.findOne({ where: { slug } });
    const post = this.repo.create({
      ...(existing ? { id: existing.id } : {}),
      slug,
      kind,
      ticker,
      sector,
      topic: topic ?? null,
      title: article.title,
      eyebrow: article.eyebrow,
      summary: article.summary,
      body: article.body,
      imagePrompt: article.imagePrompt,
      imageUrl,
      tags: article.tags,
      featuredTickers,
      iqsAtGeneration,
      inputSnapshot,
    });
    await this.repo.save(post);
  }
}

/** ISO-8601 week key, e.g. "2026-W24" — one weekly report per week. */
function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Pick the 1-3 tickers to render as brand-logo overlays on the cover.
 *  Reads from the per-kind inputSnapshot shape so we never have to query
 *  the DB again at render time. */
function extractFeaturedTickers(
  kind: string,
  ticker: string | null,
  snapshot: Record<string, unknown>,
): string[] {
  // Single-ticker posts (incl. per-stock topic articles): just that ticker.
  if (
    kind === 'ticker-deep-dive' ||
    kind === 'stock-idea' ||
    (kind === 'topic-roundup' && ticker)
  ) {
    return ticker ? [ticker.toUpperCase()] : [];
  }
  // Multi-ticker posts: pull from the snapshot the generator stored.
  const arr =
    (snapshot.top5 as RankingLite[] | undefined) ||
    (snapshot.top as RankingLite[] | undefined) ||
    [];
  return arr
    .map((r) => (r.ticker || '').toUpperCase().trim())
    .filter(Boolean)
    .slice(0, 3);
}
