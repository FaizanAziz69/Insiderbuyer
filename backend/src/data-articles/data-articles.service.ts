import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { AnalystsService } from '../analysts/analysts.service';
import { InvestorsService } from '../investors/investors.service';
import { FlagEngineService } from '../congress-trades/flag-engine.service';
import { MarketUniverseService } from '../market-universe/market-universe.service';
import { StockProfile, StockProfileService } from './stock-profile.service';
import { LAUNCH_ARTICLES, ArticleSeed, ArticleSections } from './seed';
import { LIST_ARTICLES } from './seed-lists';

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
  /**
   * Per-stock breakdown keyed by ticker — George 2026-09-23: "a simple
   * breakdown via List style … stock charts and financial snapshots for each.
   * Insider score. Analyst rating and upside … Bullish and bearish notes."
   * Present only on ticker-keyed articles; an analyst or manager leaderboard
   * has no stock to profile.
   */
  profiles?: Record<string, StockProfile>;
  /** Shown under the list when the underlying data cannot move as often as the
   *  page refreshes (13F is quarterly, whatever the cadence above says). */
  cadenceNote?: string;
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
/** Article kinds whose rows are stocks, and so carry a per-stock breakdown. */
const TICKER_KEYED = new Set([
  // The four launch articles keep the ranked-bar module they shipped with, so
  // attaching profiles to them would be payload nobody renders.
  'market-lows',
  'market-highs',
  'insider-buys-ytd',
  'analyst-targets',
  'ipos-ytd',
]);
/**
 * A single open-market insider purchase cannot be worth more than the company.
 *
 * Reborn Coffee (REBN) reached the top of the year-to-date insider board at
 * $23.6bn: 131,387 shares recorded at $180,000 each, against a $9.7M market
 * cap — 2,400x the entire company. The ingestion guard only rejects a price
 * above $1M/share, which this slipped under. Anything larger than the market
 * value it was bought in is a filing-parse artifact, not conviction.
 */
const SANE_BUY = `AND (c."marketCap" IS NULL OR t."totalValue" <= c."marketCap"::numeric)`;
/** George asked for 15 names in the screen articles, matching his reference. */
const SCREEN_N = 15;
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
    private readonly flags: FlagEngineService,
    private readonly universe: MarketUniverseService,
    private readonly profiles: StockProfileService,
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
    for (const a of [...LAUNCH_ARTICLES, ...LIST_ARTICLES]) {
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
      case 'congress-proximity':
      case 'congress-flags':
        payload = await this.buildCongress(a.slug, period, a.chart);
        break;
      case 'market-lows':
      case 'market-highs':
        payload = await this.buildMarketScreen(a.slug, period, a.chart === 'market-lows' ? 'lows' : 'highs');
        break;
      case 'insider-buys-ytd':
        payload = await this.buildInsiderBuysYtd(a.slug, period);
        break;
      case 'analyst-targets':
        payload = await this.buildAnalystTargets(a.slug, period);
        break;
      case 'ipos-ytd':
        payload = await this.buildIpos(a.slug, period);
        break;
      case 'hedge-funds-ytd':
        payload = await this.buildHedgeFundsYtd(a.slug, period);
        break;
      default:
        throw new Error(`unknown chart kind ${a.chart}`);
    }
    // The per-stock breakdown rides along with every ticker-keyed article, so
    // one template serves all of them (George: "the same for hit 52 week highs"
    // — and for every other list).
    if (TICKER_KEYED.has(a.chart)) {
      const tickers = Object.values(payload.variants)
        .flat()
        .map((r) => (r as ChartRow).label)
        .filter(Boolean);
      payload.profiles = await this.profiles.many(tickers);
    }
    await this.companies.query(
      `INSERT INTO data_article_data (slug, period, payload, refreshed_at) VALUES ($1,$2,$3::jsonb, now())
       ON CONFLICT (slug, period) DO UPDATE SET payload = EXCLUDED.payload, refreshed_at = now()`,
      [a.slug, period, JSON.stringify(payload)],
    );
    this.logger.log(`data-article ${a.slug}:${period} rebuilt (${Object.values(payload.variants)[0]?.length ?? 0} rows)`);
  }


  /* --------------------------------------------- builders: Brief v5 §4 */

  /**
   * Formats #19 and #20 — Brief v5 §4.
   *
   * Both read the SAME verified leaderboard the public page reads, through
   * FlagEngineService rather than a query of their own: a data article that
   * built its own view of the flags could show a row the page had already
   * retired, and §2 Stage 5 is explicit that nothing unverified renders
   * anywhere.
   *
   * The screen (#19) ranks by award value so the largest contracts lead; the
   * per-event list (#20) is newest first, because an entry is a citation of a
   * thing that just happened.
   */
  private async buildCongress(
    slug: string,
    period: Period,
    kind: 'congress-proximity' | 'congress-flags',
  ): Promise<ChartPayload> {
    const days = PERIOD_DAYS[period] ?? 30;
    const cutoff = new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
    const all = await this.flags.leaderboard({ limit: 250 });
    const inWindow = all.filter((r: any) => !r.awardDate || String(r.awardDate).slice(0, 10) >= cutoff);

    const ordered =
      kind === 'congress-flags'
        ? [...inWindow].sort((a: any, b: any) => String(b.awardDate ?? '').localeCompare(String(a.awardDate ?? '')))
        : [...inWindow].sort((a: any, b: any) => (b.awardValue ?? 0) - (a.awardValue ?? 0));

    const rows: ChartRow[] = ordered.slice(0, TOP_N).map((r: any, i) => ({
      rank: i + 1,
      key: `${r.id}`,
      label: r.ticker,
      sublabel: r.member,
      href: `/top-congress-trades`,
      value: Number(r.awardValue) || 0,
      valueKind: 'usd',
      iqs: null,
      detail: {
        member: r.member,
        party: r.party,
        chamber: r.chamber,
        committee: r.committee,
        role: r.role,
        agency: r.agency,
        company: r.company,
        awardValue: r.awardValue,
        awardDate: r.awardDate,
        tradeDate: r.tradeDate,
        tradeAction: r.tradeAction,
        // §5: a trade amount is an estimate from a disclosed band, and it
        // travels labelled so no surface can present it as exact.
        tradeValueEstimate: r.tradeValue,
        score: r.score,
        headline: r.headline,
        evidence: r.evidence,
      },
    }));

    return {
      slug,
      period,
      periodLabel: PERIOD_LABEL[period],
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'usd',
      valueLabel: 'Award value',
      variants: { all: rows },
      totals: {
        flags: inWindow.length,
        members: new Set(inWindow.map((r: any) => r.member)).size,
        companies: new Set(inWindow.map((r: any) => r.ticker)).size,
        agencies: new Set(inWindow.map((r: any) => r.agency)).size,
        total: inWindow.reduce((sum: number, r: any) => sum + (Number(r.awardValue) || 0), 0),
      },
      source: 'House and Senate disclosures, the public congressional committee roster, and USAspending.gov',
    };
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
             ${SANE_BUY}
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

  /* ------------------------------------------ builders: market screens */

  /**
   * "These Stocks Just Hit 52-Week Lows" (and its mirror for highs).
   *
   * Reads `market_universe`, NOT `companies`. George's own example listed FIS,
   * LVS, TAP, AON, STZ and CLX — none of which are in `companies`, because
   * that table is built from Form 4 filings. Screening there would have
   * produced a list missing its most recognisable names with no error to show
   * for it.
   */
  private async buildMarketScreen(slug: string, period: Period, kind: 'lows' | 'highs'): Promise<ChartPayload> {
    const rows = await this.universe.screen({ kind, limit: SCREEN_N });
    const list: ChartRow[] = rows.map((r, i) => ({
      rank: i + 1,
      key: r.symbol,
      label: r.symbol,
      sublabel: r.name,
      href: `/companies/${r.symbol}`,
      // The bar is the year-to-date move — the column George's reference shows.
      value: r.ytdPct ?? 0,
      valueKind: 'pct',
      iqs: null,
      detail: {
        price: r.price,
        yearHigh: r.yearHigh,
        yearLow: r.yearLow,
        ytdPct: r.ytdPct,
        changePct: r.changePct,
        offHighPct: r.offHighPct,
        offLowPct: r.offLowPct,
        rangePosition: r.rangePosition,
        marketCap: r.marketCap,
        sector: r.sector,
        industry: r.industry,
        exchange: r.exchange,
      },
    }));

    const status: any = await this.universe.status();
    return {
      slug,
      period,
      periodLabel: kind === 'lows' ? 'At 52-week lows' : 'At 52-week highs',
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'pct',
      valueLabel: 'Change (year to date)',
      variants: { all: list },
      totals: {
        universe: status?.symbols ?? null,
        matched: list.length,
        medianYtd: list.length ? list[Math.floor(list.length / 2)].value : null,
        worst: list.length ? list[0].value : null,
      },
      source:
        'Screened across every NYSE, NASDAQ and AMEX company above $2B (FMP listings, 52-week range and year-to-date change); insider, analyst and financial detail from the InsiderBuying pipeline',
    };
  }

  /**
   * "Top Insider Buys of 2026" — the year to date, not a rolling window, so
   * the headline stays true to its own title. Rebuilt weekly.
   */
  private async buildInsiderBuysYtd(slug: string, period: Period): Promise<ChartPayload> {
    const rows: any[] = await this.companies.query(
      `SELECT UPPER(c.ticker) AS ticker, c.name, c.sector,
              SUM(t."totalValue")::float8            AS total,
              COUNT(DISTINCT t."insiderName")::int   AS insiders,
              COUNT(*)::int                          AS trades,
              MAX(t."transactionDate")::text         AS last_date,
              SUM(t."totalValue")::float8 / NULLIF(SUM(t."sharesBought")::float8, 0) AS avg_price
         FROM insider_transactions t JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P' AND t."plannedBuy" = false
          AND t."totalValue" > 0 AND t."sharesBought" > 0
          AND t."transactionDate" >= date_trunc('year', CURRENT_DATE)
          AND c.ticker IS NOT NULL AND c.ticker <> ''
          ${SANE_BUY}
        GROUP BY UPPER(c.ticker), c.name, c.sector
        ORDER BY total DESC
        LIMIT $1`,
      [SCREEN_N],
    );
    const iqs = await this.latestIqs(rows.map((r) => r.ticker));
    const list: ChartRow[] = rows.map((r, i) => ({
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
        insiders: Number(r.insiders),
        trades: Number(r.trades),
        avgPrice: Number(r.avg_price) || null,
        cluster: Number(r.insiders) >= CLUSTER_MIN_INSIDERS,
        lastDate: r.last_date,
        sector: r.sector,
      },
    }));
    const [t] = await this.companies.query(
      `SELECT COALESCE(SUM(t."totalValue"),0)::float8 AS total, COUNT(DISTINCT t.company_id)::int AS companies
         FROM insider_transactions t
        WHERE t."transactionCode" = 'P' AND t."plannedBuy" = false
          AND t."transactionDate" >= date_trunc('year', CURRENT_DATE)`,
    );
    return {
      slug,
      period,
      periodLabel: `Year to date, ${new Date().getUTCFullYear()}`,
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'usd',
      valueLabel: 'Open-market purchases, year to date',
      variants: { all: list },
      totals: {
        total: Number(t.total),
        companies: Number(t.companies),
        top15Share: Number(t.total) ? (list.reduce((s, r) => s + r.value, 0) / Number(t.total)) * 100 : null,
      },
      source: 'SEC Form 4 — discretionary open-market purchases (code P) only; 10b5-1 plan buys, option exercises and awards excluded',
    };
  }

  /**
   * "Top Ranked Stocks (by analyst targets)" — ranked on consensus upside, but
   * only where enough analysts have published recently for a consensus to
   * mean anything, and only inside the screened universe so the list cannot
   * fill up with untradeable names.
   */
  private async buildAnalystTargets(slug: string, period: Period): Promise<ChartPayload> {
    const rows: any[] = await this.companies.query(
      `SELECT u.symbol, u.name, u.sector, u.price::float8 AS price, u.market_cap::float8 AS market_cap,
              AVG(p."priceTarget")::float8  AS target,
              COUNT(*)::int                 AS analysts,
              MAX(p."priceTarget")::float8  AS target_high,
              MIN(p."priceTarget")::float8  AS target_low,
              to_char(MAX(p."publishedDate"),'YYYY-MM-DD') AS latest
         FROM market_universe u
         JOIN analyst_price_targets p ON p.symbol = u.symbol
        WHERE u.price > 0 AND p."priceTarget" > 0
          AND p."publishedDate" >= now() - interval '180 days'
          -- KLA came back with a 432% "upside" on targets of $1,700-$2,250
          -- published when the stock was $169-$213. A target an order of
          -- magnitude away from the price it was written against is a feed
          -- error (usually pre-split), not a call.
          AND (p."priceWhenPosted" IS NULL OR p."priceWhenPosted" <= 0
               OR (p."priceTarget" <= p."priceWhenPosted" * 5
                   AND p."priceTarget" >= p."priceWhenPosted" / 5))
        GROUP BY u.symbol, u.name, u.sector, u.price, u.market_cap
       HAVING COUNT(*) >= 4 AND AVG(p."priceTarget") > u.price
        ORDER BY (AVG(p."priceTarget") - u.price) / u.price DESC
        LIMIT $1`,
      [SCREEN_N],
    );
    const iqs = await this.latestIqs(rows.map((r) => r.symbol));
    const list: ChartRow[] = rows.map((r, i) => {
      const upside = ((Number(r.target) - Number(r.price)) / Number(r.price)) * 100;
      return {
        rank: i + 1,
        key: r.symbol,
        label: r.symbol,
        sublabel: r.name,
        href: `/companies/${r.symbol}`,
        value: upside,
        valueKind: 'pct' as const,
        iqs: iqs.get(r.symbol) ?? null,
        detail: {
          price: Number(r.price),
          target: Number(r.target),
          targetHigh: Number(r.target_high),
          targetLow: Number(r.target_low),
          analysts: Number(r.analysts),
          upsidePct: upside,
          latest: r.latest,
          marketCap: Number(r.market_cap),
          sector: r.sector,
        },
      };
    });
    return {
      slug,
      period,
      periodLabel: 'Consensus targets, last 180 days',
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'pct',
      valueLabel: 'Upside to consensus target',
      variants: { all: list },
      totals: { minAnalysts: 4, windowDays: 180, matched: list.length },
      source: 'Published analyst price targets over the last 180 days, averaged; at least four analysts per name',
      cadenceNote:
        'A price target is an opinion with a date on it, not a forecast we endorse. Upside is measured against the last close, and a target can be withdrawn without a new filing.',
    };
  }

  /** "Best performing IPOs of 2026" — return from the offer price. */
  private async buildIpos(slug: string, period: Period): Promise<ChartPayload> {
    const rows: any[] = await this.companies.query(
      `SELECT symbol, name, exchange, to_char(listing_date,'YYYY-MM-DD') AS listed,
              ipo_price::float8 AS ipo_price, current_price::float8 AS price,
              market_cap::float8 AS market_cap,
              ((current_price - ipo_price) / NULLIF(ipo_price,0) * 100)::float8 AS ret
         FROM ipo_listings
        WHERE listing_date >= date_trunc('year', CURRENT_DATE)
          AND ipo_price > 0 AND current_price > 0
          -- "Best performing IPOs" led with NFEGP (a preferred series), USDEW
          -- and CXIIW (warrants) at +1,046% / +480% / +115%. Warrants and
          -- units are leveraged claims that routinely move in hundreds of
          -- percent; listing one as a company's IPO return is misleading.
          -- A five-letter symbol ending W/U/R is the NASDAQ convention for a
          -- warrant, unit or right. A symbol rule alone is unsafe (CSGP is a
          -- real five-letter ticker ending in P), so the name carries the rest.
          AND NOT (length(symbol) = 5 AND symbol ~ '[WUR]$')
          AND name !~* '(warrant|unit[s]?\\M|right[s]?\\M|preferred|depositary|series [A-Z]\\M)'
        ORDER BY ret DESC
        LIMIT $1`,
      [SCREEN_N],
    );
    const iqs = await this.latestIqs(rows.map((r) => r.symbol));
    const list: ChartRow[] = rows.map((r, i) => ({
      rank: i + 1,
      key: r.symbol,
      label: r.symbol,
      sublabel: r.name,
      href: `/companies/${r.symbol}`,
      value: Number(r.ret),
      valueKind: 'pct',
      iqs: iqs.get(r.symbol) ?? null,
      detail: {
        listed: r.listed,
        ipoPrice: Number(r.ipo_price),
        price: Number(r.price),
        returnPct: Number(r.ret),
        marketCap: Number(r.market_cap),
        exchange: r.exchange,
      },
    }));
    const [t] = await this.companies.query(
      `SELECT COUNT(*)::int AS listings,
              COUNT(*) FILTER (WHERE current_price > ipo_price)::int AS above_offer
         FROM ipo_listings
        WHERE listing_date >= date_trunc('year', CURRENT_DATE) AND ipo_price > 0 AND current_price > 0`,
    );
    return {
      slug,
      period,
      periodLabel: `Listed in ${new Date().getUTCFullYear()}`,
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'pct',
      valueLabel: 'Return from the offer price',
      variants: { all: list },
      totals: {
        listings: Number(t.listings),
        aboveOffer: Number(t.above_offer),
        aboveOfferPct: Number(t.listings) ? (Number(t.above_offer) / Number(t.listings)) * 100 : null,
      },
      source: 'IPO offer prices and current quotes from the InsiderBuying listings feed',
      cadenceNote:
        'Return is measured from the offer price, which most investors could not buy at. The first public trade is often well above it.',
    };
  }

  /**
   * "Top performing hedge funds of 2026" — George's topic 2, scoped to the
   * calendar year and refreshed weekly.
   *
   * The performance engine already chains quarter-to-quarter legs plus a live
   * leg to today, and those legs break exactly on 31 December — so the
   * year-to-date figure is the product of every leg starting at or after the
   * last year-end. No pro-rating, no approximation: the year boundary is a
   * real rebalance point in the data.
   *
   * What is honestly weekly and what is not: the LIVE leg reprices every
   * refresh, so the number moves weekly. The HOLDINGS under it come from 13F
   * and change four times a year. The page says so.
   */
  private async buildHedgeFundsYtd(slug: string, period: Period): Promise<ChartPayload> {
    const yearStart = `${new Date().getUTCFullYear() - 1}-12-31`;
    const { cards } = await this.investors.list('performance');
    const perf: any[] = await this.companies.query(
      `SELECT slug, legs, as_of::text AS as_of FROM investor_perf WHERE ttm_return IS NOT NULL`,
    );
    const ytd = new Map<string, { ret: number; legs: number; covered: number }>();
    for (const row of perf) {
      const legs: Array<{ from: string; to: string; returnPct: number; weightCovered: number }> =
        (row.legs as any[]) || [];
      const inYear = legs.filter((l) => l.from >= yearStart);
      if (!inYear.length) continue;
      let factor = 1;
      let covered = 1;
      for (const l of inYear) {
        factor *= 1 + l.returnPct / 100;
        covered = Math.min(covered, l.weightCovered ?? 1);
      }
      ytd.set(row.slug, { ret: (factor - 1) * 100, legs: inYear.length, covered });
    }

    const ranked = cards
      .filter((c) => c.performance !== null && ytd.has(c.slug))
      .map((c) => ({ c, y: ytd.get(c.slug)! }))
      .sort((a, b) => b.y.ret - a.y.ret)
      .slice(0, SCREEN_N);

    const list: ChartRow[] = ranked.map(({ c, y }, i) => ({
      rank: i + 1,
      key: c.slug,
      label: c.firm || c.person,
      sublabel: c.firm ? c.person : null,
      href: `/investors/${c.slug}`,
      value: y.ret,
      valueKind: 'pct',
      iqs: null,
      detail: {
        ytdReturn: y.ret,
        ttmReturn: c.performance,
        quartersInYear: y.legs,
        weightCovered: y.covered,
        portfolioValue: c.portfolioValue,
        positions: c.positions,
        asOf: c.asOf,
        topHoldings: c.topHoldings.slice(0, 5),
        person: c.person,
        firm: c.firm,
        photo: c.photo,
      },
    }));
    const latestQuarter = ranked.map(({ c }) => c.asOf).filter(Boolean).sort().pop() ?? null;
    return {
      slug,
      period,
      periodLabel: `Year to date, ${new Date().getUTCFullYear()}`,
      asOf: new Date().toISOString().slice(0, 10),
      refreshedAt: new Date().toISOString(),
      valueKind: 'pct',
      valueLabel: `Return on disclosed 13F longs, ${new Date().getUTCFullYear()} to date`,
      variants: { all: list },
      totals: {
        tracked: cards.length,
        ranked: list.length,
        latestQuarter,
        combinedAum: ranked.reduce((sum, { c }) => sum + (c.portfolioValue ?? 0), 0),
      },
      source: 'SEC Form 13F-HR via FMP; value-weighted return of disclosed long positions, rebalanced at each filing date and repriced live',
      cadenceNote:
        'This number is repriced every week, but the holdings under it are not. 13F positions are disclosed once a quarter, up to 45 days after the quarter ends, so a manager may have exited a position months before it leaves this list.',
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
      // George asked for a weekly rebalance on this list. Prices move weekly;
      // the holdings underneath them cannot. 13F is filed once a quarter, up to
      // 45 days after the quarter ends, so a "weekly rebalanced" manager
      // ranking would be precision this data does not have. The page says so
      // rather than implying otherwise.
      cadenceNote:
        'Positions come from quarterly 13F filings, which are disclosed up to 45 days after the quarter ends. Valuations on this page refresh with the market, but the holdings behind them change only four times a year — and a manager may have exited a position months before it leaves this list.',
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
      // Brief v5 §4 formats #19–20 name a person, a committee and an agency,
      // none of which the generic ticker/name pair can carry.
      // Screen and target articles: the price context their copy is written on.
      ctx[`top${n}.price`] = r.detail.price ? `$${Number(r.detail.price).toFixed(2)}` : '—';
      ctx[`top${n}.ytd`] = fmtPct(r.detail.ytdPct as number | null);
      ctx[`top${n}.yearLow`] = r.detail.yearLow ? `$${Number(r.detail.yearLow).toFixed(2)}` : '—';
      ctx[`top${n}.yearHigh`] = r.detail.yearHigh ? `$${Number(r.detail.yearHigh).toFixed(2)}` : '—';
      ctx[`top${n}.offHigh`] = fmtPct(r.detail.offHighPct as number | null);
      ctx[`top${n}.target`] = r.detail.target ? `$${Number(r.detail.target).toFixed(2)}` : '—';
      ctx[`top${n}.upside`] = fmtPct(r.detail.upsidePct as number | null);
      ctx[`top${n}.analysts`] = String(r.detail.analysts ?? '—');
      ctx[`top${n}.return`] = fmtPct(r.detail.returnPct as number | null);
      ctx[`top${n}.ipoPrice`] = r.detail.ipoPrice ? `$${Number(r.detail.ipoPrice).toFixed(2)}` : '—';
      ctx[`top${n}.listed`] = String(r.detail.listed ?? '—');
      ctx[`top${n}.sector`] = String(r.detail.sector ?? '—');
      ctx[`top${n}.member`] = String(r.detail.member ?? r.sublabel ?? '—');
      ctx[`top${n}.committee`] = String(r.detail.committee ?? '—');
      ctx[`top${n}.agency`] = String(r.detail.agency ?? '—');
      ctx[`top${n}.award`] = fmtUsd(r.detail.awardValue as number | null);
      ctx[`top${n}.cts`] = r.detail.score == null ? '—' : String(Math.round(Number(r.detail.score)));
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
