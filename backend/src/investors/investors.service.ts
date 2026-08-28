import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import { FmpService, Fmp13FHolding } from '../fmp/fmp.service';
import { ROSTER, InvestorCategory } from './roster';

/**
 * TOP INSIDERS — Developer Project Brief (Aug 24 2026), Workstream B.
 *
 * "A new section that tracks the portfolios and performance of the roster of
 *  famous investors and hedge funds … Source data is quarterly 13F filings
 *  plus daily prices."
 *
 * Data model (raw-SQL tables, created on demand like every other cache on
 * this stack — no TypeORM entity, so no duplicate-index boot trap):
 *   investors           the roster (admin-editable: add/remove/re-tag, no deploy)
 *   investor_holdings   one row per (investor, quarter, CUSIP) from the 13F
 *   investor_summary    FMP's per-quarter filer summary (portfolio value etc.)
 *   investor_perf       OUR trailing-12-month figure + the legs behind it
 *
 * Refresh cadence per brief §2.3: holdings on the 13F filing windows (we
 * check for a new quarter daily — 1 cheap call per filer), performance
 * nightly off live prices.
 */

export const TABS = ['popular', 'performance', 'growth', 'value', 'short', 'longterm'] as const;
export type InvestorTab = (typeof TABS)[number];

/** §4.4: suppress the performance line for small or near-empty portfolios. */
const MIN_AUM = 100_000_000;
const MIN_POSITIONS = 4;
/** Positions used in the return calculation, by value — the tail of a 5,000-
 *  line BlackRock filing moves the figure by basis points and costs quotes. */
const PERF_TOP_N = 100;
const QUARTERS_KEPT = 6;
const STALE_MS = 20 * 3600_000;
/** "Active insider buying" for the IQS-overlap badge (§4.2): open-market
 *  Form 4 buys in this window. */
const OVERLAP_DAYS = 90;

export interface InvestorCard {
  slug: string;
  person: string;
  firm: string;
  photo: string | null;
  active: boolean;
  note: string | null;
  categories: InvestorCategory[];
  /** Trailing-12-month return, % — null when suppressed (see `perfNote`). */
  performance: number | null;
  perfNote: string | null;
  portfolioValue: number | null;
  positions: number | null;
  asOf: string | null;
  topHoldings: Array<{ ticker: string; name: string; value: number; pct: number }>;
  /** Holdings that overlap active open-market insider buying (§4.2 gold badge). */
  overlap: Array<{ ticker: string; insiderBought: number; buyers: number }>;
}

interface PerfLeg {
  from: string;
  to: string;
  returnPct: number;
  positions: number;
  weightCovered: number;
  /** Fraction of the leg inside the trailing-12-month window (1 = fully). */
  fraction: number;
}

@Injectable()
export class InvestorsService implements OnModuleInit {
  private readonly logger = new Logger(InvestorsService.name);
  private tablesReady = false;
  private refreshing = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
      await this.seedRoster();
    } catch (e: any) {
      this.logger.warn(`investors init failed: ${e?.message || e}`);
    }
  }

  /** Nightly: new 13F quarters if any, live-price performance recompute. */
  @Cron('15 5 * * *')
  async nightly(): Promise<void> {
    if (process.env.VERCEL) return;
    try {
      await this.refresh();
    } catch (e: any) {
      this.logger.warn(`investors nightly refresh failed: ${e?.message || e}`);
    }
  }

  /* ------------------------------------------------------------ schema */

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    const q = (sql: string) => this.companies.query(sql);
    await q(`CREATE TABLE IF NOT EXISTS investors (
      slug varchar(80) PRIMARY KEY,
      person varchar(160) NOT NULL,
      firm varchar(200) NOT NULL,
      cik varchar(12),
      categories jsonb NOT NULL DEFAULT '[]'::jsonb,
      active boolean NOT NULL DEFAULT true,
      note text,
      photo_url text,
      photo_checked_at timestamptz,
      sort int NOT NULL DEFAULT 1000,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    await q(`CREATE TABLE IF NOT EXISTS investor_holdings (
      slug varchar(80) NOT NULL,
      period date NOT NULL,
      filing_date date,
      cusip varchar(16) NOT NULL,
      ticker varchar(20),
      name varchar(200),
      shares numeric(20,2) NOT NULL DEFAULT 0,
      value numeric(20,2) NOT NULL DEFAULT 0,
      put_call varchar(8),
      link text,
      PRIMARY KEY (slug, period, cusip)
    )`);
    await q(`CREATE INDEX IF NOT EXISTS investor_holdings_ticker_idx ON investor_holdings (ticker)`);
    await q(`CREATE TABLE IF NOT EXISTS investor_summary (
      slug varchar(80) NOT NULL,
      period date NOT NULL,
      market_value numeric(22,2),
      previous_market_value numeric(22,2),
      portfolio_size int,
      added int,
      removed int,
      turnover numeric(10,4),
      fmp_perf_1y numeric(10,4),
      "updatedAt" timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (slug, period)
    )`);
    await q(`CREATE TABLE IF NOT EXISTS investor_perf (
      slug varchar(80) PRIMARY KEY,
      ttm_return numeric(10,4),
      suppressed_reason text,
      legs jsonb,
      as_of date,
      "updatedAt" timestamptz NOT NULL DEFAULT now()
    )`);
    this.tablesReady = true;
  }

  /** Insert roster rows that do not exist yet. Never overwrites — the admin's
   *  edits (categories, CIK, active) are the source of truth after launch. */
  private async seedRoster(): Promise<number> {
    let inserted = 0;
    for (let i = 0; i < ROSTER.length; i++) {
      const r = ROSTER[i];
      const res = await this.companies.query(
        `INSERT INTO investors (slug, person, firm, cik, categories, active, note, sort)
         VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8)
         ON CONFLICT (slug) DO NOTHING`,
        [r.slug, r.person, r.firm, r.cik, JSON.stringify(r.categories), r.active, r.note ?? null, i],
      );
      if (Array.isArray(res) ? res.length : res?.[1]) inserted += 1;
    }
    return inserted;
  }

  /* ------------------------------------------------------------- admin */

  async rosterRows(): Promise<any[]> {
    await this.ensureTables();
    return this.companies.query(
      `SELECT i.slug, i.person, i.firm, i.cik, i.categories, i.active, i.note, i.photo_url AS photo, i.sort,
              s.period AS "asOf", s.market_value::float8 AS "portfolioValue", s.portfolio_size AS positions,
              p.ttm_return::float8 AS performance, p.suppressed_reason AS "perfNote"
       FROM investors i
       LEFT JOIN LATERAL (SELECT * FROM investor_summary x WHERE x.slug = i.slug ORDER BY period DESC LIMIT 1) s ON true
       LEFT JOIN investor_perf p ON p.slug = i.slug
       ORDER BY i.sort, i.person`,
    );
  }

  async upsertInvestor(
    slugRaw: string,
    body: { person?: string; firm?: string; cik?: string | null; categories?: string[]; active?: boolean; note?: string | null; sort?: number },
  ): Promise<any> {
    await this.ensureTables();
    const slug = slugRaw.trim().toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
    if (!slug) throw new Error('slug required');
    const cats = (body.categories || []).filter((c): c is InvestorCategory =>
      ['growth', 'value', 'short', 'longterm'].includes(c),
    );
    const cik = body.cik ? String(body.cik).replace(/\D/g, '').padStart(10, '0') : null;
    const existing = (await this.companies.query(`SELECT * FROM investors WHERE slug = $1`, [slug]))?.[0];
    if (!existing && (!body.person || !body.firm)) throw new Error('person and firm are required for a new investor');
    await this.companies.query(
      `INSERT INTO investors (slug, person, firm, cik, categories, active, note, sort, "updatedAt")
       VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8, now())
       ON CONFLICT (slug) DO UPDATE SET
         person = COALESCE($2, investors.person), firm = COALESCE($3, investors.firm),
         cik = CASE WHEN $9::boolean THEN $4 ELSE investors.cik END,
         categories = CASE WHEN $10::boolean THEN $5::jsonb ELSE investors.categories END,
         active = COALESCE($6, investors.active), note = CASE WHEN $11::boolean THEN $7 ELSE investors.note END,
         sort = COALESCE($8, investors.sort), "updatedAt" = now()`,
      [
        slug,
        body.person ?? null,
        body.firm ?? null,
        cik,
        JSON.stringify(cats),
        body.active ?? null,
        body.note ?? null,
        body.sort ?? null,
        body.cik !== undefined,
        body.categories !== undefined,
        body.note !== undefined,
      ],
    );
    // A new or re-pointed CIK gets its data pulled right away.
    if (body.cik !== undefined && cik) void this.refresh(slug).catch(() => undefined);
    return (await this.companies.query(`SELECT * FROM investors WHERE slug = $1`, [slug]))?.[0];
  }

  async removeInvestor(slug: string): Promise<boolean> {
    await this.ensureTables();
    const res = await this.companies.query(`DELETE FROM investors WHERE slug = $1`, [slug]);
    await this.companies.query(`DELETE FROM investor_holdings WHERE slug = $1`, [slug]);
    await this.companies.query(`DELETE FROM investor_summary WHERE slug = $1`, [slug]);
    await this.companies.query(`DELETE FROM investor_perf WHERE slug = $1`, [slug]);
    return Array.isArray(res) ? res[1] > 0 : true;
  }

  /* ----------------------------------------------------------- ingest */

  async status(): Promise<unknown> {
    await this.ensureTables();
    const [counts] = await this.companies.query(
      `SELECT (SELECT COUNT(*)::int FROM investors) AS investors,
              (SELECT COUNT(*)::int FROM investors WHERE active AND cik IS NOT NULL) AS "withCik",
              (SELECT COUNT(*)::int FROM investor_holdings) AS holdings,
              (SELECT COUNT(DISTINCT slug)::int FROM investor_perf WHERE ttm_return IS NOT NULL) AS "withPerf",
              (SELECT MAX("updatedAt") FROM investor_perf) AS "perfUpdatedAt",
              (SELECT MAX(period) FROM investor_holdings) AS "latestPeriod"`,
    );
    return { ...counts, refreshing: this.refreshing };
  }

  async refreshIfStale(): Promise<unknown> {
    await this.ensureTables();
    const [row] = await this.companies.query(`SELECT MAX("updatedAt") AS t FROM investor_perf`);
    const age = row?.t ? Date.now() - new Date(row.t).getTime() : Infinity;
    if (age < STALE_MS) return { refreshed: false, ageMs: age };
    return { refreshed: true, ...(await this.refresh()) };
  }

  /** Pull any 13F quarters we do not have yet, FMP's summaries, then
   *  recompute every investor's performance off live prices. */
  async refresh(onlySlug?: string): Promise<{ investors: number; quartersFetched: number; perfComputed: number }> {
    await this.ensureTables();
    if (!this.fmp.enabled) return { investors: 0, quartersFetched: 0, perfComputed: 0 };
    if (this.refreshing && !onlySlug) return { investors: 0, quartersFetched: 0, perfComputed: 0 };
    this.refreshing = true;
    let quartersFetched = 0;
    let perfComputed = 0;
    try {
      const rows: Array<{ slug: string; cik: string | null; active: boolean }> = await this.companies.query(
        `SELECT slug, cik, active FROM investors WHERE cik IS NOT NULL ${onlySlug ? 'AND slug = $1' : ''} ORDER BY sort`,
        onlySlug ? [onlySlug] : [],
      );
      for (const inv of rows) {
        try {
          quartersFetched += await this.ingestInvestor(inv.slug, inv.cik as string);
        } catch (e: any) {
          this.logger.warn(`13F ingest ${inv.slug} failed: ${e?.message || e}`);
        }
      }
      // Live prices for every ticker in the latest snapshots — one batch.
      const tickers: Array<{ t: string }> = await this.companies.query(
        `SELECT DISTINCT h.ticker AS t FROM investor_holdings h
         JOIN (SELECT slug, MAX(period) AS period FROM investor_holdings GROUP BY slug) l
           ON l.slug = h.slug AND l.period = h.period
         WHERE h.ticker IS NOT NULL AND h.put_call IN ('', 'Share')
         ${onlySlug ? 'AND h.slug = $1' : ''}`,
        onlySlug ? [onlySlug] : [],
      );
      const quotes = await this.fmp.getQuotesBatch(tickers.map((r) => r.t));
      const live = new Map<string, number>();
      for (const [sym, q] of quotes) if (Number(q?.price) > 0) live.set(sym, Number(q.price));
      for (const inv of rows) {
        try {
          if (await this.computePerformance(inv.slug, live)) perfComputed += 1;
        } catch (e: any) {
          this.logger.warn(`performance ${inv.slug} failed: ${e?.message || e}`);
        }
      }
      // Portraits (Wikipedia, verified against the firm name) — a few per run.
      await this.fillPortraits(onlySlug);
      return { investors: rows.length, quartersFetched, perfComputed };
    } finally {
      this.refreshing = false;
    }
  }

  /** Fetch the quarters we lack for one filer (newest QUARTERS_KEPT). */
  private async ingestInvestor(slug: string, cik: string): Promise<number> {
    const dates = (await this.fmp.get13FDates(cik)).slice(0, QUARTERS_KEPT);
    if (!dates.length) return 0;
    const have = new Set<string>(
      (await this.companies.query(`SELECT DISTINCT period::text AS p FROM investor_holdings WHERE slug = $1`, [slug])).map(
        (r: any) => String(r.p),
      ),
    );
    let fetched = 0;
    for (const d of dates) {
      if (have.has(d.date)) continue;
      const rows = await this.fmp.get13FHoldings(cik, d.year, d.quarter);
      if (!rows.length) continue;
      await this.storeHoldings(slug, rows);
      fetched += 1;
    }
    // Summaries are cheap and carry FMP's own portfolio value per quarter.
    const summaries = (await this.fmp.get13FSummary(cik)).slice(0, QUARTERS_KEPT);
    for (const s of summaries) {
      await this.companies.query(
        `INSERT INTO investor_summary (slug, period, market_value, previous_market_value, portfolio_size, added, removed, turnover, fmp_perf_1y, "updatedAt")
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
         ON CONFLICT (slug, period) DO UPDATE SET market_value = EXCLUDED.market_value,
           previous_market_value = EXCLUDED.previous_market_value, portfolio_size = EXCLUDED.portfolio_size,
           added = EXCLUDED.added, removed = EXCLUDED.removed, turnover = EXCLUDED.turnover,
           fmp_perf_1y = EXCLUDED.fmp_perf_1y, "updatedAt" = now()`,
        [slug, s.period, s.marketValue, s.previousMarketValue, s.portfolioSize, s.securitiesAdded, s.securitiesRemoved, s.turnover, s.fmpPerf1yPct],
      );
    }
    // Keep the table bounded.
    await this.companies.query(
      `DELETE FROM investor_holdings WHERE slug = $1 AND period < (
         SELECT MIN(period) FROM (SELECT DISTINCT period FROM investor_holdings WHERE slug = $1 ORDER BY period DESC LIMIT $2) k)`,
      [slug, QUARTERS_KEPT],
    );
    return fetched;
  }

  private async storeHoldings(slug: string, rows: Fmp13FHolding[]): Promise<void> {
    // Same CUSIP can appear twice (shares + options); merge share rows, keep
    // puts/calls as their own rows keyed by CUSIP suffix so nothing is lost.
    const merged = new Map<string, Fmp13FHolding>();
    for (const r of rows) {
      const isShare = !r.putCall || r.putCall === 'Share';
      const key = isShare ? r.cusip : `${r.cusip}:${r.putCall}`;
      const prev = merged.get(key);
      if (prev) {
        prev.shares += r.shares;
        prev.value += r.value;
      } else merged.set(key, { ...r, putCall: isShare ? 'Share' : r.putCall });
    }
    const list = Array.from(merged.entries());
    const CHUNK = 400;
    for (let i = 0; i < list.length; i += CHUNK) {
      const chunk = list.slice(i, i + CHUNK);
      const values: any[] = [];
      const tuples = chunk.map(([key, r], j) => {
        const o = j * 10;
        values.push(slug, r.period, r.filingDate || null, key.slice(0, 16), r.symbol, r.name.slice(0, 200), r.shares, r.value, r.putCall, r.link);
        return `($${o + 1},$${o + 2},$${o + 3},$${o + 4},$${o + 5},$${o + 6},$${o + 7},$${o + 8},$${o + 9},$${o + 10})`;
      });
      await this.companies.query(
        `INSERT INTO investor_holdings (slug, period, filing_date, cusip, ticker, name, shares, value, put_call, link)
         VALUES ${tuples.join(',')}
         ON CONFLICT (slug, period, cusip) DO UPDATE SET ticker = EXCLUDED.ticker, name = EXCLUDED.name,
           shares = EXCLUDED.shares, value = EXCLUDED.value, put_call = EXCLUDED.put_call, link = EXCLUDED.link,
           filing_date = EXCLUDED.filing_date`,
        values,
      );
    }
  }

  /* ------------------------------------------------------ performance */

  /**
   * Brief §4.4, implemented literally:
   *   "Compute trailing-12-month performance as the value-weighted return of
   *    disclosed 13F long positions, rebalanced at each filing date, using
   *    period-average purchase price estimates for new positions."
   *
   * Legs run quarter-end to quarter-end (the rebalance points), plus a live
   * leg from the latest quarter-end to today. Within a leg each long share
   * position held at the start is weighted by its start value; its return
   * is the change in the filing-implied price (value ÷ shares) — or, for the
   * live leg, the batch quote. A position that first appears at the END of
   * a leg was bought during it: its purchase price is estimated as the
   * average of the start-of-leg and end-of-leg implied prices (the start
   * price taken from any tracked filer that held it), and it is weighted by
   * that estimated cost. Legs chain by compounding; the earliest leg is
   * pro-rated to the part of it inside the 365-day window. Puts, calls and
   * positions without a price at both ends are excluded, and the covered
   * weight is recorded on the leg so the figure can be audited.
   *
   * Suppressed (null) below $100M AUM or 4 positions, per the brief.
   */
  private async computePerformance(slug: string, live: Map<string, number>): Promise<boolean> {
    const periods: Array<{ period: string }> = await this.companies.query(
      `SELECT DISTINCT period::text AS period FROM investor_holdings WHERE slug = $1 ORDER BY period`,
      [slug],
    );
    const [summary] = await this.companies.query(
      `SELECT market_value::float8 AS mv, portfolio_size AS n, period::text AS period
       FROM investor_summary WHERE slug = $1 ORDER BY period DESC LIMIT 1`,
      [slug],
    );
    const write = async (ttm: number | null, reason: string | null, legs: PerfLeg[], asOf: string | null) => {
      await this.companies.query(
        `INSERT INTO investor_perf (slug, ttm_return, suppressed_reason, legs, as_of, "updatedAt")
         VALUES ($1,$2,$3,$4::jsonb,$5, now())
         ON CONFLICT (slug) DO UPDATE SET ttm_return = EXCLUDED.ttm_return, suppressed_reason = EXCLUDED.suppressed_reason,
           legs = EXCLUDED.legs, as_of = EXCLUDED.as_of, "updatedAt" = now()`,
        [slug, ttm, reason, JSON.stringify(legs), asOf],
      );
    };
    if (!periods.length) {
      await write(null, 'No 13F filings on record.', [], null);
      return false;
    }
    const latestPeriod = periods[periods.length - 1].period;
    const aum = Number(summary?.mv) || 0;
    const n = Number(summary?.n) || 0;
    if (aum && aum < MIN_AUM) {
      await write(null, `Performance suppressed: portfolio under $100M ($${(aum / 1e6).toFixed(0)}M).`, [], latestPeriod);
      return true;
    }
    if (n && n < MIN_POSITIONS) {
      await write(null, `Performance suppressed: fewer than 4 positions (${n}).`, [], latestPeriod);
      return true;
    }

    // Snapshots: top-N long share positions per quarter with implied prices.
    type Pos = { ticker: string; value: number; shares: number; px: number };
    const snaps = new Map<string, Pos[]>();
    for (const p of periods) {
      const rows: Array<{ ticker: string; value: number; shares: number }> = await this.companies.query(
        `SELECT ticker, value::float8 AS value, shares::float8 AS shares FROM investor_holdings
         WHERE slug = $1 AND period = $2 AND ticker IS NOT NULL AND put_call = 'Share' AND shares > 0
         ORDER BY value DESC LIMIT $3`,
        [slug, p.period, PERF_TOP_N],
      );
      snaps.set(
        p.period,
        rows.map((r) => ({ ticker: r.ticker, value: r.value, shares: r.shares, px: r.value / r.shares })),
      );
    }
    // Market-wide implied prices per (period, ticker) across every tracked
    // filer — the start price for positions this filer did not hold yet.
    const marketPx = new Map<string, number>();
    const mp: Array<{ period: string; ticker: string; px: number }> = await this.companies.query(
      `SELECT period::text AS period, ticker, percentile_cont(0.5) WITHIN GROUP (ORDER BY value / NULLIF(shares,0)) AS px
       FROM investor_holdings WHERE ticker IS NOT NULL AND put_call = 'Share' AND shares > 0
         AND period >= (CURRENT_DATE - 500)
       GROUP BY period, ticker`,
    );
    for (const r of mp) if (Number(r.px) > 0) marketPx.set(`${r.period}|${r.ticker}`, Number(r.px));

    const legReturn = (from: string, to: string, endPx: (t: string) => number | null): PerfLeg | null => {
      const start = snaps.get(from) || [];
      const end = snaps.get(to);
      if (!start.length) return null;
      const endMap = new Map<string, Pos>();
      for (const p of end || []) endMap.set(p.ticker, p);
      let weighted = 0;
      let weightSum = 0;
      let totalStart = 0;
      for (const p of start) totalStart += p.value;
      // Existing positions: start value weight, implied/quoted price change.
      for (const p of start) {
        const px1 = endPx(p.ticker);
        if (!px1 || !p.px) continue;
        weighted += p.value * (px1 / p.px - 1);
        weightSum += p.value;
      }
      // New positions bought during the leg (period-average price estimate).
      if (end) {
        for (const p of end) {
          if (start.find((s) => s.ticker === p.ticker)) continue;
          const startPx = marketPx.get(`${from}|${p.ticker}`);
          const avgPx = startPx ? (startPx + p.px) / 2 : p.px;
          const cost = p.shares * avgPx;
          weighted += cost * (p.px / avgPx - 1);
          weightSum += cost;
        }
      }
      if (weightSum <= 0) return null;
      return {
        from,
        to,
        returnPct: (weighted / weightSum) * 100,
        positions: start.length,
        weightCovered: totalStart > 0 ? Math.min(1, weightSum / totalStart) : 0,
        fraction: 1,
      };
    };

    const legs: PerfLeg[] = [];
    for (let i = 0; i < periods.length - 1; i++) {
      const to = periods[i + 1].period;
      const endSnap = new Map((snaps.get(to) || []).map((p) => [p.ticker, p.px]));
      const leg = legReturn(periods[i].period, to, (t) => {
        const own = endSnap.get(t);
        return own ?? marketPx.get(`${to}|${t}`) ?? null;
      });
      if (leg) legs.push(leg);
    }
    const today = new Date().toISOString().slice(0, 10);
    const liveLeg = legReturn(latestPeriod, today, (t) => live.get(t) ?? null);
    if (liveLeg) legs.push(liveLeg);

    // Trailing 12 months: keep legs ending inside the window, pro-rate the
    // earliest one, compound.
    const windowStart = new Date(Date.now() - 365 * 86_400_000);
    const kept = legs.filter((l) => new Date(l.to) > windowStart);
    if (!kept.length) {
      await write(null, 'Not enough filing history inside the trailing 12 months.', legs, latestPeriod);
      return true;
    }
    const first = kept[0];
    const span = new Date(first.to).getTime() - new Date(first.from).getTime();
    const inside = new Date(first.to).getTime() - windowStart.getTime();
    if (span > 0 && inside < span) first.fraction = Math.max(0, inside / span);
    let growth = 1;
    for (const l of kept) growth *= Math.pow(1 + l.returnPct / 100, l.fraction);
    const ttm = (growth - 1) * 100;
    await write(Number.isFinite(ttm) ? +ttm.toFixed(2) : null, Number.isFinite(ttm) ? null : 'Return could not be computed.', kept, today);
    return true;
  }

  /* ------------------------------------------------------- portraits */

  /** Wikipedia lead image for the person, accepted only when the article
   *  mentions the firm — same rule as the insider profile portraits. Checked
   *  at most once a week per investor; a miss is remembered too. */
  private async fillPortraits(onlySlug?: string): Promise<void> {
    const rows: Array<{ slug: string; person: string; firm: string }> = await this.companies.query(
      `SELECT slug, person, firm FROM investors
       WHERE (photo_checked_at IS NULL OR photo_checked_at < now() - interval '7 days')
       ${onlySlug ? 'AND slug = $1' : ''} ORDER BY sort LIMIT 12`,
      onlySlug ? [onlySlug] : [],
    );
    const UA = { 'User-Agent': 'InsiderBuyingBot/1.0 (https://insiderbuying.com; contact@insiderbuying.com)' };
    const STOP = new Set(['llc', 'lp', 'inc', 'co', 'the', 'and', 'management', 'capital', 'asset', 'investment', 'investments', 'partners', 'group', 'fund', 'funds', 'company', 'holdings', 'trust', 'advisors', 'advisers', 'corporation', 'llp', 'ltd']);
    for (const r of rows) {
      let url: string | null = null;
      try {
        const needles = r.firm.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !STOP.has(w));
        const q = new URLSearchParams({ action: 'query', format: 'json', redirects: '1', titles: r.person, prop: 'pageimages|extracts', exintro: '1', explaintext: '1', exchars: '1500', pithumbsize: '600' });
        const res = await axios.get(`https://en.wikipedia.org/w/api.php?${q}`, { headers: UA, timeout: 6000 });
        const page: any = Object.values(res.data?.query?.pages ?? {})[0];
        const extract = String(page?.extract || '').toLowerCase();
        if (page?.thumbnail?.source && (needles.some((w) => extract.includes(w)) || r.person === r.firm)) url = page.thumbnail.source;
      } catch {
        /* leave null, retried next week */
      }
      await this.companies.query(`UPDATE investors SET photo_url = COALESCE($2, photo_url), photo_checked_at = now() WHERE slug = $1`, [r.slug, url]);
    }
  }

  /* -------------------------------------------------------------- read */

  /** Tickers with open-market insider buying in the overlap window. */
  private async insiderBuyMap(): Promise<Map<string, { bought: number; buyers: number }>> {
    const rows: Array<{ t: string; bought: number; buyers: number }> = await this.companies.query(
      `SELECT UPPER(c.ticker) AS t, SUM(t."totalValue")::float8 AS bought, COUNT(DISTINCT t."insiderName")::int AS buyers
       FROM insider_transactions t JOIN companies c ON c.id = t.company_id
       WHERE t."transactionCode" = 'P' AND t."plannedBuy" = false AND t."totalValue" > 0
         AND t."transactionDate" >= (CURRENT_DATE - ${OVERLAP_DAYS})
         AND c.ticker IS NOT NULL
       GROUP BY UPPER(c.ticker)`,
    );
    const m = new Map<string, { bought: number; buyers: number }>();
    for (const r of rows) m.set(r.t, { bought: Number(r.bought), buyers: Number(r.buyers) });
    return m;
  }

  async list(tab: InvestorTab): Promise<{ tab: InvestorTab; count: number; cards: InvestorCard[]; methodologyUrl: string }> {
    await this.ensureTables();
    const rows: any[] = await this.companies.query(
      `SELECT i.slug, i.person, i.firm, i.photo_url AS photo, i.active, i.note, i.categories, i.sort,
              s.period::text AS "asOf", s.market_value::float8 AS "portfolioValue", s.portfolio_size AS positions,
              p.ttm_return::float8 AS performance, p.suppressed_reason AS "perfNote"
       FROM investors i
       LEFT JOIN LATERAL (SELECT * FROM investor_summary x WHERE x.slug = i.slug ORDER BY period DESC LIMIT 1) s ON true
       LEFT JOIN investor_perf p ON p.slug = i.slug
       ORDER BY i.sort, i.person`,
    );
    const tops: any[] = await this.companies.query(
      `SELECT h.slug, h.ticker, h.name, h.value::float8 AS value
       FROM investor_holdings h
       JOIN (SELECT slug, MAX(period) AS period FROM investor_holdings GROUP BY slug) l ON l.slug = h.slug AND l.period = h.period
       WHERE h.ticker IS NOT NULL AND h.put_call = 'Share'
       ORDER BY h.slug, h.value DESC`,
    );
    const insider = await this.insiderBuyMap();
    const bySlug = new Map<string, any[]>();
    for (const t of tops) {
      const arr = bySlug.get(t.slug) || [];
      arr.push(t);
      bySlug.set(t.slug, arr);
    }
    const cards: InvestorCard[] = rows.map((r) => {
      const holdings = bySlug.get(r.slug) || [];
      const total = holdings.reduce((a, h) => a + h.value, 0);
      const overlap = holdings
        .filter((h) => insider.has(h.ticker))
        .map((h) => ({ ticker: h.ticker, insiderBought: insider.get(h.ticker)!.bought, buyers: insider.get(h.ticker)!.buyers }))
        .sort((a, b) => b.insiderBought - a.insiderBought)
        .slice(0, 8);
      return {
        slug: r.slug,
        person: r.person,
        firm: r.firm,
        photo: r.photo || null,
        active: !!r.active,
        note: r.note || null,
        categories: Array.isArray(r.categories) ? r.categories : [],
        performance: r.active && r.performance != null ? Number(r.performance) : null,
        perfNote: r.active ? r.perfNote || null : r.note || 'No current 13F filings.',
        portfolioValue: r.active && r.portfolioValue != null ? Number(r.portfolioValue) : r.active ? null : 0,
        positions: r.positions != null ? Number(r.positions) : holdings.length || null,
        asOf: r.asOf || null,
        topHoldings: holdings.slice(0, 3).map((h) => ({ ticker: h.ticker, name: h.name, value: h.value, pct: total ? (h.value / total) * 100 : 0 })),
        overlap,
      };
    });
    let out = cards;
    if (tab === 'performance') {
      out = cards.filter((c) => c.performance != null).sort((a, b) => (b.performance as number) - (a.performance as number));
    } else if (tab !== 'popular') {
      out = cards.filter((c) => c.categories.includes(tab));
    }
    return { tab, count: out.length, cards: out, methodologyUrl: '/methodology#top-insiders' };
  }

  async detail(slug: string): Promise<unknown | null> {
    await this.ensureTables();
    const [inv] = await this.companies.query(
      `SELECT i.*, i.photo_url AS photo, p.ttm_return::float8 AS performance, p.suppressed_reason AS "perfNote", p.legs, p.as_of::text AS "perfAsOf"
       FROM investors i LEFT JOIN investor_perf p ON p.slug = i.slug WHERE i.slug = $1`,
      [slug],
    );
    if (!inv) return null;
    const summaries: any[] = await this.companies.query(
      `SELECT period::text AS period, market_value::float8 AS "marketValue", previous_market_value::float8 AS "previousMarketValue",
              portfolio_size AS positions, added, removed, turnover::float8 AS turnover, fmp_perf_1y::float8 AS "fmpPerf1y"
       FROM investor_summary WHERE slug = $1 ORDER BY period DESC`,
      [slug],
    );
    const periods: Array<{ period: string }> = await this.companies.query(
      `SELECT DISTINCT period::text AS period FROM investor_holdings WHERE slug = $1 ORDER BY period DESC`,
      [slug],
    );
    const latest = periods[0]?.period ?? null;
    const prior = periods[1]?.period ?? null;
    const holdings: any[] = latest
      ? await this.companies.query(
          `SELECT h.cusip, h.ticker, h.name, h.shares::float8 AS shares, h.value::float8 AS value, h.put_call AS "putCall", h.link,
                  pr.shares::float8 AS "priorShares", pr.value::float8 AS "priorValue"
           FROM investor_holdings h
           LEFT JOIN investor_holdings pr ON pr.slug = h.slug AND pr.cusip = h.cusip AND pr.period = $3
           WHERE h.slug = $1 AND h.period = $2 ORDER BY h.value DESC`,
          [slug, latest, prior],
        )
      : [];
    const total = holdings.reduce((a, h) => a + (h.putCall === 'Share' ? h.value : 0), 0);
    // Transaction history by filing period: what changed between consecutive quarters.
    const history: any[] = [];
    for (let i = 0; i < periods.length - 1; i++) {
      const cur = periods[i].period;
      const prev = periods[i + 1].period;
      const rows: any[] = await this.companies.query(
        `SELECT COALESCE(a.ticker, b.ticker) AS ticker, COALESCE(a.name, b.name) AS name,
                a.shares::float8 AS shares, b.shares::float8 AS "prevShares", a.value::float8 AS value, b.value::float8 AS "prevValue",
                COALESCE(a.filing_date, b.filing_date)::text AS "filingDate"
         FROM investor_holdings a FULL OUTER JOIN investor_holdings b
           ON a.slug = b.slug AND a.cusip = b.cusip AND a.period = $2 AND b.period = $3
         WHERE (a.slug = $1 AND a.period = $2) OR (b.slug = $1 AND b.period = $3)`,
        [slug, cur, prev],
      );
      const changes = rows
        .map((r) => {
          const s = Number(r.shares) || 0;
          const p = Number(r.prevShares) || 0;
          const kind = !p && s ? 'new' : p && !s ? 'closed' : s > p ? 'added' : s < p ? 'reduced' : null;
          return kind ? { ticker: r.ticker, name: r.name, kind, shares: s, prevShares: p, value: Number(r.value) || 0, prevValue: Number(r.prevValue) || 0 } : null;
        })
        .filter(Boolean)
        .sort((a: any, b: any) => Math.abs(b.value - b.prevValue) - Math.abs(a.value - a.prevValue));
      history.push({ period: cur, filingDate: rows[0]?.filingDate ?? null, changes: changes.slice(0, 60), totalChanges: changes.length });
    }
    const insider = await this.insiderBuyMap();
    const overlap = holdings
      .filter((h) => h.ticker && insider.has(h.ticker))
      .map((h) => ({ ticker: h.ticker, name: h.name, fundValue: h.value, fundPct: total ? (h.value / total) * 100 : 0, insiderBought: insider.get(h.ticker)!.bought, buyers: insider.get(h.ticker)!.buyers }))
      .sort((a, b) => b.insiderBought - a.insiderBought);
    return {
      slug: inv.slug,
      person: inv.person,
      firm: inv.firm,
      cik: inv.cik,
      photo: inv.photo || null,
      active: !!inv.active,
      note: inv.note || null,
      categories: Array.isArray(inv.categories) ? inv.categories : [],
      performance: inv.active && inv.performance != null ? Number(inv.performance) : null,
      perfNote: inv.active ? inv.perfNote || null : inv.note || 'No current 13F filings.',
      perfAsOf: inv.perfAsOf || null,
      legs: Array.isArray(inv.legs) ? inv.legs : [],
      asOf: latest,
      priorPeriod: prior,
      portfolioValue: total || Number(summaries[0]?.marketValue) || 0,
      summaries,
      holdings: holdings.map((h) => ({
        ...h,
        pct: total && h.putCall === 'Share' ? (h.value / total) * 100 : 0,
        changeShares: h.priorShares != null ? h.shares - h.priorShares : h.shares,
        isNew: h.priorShares == null,
      })),
      history,
      overlap,
      methodologyUrl: '/methodology#top-insiders',
    };
  }
}
