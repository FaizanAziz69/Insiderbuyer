import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { AnalystsService } from '../analysts/analysts.service';
import { InvestorsService } from '../investors/investors.service';
import { LAUNCH_ARTICLES, ArticleSeed, ArticleSections } from './seed';

/**
 * DATA ARTICLES — Developer Project Brief (Aug 24 2026), Workstream A.
 *
 * "Evergreen, auto-refreshing data article pages … template it in the CMS,
 *  wire the chart to live data, and launch four articles."
 *
 *  §3.2 Chart module: ranked horizontal bars, top 10; 30/90-day toggle served
 *  as one endpoint per article per period; hover/focus detail per row (total
 *  bought, # insiders, avg buy price, % since purchase, % above 52-week low,
 *  cluster flag, largest buyer). 10b5-1 plan sales, option exercises and stock
 *  awards are excluded — discretionary open-market purchases only
 *  (transactionCode 'P', plannedBuy = false).
 *
 *  §3.3 Body copy is editorial's and editable around a LOCKED chart module;
 *  headlines and URLs are permanent; "updated" renders from the data refresh
 *  timestamp. Copy may use {{placeholders}} (top1.ticker, total, asOf …) so
 *  evergreen sentences stay true after every refresh.
 *
 * Tables (raw SQL, created on demand — same convention as investors/ipo):
 *   data_articles       slug, headline, dek, category, refresh kind, editable sections (jsonb)
 *   data_article_data   (slug, period) → chart payload (jsonb) + refreshed_at
 */

export type Period = '30d' | '90d' | '12m' | 'ttm';
export type Variant = 'all' | 'discretionary' | 'planned';

export interface ChartRow {
  rank: number;
  key: string; // ticker / analyst slug / investor slug
  label: string; // ticker or name shown on the bar
  sublabel: string | null; // company name / firm
  href: string | null;
  value: number; // the bar length
  valueKind: 'usd' | 'pct';
  iqs: number | null;
  detail: Record<string, unknown>;
}

export interface ChartPayload {
  slug: string;
  period: Period;
  periodLabel: string;
  asOf: string; // yyyy-mm-dd the data runs to
  refreshedAt: string; // ISO
  valueKind: 'usd' | 'pct';
  valueLabel: string;
  variants: Partial<Record<Variant, ChartRow[]>>;
  totals: Record<string, number | string | null>;
  source: string;
}

const STALE_BY_KIND: Record<ArticleSeed['refresh'], number> = {
  weekly: 8 * 86_400_000,
  monthly: 32 * 86_400_000,
  quarterly: 95 * 86_400_000,
};

const PERIOD_DAYS: Record<string, number> = { '30d': 30, '90d': 90 };
const PERIOD_LABEL: Record<Period, string> = { '30d': 'Last 30 days', '90d': 'Last 90 days', '12m': 'Trailing 12 months', ttm: 'Trailing 12 months' };
/** §3.2 cluster flag: three or more distinct insiders on the same side. */
const CLUSTER_MIN_INSIDERS = 3;
const TOP_N = 10;
/** Analyst leaderboard: graded calls needed before a hit rate is credible. */
const ANALYST_MIN_GRADED = 20;
const ANALYST_MIN_GRADED_FALLBACK = 10;

function fmtUsd(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function fmtPct(n: number | null | undefined, digits = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

@Injectable()
export class DataArticlesService implements OnModuleInit {
  private readonly logger = new Logger(DataArticlesService.name);
  private tablesReady = false;
  private inflight = new Map<string, Promise<void>>();

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly analysts: AnalystsService,
    private readonly investors: InvestorsService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
      await this.seed();
    } catch (e: any) {
      this.logger.warn(`data-articles init failed: ${e?.message || e}`);
    }
    if (!process.env.VERCEL) setTimeout(() => void this.refreshStale().catch(() => undefined), 90_000);
  }

  /** §2.3 "Data article aggregates — Weekly (Fri close) + monthly". */
  @Cron('30 22 * * 5')
  async weekly(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.refreshKind('weekly').catch((e) => this.logger.warn(`weekly refresh failed: ${e?.message || e}`));
  }
  @Cron('0 6 1 * *')
  async monthly(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.refreshKind('monthly').catch((e) => this.logger.warn(`monthly refresh failed: ${e?.message || e}`));
  }
  /** Quarterly: the day after the 45-day 13F window closes (Feb/May/Aug/Nov 16). */
  @Cron('0 7 16 2,5,8,11 *')
  async quarterly(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.refreshKind('quarterly').catch((e) => this.logger.warn(`quarterly refresh failed: ${e?.message || e}`));
  }

  /* ------------------------------------------------------------ schema */

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    const q = (sql: string) => this.companies.query(sql);
    await q(`CREATE TABLE IF NOT EXISTS data_articles (
      slug        text PRIMARY KEY,
      headline    text NOT NULL,
      dek         text NOT NULL,
      category    text NOT NULL,
      refresh     text NOT NULL,
      chart       text NOT NULL,
      periods     text[] NOT NULL,
      sections    jsonb NOT NULL,
      published   boolean NOT NULL DEFAULT true,
      sort        int NOT NULL DEFAULT 0,
      created_at  timestamptz NOT NULL DEFAULT now(),
      updated_at  timestamptz NOT NULL DEFAULT now()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS data_article_data (
      slug         text NOT NULL,
      period       text NOT NULL,
      payload      jsonb NOT NULL,
      refreshed_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, period)
    )`);
    this.tablesReady = true;
  }

  /** Seed the four launch articles ONCE; editorial edits live in the DB. */
  private async seed(): Promise<void> {
    let i = 0;
    for (const a of LAUNCH_ARTICLES) {
      await this.companies.query(
        `INSERT INTO data_articles (slug, headline, dek, category, refresh, chart, periods, sections, sort)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) ON CONFLICT (slug) DO NOTHING`,
        [a.slug, a.headline, a.dek, a.category, a.refresh, a.chart, a.periods, JSON.stringify(a.sections), i++],
      );
    }
  }

  /* -------------------------------------------------------------- read */

  async list(): Promise<{ count: number; articles: unknown[] }> {
    await this.ensureTables();
    const rows: any[] = await this.companies.query(
      `SELECT a.slug, a.headline, a.dek, a.category, a.refresh, a.chart, a.periods, a.updated_at,
              (SELECT MAX(refreshed_at) FROM data_article_data d WHERE d.slug = a.slug) AS refreshed_at
       FROM data_articles a WHERE a.published ORDER BY a.sort, a.created_at`,
    );
    return {
      count: rows.length,
      articles: rows.map((r) => ({
        slug: r.slug,
        headline: r.headline,
        dek: r.dek,
        category: r.category,
        refresh: r.refresh,
        chart: r.chart,
        periods: r.periods,
        refreshedAt: r.refreshed_at,
        href: `/data/${r.slug}`,
      })),
    };
  }

  async article(slug: string): Promise<unknown | null> {
    await this.ensureTables();
    const [a] = await this.companies.query(`SELECT * FROM data_articles WHERE slug = $1 AND published`, [slug]);
    if (!a) return null;
    await this.ensureFresh(a);
    const data: any[] = await this.companies.query(
      `SELECT period, payload, refreshed_at FROM data_article_data WHERE slug = $1 ORDER BY period`,
      [slug],
    );
    const primary = data.find((d) => d.period === a.periods[0]) || data[0];
    const ctx = primary ? this.context(primary.payload as ChartPayload) : {};
    return {
      slug: a.slug,
      headline: a.headline,
      dek: a.dek,
      category: a.category,
      refresh: a.refresh,
      chart: a.chart,
      periods: a.periods,
      sections: this.fill(a.sections as ArticleSections, ctx),
      rawSections: a.sections,
      refreshedAt: primary?.refreshed_at ?? null,
      asOf: (primary?.payload as ChartPayload | undefined)?.asOf ?? null,
      methodologyUrl: '/methodology#data-articles',
      href: `/data/${a.slug}`,
    };
  }

  /** §3.2 data contract — one endpoint per article per period. */
  async chart(slug: string, period?: string): Promise<ChartPayload | null> {
    await this.ensureTables();
    const [a] = await this.companies.query(`SELECT * FROM data_articles WHERE slug = $1 AND published`, [slug]);
    if (!a) return null;
    const p = (a.periods as string[]).includes(String(period)) ? (period as Period) : (a.periods[0] as Period);
    await this.ensureFresh(a, p);
    const [row] = await this.companies.query(`SELECT payload FROM data_article_data WHERE slug = $1 AND period = $2`, [slug, p]);
    return (row?.payload as ChartPayload) ?? null;
  }

  /* ------------------------------------------------------------- admin */

  async adminList(): Promise<unknown[]> {
    await this.ensureTables();
    return this.companies.query(
      `SELECT a.*, (SELECT MAX(refreshed_at) FROM data_article_data d WHERE d.slug = a.slug) AS refreshed_at
       FROM data_articles a ORDER BY a.sort, a.created_at`,
    );
  }

  /** Editable text around the locked chart: dek, category, sections, published.
   *  Headline and slug stay permanent (SEO) unless the admin explicitly sends a
   *  new headline. */
  async adminUpdate(slug: string, patch: Partial<{ headline: string; dek: string; category: string; sections: ArticleSections; published: boolean }>): Promise<unknown | null> {
    await this.ensureTables();
    const [existing] = await this.companies.query(`SELECT * FROM data_articles WHERE slug = $1`, [slug]);
    if (!existing) return null;
    await this.companies.query(
      `UPDATE data_articles SET headline = $2, dek = $3, category = $4, sections = $5::jsonb, published = $6, updated_at = now() WHERE slug = $1`,
      [
        slug,
        patch.headline ?? existing.headline,
        patch.dek ?? existing.dek,
        patch.category ?? existing.category,
        JSON.stringify(patch.sections ?? existing.sections),
        patch.published ?? existing.published,
      ],
    );
    return (await this.companies.query(`SELECT * FROM data_articles WHERE slug = $1`, [slug]))[0];
  }

  async status(): Promise<unknown> {
    await this.ensureTables();
    const rows = await this.companies.query(
      `SELECT a.slug, a.refresh, a.periods, d.period, d.refreshed_at
       FROM data_articles a LEFT JOIN data_article_data d ON d.slug = a.slug ORDER BY a.sort, d.period`,
    );
    return { rows, crons: { weekly: '30 22 * * 5', monthly: '0 6 1 * *', quarterly: '0 7 16 2,5,8,11 *' } };
  }

  /* ----------------------------------------------------------- refresh */

  async refreshKind(kind: ArticleSeed['refresh']): Promise<string[]> {
    await this.ensureTables();
    const rows: any[] = await this.companies.query(`SELECT * FROM data_articles WHERE refresh = $1`, [kind]);
    const done: string[] = [];
    for (const a of rows) {
      for (const p of a.periods as Period[]) {
        await this.build(a, p);
        done.push(`${a.slug}:${p}`);
      }
    }
    return done;
  }

  async refreshAll(): Promise<string[]> {
    const out: string[] = [];
    for (const k of ['weekly', 'monthly', 'quarterly'] as const) out.push(...(await this.refreshKind(k)));
    return out;
  }

  async refreshStale(): Promise<void> {
    await this.ensureTables();
    const rows: any[] = await this.companies.query(`SELECT * FROM data_articles`);
    for (const a of rows) for (const p of a.periods as Period[]) await this.ensureFresh(a, p);
  }

  private async ensureFresh(a: any, only?: Period): Promise<void> {
    const periods = only ? [only] : (a.periods as Period[]);
    for (const p of periods) {
      const [row] = await this.companies.query(`SELECT refreshed_at FROM data_article_data WHERE slug = $1 AND period = $2`, [a.slug, p]);
      const age = row ? Date.now() - new Date(row.refreshed_at).getTime() : Infinity;
      if (age < STALE_BY_KIND[a.refresh as ArticleSeed['refresh']]) continue;
      const key = `${a.slug}:${p}`;
      if (!row) {
        // First build blocks the request so the page never renders empty.
        await this.dedupe(key, () => this.build(a, p));
      } else {
        // Stale-but-present: serve what we have, rebuild in the background.
        void this.dedupe(key, () => this.build(a, p)).catch(() => undefined);
      }
    }
  }

  private dedupe(key: string, fn: () => Promise<void>): Promise<void> {
    const hit = this.inflight.get(key);
    if (hit) return hit;
    const p = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, p);
    return p;
  }

  private async build(a: any, period: Period): Promise<void> {
    let payload: ChartPayload;
    switch (a.chart) {
      case 'insider-buys':
        payload = await this.buildInsiderFlow(a.slug, period, 'P');
        break;
      case 'insider-sells':
        payload = await this.buildInsiderFlow(a.slug, period, 'S');
        break;
      case 'analysts':
        payload = await this.buildAnalysts(a.slug, period);
        break;
      case 'hedge-funds':
        payload = await this.buildHedgeFunds(a.slug, period);
        break;
      default:
        throw new Error(`unknown chart kind ${a.chart}`);
    }
    await this.companies.query(
      `INSERT INTO data_article_data (slug, period, payload, refreshed_at) VALUES ($1,$2,$3::jsonb, now())
       ON CONFLICT (slug, period) DO UPDATE SET payload = EXCLUDED.payload, refreshed_at = now()`,
      [a.slug, period, JSON.stringify(payload)],
    );
    this.logger.log(`data-article ${a.slug}:${period} rebuilt (${Object.values(payload.variants)[0]?.length ?? 0} rows)`);
  }

  /* ------------------------------------------------ builders: Form 4 */

  private async latestIqs(tickers: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!tickers.length) return out;
    const rows: Array<{ t: string; iqs: number }> = await this.companies.query(
      `SELECT UPPER(c.ticker) AS t, s.iqs::float8 AS iqs
       FROM iqs_scores s JOIN companies c ON c.id = s.company_id
       WHERE UPPER(c.ticker) = ANY($1)
         AND s."asOfDate" = (SELECT MAX(s2."asOfDate") FROM iqs_scores s2 WHERE s2.company_id = s.company_id)`,
      [tickers],
    );
    for (const r of rows) out.set(r.t, Math.round(Number(r.iqs)));
    return out;
  }

  /** Most bought / most sold, one variant per planned-vs-discretionary filter. */
  private async buildInsiderFlow(slug: string, period: Period, code: 'P' | 'S'): Promise<ChartPayload> {
    const days = PERIOD_DAYS[period] ?? 30;
    const variants: Partial<Record<Variant, ChartRow[]>> = {};
    // Buys: discretionary only (§3.2). Sells: all three so the UI can filter.
    const filters: Array<[Variant, string]> =
      code === 'P'
        ? [['all', 'AND t."plannedBuy" = false']]
        : [
            ['all', ''],
            ['discretionary', 'AND t."plannedBuy" = false'],
            ['planned', 'AND t."plannedBuy" = true'],
          ];
    let totals: Record<string, number | string | null> = {};
    for (const [variant, cond] of filters) {
      const rows: any[] = await this.companies.query(
        `WITH agg AS (
           SELECT c.id, UPPER(c.ticker) AS ticker, c.name, c.sector, c."lastPrice"::float8 AS last_price,
                  SUM(t."totalValue")::float8 AS total,
                  SUM(t."sharesBought")::float8 AS shares,
                  COUNT(DISTINCT t."insiderName")::int AS insiders,
                  COUNT(*)::int AS trades,
                  MAX(t."transactionDate")::text AS last_date,
                  MIN(t."transactionDate")::text AS first_date,
                  SUM(t."totalValue")::float8 / NULLIF(SUM(t."sharesBought")::float8, 0) AS avg_price
           FROM insider_transactions t JOIN companies c ON c.id = t.company_id
           WHERE t."transactionCode" = $1 AND t."totalValue" > 0 AND t."sharesBought" > 0
             AND t."transactionDate" >= CURRENT_DATE - $2::int
             AND c.ticker IS NOT NULL AND c.ticker <> ''
             ${cond}
           GROUP BY c.id, UPPER(c.ticker), c.name, c.sector, c."lastPrice"
         ),
         largest AS (
           SELECT DISTINCT ON (t.company_id) t.company_id, t."insiderName" AS name, t.role, SUM(t."totalValue")::float8 AS value
           FROM insider_transactions t
           WHERE t."transactionCode" = $1 AND t."totalValue" > 0 AND t."transactionDate" >= CURRENT_DATE - $2::int ${cond}
           GROUP BY t.company_id, t."insiderName", t.role
           ORDER BY t.company_id, SUM(t."totalValue") DESC
         )
         SELECT a.*, l.name AS largest_name, l.role AS largest_role, l.value AS largest_value
         FROM agg a LEFT JOIN largest l ON l.company_id = a.id
         ORDER BY a.total DESC LIMIT ${TOP_N * 3}`,
        [code, days],
      );
      // Live quote for % since purchase and % above the 52-week low.
      const quotes = await this.fmp.getQuotesBatch(rows.map((r) => r.ticker));
      const iqs = await this.latestIqs(rows.map((r) => r.ticker));
      const list: ChartRow[] = rows.slice(0, TOP_N).map((r, i) => {
        const q = quotes.get(r.ticker);
        const price = Number(q?.price) || Number(r.last_price) || null;
        const yearLow = Number(q?.yearLow) || null;
        const yearHigh = Number(q?.yearHigh) || null;
        const avg = Number(r.avg_price) || null;
        return {
          rank: i + 1,
          key: r.ticker,
          label: r.ticker,
          sublabel: r.name,
          href: `/companies/${r.ticker}`,
          value: Number(r.total),
          valueKind: 'usd',
          iqs: iqs.get(r.ticker) ?? null,
          detail: {
            total: Number(r.total),
            shares: Number(r.shares),
            insiders: Number(r.insiders),
            trades: Number(r.trades),
            avgPrice: avg,
            price,
            pctSince: avg && price ? ((price - avg) / avg) * 100 : null,
            pctAbove52wLow: yearLow && price ? ((price - yearLow) / yearLow) * 100 : null,
            pctBelow52wHigh: yearHigh && price ? ((yearHigh - price) / yearHigh) * 100 : null,
            cluster: Number(r.insiders) >= CLUSTER_MIN_INSIDERS,
            largest: r.largest_name ? { name: r.largest_name, role: r.largest_role, value: Number(r.largest_value) } : null,
            firstDate: r.first_date,
            lastDate: r.last_date,
            sector: r.sector,
          },
        };
      });
      variants[variant] = list;
      if (variant === (code === 'P' ? 'all' : 'discretionary') || !Object.keys(totals).length) {
        const [t] = await this.companies.query(
          `SELECT COALESCE(SUM(t."totalValue"),0)::float8 AS total, COUNT(DISTINCT t.company_id)::int AS companies,
                  COUNT(DISTINCT t."insiderName")::int AS insiders, COUNT(*)::int AS trades
           FROM insider_transactions t
           WHERE t."transactionCode" = $1 AND t."totalValue" > 0 AND t."transactionDate" >= CURRENT_DATE - $2::int ${cond}`,
          [code, days],
        );
        totals = {
          total: Number(t.total),
          companies: Number(t.companies),
          insiders: Number(t.insiders),
          trades: Number(t.trades),
          clusters: list.filter((r) => r.detail.cluster).length,
          top10Share: Number(t.total) ? (list.reduce((s, r) => s + r.value, 0) / Number(t.total)) * 100 : null,
        };
      }
    }
    return {
      slug,
      period,
      periodLabel: PERIOD_LABEL[period],
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'usd',
      valueLabel: code === 'P' ? 'Open-market purchases' : 'Shares sold (value)',
      variants,
      totals,
      source: 'SEC Form 4 filings (InsiderBuying pipeline); live prices via FMP',
    };
  }

  /* ---------------------------------------------- builders: leaderboards */

  /** George (2026-08-29): "no credible analyst has a 100% hit rate". With
   *  3–9 graded calls a perfect record is noise, so the article needs a real
   *  sample (StockAnalysis/TipRanks' top-100 carry 700–1,250 ratings each) and a
   *  ranking that penalises thin samples: the 95% Wilson lower bound of the hit
   *  rate, so 27/32 outranks 6/6. Displayed value stays the plain hit rate. */
  private async buildAnalysts(slug: string, period: Period): Promise<ChartPayload> {
    const { rows, coverage } = await this.analysts.getTopAnalysts(600);
    const wilsonLow = (rate: number, n: number) => {
      const p = rate / 100;
      const z = 1.96;
      const den = 1 + (z * z) / n;
      const centre = p + (z * z) / (2 * n);
      const spread = z * Math.sqrt((p * (1 - p)) / n + (z * z) / (4 * n * n));
      return (centre - spread) / den;
    };
    const eligible = (min: number) => rows.filter((r) => r.successRate !== null && r.scoredRatings >= min);
    let minScored = ANALYST_MIN_GRADED;
    let pool = eligible(minScored);
    if (pool.length < TOP_N) {
      minScored = ANALYST_MIN_GRADED_FALLBACK;
      pool = eligible(minScored);
    }
    const ranked = pool
      .map((r) => ({ r, lb: wilsonLow(r.successRate!, r.scoredRatings) }))
      .sort((a, b) => b.lb - a.lb || (b.r.avgReturn ?? 0) - (a.r.avgReturn ?? 0))
      .slice(0, TOP_N)
      .map((x) => x.r);
    const list: ChartRow[] = ranked.map((r, i) => ({
      rank: i + 1,
      key: r.slug,
      label: r.analyst,
      sublabel: r.firm,
      href: `/analyst-ratings?analyst=${encodeURIComponent(r.slug)}`,
      value: r.successRate ?? 0,
      valueKind: 'pct',
      iqs: null,
      detail: {
        successRate: r.successRate,
        avgReturn: r.avgReturn,
        avgImpliedUpside: r.avgImpliedUpside,
        ratings: r.ratings,
        scoredRatings: r.scoredRatings,
        mainSector: r.mainSector,
        topSymbols: r.topSymbols,
        stars: r.stars,
        latest: r.latest,
        firm: r.firm,
      },
    }));
    return {
      slug,
      period,
      periodLabel: PERIOD_LABEL[period],
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'pct',
      valueLabel: `Hit rate (min. ${minScored} graded calls, ranked on the sample-adjusted lower bound)`,
      variants: { all: list },
      totals: {
        analysts: coverage.analysts,
        ratings: coverage.ratings,
        since: coverage.since,
        minGradedCalls: minScored,
        eligibleAnalysts: pool.length,
        avgReturnTop10: list.length ? list.reduce((s, r) => s + (Number(r.detail.avgReturn) || 0), 0) / list.length : null,
      },
      source: 'Analyst price targets and ratings via FMP, graded against subsequent closes',
    };
  }

  private async buildHedgeFunds(slug: string, period: Period): Promise<ChartPayload> {
    const { cards } = await this.investors.list('performance');
    const ranked = cards
      .filter((c) => c.performance !== null)
      .sort((a, b) => b.performance! - a.performance!)
      .slice(0, TOP_N);
    const list: ChartRow[] = ranked.map((c, i) => ({
      rank: i + 1,
      key: c.slug,
      label: c.firm || c.person,
      sublabel: c.firm ? c.person : null,
      href: `/investors/${c.slug}`,
      value: c.performance ?? 0,
      valueKind: 'pct',
      iqs: null,
      detail: {
        performance: c.performance,
        portfolioValue: c.portfolioValue,
        positions: c.positions,
        asOf: c.asOf,
        topHoldings: c.topHoldings.slice(0, 5),
        overlap: c.overlap.slice(0, 5),
        photo: c.photo,
        person: c.person,
        firm: c.firm,
      },
    }));
    const latestQuarter = ranked.map((c) => c.asOf).filter(Boolean).sort().pop() ?? null;
    return {
      slug,
      period,
      periodLabel: PERIOD_LABEL[period],
      asOf: latestQuarter ?? new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'pct',
      valueLabel: 'Trailing-12-month return on disclosed 13F longs',
      variants: { all: list },
      totals: {
        tracked: cards.length,
        withPerformance: cards.filter((c) => c.performance !== null).length,
        latestQuarter,
        combinedAum: ranked.reduce((s, c) => s + (c.portfolioValue ?? 0), 0),
      },
      source: 'SEC Form 13F-HR via FMP; performance per /methodology#top-insiders',
    };
  }

  /* ------------------------------------------------- template filling */

  /** Flat context for {{placeholders}} in editorial copy. */
  private context(p: ChartPayload): Record<string, string> {
    const ctx: Record<string, string> = {
      period: p.periodLabel.toLowerCase(),
      asOf: p.asOf,
      refreshed: new Date(p.refreshedAt).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
    };
    for (const [k, v] of Object.entries(p.totals)) {
      ctx[k] = typeof v === 'number' ? (k.toLowerCase().includes('share') || k.startsWith('avg') ? fmtPct(v) : k === 'total' || k === 'combinedAum' ? fmtUsd(v) : String(Math.round(v))) : String(v ?? '—');
    }
    const rows = p.variants.discretionary ?? p.variants.all ?? [];
    rows.slice(0, 3).forEach((r, i) => {
      const n = i + 1;
      ctx[`top${n}.label`] = r.label;
      ctx[`top${n}.ticker`] = r.label;
      ctx[`top${n}.name`] = r.sublabel ?? r.label;
      ctx[`top${n}.value`] = r.valueKind === 'usd' ? fmtUsd(r.value) : fmtPct(r.value);
      ctx[`top${n}.insiders`] = String(r.detail.insiders ?? '—');
      ctx[`top${n}.avgPrice`] = r.detail.avgPrice ? `$${Number(r.detail.avgPrice).toFixed(2)}` : '—';
      ctx[`top${n}.pctSince`] = fmtPct(r.detail.pctSince as number | null);
      ctx[`top${n}.largest`] = (r.detail.largest as any)?.name ?? '—';
      ctx[`top${n}.iqs`] = r.iqs === null ? '—' : String(r.iqs);
      ctx[`top${n}.avgReturn`] = fmtPct(r.detail.avgReturn as number | null);
      ctx[`top${n}.ratings`] = String(r.detail.ratings ?? '—');
      ctx[`top${n}.positions`] = String(r.detail.positions ?? '—');
      ctx[`top${n}.aum`] = fmtUsd(r.detail.portfolioValue as number | null);
    });
    return ctx;
  }

  private fill(sections: ArticleSections, ctx: Record<string, string>): ArticleSections {
    const sub = (s: string) => s.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, k) => ctx[k] ?? '—');
    return {
      takeaways: sections.takeaways.map(sub),
      body: sections.body.map((b) => ({ heading: sub(b.heading), html: sub(b.html) })),
      pullQuote: { text: sub(sections.pullQuote.text), attribution: sub(sections.pullQuote.attribution) },
      whatItMeans: sections.whatItMeans.map((w) => ({ audience: w.audience, text: sub(w.text) })),
      cta: { headline: sub(sections.cta.headline), body: sub(sections.cta.body) },
    };
  }
}
