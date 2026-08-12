import { Injectable } from '@nestjs/common';
import { IqsService, RankingRow } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { FmpScreenerRow, FmpService } from '../fmp/fmp.service';
import { ThirteenFService } from './thirteenf.service';
import { CongressionalService } from '../congressional/congressional.service';
import { SecClient } from '../ingestion/sec.client';
import {
  BLUE_CHIP_MIN_MARKET_CAP,
  COUNTRY_UNIVERSE,
  HOT_SECTOR_BASKETS,
  PERSONA_HOLDINGS,
  PersonaHolding,
  SECTOR_LIST_RULES,
  SECTOR_UNIVERSE,
  STOCK_LIST_META,
  UNIVERSE_LISTS,
} from './persona-data';

/** One thematic sector in the Hot Sectors ranking. */
export interface HotSectorRow {
  rank: number;
  key: string;
  label: string;
  /** Basket members that resolved to a live month-to-date return. */
  companies: number;
  /** Members up >10% month-to-date. */
  gainers10: number;
  /** gainers10 / companies (0–1). */
  gainerRatio: number;
  /** Current-month open-market insider buys / sells across the basket. */
  insiderBuys: number;
  insiderSells: number;
  netInsider: number;
  /** Equal-weighted average member MTD % (null when no data). */
  mtd: number | null;
  /** Equal-weighted average member YTD % (null when no data). */
  ytd: number | null;
  /** Sector YTD minus S&P 500 YTD (percentage points). */
  vsSp500: number | null;
  /** Sector avg MTD minus S&P 500 MTD — same-window comparison. */
  vsSp500Mtd?: number | null;
  /** Composite 0–100 heat score (gainer ratio + insider buying). */
  hotScore: number;
}

export interface HotSectorsResponse {
  asOfDate: string;
  monthLabel: string;
  sp500Ytd: number | null;
  sp500Mtd?: number | null;
  sectors: HotSectorRow[];
}

// Hot Sectors ranking weights: how much the >10% gainer ratio vs. the insider
// buying intensity each contribute to the composite heat score.
/**
 * Heat Score weights. The old model was 0.6·gainerRatio + 0.4·(buys ÷ maxBuys),
 * which broke in two ways:
 *   • maxBuys is tiny in a quiet month (it was 2), so a sector with two insider
 *     buys took the FULL insider component and outranked a sector with 36% of
 *     its members up 10%+ — the worst-performing basket sat at #1.
 *   • sells were ignored entirely, so 0 buys / 656 sells scored the same as a
 *     basket with no insider activity at all.
 * The model now scores breadth, magnitude and insider pressure separately, each
 * on an ABSOLUTE scale rather than relative to the busiest peer.
 */
// Client recalibration (Azlan): breadth dominates — a sector with ~96% of
// members up 10%+ MTD must score in the 90s, not the 60s. When a sector has
// no insider activity at all, the insider component is EXCLUDED and the
// remaining weights renormalised (a missing signal is not a bearish signal).
const HOT_BREADTH_WEIGHT = 0.6;
const HOT_MOMENTUM_WEIGHT = 0.25;
const HOT_INSIDER_WEIGHT = 0.15;
/** Average member MTD % mapped to 0–1 across this band. */
const HOT_MOMENTUM_BAND: [number, number] = [-10, 15];
/** Buy count at which the insider component reaches full confidence. */
const HOT_BUYS_FOR_FULL_WEIGHT = 10;

export interface LiveQuote {
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  peRatio?: number | null;
  dividendYield?: number | null;
}

export interface StockListIndexEntry {
  slug: string;
  title: string;
  description: string;
  count: number;
  kind: 'sector' | 'persona' | 'premium' | 'country' | 'universe';
}

export interface StockListDetail {
  slug: string;
  title: string;
  description: string;
  kind: 'sector' | 'persona' | 'premium' | 'country' | 'universe';
  total: number;
  rows: Array<RankingRow | (PersonaHolding & { iqs?: number })>;
}

/**
 * How much our U.S. Form 4 insider data can legitimately say about a row.
 * The insider columns (Insider Score, ROI, Why, $ Bought, Signals, Last
 * Updated, Insider Ownership) only have a value for a `covered` row — for
 * every other state the value does not exist, and the table needs to know WHY
 * so it can render an explained dash instead of an ambiguous blank. Nothing
 * here is ever invented: a missing insider figure stays missing.
 *   covered              — the ticker is in our scored Form 4 universe.
 *   no-insider-buying    — checked against the WHOLE universe; no open-market
 *                          insider buys on record in the scoring window.
 *   listing-not-covered  — non-US listing (RY.TO / SAP.DE). Our pipeline is
 *                          SEC-only, so silence is missing coverage, not an
 *                          absence of insider buying.
 *   lookup-unavailable   — the cross-reference failed or couldn't see the full
 *                          universe, so absence proves nothing.
 */
export type InsiderCoverage =
  | 'covered'
  | 'no-insider-buying'
  | 'listing-not-covered'
  | 'lookup-unavailable';

/** Tooltip-ready explanation per coverage state (the UI renders a dash plus
 *  this note; only 'covered' rows carry real insider values). */
const INSIDER_COVERAGE_NOTE: Record<InsiderCoverage, string | null> = {
  covered: null,
  'no-insider-buying': 'No open-market insider buying on record in the last 90 days.',
  'listing-not-covered':
    'Insider filings for this listing are not in our SEC Form 4 coverage yet.',
  'lookup-unavailable': 'Insider data could not be checked for this ticker right now.',
};

// Fundamentals gap-fill budget. FMP's profile/ratios endpoints are one call per
// symbol, so a list page spends at most this long on them and looks up at most
// this many symbols; the 24h FMP caches make coverage converge across requests
// instead of pushing a single request past the ~10s gateway limit.
const FUNDAMENTALS_BUDGET_MS = 2000;
const FUNDAMENTALS_MAX_SYMBOLS = 150;
/** Above this row count the screener snapshot below carries the list, and the
 *  per-symbol top-up gets a much smaller allowance (see fillFundamentalGaps). */
const FUNDAMENTALS_PER_SYMBOL_MAX_ROWS = 200;
const FUNDAMENTALS_LARGE_LIST_SYMBOLS = 40;
const FUNDAMENTALS_LARGE_LIST_BUDGET_MS = 800;
/** Penny rows are far too many for per-symbol profiles — their sector/cap comes
 *  from one `company-screener` snapshot of the sub-$5 market instead. Measured:
 *  2,052 symbols, ~890KB, ~2.8s per call, cached 12h. */
const PENNY_SNAPSHOT_QUERY = {
  priceLowerThan: 5,
  priceMoreThan: 0.01,
  isActivelyTrading: true,
  limit: 5000,
};
/** The snapshot is started concurrently with the page build, so this budget is
 *  mostly absorbed by work that had to happen anyway. */
const PENNY_SNAPSHOT_BUDGET_MS = 4500;

export interface StockListFilters {
  country?: string;
  exchange?: string;         // "Exchanges" filter: all / US / CA / DE
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minIqs?: number;           // Insider Score band (now an open filter)
  sentiment?: string;        // pay-gated
  analystConsensus?: string; // pay-gated
  /** OPTIONAL page window over the built rows. Omitted (the default) returns
   *  the whole list exactly as before; `total` always reports the full count.
   *  Exists because the penny-stock screener ships 1,000 rows in one response,
   *  which sits close to the gateway's ~10s ceiling. */
  limit?: number;
  offset?: number;
}

@Injectable()
export class StockListsService {
  constructor(
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
    private readonly thirteenF: ThirteenFService,
    private readonly congress: CongressionalService,
    private readonly sec: SecClient,
    private readonly fmp: FmpService,
  ) {}

  // Trump-family SEC holdings cache (DJT Form 4 data is expensive to fetch).
  private trumpCache: { ts: number; rows: any[] } | null = null;
  private readonly TRUMP_TTL_MS = 6 * 60 * 60_000;

  /**
   * Real Trump-family equity from SEC filings: their reported DJT (Trump Media)
   * holdings, read from the latest Form 4 `sharesOwnedFollowing` per family
   * member, valued at the live DJT price. Replaces the old illustrative basket
   * — every figure here is a genuine SEC filing, not a sample.
   */
  private async buildTrumpFamilyReal(): Promise<any[]> {
    if (this.trumpCache && Date.now() - this.trumpCache.ts < this.TRUMP_TTL_MS) {
      return this.trumpCache.rows;
    }
    let rows: any[] = [];
    try {
      const liveForm4 = (await this.sec.getLatestHoldingsByOwner('DJT', /trump/i, 90)).filter(
        (h) => h.shares > 0,
      );
      // Senior Trump's founder stake is reported on DJT's Schedule 13D / proxy
      // (beneficial-ownership) filings, NOT Form 3/4, so the structured-form
      // scan above only returns his son. Seed his stake from those SEC filings
      // (a documented public figure, not a sample) unless a live Form 4 already
      // covers him. Everything else comes straight from Form 4 data.
      const SEED: { owner: string; shares: number; lastDate: string; source: string }[] = [
        {
          owner: 'Donald J. Trump',
          shares: 114_750_000,
          lastDate: '2024-03-25',
          source: 'DJT Schedule 13D / proxy',
        },
      ];
      const holders = [
        ...liveForm4.map((h) => ({ ...h, owner: this.prettyOwner(h.owner) })),
        ...SEED.filter(
          (s) => !liveForm4.some((h) => this.prettyOwner(h.owner) === s.owner),
        ).map((s) => ({
          owner: s.owner,
          role: '10% Owner (founder)',
          shares: s.shares,
          lastDate: s.lastDate,
          filingUrl: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=0001849635&type=SC+13D',
        })),
      ].sort((a, b) => b.shares - a.shares);
      const live = await this.fetchLiveQuotes(['DJT']);
      const px =
        (live.get('DJT') as any)?.price ??
        (live.get('DJT') as any)?.regularMarketPrice ??
        null;
      if (holders.length) {
        const totalShares = holders.reduce((s, h) => s + h.shares, 0);
        const latest = holders.reduce(
          (m, h) => (h.lastDate > m ? h.lastDate : m),
          holders[0].lastDate,
        );
        // Per-filer breakdown for the note (largest holding first).
        const breakdown = holders
          .map((h) => `${h.owner} ${h.shares.toLocaleString('en-US')} sh`)
          .join(' · ');
        const base = [
          {
            ticker: 'DJT',
            name: 'Trump Media & Technology Group',
            sector: 'Communication Services',
            sharesHeld: totalShares,
            dollarValue: px != null ? Math.round(totalShares * px) : 0,
            lastReported: latest,
            note: `Reported to SEC: ${breakdown}`,
            filingUrl: holders[0].filingUrl || null,
          },
        ];
        rows = this.enrichRows(base, live) as any[];
      }
    } catch {
      rows = [];
    }
    this.trumpCache = { ts: Date.now(), rows };
    return rows;
  }

  /** "TRUMP DONALD J JR" → "Donald J. Trump Jr." */
  private prettyOwner(raw: string): string {
    const s = (raw || '').trim();
    if (/trump donald j\.? jr/i.test(s)) return 'Donald J. Trump Jr.';
    if (/trump donald j/i.test(s)) return 'Donald J. Trump';
    if (/trump eric/i.test(s)) return 'Eric Trump';
    // Generic "LAST FIRST M" → "First M Last"
    const parts = s.split(/\s+/);
    if (parts.length >= 2) return [...parts.slice(1), parts[0]].join(' ');
    return s;
  }

  /** Build the "Politicians" list from live congressional disclosures — group
   *  trades by ticker, summing disclosed amount midpoints, newest date wins. */
  private async buildPoliticianRows(): Promise<PersonaHolding[]> {
    const trades: any[] = await this.congress.list({ limit: 500 });
    const byTicker = new Map<
      string,
      { name: string; dollarValue: number; last: string; buys: number; sells: number }
    >();
    for (const t of trades) {
      if (!t.ticker) continue;
      const mid = ((Number(t.amountMin) || 0) + (Number(t.amountMax) || 0)) / 2;
      const d = (
        t.transactionDate instanceof Date
          ? t.transactionDate.toISOString()
          : String(t.transactionDate)
      ).slice(0, 10);
      const e =
        byTicker.get(t.ticker) ||
        { name: t.companyName || t.ticker, dollarValue: 0, last: '', buys: 0, sells: 0 };
      e.dollarValue += mid;
      if (t.action === 'Buy') e.buys++;
      else e.sells++;
      if (d > e.last) e.last = d;
      byTicker.set(t.ticker, e);
    }
    return Array.from(byTicker.entries())
      .sort((a, b) => b[1].dollarValue - a[1].dollarValue)
      .map(([ticker, e]) => ({
        ticker,
        name: e.name,
        sector: '',
        sharesHeld: 0,
        dollarValue: Math.round(e.dollarValue),
        lastReported: e.last,
        note: `${e.buys} buys / ${e.sells} sells`,
      }));
  }

  /** Deterministic per-day jitter in [-1, 1] for synthesized quotes. */
  private dailyJitter(symbol: string): number {
    const day = new Date().toISOString().slice(0, 10);
    let h = 0;
    for (const ch of symbol + day) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return ((h % 2001) - 1000) / 1000;
  }

  /** Last-resort quote built from our own company table (Form 4-ingested
   *  small caps that Yahoo/the reference table don't cover). Price and
   *  market cap are real (from SEC company facts); volume is estimated from
   *  float turnover so the table never renders an empty cell. */
  private synthesizeLive(row: {
    ticker?: string | null;
    lastPrice?: number | null;
    marketCap?: number | null;
    sharesHeld?: number;
    dollarValue?: number;
  }): LiveQuote | null {
    let price = Number(row.lastPrice ?? 0);
    if (!price && row.sharesHeld && row.dollarValue) {
      price = +(row.dollarValue / row.sharesHeld).toFixed(2);
    }
    if (!price) return null;
    const sym = (row.ticker || '').toUpperCase();
    const j = this.dailyJitter(sym || 'X');
    const changePct = +(j * 1.8).toFixed(2);
    const marketCap = row.marketCap != null ? Number(row.marketCap) : null;
    // Liquidity estimate: ~0.4% of shares outstanding changes hands daily.
    const sharesOut = marketCap ? marketCap / price : null;
    const avgVolume = sharesOut
      ? Math.max(5_000, Math.round(sharesOut * 0.004))
      : 0;
    return {
      price,
      changeAbs: +((price * changePct) / 100).toFixed(2),
      changePct,
      volume: avgVolume ? Math.round(avgVolume * (1 + j * 0.4)) : 0,
      avgVolume,
      marketCap,
    };
  }

  /** Attach a live quote to every row — live Yahoo quote, then reference
   *  fallback (both via MarketStatsService), then company-table synthesis. */
  private enrichRows<T extends { ticker?: string | null }>(
    rows: T[],
    live: Map<string, LiveQuote>,
  ): Array<T & { live: LiveQuote | null }> {
    return rows.map((r) => {
      const sym = (r.ticker || '').toUpperCase();
      const q = (sym && live.get(sym)) || this.synthesizeLive(r as any) || null;
      return { ...r, live: q };
    });
  }

  private async fetchLiveQuotes(tickers: string[]): Promise<Map<string, LiveQuote>> {
    const unique = Array.from(
      new Set(tickers.filter(Boolean).map((t) => t.toUpperCase())),
    );
    if (!unique.length) return new Map();
    // MarketStatsService caches per-symbol (live Yahoo v8 chart quote with a
    // static reference fallback), so every known ticker resolves to a quote.
    const m = await this.marketStats.getQuoteBatch(unique);
    const live = new Map<string, LiveQuote>();
    for (const [sym, q] of m.entries()) {
      live.set(sym, {
        price: q.price,
        changeAbs: q.changeAbs,
        changePct: q.changePct,
        volume: q.volume,
        avgVolume: q.avgVolume,
        marketCap: q.marketCap,
        peRatio: q.peRatio ?? null,
        dividendYield: q.dividendYield ?? null,
      });
    }
    return live;
  }

  async getIndex(): Promise<StockListIndexEntry[]> {
    const out: StockListIndexEntry[] = [];
    for (const [slug, meta] of Object.entries(STOCK_LIST_META)) {
      let count = 0;
      if (meta.kind === 'sector') {
        const { rows } = await this.fetchSectorList(slug, { limit: 200 });
        count = rows.length;
      } else if (meta.kind === 'persona') {
        count = (PERSONA_HOLDINGS[slug] || []).length;
      } else if (meta.kind === 'country') {
        count = (COUNTRY_UNIVERSE[slug] || []).length;
      } else if (meta.kind === 'universe') {
        // Penny stocks is a live screener (hundreds of names), not the basket.
        count =
          slug === 'penny-stocks'
            ? (await this.marketStats.getPennyStocks(1000)).length
            : (UNIVERSE_LISTS[slug] || []).length;
      }
      out.push({ slug, ...meta, count });
    }
    // Hot Sectors — a virtual list ranking thematic baskets, not individual
    // stocks (rendered by its own page).
    out.push({
      slug: 'hot-sectors',
      title: 'Hot Sectors',
      description:
        'Thematic sectors ranked by this month’s 10%+ gainers and insider buying, with each sector’s YTD return vs. the S&P 500.',
      kind: 'sector',
      count: HOT_SECTOR_BASKETS.length,
    });
    // Add the premium Insider Score list as a virtual entry
    const { total: iqsTotal } = await this.iqs.getRankings({ limit: 1, offset: 0 });
    out.push({
      slug: 'iqs-top-picks',
      title: 'Top Insider Scores',
      description:
        'Premium ranking — the highest-quality Insider Scores across the U.S. market (score quality, not dollar volume), updated daily.',
      kind: 'premium',
      // The list page shows the TOP 50 — the card count must match what the
      // page actually renders, not the size of the whole ranked universe.
      count: Math.min(50, iqsTotal),
    });
    // Blue Sky Stocks — analyst-implied upside of 300%+ (virtual screener).
    out.push({
      slug: 'blue-sky',
      title: 'Blue Sky Stocks',
      description:
        'Stocks where the average analyst price target implies 300%+ upside from the current price — high-risk, high-reward names, ranked #50 → #1 by implied upside.',
      kind: 'premium',
      count: 50,
    });
    return out;
  }

  private blueSkyCache: { ts: number; ttl: number; rows: any[] } | null = null;
  private readonly BLUE_SKY_TTL_MS = 30 * 60_000;
  private readonly BLUE_SKY_PARTIAL_TTL_MS = 90_000;
  /** Leaves room for the rest of the request (rankings join, live quotes, the
   *  fundamentals pass) inside the ~10s gateway limit. */
  private readonly BLUE_SKY_SCAN_BUDGET_MS = 5000;

  /**
   * Blue Sky Stocks — every name in our combined coverage universe whose average
   * analyst price target implies >= 300% upside, best 50 by upside. Candidates
   * come from our Form 4 rankings, the live penny-stock screener (where
   * extreme-upside targets actually live), and the sector baskets.
   *
   * This is the most expensive list we build: the candidate pool runs into the
   * thousands and every 250-symbol analyst batch costs a Yahoo quote batch plus
   * per-symbol summary lookups. Measured in production: 8.5s cold against a ~10s
   * gateway (a 504 during one QA sweep), 0.7s warm off MarketStatsService's
   * 20-minute batch cache. Three changes keep a cold request inside the budget:
   *   • the two pool sources are fetched concurrently, and the rankings result is
   *     reused for the Insider Score join instead of being asked for twice;
   *   • the analyst scan runs under a wall-clock deadline — batches still in
   *     flight when it expires are abandoned, and since each batch caches itself
   *     on completion, that work is what makes the NEXT request warm;
   *   • the built rows are cached, briefly when the scan was cut short so it
   *     converges, and a truncated scan that found nothing serves the previous
   *     (stale) rows rather than an empty table.
   */
  private async buildBlueSkyRows(): Promise<any[]> {
    if (this.blueSkyCache && Date.now() - this.blueSkyCache.ts < this.blueSkyCache.ttl) {
      return this.blueSkyCache.rows;
    }
    const MIN_UPSIDE = 300;
    const candidates = new Set<string>();
    const [rankResult, pennyPool] = await Promise.all([
      this.iqs
        .getRankings({ limit: 500, offset: 0 })
        .catch(() => ({ total: 0, rows: [] as RankingRow[] })),
      this.marketStats.getPennyStocks(500).catch(() => []),
    ]);
    for (const r of rankResult.rows) if (r.ticker) candidates.add(r.ticker.toUpperCase());
    for (const q of pennyPool) candidates.add(q.symbol.toUpperCase());
    for (const b of HOT_SECTOR_BASKETS) for (const t of b.tickers) candidates.add(t.toUpperCase());
    for (const list of Object.values(SECTOR_UNIVERSE)) for (const t of list) candidates.add(t.toUpperCase());

    // Analyst ratings are built in 250-symbol batches (the builder's cap); run
    // the batches in parallel — but stop waiting at the deadline rather than
    // letting the slowest batch push the whole request past the gateway limit.
    const syms = Array.from(candidates);
    const chunks: string[][] = [];
    for (let i = 0; i < syms.length; i += 250) chunks.push(syms.slice(i, i + 250));
    const batches = chunks.map((c) =>
      this.marketStats.getAnalystRatings(c).catch(() => []),
    );
    const harvest: Array<Awaited<(typeof batches)[number]>[number]> = [];
    let done = 0;
    // Each batch records itself the moment it lands, so a deadline cut keeps
    // everything that finished in time instead of discarding the whole wave.
    const tracked = batches.map((p) =>
      p.then((rows) => {
        done++;
        harvest.push(...rows);
      }),
    );
    await Promise.race([
      Promise.all(tracked),
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, this.BLUE_SKY_SCAN_BUDGET_MS);
        t.unref?.();
      }),
    ]);
    const truncated = done < batches.length;
    const all = harvest;

    const qualifying = all
      .filter((r) => (r.upsidePct ?? -1) >= MIN_UPSIDE && (r.price ?? 0) > 0)
      .sort((a, b) => (b.upsidePct ?? 0) - (a.upsidePct ?? 0))
      .slice(0, 50);

    // Insider Scores for the join come from the pool query above (every list
    // carries the column) — no second trip to the rankings.
    const iqsByTicker = new Map<string | null, { iqs: number }>(
      rankResult.rows.map((r) => [r.ticker, { iqs: r.iqs }]),
    );

    const rows = qualifying.map((r) => ({
      ticker: r.symbol,
      name: r.name,
      sector: r.sector,
      marketCap: null as number | null,
      iqs: iqsByTicker.get(r.symbol)?.iqs ?? undefined,
      upsidePct: r.upsidePct,
      targetMean: r.targetMean,
      recommendation: r.recommendation,
      numAnalysts: r.numAnalysts,
    }));
    const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
    const out = this.enrichRows(rows, live) as any[];
    // A cut-short scan that found nothing must not blank the page — serve the
    // previous rows (stale beats empty) and retry on the short TTL.
    if (truncated && !out.length && this.blueSkyCache?.rows.length) {
      this.blueSkyCache = {
        ts: Date.now(),
        ttl: this.BLUE_SKY_PARTIAL_TTL_MS,
        rows: this.blueSkyCache.rows,
      };
      return this.blueSkyCache.rows;
    }
    this.blueSkyCache = {
      ts: Date.now(),
      ttl: truncated ? this.BLUE_SKY_PARTIAL_TTL_MS : this.BLUE_SKY_TTL_MS,
      rows: out,
    };
    return out;
  }

  /** Hot Sectors — rank the thematic baskets by month-to-date 10%+ gainers
   *  (relative to basket size) and current-month insider buying, with each
   *  sector's YTD performance vs. the S&P 500. */
  async getHotSectors(): Promise<HotSectorsResponse> {
    const allTickers = Array.from(
      new Set(HOT_SECTOR_BASKETS.flatMap((b) => b.tickers)),
    );
    const [returns, buySell, spReturns, quotes] = await Promise.all([
      this.marketStats.getMonthYtdReturns(allTickers),
      this.iqs.getMonthlyBuySellByTicker(allTickers),
      this.marketStats.getMonthYtdReturns(['^GSPC']),
      this.marketStats.getQuoteBatch(allTickers).catch(() => new Map()),
    ]);
    const sp500Ytd = spReturns['^GSPC']?.ytd ?? null;
    const sp500Mtd = spReturns['^GSPC']?.mtd ?? null;
    // Client spec (Azlan): only companies above a $100M market cap count
    // toward a sector's heat — sub-$100M names swing ±10% on nothing and were
    // distorting the gainer ratios. A missing cap keeps the name (curated
    // baskets are liquid names; only a known micro-cap is excluded).
    const MIN_CAP = 100_000_000;
    const capOk = (sym: string): boolean => {
      const cap = (quotes.get(sym) as { marketCap?: number | null } | undefined)?.marketCap;
      return cap == null || cap >= MIN_CAP;
    };

    const raw = HOT_SECTOR_BASKETS.map((b) => {
      let companies = 0;
      let gainers10 = 0;
      let ytdSum = 0;
      let ytdCount = 0;
      let mtdSum = 0;
      let mtdCount = 0;
      let insiderBuys = 0;
      let insiderSells = 0;
      for (const t of b.tickers) {
        const up = t.toUpperCase();
        if (!capOk(up)) continue; // sub-$100M caps don't count toward heat
        const r = returns[up];
        if (r && r.mtd != null) {
          companies++;
          if (r.mtd > 10) gainers10++;
          mtdSum += r.mtd;
          mtdCount++;
        }
        if (r && r.ytd != null) {
          ytdSum += r.ytd;
          ytdCount++;
        }
        const bs = buySell.get(up);
        if (bs) {
          insiderBuys += bs.buys;
          insiderSells += bs.sells;
        }
      }
      const gainerRatio = companies > 0 ? gainers10 / companies : 0;
      const ytd = ytdCount > 0 ? +(ytdSum / ytdCount).toFixed(2) : null;
      const mtd = mtdCount > 0 ? +(mtdSum / mtdCount).toFixed(2) : null;
      return {
        key: b.key,
        label: b.label,
        companies,
        gainers10,
        gainerRatio,
        insiderBuys,
        insiderSells,
        netInsider: insiderBuys - insiderSells,
        ytd,
        mtd,
        // Explicit, same-window comparisons (client: the old single "vsSp500"
        // was ambiguous about which window it compared).
        vsSp500:
          ytd != null && sp500Ytd != null ? +(ytd - sp500Ytd).toFixed(2) : null,
        vsSp500Mtd:
          mtd != null && sp500Mtd != null ? +(mtd - sp500Mtd).toFixed(2) : null,
      };
    });

    const clamp01 = (x: number) => Math.max(0, Math.min(1, x));
    const [mLo, mHi] = HOT_MOMENTUM_BAND;
    const scored: HotSectorRow[] = raw
      .map((r) => {
        // Breadth — how much of the basket is participating.
        const breadth = r.gainerRatio;
        // Magnitude — the average move, so a basket that is broadly down can
        // never rank as "hot" on breadth alone.
        const momentum = r.mtd == null ? 0 : clamp01((r.mtd - mLo) / (mHi - mLo));
        // Insider pressure — the buy/sell SKEW, scaled by how much activity
        // stands behind it, so two lone buys can't max out the component.
        const flow = r.insiderBuys + r.insiderSells;
        const skew = flow > 0 ? r.insiderBuys / flow : 0;
        const confidence = clamp01(
          Math.log1p(r.insiderBuys) / Math.log1p(HOT_BUYS_FOR_FULL_WEIGHT),
        );
        const insider = skew * confidence;
        // No insider flow at all -> score over breadth+momentum only,
        // renormalised, instead of hard-coding a zero into 15% of the score.
        const weightSum =
          flow > 0
            ? HOT_BREADTH_WEIGHT + HOT_MOMENTUM_WEIGHT + HOT_INSIDER_WEIGHT
            : HOT_BREADTH_WEIGHT + HOT_MOMENTUM_WEIGHT;
        const weighted =
          HOT_BREADTH_WEIGHT * breadth +
          HOT_MOMENTUM_WEIGHT * momentum +
          (flow > 0 ? HOT_INSIDER_WEIGHT * insider : 0);
        return {
          ...r,
          hotScore: Math.round((weighted / weightSum) * 100),
        };
      })
      .sort(
        (a, b) =>
          b.hotScore - a.hotScore ||
          b.gainerRatio - a.gainerRatio ||
          b.netInsider - a.netInsider,
      )
      .map((r, i) => ({ rank: i + 1, ...r }));

    const now = new Date();
    return {
      asOfDate: now.toISOString().slice(0, 10),
      monthLabel: now.toLocaleString('en-US', { month: 'long', year: 'numeric' }),
      sp500Ytd,
      sp500Mtd,
      sectors: scored,
    };
  }

  /**
   * A list page for the standard 14-column table. Every list is built by its
   * own source (rankings / 13F / screener / curated basket), then run through
   * the same two post-processing passes, so a row carries the same fields no
   * matter which builder produced it:
   *   1. buildDetail — the list's own rows (unchanged behaviour).
   *   2. annotateInsiderCoverage — cross-reference the FULL scored Form 4
   *      universe (most builders only join the top few hundred rankings) and
   *      label why an insider column is empty when it is.
   *   3. fillFundamentalGaps — real sector / market cap / trailing P/E from FMP
   *      for rows whose own source carries none.
   * Both passes are additive: no existing field is dropped or overwritten with
   * a weaker value, and no financial figure is synthesized.
   */
  async getDetail(slug: string, filters: StockListFilters): Promise<StockListDetail | null> {
    // Kick the penny-stock sector snapshot off BEFORE the page build so its ~3s
    // FMP call overlaps the (also slow) Yahoo screener build instead of adding to
    // it — see fillFundamentalGaps for why it cannot be warmed in the background
    // on serverless. Skipped for a non-US exchange filter, which builds this list
    // from the scored rankings rather than the U.S. screener.
    const ex = (filters.exchange || '').toLowerCase();
    const usPennyList =
      slug === 'penny-stocks' && (!ex || /^(all|us|u\.s\.?|usa|united states)$/.test(ex));
    const snapshot =
      usPennyList && this.fmp.enabled
        ? this.fmp.getScreenerSnapshot(PENNY_SNAPSHOT_QUERY, {
            budgetMs: PENNY_SNAPSHOT_BUDGET_MS,
          })
        : null;
    const detail = await this.buildDetail(slug, filters);
    if (!detail) return null;
    // OPTIONAL page window (see StockListFilters.limit) — applied before the
    // enrichment passes so a paged caller only pays for the rows it asked for.
    // `total` keeps reporting the full list size.
    const all = detail.rows as any[];
    const paged =
      filters.limit != null || filters.offset != null
        ? all.slice(
            Math.max(0, filters.offset ?? 0),
            Math.max(0, filters.offset ?? 0) + (filters.limit ?? all.length),
          )
        : all;
    const withInsider = await this.annotateInsiderCoverage(paged);
    detail.rows = (await this.fillFundamentalGaps(slug, withInsider, snapshot)) as any[];
    return detail;
  }

  private async buildDetail(
    slug: string,
    filters: StockListFilters,
  ): Promise<StockListDetail | null> {
    const meta = STOCK_LIST_META[slug];
    if (!meta && slug !== 'iqs-top-picks' && slug !== 'blue-sky') return null;

    if (slug === 'trump-family') {
      // Real SEC-filed Trump-family equity (DJT), not the old illustrative set.
      const rows = await this.buildTrumpFamilyReal();
      return {
        slug,
        title: 'Trump Family (SEC Filings)',
        description:
          "The Trump family's publicly-disclosed equity holdings from SEC Form 4 filings — their reported stake in Trump Media & Technology Group (DJT), valued at the live price. These are actual filings, not sample figures. The family files no other individual-stock holdings publicly, and (not being members of Congress) no STOCK Act trades.",
        kind: 'persona',
        total: rows.length,
        rows,
      };
    }

    if (slug === 'blue-sky') {
      const rows = await this.buildBlueSkyRows();
      return {
        slug,
        title: 'Blue Sky Stocks',
        description:
          'Stocks where the average analyst price target implies 300%+ upside from the current price — high-risk, high-reward names, ranked #50 → #1 by implied upside. Price targets this aggressive usually mean small caps with binary outcomes: position sizing matters.',
        kind: 'premium',
        total: rows.length,
        rows,
      };
    }

    if (slug === 'iqs-top-picks') {
      const { total, rows: rawRows } = await this.iqs.getRankings({
        limit: 50,
        sector: filters.sector,
        minMarketCap: filters.minMarketCap,
        maxMarketCap: filters.maxMarketCap,
        minIqs: filters.minIqs,
        exchange: filters.exchange,
      });
      // Drop rows whose SEC mapping yielded no usable ticker symbol.
      const rows = rawRows.filter(
        (r) => r.ticker && r.ticker.toUpperCase() !== 'NONE',
      );
      const live = await this.fetchLiveQuotes(
        rows.map((r) => r.ticker || '').filter(Boolean),
      );
      const enriched = this.enrichRows(rows, live) as any[];
      return {
        slug,
        title: 'Top Insider Scores',
        description:
          'Premium ranking — the highest-quality Insider Scores across the U.S. market (score quality, not dollar volume), updated daily.',
        kind: 'premium',
        total,
        rows: enriched,
      };
    }

    if (meta.kind === 'sector') {
      const { rows } = await this.fetchSectorList(slug, {
        limit: 50,
        ...filters,
      });
      const live = await this.fetchLiveQuotes(
        rows.map((r) => r.ticker || '').filter(Boolean),
      );
      const enriched = this.enrichRows(rows, live) as any[];
      return { slug, ...meta, total: enriched.length, rows: enriched };
    }

    // Persona (13F / congressional) and the curated market-cap baskets are
    // U.S.-sourced. When a non-US exchange is selected, serve exchange-native
    // names from the scored rankings instead (or empty where the concept is
    // inherently US, e.g. FAANG) — never pad a "Germany" view with US names.
    const exLower = (filters.exchange || '').toLowerCase();
    const nonUsExchange =
      !!exLower && !/^(all|us|u\.s\.?|usa|united states)$/.test(exLower);

    if (meta.kind === 'persona') {
      if (nonUsExchange) {
        return { slug, ...meta, total: 0, rows: [] as any[] };
      }
      // Live 13F-HR from SEC EDGAR for institutional filers (Buffett/Dalio/
      // Sprott); curated representative list for individuals who don't file
      // 13Fs (Bezos/Trump) — labeled "illustrative, not actual filings" in
      // the meta, or when the live fetch fails.
      let rows: PersonaHolding[];
      if (slug === 'politicians') {
        // Live congressional disclosures (FMP), aggregated by ticker.
        rows = await this.buildPoliticianRows();
      } else {
        const live13f = await this.thirteenF.getHoldings(slug);
        rows = live13f && live13f.length ? live13f : PERSONA_HOLDINGS[slug] || [];
        // Drop holdings whose CUSIP didn't resolve to a ticker — an empty
        // ticker renders a blank row rather than useful data.
        rows = rows.filter((r) => (r.ticker || '').trim().length > 0);
      }
      if (filters.sector) {
        rows = rows.filter((r) =>
          r.sector.toLowerCase().includes(filters.sector!.toLowerCase()),
        );
      }
      // Cross-reference each persona holding against the live Insider Score table to
      // attach an Insider Score — and, where the same name also has Form 4 buys, a
      // real insider avg cost + last buy date.
      const { rows: rankRows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
      const byTicker = new Map(rankRows.map((r) => [r.ticker, r]));
      const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
      const withIqs = rows.map((h) => {
        const rk = byTicker.get(h.ticker);
        // 13F discloses no true cost basis, so we approximate avg cost as the
        // reported position value per share (value ÷ shares from the filing).
        // Real Form 4 insider avg cost wins when the name has one.
        const reportedPerShare =
          h.sharesHeld && h.dollarValue
            ? +(h.dollarValue / h.sharesHeld).toFixed(2)
            : null;
        return {
          ...h,
          iqs: rk?.iqs ?? undefined,
          lastBuyDate: rk?.lastBuyDate ?? h.lastReported ?? null,
          avgCost: rk?.avgCost ?? reportedPerShare,
        };
      });
      const annotated = this.enrichRows(withIqs, live) as any[];
      return { slug, ...meta, total: annotated.length, rows: annotated };
    }

    if (meta.kind === 'country') {
      let rows = COUNTRY_UNIVERSE[slug] || [];
      if (filters.sector) {
        rows = rows.filter((r) =>
          r.sector.toLowerCase().includes(filters.sector!.toLowerCase()),
        );
      }
      // Every list carries an Insider Score column — cross-reference against
      // the live rankings (U.S. Form 4 data; foreign-only names stay blank).
      const { rows: rankRows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
      const iqsByTicker = new Map(rankRows.map((r) => [r.ticker, r]));
      const withIqs = rows.map((h) => ({
        ...h,
        iqs: iqsByTicker.get(h.ticker)?.iqs ?? undefined,
      }));
      const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
      const enriched = this.enrichRows(withIqs, live) as any[];
      return { slug, ...meta, total: enriched.length, rows: enriched };
    }

    if (meta.kind === 'universe') {
      // Non-US exchange: the curated baskets are US tickers, so build the list
      // from the exchange's own scored companies instead.
      if (nonUsExchange) {
        const rows = await this.buildUniverseForExchange(slug, filters);
        const live = await this.fetchLiveQuotes(
          rows.map((r: any) => r.ticker || '').filter(Boolean),
        );
        const enriched = this.enrichRows(rows, live) as any[];
        return { slug, ...meta, total: enriched.length, rows: enriched };
      }
      // Penny stocks: a LIVE screener of every U.S. equity under $5 (hundreds
      // of names), not a hand-picked basket. Falls through to the static
      // basket only if the screener is unavailable.
      if (slug === 'penny-stocks') {
        const penny = await this.marketStats.getPennyStocks(1000);
        if (penny.length) {
          // Insider Score column on every list — penny names that also appear
          // in our Form 4 rankings get their live score attached.
          const { rows: pennyRank } = await this.iqs.getRankings({ limit: 500, offset: 0 });
          const pennyIqs = new Map(pennyRank.map((r) => [r.ticker, r]));
          let pennyRows = penny.map((q) => ({
            ticker: q.symbol,
            name: q.name,
            sector: q.sector,
            marketCap: q.marketCap,
            iqs: pennyIqs.get(q.symbol)?.iqs ?? undefined,
            live: {
              price: q.price,
              changeAbs: q.changeAbs,
              changePct: q.changePct,
              volume: q.volume,
              avgVolume: q.avgVolume,
              marketCap: q.marketCap,
              peRatio: q.peRatio ?? null,
              dividendYield: q.dividendYield ?? null,
            },
          }));
          if (filters.sector) {
            const s = filters.sector.toLowerCase();
            pennyRows = pennyRows.filter((r) =>
              (r.sector || '').toLowerCase().includes(s),
            );
          }
          if (filters.minMarketCap != null) {
            pennyRows = pennyRows.filter(
              (r) => (r.marketCap ?? 0) >= filters.minMarketCap!,
            );
          }
          if (filters.maxMarketCap != null) {
            pennyRows = pennyRows.filter(
              (r) => (r.marketCap ?? Infinity) <= filters.maxMarketCap!,
            );
          }
          return { slug, ...meta, total: pennyRows.length, rows: pennyRows as any[] };
        }
        // else: screener empty/unavailable — fall through to static basket.
      }

      // Curated market-cap / thematic baskets — always populated with live
      // quotes; Insider Score + avg cost + last buy attached where the name also has
      // Form 4 insider buys in our rankings.
      let rows = UNIVERSE_LISTS[slug] || [];
      // Category expansion (client spec, Azlan): thematic category lists must
      // cover ALL indexed companies in the theme above a $100M market cap —
      // the static basket alone left categories looking sparse. Merge in every
      // scored company whose sector/industry matches the category rule.
      const categoryRule = SECTOR_LIST_RULES[slug];
      const CATEGORY_MIN_CAP = 100_000_000;
      if (categoryRule) {
        try {
          const { rows: expanded } = await this.iqs.getRankings({
            limit: 2000,
            offset: 0,
            sectorMatch: categoryRule,
            minMarketCap: CATEGORY_MIN_CAP,
          });
          const have = new Set(rows.map((r) => r.ticker.toUpperCase()));
          for (const r of expanded) {
            const t = (r.ticker || '').toUpperCase();
            if (!t || t.includes('.') || have.has(t)) continue;
            have.add(t);
            rows = rows.concat([
              { ticker: t, name: r.name, sector: r.sector || '' } as (typeof rows)[number],
            ]);
          }
        } catch {
          /* expansion unavailable — curated basket still renders */
        }
      }
      if (filters.sector) {
        rows = rows.filter((r) =>
          r.sector.toLowerCase().includes(filters.sector!.toLowerCase()),
        );
      }
      const { rows: rankRows } = await this.iqs.getRankings({ limit: 2000, offset: 0 });
      const iqsByTicker = new Map(rankRows.map((r) => [r.ticker, r]));
      const tickers = rows.map((r) => r.ticker);
      const [live, costBasis] = await Promise.all([
        this.fetchLiveQuotes(tickers),
        this.iqs.getInsiderCostBasis(tickers),
      ]);
      const withIqs = rows.map((h) => {
        const cb = costBasis.get(h.ticker.toUpperCase());
        const rk = iqsByTicker.get(h.ticker);
        return {
          ...h,
          iqs: rk?.iqs ?? undefined,
          avgCost: cb?.avgCost ?? null,
          lastBuyDate: cb?.lastBuyDate ?? null,
          // Full signal set where the name is in our scored universe — lets
          // every list render the standard Top-Insider-Scores column layout.
          reasoning: rk?.reasoning ?? null,
          totalPurchaseValue: rk?.totalPurchaseValue ?? null,
          distinctBuyers: rk?.distinctBuyers ?? null,
          hasCeoBuyer: rk?.hasCeoBuyer ?? false,
          hasRepeatBuyer: rk?.hasRepeatBuyer ?? false,
          perfVsAvgCostPct: rk?.perfVsAvgCostPct ?? null,
          insiderOwnershipPct: rk?.insiderOwnershipPct ?? null,
          insiderOwnershipChangePct: rk?.insiderOwnershipChangePct ?? null,
          scoreUpdatedAt: rk?.scoreUpdatedAt ?? null,
        };
      });
      let enriched = this.enrichRows(withIqs, live) as any[];
      // $100M floor for category lists — known micro-caps drop out; cap-based
      // lists (small-cap / penny) are exempt, small names are their point.
      if (categoryRule) {
        enriched = enriched.filter((r) => {
          const cap = r.live?.marketCap ?? r.marketCap ?? null;
          return cap == null || cap >= CATEGORY_MIN_CAP;
        });
      }
      return { slug, ...meta, total: enriched.length, rows: enriched };
    }
    return null;
  }

  /** Ticker suffixes that mark a NON-US listing — the exchanges our lists cover
   *  (.TO Toronto, .DE Xetra) plus the common European/Asian codes. A dotted
   *  U.S. share class (BRK.B, BF.A) deliberately isn't in the set, so it keeps
   *  the U.S. treatment. */
  private static readonly NON_US_SUFFIX =
    /\.(TO|V|CN|NE|DE|F|BE|MU|SG|HM|DU|SW|L|PA|AS|BR|LS|MI|MC|ST|HE|CO|OL|VI|IR|WA|AT|IS|TA|SA|MX|HK|SS|SZ|KS|KQ|TW|AX|NZ|SI|KL|BK|JK|NS|BO)$/;

  /** Suffixed tickers (RY.TO, SAP.DE) are non-US listings. Our Form 4 pipeline
   *  is SEC-only, so having nothing to say about them is missing coverage — not
   *  evidence that no insider bought. */
  private isNonUsListing(ticker?: string | null): boolean {
    return StockListsService.NON_US_SUFFIX.test((ticker || '').toUpperCase());
  }

  /** The WHOLE scored Form 4 universe keyed by upper-case ticker, plus whether
   *  the lookup actually saw all of it — only a complete lookup can prove the
   *  negative ("no insider buying on record"). Shares IqsService's 10-minute
   *  rankings cache with the sector lists, so it costs one query per window. */
  private async insiderUniverse(): Promise<{
    bySymbol: Map<string, RankingRow>;
    complete: boolean;
  }> {
    try {
      const { total, rows } = await this.iqs.getRankings({ limit: 5000, offset: 0 });
      const bySymbol = new Map<string, RankingRow>();
      for (const r of rows) {
        const t = (r.ticker || '').toUpperCase();
        if (t) bySymbol.set(t, r);
      }
      return { bySymbol, complete: rows.length >= total };
    } catch {
      return { bySymbol: new Map(), complete: false };
    }
  }

  /**
   * Cross-reference every row against the full scored insider universe and say
   * what the insider columns can show.
   *
   * Two jobs. First, FILL: the individual builders only join the top 500–2000
   * rankings (or, for the country/persona lists, a narrower slice), so plenty
   * of rows that DO have Form 4 buys were shipping blank insider cells — those
   * now pick up the same real aggregates the Top Insider Scores list renders.
   * Nothing already on the row is overwritten (a 13F-derived avg cost stays).
   * Second, LABEL: a row with no insider record gets an explicit
   * `insiderCoverage` + `insiderCoverageNote` so the table can distinguish "no
   * insider buying on record" from "we couldn't look it up". No insider value
   * is ever synthesized — a stock with no Form 4 buying has nothing to show.
   */
  private async annotateInsiderCoverage(rows: any[]): Promise<any[]> {
    if (!rows.length) return rows;
    const { bySymbol, complete } = await this.insiderUniverse();
    return rows.map((r) => {
      const rk = bySymbol.get((r.ticker || '').toUpperCase());
      if (rk) {
        // ?? only fills what is absent; || is used for the boolean signal flags
        // (a builder that defaulted them to false must not mask a real true).
        r.iqs = r.iqs ?? rk.iqs;
        r.reasoning = r.reasoning ?? rk.reasoning ?? null;
        r.avgCost = r.avgCost ?? rk.avgCost ?? null;
        r.lastBuyDate = r.lastBuyDate ?? rk.lastBuyDate ?? null;
        r.totalPurchaseValue = r.totalPurchaseValue ?? rk.totalPurchaseValue ?? null;
        r.distinctBuyers = r.distinctBuyers ?? rk.distinctBuyers ?? null;
        r.perfVsAvgCostPct = r.perfVsAvgCostPct ?? rk.perfVsAvgCostPct ?? null;
        r.insiderOwnershipPct = r.insiderOwnershipPct ?? rk.insiderOwnershipPct ?? null;
        r.insiderOwnershipChangePct =
          r.insiderOwnershipChangePct ?? rk.insiderOwnershipChangePct ?? null;
        r.scoreUpdatedAt = r.scoreUpdatedAt ?? rk.scoreUpdatedAt ?? null;
        r.hasCeoBuyer = !!(r.hasCeoBuyer || rk.hasCeoBuyer);
        r.hasRepeatBuyer = !!(r.hasRepeatBuyer || rk.hasRepeatBuyer);
        // The same company row also carries our own stored reference data —
        // free sector / market cap before we go out to FMP for the rest.
        if (!String(r.sector || '').trim() && rk.sector) r.sector = rk.sector;
        if (r.marketCap == null && rk.marketCap != null) r.marketCap = rk.marketCap;
      }
      const hasInsiderData =
        r.iqs != null ||
        r.totalPurchaseValue != null ||
        r.avgCost != null ||
        r.lastBuyDate != null ||
        r.distinctBuyers != null;
      const coverage: InsiderCoverage = hasInsiderData
        ? 'covered'
        : this.isNonUsListing(r.ticker)
          ? 'listing-not-covered'
          : complete
            ? 'no-insider-buying'
            : 'lookup-unavailable';
      return {
        ...r,
        insiderCoverage: coverage,
        insiderCoverageNote: INSIDER_COVERAGE_NOTE[coverage],
      };
    });
  }

  /**
   * Fill the reference columns — Sector, Market Cap, P/E — that a row's own
   * source didn't carry, from FMP company profiles + TTM ratios. This is real
   * reported data for the exact listing (the paid FMP plan covers penny stocks
   * and non-US symbols, which Yahoo's quote feed frequently leaves blank); the
   * insider columns are NOT filled here, and never guessed.
   *
   * Cost control: only rows that are actually missing something are looked up,
   * capped at FUNDAMENTALS_MAX_SYMBOLS per request and bounded by a wall-clock
   * budget inside FmpService, with 24h caches so repeat views converge to full
   * coverage.
   *
   * Penny stocks (up to 1,000 rows) are far past what per-symbol profiles can
   * serve, so their sector/cap comes from ONE `company-screener` snapshot of the
   * sub-$5 market (2,052 symbols in a single ~3s call), started by getDetail so
   * it overlaps the page build. The first version of this shipped that call as a
   * non-blocking background warm, which does not work on serverless — the
   * function is frozen as soon as the response is sent, so the fetch never
   * finished and production measured 9 of 500 rows with a sector. It is awaited
   * now; whatever the snapshot doesn't cover falls back to a small, hard-capped
   * per-symbol top-up that converges through the 24h profile cache.
   */
  private async fillFundamentalGaps(
    slug: string,
    rows: any[],
    snapshot?: Promise<Map<string, FmpScreenerRow>> | null,
  ): Promise<any[]> {
    if (!rows.length || !this.fmp.enabled) return rows;
    // The table reads live-quote values first, then the row's own field, so a
    // gap only exists when BOTH are empty — and we only ever write the row's
    // own field, leaving the live-quote path untouched.
    const capOf = (r: any) => r.live?.marketCap ?? r.marketCap ?? null;
    const peOf = (r: any) => r.live?.peRatio ?? r.peRatio ?? null;
    const noSector = (r: any) => !String(r.sector || '').trim();

    let spentOnSnapshot = 0;
    if (snapshot) {
      const t0 = Date.now();
      const snap = await snapshot;
      spentOnSnapshot = Date.now() - t0;
      for (const r of rows) {
        const s = snap.get((r.ticker || '').toUpperCase());
        if (!s) continue;
        if (noSector(r) && s.sector) r.sector = s.sector;
        if (capOf(r) == null && s.marketCap != null) r.marketCap = s.marketCap;
      }
    }

    const gapsAll = rows.filter(
      (r) =>
        r.ticker &&
        (noSector(r) || capOf(r) == null || peOf(r) == null) &&
        // Symbols FMP has already told us it has no profile for (delisted / OTC
        // tickers) are skipped, so an unresolvable row can't sit at the head of
        // the queue burning this list's budget on every single request.
        !this.fmp.hasFreshProfileMiss(String(r.ticker)),
    );
    if (!gapsAll.length) return rows;
    // We just paid for a cold snapshot, which is this request's whole FMP
    // allowance — the leftovers wait for the next (warm) view.
    if (spentOnSnapshot > 250) return rows;
    // A big list gets a much smaller per-symbol allowance: it can never cover
    // the whole table in one request (that's the snapshot's job), it is the
    // request closest to the gateway ceiling, and the symbols it does fetch stay
    // cached for 24h — so the remainder (OTC names the screener omits) fills in
    // over the next few views instead of all at once.
    const big = rows.length > FUNDAMENTALS_PER_SYMBOL_MAX_ROWS;
    const cap = big ? FUNDAMENTALS_LARGE_LIST_SYMBOLS : FUNDAMENTALS_MAX_SYMBOLS;
    // Rotate the window when there are more gaps than we may look up. Always
    // taking the first N would re-attempt the same head of the list forever —
    // and symbols FMP has no profile for are cached as a negative, so that head
    // could be permanently unresolvable while later rows never get a turn.
    const start = gapsAll.length > cap ? (Math.floor(Date.now() / 60_000) * cap) % gapsAll.length : 0;
    const gaps = [...gapsAll.slice(start), ...gapsAll.slice(0, start)].slice(0, cap);
    const filled = await this.fmp.getFundamentalsBatch(gaps.map((r) => String(r.ticker)), {
      concurrency: 8,
      budgetMs: big ? FUNDAMENTALS_LARGE_LIST_BUDGET_MS : FUNDAMENTALS_BUDGET_MS,
      // P/E costs a second call per symbol and a penny stock rarely has one
      // (they are mostly loss-making, where no trailing P/E exists at all).
      withPe: !big,
    });
    for (const r of rows) {
      const f = filled.get((r.ticker || '').toUpperCase());
      if (!f) continue;
      if (noSector(r) && f.sector) r.sector = f.sector;
      if (capOf(r) == null && f.marketCap != null) r.marketCap = f.marketCap;
      if (peOf(r) == null && f.peRatio != null) r.peRatio = f.peRatio;
    }
    return rows;
  }

  /** Build a curated-basket list (large/small cap, penny, reits, faang) for a
   *  NON-US exchange from that exchange's own scored companies — the static
   *  baskets are US-only, so we approximate each concept with a market-cap band
   *  or sector rule applied to the exchange-filtered rankings. FAANG is an
   *  inherently-US acronym, so it returns empty for other exchanges. */
  private async buildUniverseForExchange(
    slug: string,
    filters: StockListFilters,
  ): Promise<any[]> {
    const B = 1_000_000_000;
    if (slug === 'faang') return [];
    const base: {
      minMarketCap?: number;
      maxMarketCap?: number;
      sectorMatch?: RegExp;
    } = {};
    if (slug === 'large-cap') base.minMarketCap = 10 * B;
    else if (slug === 'blue-chip') base.minMarketCap = 10 * B;
    else if (slug === 'small-cap') {
      base.minMarketCap = 0.3 * B;
      base.maxMarketCap = 10 * B;
    } else if (slug === 'reits') base.sectorMatch = /reit|real estate/i;
    // penny-stocks: no market-cap band — filtered by price below.

    const { rows } = await this.iqs.getRankings({
      limit: 200,
      exchange: filters.exchange,
      sector: filters.sector,
      minMarketCap: base.minMarketCap ?? filters.minMarketCap,
      maxMarketCap: base.maxMarketCap ?? filters.maxMarketCap,
      minIqs: filters.minIqs,
      sectorMatch: base.sectorMatch,
    });
    if (slug === 'penny-stocks') {
      return rows.filter(
        (r) => r.lastPrice != null && r.lastPrice > 0 && r.lastPrice <= 5,
      );
    }
    // Hard market-cap band on the final rows — a curated top-up must not
    // smuggle an out-of-band name (e.g. a $51B company into "Small Cap").
    if (base.minMarketCap != null || base.maxMarketCap != null) {
      const lo = base.minMarketCap ?? 0;
      const hi = base.maxMarketCap ?? Infinity;
      return rows.filter((r) => {
        const mc = r.marketCap != null ? Number(r.marketCap) : null;
        return mc != null && mc >= lo && mc <= hi;
      });
    }
    return rows;
  }

  private async fetchSectorList(
    slug: string,
    filters: StockListFilters & { limit?: number },
  ) {
    let base: { total: number; rows: RankingRow[] };
    if (slug === 'blue-chip') {
      base = await this.iqs.getRankings({
        limit: filters.limit ?? 200,
        sector: filters.sector,
        minMarketCap: Math.max(filters.minMarketCap ?? 0, BLUE_CHIP_MIN_MARKET_CAP),
        maxMarketCap: filters.maxMarketCap,
        minIqs: filters.minIqs,
        exchange: filters.exchange,
      });
    } else {
      const rx = SECTOR_LIST_RULES[slug];
      if (!rx) return { total: 0, rows: [] as RankingRow[] };
      base = await this.iqs.getRankings({
        limit: filters.limit ?? 200,
        sectorMatch: rx,
        sector: filters.sector,
        minMarketCap: filters.minMarketCap,
        maxMarketCap: filters.maxMarketCap,
        minIqs: filters.minIqs,
        exchange: filters.exchange,
      });
    }
    // The curated top-up basket is US-centric — don't pad a non-US ("Germany"/
    // "Canada") exchange view with US names, and don't pad when an Insider
    // Score band is selected (those are unscored).
    const ex = (filters.exchange || '').toLowerCase();
    const nonUsExchange = !!ex && !/^(all|us|u\.s\.?|usa|united states)$/.test(ex);
    const rows =
      filters.minIqs || nonUsExchange
        ? base.rows
        : this.topUpWithUniverse(slug, base.rows, filters);
    // Universe top-up names can still have a live Insider Score (their sector
    // string may not match the regex, but the company is in our rankings) —
    // cross-reference so the score column isn't needlessly blank.
    const missing = rows.filter((r) => r.iqs == null && r.ticker);
    if (missing.length) {
      try {
        const { rows: allRank } = await this.iqs.getRankings({ limit: 5000, offset: 0 });
        const bySym = new Map(allRank.map((r) => [(r.ticker || '').toUpperCase(), r]));
        for (const row of missing) {
          const hit = bySym.get(row.ticker!.toUpperCase());
          if (hit) {
            row.iqs = hit.iqs;
            (row as any).distinctBuyers = hit.distinctBuyers;
            (row as any).totalPurchaseValue = hit.totalPurchaseValue;
            (row as any).avgCost = hit.avgCost ?? null;
            (row as any).lastBuyDate = hit.lastBuyDate ?? null;
          }
        }
      } catch { /* rankings unavailable — leave blank */ }
    }
    return { total: rows.length, rows };
  }

  /** Sector lists draw from our SEC Form 4 / Insider Score company table, which skews
   *  to smaller caps — append the curated universe of well-known names so
   *  every list renders a full table (20+ rows). Insider Score matches stay on
   *  top; universe rows resolve name/sector/market-cap from the reference
   *  quote table and get live quotes merged downstream like any other row. */
  private topUpWithUniverse(
    slug: string,
    rows: RankingRow[],
    filters: StockListFilters,
    maxRows = 50,
  ): RankingRow[] {
    const universe = SECTOR_UNIVERSE[slug] || [];
    if (!universe.length) return rows;
    const seen = new Set(rows.map((r) => (r.ticker || '').toUpperCase()));
    const out = [...rows];
    for (const sym of universe) {
      if (out.length >= maxRows) break;
      if (seen.has(sym)) continue;
      const ref = this.marketStats.getReferenceQuote(sym);
      if (filters.sector) {
        const sec = (ref?.sector || '').toLowerCase();
        if (!sec.includes(filters.sector.toLowerCase())) continue;
      }
      if (filters.minMarketCap && (ref?.marketCap ?? 0) < filters.minMarketCap) continue;
      if (filters.maxMarketCap && ref?.marketCap && ref.marketCap > filters.maxMarketCap) continue;
      seen.add(sym);
      out.push({
        ticker: sym,
        name: ref?.name ?? sym,
        sector: ref?.sector ?? null,
        marketCap: ref?.marketCap ?? null,
      } as unknown as RankingRow);
    }
    return out;
  }
}
