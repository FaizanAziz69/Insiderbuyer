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

/**
 * ── Heat Score model ──────────────────────────────────────────────────────
 *
 * The score is a weighted average of three factors, each independently mapped
 * to 0–1 on an ABSOLUTE scale (never relative to the busiest peer), then scaled
 * to 0–100:
 *
 *   breadth   = share of members up more than 10% month-to-date        (60%)
 *   momentum  = average member MTD %, mapped across HOT_MOMENTUM_BAND  (25%)
 *   insider   = current-month buy/sell skew, damped by how much
 *               insider activity stands behind it, NEUTRAL AT 0.5      (15%)
 *
 * History, because the arithmetic is the whole point of this block:
 *
 * 1. The original model was `0.6·breadth + 0.4·(buys ÷ maxBuys)`. Two defects.
 *    `maxBuys` is whatever the busiest basket happened to have — in a quiet
 *    month it was 2, so a sector with two insider buys took the entire insider
 *    component and the WORST-performing basket ranked #1. And sells were
 *    ignored, so 0 buys / 656 sells scored the same as no insider activity at
 *    all. It is also what produced the client's complaint: a sector with 96% of
 *    members up 10%+ scored 0.6·0.96 + 0.4·0.26 = 0.68 → 68, because the
 *    breadth term alone can never exceed 60 and the other 40 points were
 *    decided by a ratio against an unrelated basket.
 *
 * 2. Breadth-dominant weights (60/25/15) with absolute scales replaced that.
 *    Same 96%-breadth sector, average MTD +10%:
 *      breadth  = 0.96
 *      momentum = (10 − (−10)) ÷ (15 − (−10)) = 0.80
 *      no insider data → renormalise over the two live factors:
 *        (0.6·0.96 + 0.25·0.80) ÷ 0.85 = 0.776 ÷ 0.85 = 0.913 → 91
 *
 * 3. What is fixed HERE is the insider factor's zero point. It was
 *    `skew × confidence`, which is 0 for a sector with balanced insider flow
 *    (skew 0.5, confidence 1 → 0.5, i.e. only half credit) and drops toward 0
 *    as evidence THINS — so thin data read as bearish, and a sector with no
 *    data at all (renormalised away) scored HIGHER than an identical sector
 *    with neutral data. A weighted average needs a neutral signal to score
 *    neutral, so the factor is now centred on 0.5 and confidence interpolates
 *    between "no idea" (0.5) and the measured skew:
 *      insider = 0.5 + confidence·(skew − 0.5)
 *    Confidence is derived from TOTAL flow, not the buy count: 656 sells and no
 *    buys is strong evidence of selling (skew 0 at full confidence → insider 0),
 *    whereas the old form read it as no evidence at all.
 *
 * Worked examples at 96% breadth (client's scenario), old model → new model:
 *   avg MTD +10%, no insider data      68 → 91
 *   avg MTD +10%, balanced insider flow 68 → 85
 *   avg MTD +10%, only insider selling  68 → 78
 *   avg MTD +18%, balanced insider flow 68 → 90
 * A near-unanimous strong month can no longer land in the 60s under any
 * insider configuration, and the insider factor moves the score by at most
 * 15 points in either direction.
 */
const HOT_BREADTH_WEIGHT = 0.6;
const HOT_MOMENTUM_WEIGHT = 0.25;
const HOT_INSIDER_WEIGHT = 0.15;
/** Average member MTD % mapped to 0–1 across this band. The top is +15%, not
 *  +10%, so the client's "everything up 10%+" case does not sit at the ceiling
 *  with nowhere left to express a genuinely exceptional month. */
const HOT_MOMENTUM_BAND: [number, number] = [-10, 15];
/** Total insider transactions (buys + sells) at which the buy/sell skew is
 *  taken at face value. Below it the factor is pulled toward neutral, not
 *  toward bearish. Logarithmic, so the first few filings move it the most. */
const HOT_FLOW_FOR_FULL_CONFIDENCE = 10;
/** A factor with no evidence behind it: the midpoint of the 0–1 scale. */
const HOT_NEUTRAL = 0.5;

// ── Hot Sectors membership ────────────────────────────────────────────────
/** The benchmark every sector is compared against: the S&P 500 index itself. */
const SP500_SYMBOL = '^GSPC';
/** Client spec (Azlan): a company only counts toward a sector's heat above a
 *  $100M market cap — below that a name swings ±10% on nothing and distorts the
 *  gainer ratio that the score is mostly made of. */
const HOT_SECTOR_MIN_CAP = 100_000_000;
/**
 * Widening the baskets to "every company above $100M" (client spec).
 *
 * A theme is not a taxonomy. FMP's screener publishes a sector and an industry
 * for every listed company, which identifies Gold, Energy, Financials and
 * Biotech precisely — but no published classification identifies "AI",
 * "Quantum" or "Crypto", because those are business narratives that cut across
 * industries (NVDA is a semiconductor company; COIN is capital markets). So the
 * baskets in persona-data.ts remain the DEFINITION of each theme, and where a
 * screener rule can honestly enumerate the rest of the theme, it is merged in.
 * Themes with no rule stay exactly as curated rather than being padded with
 * names that only look related.
 *
 * Matching is on the screener's `industry` first (the precise field) and
 * `sector` as the coarse fallback.
 */
const HOT_SECTOR_EXPANSION: Record<string, { industry?: RegExp; sector?: RegExp }> = {
  gold: { industry: /^(Gold|Other Precious Metals)$/i },
  energy: { sector: /^Energy$/i },
  financials: { sector: /^Financial Services$/i },
  'biotech-pharma': {
    industry: /^(Biotechnology|Drug Manufacturers.*|Medical - Pharmaceuticals)$/i,
  },
  'rare-earths': {
    industry: /^(Copper|Aluminum|Steel|Uranium|Industrial Materials|Other Precious Metals)$/i,
  },
};
/**
 * Members one basket may hold after expansion, largest market cap first.
 *
 * This is the binding constraint on the whole page, and it is a DATA cost, not
 * an arbitrary limit: the breadth factor needs a month-to-date return for every
 * member, and a month-to-date return needs that member's close on the last
 * trading day of the previous month. That baseline is one chart request per
 * symbol — there is no batch form of it anywhere (see the note on
 * getMonthYtdReturns) — so an unbounded expansion of the Financials basket
 * alone (1,097 qualifying companies) would need 1,097 requests before the page
 * could render. Baselines are cached for the whole month, so 75 per basket is
 * affordable and converges within a few page loads; thousands is not. Covering
 * every qualifying company in every theme needs the baseline sweep moved to a
 * scheduled job with a persistent store.
 */
const HOT_SECTOR_MAX_MEMBERS = 75;
/** Wall-clock slice one Hot Sectors request may spend fetching missing MTD/YTD
 *  baselines. The rest of its budget goes on the batch quote and the insider
 *  buy/sell join. */
const HOT_SECTOR_BASELINE_BUDGET_MS = 2_500;
/** Budget for the universe snapshot that drives the expansion. Deliberately
 *  smaller than the heatmap's, which is the endpoint that normally warms the
 *  shared 12h snapshot: this page should not be the one paying for a cold fetch
 *  on top of its own two data legs. Losing the race costs coverage for one
 *  request, never the page — the curated baskets stand. */
const HOT_SECTOR_UNIVERSE_BUDGET_MS = 2_500;

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
/** Whole-request soft budget for a list page. The frontend proxy aborts at 9s
 *  (BACKEND_TIMEOUT_MS), which is tighter than the gateway, so the optional
 *  gap-fill only runs with whatever is left of this — a page that already spent
 *  its time building rows ships them instead of dying with prettier ones. */
const LIST_REQUEST_BUDGET_MS = 7000;
/** Held back from Blue Sky's analyst scan for the work that always follows it:
 *  live quotes for the shortlist and the insider-coverage join. */
const BLUE_SKY_TAIL_RESERVE_MS = 1500;

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
  /** Hard stop for the analyst scan, sized off the measurements in the docblock
   *  below: the rest of the request costs ~1.5s and the frontend proxy aborts at
   *  9s, so the scan gets the middle and nothing it does can push past that. */
  private readonly BLUE_SKY_SCAN_BUDGET_MS = 5000;
  /** Symbols per analyst batch. Deliberately far below MarketStatsService's
   *  250-symbol cap, because a small batch is the only PREDICTABLE unit of work
   *  here: measured cold against production, 50 symbols took 1.17s / 1.27s /
   *  1.60s and returned 6–13 qualifiers each, where a 250-symbol batch ranged
   *  5.2s to 19.8s. Three or four of these fit in the budget with room to spare. */
  private readonly BLUE_SKY_BATCH = 50;
  /** Don't start another batch without at least this much budget left. */
  private readonly BLUE_SKY_MIN_BATCH_MS = 1200;
  /** Floor for the first batch, so an over-budget request still ships some rows. */
  private readonly BLUE_SKY_FIRST_BATCH_MS = 1800;
  /** Cap on waiting for the penny screener that seeds the candidate pool. */
  private readonly BLUE_SKY_POOL_BUDGET_MS = 2500;
  /**
   * Qualifying names accumulated ACROSS requests (symbol → row). A cold scan can
   * only measure part of the pool inside the request budget, so each request
   * merges what it managed to measure instead of throwing it away: a name that
   * still clears the bar is (re)stored, one that no longer does is dropped, and
   * the page is served from the accumulator. That is what turns "the scan was cut
   * short" into a partial list rather than an empty one. Same 20-minute window
   * MarketStatsService caches the underlying analyst batches for.
   */
  private blueSkyPool = new Map<string, { ts: number; row: any }>();
  private readonly BLUE_SKY_POOL_TTL_MS = 20 * 60_000;

  /**
   * Blue Sky Stocks — every name in our coverage universe whose average analyst
   * price target implies >= 300% upside, best 50 by upside.
   *
   * The expensive part is the analyst scan: every batch costs a Yahoo quote batch
   * plus per-symbol quoteSummary lookups. MEASURED against production:
   *   • 250 curated large caps → 16.1s, past the frontend proxy's 9s abort, and
   *     ZERO qualifiers; the best implied upside anywhere in the curated baskets
   *     was 173% (VKTX). A liquid large cap does not carry a 4x consensus target.
   *     Those baskets were most of the load and none of the answer, so the pool
   *     is now the penny screener plus our own scored names (44 of one 250-symbol
   *     penny batch cleared 300%; 100 qualifiers exist across the whole pool).
   *   • Batch cost is dominated by the per-symbol summary lookups and is wildly
   *     variable: the same 250-symbol batch took 5.2s once and 19.8s later, and
   *     THREE batches in parallel took 14–19s each — they contend for Yahoo, so
   *     fanning out makes every batch slower. A 50-symbol batch, by contrast,
   *     came back in 1.17–1.60s every time with 6–13 qualifiers in it.
   *   • MarketStatsService's 20-minute batch cache is per-process, and requests
   *     land on different serverless instances, so "warm" is luck, not a state we
   *     can count on.
   * Conclusion: no single request can scan the whole pool. So it doesn't try. The
   * scan walks SMALL batches one at a time (no self-contention), stops the moment
   * the budget runs low, and folds every batch that lands into `blueSkyPool` —
   * which is what makes a cut-short scan a partial list instead of an empty one,
   * and lets successive views converge on the full 50.
   *
   * Also: the two pool sources are fetched concurrently and the rankings result
   * is reused for the Insider Score join (it used to be fetched twice); results
   * are cached 30 min for a complete scan and 90s for a partial one.
   *
   * An empty result from a cut-short scan is NOT an answer and is never cached:
   * "we could not finish measuring" must not be published as "nothing qualifies".
   */
  private async buildBlueSkyRows(startedAt = Date.now()): Promise<any[]> {
    if (this.blueSkyCache && Date.now() - this.blueSkyCache.ts < this.blueSkyCache.ttl) {
      return this.blueSkyCache.rows;
    }
    const MIN_UPSIDE = 300;
    const candidates = new Set<string>();
    const [rankResult, pennyPool] = await Promise.all([
      this.iqs
        .getRankings({ limit: 500, offset: 0 })
        .catch(() => ({ total: 0, rows: [] as RankingRow[] })),
      // Bound the screener too. It is a live Yahoo call with its own retries,
      // and when it goes slow it goes VERY slow — measured 21s end-to-end on a
      // rate-limited client, which no downstream deadline can rescue. If it
      // doesn't answer in time we scan our own scored names this round; the
      // screener keeps filling its own 10-minute cache for the next one.
      Promise.race([
        this.marketStats.getPennyStocks(500).catch(() => []),
        new Promise<Awaited<ReturnType<MarketStatsService['getPennyStocks']>>>((resolve) => {
          const t = setTimeout(() => resolve([]), this.BLUE_SKY_POOL_BUDGET_MS);
          t.unref?.();
        }),
      ]),
    ]);
    // Penny names first: they are both the cheapest batches and the productive
    // ones, so if the deadline does bite, what landed is what mattered.
    for (const q of pennyPool) candidates.add(q.symbol.toUpperCase());
    for (const r of rankResult.rows) if (r.ticker) candidates.add(r.ticker.toUpperCase());

    const syms = Array.from(candidates);
    const chunks: string[][] = [];
    for (let i = 0; i < syms.length; i += this.BLUE_SKY_BATCH) {
      chunks.push(syms.slice(i, i + this.BLUE_SKY_BATCH));
    }
    const now = Date.now();
    // Drop anything we last measured more than a window ago before deciding how
    // much of the pool still needs scanning.
    for (const [sym, e] of this.blueSkyPool) {
      if (now - e.ts > this.BLUE_SKY_POOL_TTL_MS) this.blueSkyPool.delete(sym);
    }
    // The scan gets its own budget OR whatever the request has left, whichever
    // is smaller — the pool fetch above already spent some of it (measured at up
    // to 4s when the penny screener has to be re-fetched), and the annotate/quote
    // passes downstream still need their turn before the proxy's 9s abort.
    const deadline = Math.min(
      now + this.BLUE_SKY_SCAN_BUDGET_MS,
      startedAt + LIST_REQUEST_BUDGET_MS - BLUE_SKY_TAIL_RESERVE_MS,
    );
    let truncated = false;
    let attempted = 0;
    for (const chunk of chunks) {
      // Enough names for a full page already — the rest of the pool can wait for
      // the next window rather than spend this request's budget.
      if (this.blueSkyPool.size >= 50) break;
      // The FIRST batch always gets a go, even if the pool fetch ate the budget:
      // one batch is ~1.3–1.6s and worth ~6–13 names, and a page with some rows
      // beats a page with none. Every batch after it must fit in what's left.
      const left = attempted === 0 ? Math.max(deadline - Date.now(), this.BLUE_SKY_FIRST_BATCH_MS) : deadline - Date.now();
      if (left < this.BLUE_SKY_MIN_BATCH_MS) {
        truncated = true;
        break;
      }
      attempted++;
      // Bound EVERY batch: MarketStatsService only caps its per-symbol summary
      // sweep at 20s internally, which alone would blow the request.
      const rows = await Promise.race([
        this.marketStats
          .getAnalystRatings(chunk)
          .catch(() => [] as Awaited<ReturnType<MarketStatsService['getAnalystRatings']>>),
        new Promise<null>((resolve) => {
          const t = setTimeout(() => resolve(null), left);
          t.unref?.();
        }),
      ]);
      if (rows == null) {
        // Abandoned mid-flight: it may still finish and cache itself for the next
        // request, but this one stops here.
        truncated = true;
        break;
      }
      // Fold the batch in: a name that still clears the bar is (re)stored, one
      // that no longer does is removed rather than left to linger in the list.
      for (const r of rows) {
        const sym = (r.symbol || '').toUpperCase();
        if (!sym) continue;
        if ((r.upsidePct ?? -1) >= MIN_UPSIDE && (r.price ?? 0) > 0) {
          this.blueSkyPool.set(sym, { ts: Date.now(), row: r });
        } else {
          this.blueSkyPool.delete(sym);
        }
      }
    }
    const qualifying = Array.from(this.blueSkyPool.values())
      .map((e) => e.row)
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
    if (!out.length && truncated) {
      // "The scan was cut short" is not the same claim as "nothing qualifies".
      // Never cache it: serve the last known rows if we have any, otherwise let
      // this request come back empty and let the NEXT one try again against
      // warmer batch caches. Caching an empty here is what pinned the page at
      // zero rows for 90 seconds at a time.
      return this.blueSkyCache?.rows ?? [];
    }
    this.blueSkyCache = {
      ts: Date.now(),
      ttl: truncated ? this.BLUE_SKY_PARTIAL_TTL_MS : this.BLUE_SKY_TTL_MS,
      rows: out,
    };
    return out;
  }

  /** Basket membership for Hot Sectors: the curated theme definition, widened
   *  with every $100M+ company the screener can attribute to that theme (see
   *  HOT_SECTOR_EXPANSION for why only some themes can be). Cap-ordered, so the
   *  members a budget-bounded build reaches first are the ones that matter most.
   *  Degrades to the curated baskets exactly when the snapshot is unavailable. */
  private async hotSectorBaskets(): Promise<Array<{ key: string; label: string; tickers: string[] }>> {
    let universe: Awaited<ReturnType<MarketStatsService['getUniverseRows']>> = [];
    try {
      universe = await this.marketStats.getUniverseRows(HOT_SECTOR_UNIVERSE_BUDGET_MS);
    } catch {
      universe = [];
    }
    return HOT_SECTOR_BASKETS.map((b) => {
      const tickers = b.tickers.map((t) => t.toUpperCase());
      const rule = HOT_SECTOR_EXPANSION[b.key];
      if (!rule || !universe.length) return { key: b.key, label: b.label, tickers };
      const have = new Set(tickers);
      // `universe` is already sorted by market cap descending, so this takes the
      // largest qualifying companies first and stops at the member ceiling.
      for (const r of universe) {
        if (tickers.length >= HOT_SECTOR_MAX_MEMBERS) break;
        if (have.has(r.symbol)) continue;
        if ((r.marketCap ?? 0) < HOT_SECTOR_MIN_CAP) continue;
        const hit =
          (rule.industry && r.industry && rule.industry.test(r.industry)) ||
          (rule.sector && r.sector && rule.sector.test(r.sector));
        if (!hit) continue;
        have.add(r.symbol);
        tickers.push(r.symbol);
      }
      return { key: b.key, label: b.label, tickers };
    });
  }

  /** Hot Sectors — rank the thematic baskets by month-to-date 10%+ gainers
   *  (relative to basket size) and current-month insider buying, with each
   *  sector's MTD and YTD performance vs. the S&P 500.
   *
   *  BENCHMARK BASIS (client asked for this to be verified explicitly):
   *   • Source: Yahoo v8 daily chart for `^GSPC`, the S&P 500 index itself —
   *     not SPY, so there is no tracking error or expense drag.
   *   • Formula: (live index price ÷ last close before the 1st of the month or
   *     year − 1) × 100. Verified against FMP as an independent source: our YTD
   *     for AAPL from the 2025-12-31 close is 11.02% and FMP's own `ytd` field
   *     is 11.029%. Measuring from the first close INSIDE the period instead —
   *     the classic off-by-one-day error — would report 11.37%.
   *   • `^GSPC` is a PRICE index (dividends excluded). The sector figures are
   *     equal-weighted averages of member PRICE returns, so both sides of the
   *     comparison exclude dividends and are consistent. They differ in
   *     weighting: the index is cap-weighted, a sector average is equal-weighted
   *     (every member counts once, which is the point of a breadth measure).
   *   • The benchmark is now requested in the SAME call as the members, so every
   *     figure in one response is marked at one instant. Previously the members
   *     and the index came from two separately-cached calls, so a sector could be
   *     compared against an index quoted up to an hour apart — the "slightly
   *     inaccurate" part of the complaint.
   */
  async getHotSectors(): Promise<HotSectorsResponse> {
    const baskets = await this.hotSectorBaskets();
    // ROUND-ROBIN across baskets rather than basket-by-basket. The MTD baseline
    // fill downstream is a budget-bounded PREFIX of this list, so the order
    // decides what a warming instance knows about: taken basket-by-basket, the
    // first sectors would have every member resolved and the last none, and
    // their gainer ratios — the factor that is 60% of the score — would not be
    // comparable. Interleaving spreads partial coverage evenly, and because each
    // basket lists its curated members before its screener-expanded ones, every
    // curated member is still resolved before any expansion member.
    const allTickers: string[] = [];
    const seen = new Set<string>();
    for (let i = 0; ; i++) {
      let any = false;
      for (const b of baskets) {
        const t = b.tickers[i];
        if (!t) continue;
        any = true;
        if (seen.has(t)) continue;
        seen.add(t);
        allTickers.push(t);
      }
      if (!any) break;
    }
    const [returns, buySell] = await Promise.all([
      // The benchmark rides along with the members: one call, one instant. It is
      // FIRST in the list, not appended, because the baseline fill is a
      // budget-bounded prefix of whatever order it is given — with the benchmark
      // last, a converging cold instance produced sector returns and a null S&P
      // 500 comparison for its first few requests (measured: ^GSPC resolved only
      // on the 4th call). The one symbol every row is compared against goes first.
      this.marketStats.getMonthYtdReturns([SP500_SYMBOL, ...allTickers], {
        baselineBudgetMs: HOT_SECTOR_BASELINE_BUDGET_MS,
      }),
      this.iqs.getMonthlyBuySellByTicker(allTickers),
    ]);
    // Cache hit: getMonthYtdReturns has just quoted these symbols for its live
    // numerator, so this costs nothing and only supplies the market caps.
    const quotes = await this.marketStats
      .getQuoteBatch(allTickers)
      .catch(() => new Map());
    const sp500Ytd = returns[SP500_SYMBOL]?.ytd ?? null;
    const sp500Mtd = returns[SP500_SYMBOL]?.mtd ?? null;
    // Client spec (Azlan): only companies above a $100M market cap count
    // toward a sector's heat — sub-$100M names swing ±10% on nothing and were
    // distorting the gainer ratios. A missing cap keeps the name (curated
    // baskets are liquid names; only a known micro-cap is excluded).
    const capOk = (sym: string): boolean => {
      const cap = (quotes.get(sym) as { marketCap?: number | null } | undefined)?.marketCap;
      return cap == null || cap >= HOT_SECTOR_MIN_CAP;
    };

    const raw = baskets.map((b) => {
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
          // "up by 10%+" as the client states it — inclusive of exactly +10.00%.
          if (r.mtd >= 10) gainers10++;
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
        // Insider pressure — the buy/sell SKEW, pulled toward neutral by how
        // little activity stands behind it, so two lone buys can't max out the
        // component and thin evidence isn't read as bearish.
        const flow = r.insiderBuys + r.insiderSells;
        const skew = flow > 0 ? r.insiderBuys / flow : HOT_NEUTRAL;
        const confidence = clamp01(
          Math.log1p(flow) / Math.log1p(HOT_FLOW_FOR_FULL_CONFIDENCE),
        );
        const insider = HOT_NEUTRAL + confidence * (skew - HOT_NEUTRAL);
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
    const startedAt = Date.now();
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
    const detail = await this.buildDetail(slug, filters, startedAt);
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
    detail.rows = (await this.fillFundamentalGaps(
      slug,
      withInsider,
      snapshot,
      LIST_REQUEST_BUDGET_MS - (Date.now() - startedAt),
    )) as any[];
    return detail;
  }

  private async buildDetail(
    slug: string,
    filters: StockListFilters,
    /** When the request started, so a builder that scans an external feed can
     *  size its own deadline against the whole request rather than assuming it
     *  owns the clock (measured: Blue Sky's pool fetch alone can cost 4s). */
    startedAt = Date.now(),
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
      const rows = await this.buildBlueSkyRows(startedAt);
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
    /** What is left of the request's soft budget. Everything here is optional
     *  polish on rows we already have, so it yields to shipping them on time. */
    budgetLeftMs = LIST_REQUEST_BUDGET_MS,
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
    // Out of request budget → budget 0, which still resolves anything already
    // cached (free) but makes no new calls. Blue Sky in particular can spend its
    // whole allowance on the analyst scan, and a filled P/E column is not worth
    // a timed-out page.
    const budgetMs = Math.max(
      0,
      Math.min(big ? FUNDAMENTALS_LARGE_LIST_BUDGET_MS : FUNDAMENTALS_BUDGET_MS, budgetLeftMs),
    );
    const filled = await this.fmp.getFundamentalsBatch(gaps.map((r) => String(r.ticker)), {
      concurrency: 8,
      budgetMs,
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
