import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';
import { XMLParser } from 'fast-xml-parser';
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
import { HOT_SECTOR_BASKETS } from '../stock-lists/persona-data';

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
  private refreshingSince = 0;

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

    const headlines = await this.tickerHeadlines(key, name);
    const data = await this.generator.generateMovementExplainer({
      symbol: key,
      name,
      changePct,
      headlines,
    });
    if (data.explainer) this.explainerCache.set(key, { ts: Date.now(), data });
    return data;
  }

  /** Deep per-ticker news sweep for the movement explainer — THREE sources in
   *  parallel (Google News RSS, Yahoo per-ticker RSS, Yahoo search), each
   *  headline stamped with its source and date so the model can anchor the
   *  move to the actual, current catalyst (merger, offering, earnings, ...)
   *  instead of guessing. Freshest first, deduped, last 7 days, max 8. */
  private readonly rssParser = new XMLParser({ ignoreAttributes: false, trimValues: true });

  private async tickerHeadlines(symbol: string, name: string): Promise<string[]> {
    const sym = symbol.toUpperCase();
    const UA = { 'User-Agent': 'Mozilla/5.0' };
    type Item = { title: string; source: string; date: number };
    const items: Item[] = [];

    const parseRss = (xml: string, fallbackSource: string): Item[] => {
      try {
        const parsed = this.rssParser.parse(xml);
        const raw = parsed?.rss?.channel?.item || [];
        const list = Array.isArray(raw) ? raw : [raw];
        return list.filter(Boolean).map((it: any) => {
          let title = String(it.title?.['#text'] ?? it.title ?? '').trim();
          let source = String(it.source?.['#text'] ?? '').trim() || fallbackSource;
          // Google News titles end with " - Publisher"
          const m = title.match(/^(.*)\s-\s([^-]{2,40})$/);
          if (m && !it.source) { title = m[1].trim(); source = m[2].trim(); }
          return { title, source, date: Date.parse(String(it.pubDate || '')) || 0 };
        });
      } catch { return []; }
    };

    const q = encodeURIComponent(`"${sym}" OR "${(name || sym).split(/[,(]/)[0].trim()}" stock`);
    const fetches: Array<Promise<void>> = [
      // 1. Google News — best coverage of the actual catalyst (press wires,
      //    Benzinga/StockTitan/TipRanks write-ups), especially for small caps.
      axios.get(`https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`, { headers: UA, timeout: 6000, responseType: 'text' })
        .then((r) => { items.push(...parseRss(r.data, 'Google News')); })
        .catch(() => undefined),
      // 2. Yahoo per-ticker headline feed — company press releases.
      axios.get(`https://feeds.finance.yahoo.com/rss/2.0/headline?s=${encodeURIComponent(sym)}&region=US&lang=en-US`, { headers: UA, timeout: 6000, responseType: 'text' })
        .then((r) => { items.push(...parseRss(r.data, 'Yahoo Finance')); })
        .catch(() => undefined),
      // 3. Yahoo search JSON — extra publisher-tagged coverage.
      axios.get('https://query1.finance.yahoo.com/v1/finance/search', { params: { q: sym, newsCount: 8, quotesCount: 0 }, headers: UA, timeout: 6000 })
        .then((r) => {
          const arr: any[] = Array.isArray(r.data?.news) ? r.data.news : [];
          items.push(...arr.map((n) => ({
            title: String(n?.title || '').trim(),
            source: String(n?.publisher || 'Yahoo Finance').trim(),
            date: (Number(n?.providerPublishTime) || 0) * 1000,
          })));
        })
        .catch(() => undefined),
    ];
    await Promise.allSettled(fetches);

    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const seen = new Set<string>();
    const fmtAge = (d: number) => {
      if (!d) return 'date unknown';
      const h = Math.max(0, (Date.now() - d) / 3_600_000);
      if (h < 1) return 'just now';
      if (h < 24) return `${Math.round(h)}h ago`;
      return `${Math.round(h / 24)}d ago`;
    };
    return items
      .filter((i) => i.title && (!i.date || i.date >= cutoff))
      .sort((a, b) => b.date - a.date)
      .filter((i) => {
        const k = i.title.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 70);
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      })
      .slice(0, 8)
      .map((i) => `[${i.source} · ${fmtAge(i.date)}] ${i.title}`);
  }

  /** Pre-warm movement explainers for a page of movers in ONE model call —
   *  the top-gainers page posts its visible tickers on load so every hover
   *  resolves instantly from cache. Returns whatever is ready (cached +
   *  freshly generated). */
  async getMovementExplainersBatch(
    items: Array<{ symbol: string; name?: string; changePct?: number }>,
  ): Promise<Record<string, { title: string; explainer: string }>> {
    const wanted = items
      .map((i) => ({
        symbol: (i.symbol || '').toUpperCase(),
        name: i.name || '',
        changePct: Number(i.changePct) || 0,
      }))
      .filter((i) => /^[A-Z][A-Z0-9.\-]{0,9}$/.test(i.symbol))
      .slice(0, 30);

    const out: Record<string, { title: string; explainer: string }> = {};
    const missing: typeof wanted = [];
    for (const it of wanted) {
      const cached = this.explainerCache.get(it.symbol);
      if (cached && Date.now() - cached.ts < this.EXPLAINER_TTL) {
        out[it.symbol] = cached.data;
      } else {
        missing.push(it);
      }
    }
    if (!missing.length) return out;

    // Per-ticker headlines in parallel (bounded), then ONE batched model call.
    const settled = await Promise.allSettled(
      missing.map((m) => this.tickerHeadlines(m.symbol, m.name)),
    );
    const withNews = missing.map((m, i) => ({
      ...m,
      headlines:
        settled[i].status === 'fulfilled'
          ? (settled[i] as PromiseFulfilledResult<string[]>).value.slice(0, 5)
          : [],
    }));

    const generatedMap = await this.generator.generateMovementExplainersBatch(withNews);
    for (const m of missing) {
      const explainer = generatedMap[m.symbol];
      if (!explainer) continue;
      const dir = m.changePct >= 0 ? 'up' : 'down';
      const data = {
        title: `Why ${m.symbol} is ${dir} ${Math.abs(m.changePct).toFixed(2)}% today`,
        explainer,
      };
      this.explainerCache.set(m.symbol, { ts: Date.now(), data });
      out[m.symbol] = data;
    }
    return out;
  }

  /** Run the full daily refresh. Concurrency-locked so a manual trigger and
   *  the boot/cron refresh can't run at once and race on duplicate slugs. */
  async runDailyRefresh(opts?: {
    reset?: boolean;
    /** Clear the ENTIRE feed (all days) before regenerating — full replace. */
    resetAll?: boolean;
    staleOnly?: boolean;
    limit?: number;
  }): Promise<{ generated: number; skipped: number; errors: string[] }> {
    // Auto-expiring lock — on serverless a function killed at the time cap can
    // leave `refreshing` stuck; expire it after 2 min so it self-heals. Safe
    // because persist() upserts by slug (a concurrent run can't duplicate).
    const LOCK_TTL = 120_000;
    if (this.refreshing && Date.now() - this.refreshingSince < LOCK_TTL) {
      this.logger.warn('Daily refresh already in progress — skipping duplicate run.');
      return { generated: 0, skipped: 0, errors: ['refresh already running'] };
    }
    this.refreshing = true;
    this.refreshingSince = Date.now();
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
    resetAll?: boolean;
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
    // The "Key points" box opens every current-engine article. We use it (not
    // the disclosure, which sits at the very end and can be truncated on long
    // bodies) as the compliance marker — otherwise a truncated article would
    // look stale forever and be regenerated in an endless, token-burning loop.
    const isCurrentEngine = (body: string | null | undefined) =>
      /key\s*points/i.test(body || '');
    const take = async (slug: string): Promise<boolean> => {
      if (generated >= cap) return false;
      const existing = await this.repo.findOne({ where: { slug } });
      if (!existing) return true; // missing → generate
      if (opts?.reset) return true; // force this cycle
      // staleOnly: regenerate older-engine articles in place — zero downtime,
      // converges as each rewrite gains the Key points box and is then skipped.
      if (opts?.staleOnly && !isCurrentEngine(existing.body)) return true;
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
    // Full replace: wipe the ENTIRE feed once (send on the first batched call
    // only), then batched calls refill today's full slug set through the
    // current engine — everything QA sees is newest-rules content.
    if (opts?.resetAll) {
      const del = await this.repo.createQueryBuilder().delete().where('1=1').execute();
      this.logger.log(`Refresh reset-all: cleared ${del.affected ?? 0} articles (full feed).`);
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

    // Category list article ("Best Gold Stocks Right Now", "5 AI Stocks Worth
    // Considering", "Insiders Are Buying These 3 Gold Stocks") — rotate the
    // thematic category and the headline variant daily; the category goes in
    // the headline, and every stock carries its Insider Score + a live data card.
    const basket = HOT_SECTOR_BASKETS[dayOfYear % HOT_SECTOR_BASKETS.length];
    const listSlug = `sector-list-${basket.key}-${dayKey}`;
    if (await take(listSlug)) {
      try {
        const variants = ['best', 'worth-considering', 'insiders-buying'] as const;
        let variant: (typeof variants)[number] = variants[dayOfYear % variants.length];
        const { rows: catRank } = await this.iqs.getRankings({ limit: 500, offset: 0 });
        const rankByTicker = new Map(
          catRank.map((r) => [(r.ticker || '').toUpperCase(), r]),
        );
        const quotes = await this.marketStats.getQuoteBatch(basket.tickers.slice(0, 30));
        const members = basket.tickers.map((t) => {
          const sym = t.toUpperCase();
          const rk = rankByTicker.get(sym);
          const q = quotes.get(sym);
          return {
            ticker: sym,
            name: q?.name || rk?.name || sym,
            price: q?.price ?? null,
            marketCap: q?.marketCap ?? rk?.marketCap ?? null,
            iqs: rk?.iqs != null ? Number(rk.iqs) : null,
            distinctBuyers: rk?.distinctBuyers ?? null,
          };
        });
        const withInsiders = members.filter((m) => m.iqs != null);
        // "Insiders are buying…" needs real insider names — fall back when thin.
        if (variant === 'insiders-buying' && withInsiders.length < 2) variant = 'best';
        const pool = variant === 'insiders-buying' ? withInsiders : members;
        const picks = [...pool]
          .sort(
            (a, b) =>
              (b.iqs ?? -1) - (a.iqs ?? -1) ||
              (b.marketCap ?? 0) - (a.marketCap ?? 0),
          )
          .slice(0, 5);
        if (picks.length >= 3) {
          const article = await this.generator.generateSectorListArticle(
            basket.label,
            variant,
            picks,
          );
          await this.persist({
            slug: listSlug,
            kind: 'sector-roundup',
            ticker: null,
            sector: basket.label,
            iqsAtGeneration: picks[0]?.iqs ?? null,
            article,
            inputSnapshot: { category: basket.label, variant, picks },
          });
          generated++;
        } else {
          skipped++;
        }
      } catch (err) {
        errors.push(`sector-list ${basket.key}: ${(err as Error).message}`);
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

    // Editorial Desk — at least 4 structured, factual news stories per day,
    // each grounded in a distinct lead headline from the live news feed (the
    // feed hook is NewsService; swap/add sources there).
    const editorialResult = await this.generateEditorialStories(dayKey, dateLabel, take, () => {
      generated++;
    });
    skipped += editorialResult.skipped;
    errors.push(...editorialResult.errors);

    this.logger.log(
      `Daily refresh complete — generated=${generated} skipped=${skipped} errors=${errors.length}`,
    );
    return { generated, skipped, errors };
  }

  /** Editorial Desk — ≥4 structured, non-promotional news stories per day in a
   *  factual WSJ/Barron's tone. Each story takes one distinct lead headline
   *  from the aggregated news feed (one per source where possible) and rewrites
   *  it in our voice with an "Our take:" and a bear/skeptic section. */
  private readonly EDITORIAL_PER_DAY = 4;
  private async generateEditorialStories(
    dayKey: string,
    dateLabel: string,
    take: (slug: string) => Promise<boolean>,
    bump: () => void,
  ): Promise<{ skipped: number; errors: string[] }> {
    let skipped = 0;
    const errors: string[] = [];

    let allNews: Awaited<ReturnType<NewsService['getLatest']>> = [];
    try {
      allNews = await this.news.getLatest();
    } catch {
      allNews = [];
    }
    if (!allNews.length) {
      errors.push('editorial: no source headlines available');
      return { skipped, errors };
    }

    // Pick distinct leads — prefer one story per source so the day's desk
    // covers different corners of the market instead of one outlet's feed.
    const leads: typeof allNews = [];
    const seenSources = new Set<string>();
    for (const n of allNews) {
      if (leads.length >= this.EDITORIAL_PER_DAY) break;
      const src = (n.source || 'unknown').toLowerCase();
      if (seenSources.has(src)) continue;
      seenSources.add(src);
      leads.push(n);
    }
    // Top up from remaining headlines if we had fewer sources than stories.
    for (const n of allNews) {
      if (leads.length >= this.EDITORIAL_PER_DAY) break;
      if (!leads.includes(n)) leads.push(n);
    }

    for (let i = 0; i < leads.length; i++) {
      const slug = `editorial-${i + 1}-${dayKey}`;
      if (!(await take(slug))) {
        skipped++;
        continue;
      }
      const lead = leads[i];
      try {
        const related = allNews
          .filter((n) => n !== lead)
          .slice(0, 5)
          .map((n) => ({ title: n.title, source: n.source }));
        const article = await this.generator.generateEditorialStory({
          dateLabel,
          lead: { title: lead.title, source: lead.source },
          related,
        });
        await this.persist({
          slug,
          kind: 'editorial',
          ticker: null,
          sector: null,
          iqsAtGeneration: null,
          article,
          inputSnapshot: { date: dayKey, lead: { title: lead.title, source: lead.source } },
        });
        bump();
      } catch (err) {
        errors.push(`editorial ${i + 1}: ${(err as Error).message}`);
      }
    }
    return { skipped, errors };
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
