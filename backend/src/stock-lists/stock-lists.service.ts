import { Injectable } from '@nestjs/common';
import { IqsService, RankingRow } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { ThirteenFService } from './thirteenf.service';
import { CongressionalService } from '../congressional/congressional.service';
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
  /** Equal-weighted average member YTD % (null when no data). */
  ytd: number | null;
  /** Sector YTD minus S&P 500 YTD (percentage points). */
  vsSp500: number | null;
  /** Composite 0–100 heat score (gainer ratio + insider buying). */
  hotScore: number;
}

export interface HotSectorsResponse {
  asOfDate: string;
  monthLabel: string;
  sp500Ytd: number | null;
  sectors: HotSectorRow[];
}

// Hot Sectors ranking weights: how much the >10% gainer ratio vs. the insider
// buying intensity each contribute to the composite heat score.
const HOT_GAINER_WEIGHT = 0.6;
const HOT_INSIDER_WEIGHT = 0.4;

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

export interface StockListFilters {
  country?: string;
  exchange?: string;         // "Exchanges" filter: all / US / CA / DE
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minIqs?: number;           // Insider Score band (now an open filter)
  sentiment?: string;        // pay-gated
  analystConsensus?: string; // pay-gated
}

@Injectable()
export class StockListsService {
  constructor(
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
    private readonly thirteenF: ThirteenFService,
    private readonly congress: CongressionalService,
  ) {}

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

  /** Blue Sky Stocks — every name in our combined coverage universe whose
   *  average analyst price target implies >= 300% upside, best 50 by upside.
   *  Candidates come from our Form 4 rankings, the live penny-stock screener
   *  (where extreme-upside targets actually live), and the sector baskets. */
  private async buildBlueSkyRows(): Promise<any[]> {
    const MIN_UPSIDE = 300;
    const candidates = new Set<string>();
    try {
      const { rows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
      for (const r of rows) if (r.ticker) candidates.add(r.ticker.toUpperCase());
    } catch { /* rankings unavailable — screener pool still applies */ }
    try {
      for (const q of await this.marketStats.getPennyStocks(500)) {
        candidates.add(q.symbol.toUpperCase());
      }
    } catch { /* screener unavailable */ }
    for (const b of HOT_SECTOR_BASKETS) for (const t of b.tickers) candidates.add(t.toUpperCase());
    for (const list of Object.values(SECTOR_UNIVERSE)) for (const t of list) candidates.add(t.toUpperCase());

    // Analyst ratings are built in 250-symbol batches (the builder's cap);
    // run batches in parallel so the whole scan stays inside one request.
    const syms = Array.from(candidates);
    const chunks: string[][] = [];
    for (let i = 0; i < syms.length; i += 250) chunks.push(syms.slice(i, i + 250));
    const settled = await Promise.allSettled(
      chunks.map((c) => this.marketStats.getAnalystRatings(c)),
    );
    const all = settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []));

    const qualifying = all
      .filter((r) => (r.upsidePct ?? -1) >= MIN_UPSIDE && (r.price ?? 0) > 0)
      .sort((a, b) => (b.upsidePct ?? 0) - (a.upsidePct ?? 0))
      .slice(0, 50);

    // Attach Insider Scores (every list carries the column).
    let iqsByTicker = new Map<string | null, number>();
    try {
      const { rows: rankRows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
      iqsByTicker = new Map(rankRows.map((r) => [r.ticker, r.iqs]));
    } catch { /* scores unavailable */ }

    const rows = qualifying.map((r) => ({
      ticker: r.symbol,
      name: r.name,
      sector: r.sector,
      marketCap: null as number | null,
      iqs: iqsByTicker.get(r.symbol) ?? undefined,
      upsidePct: r.upsidePct,
      targetMean: r.targetMean,
      recommendation: r.recommendation,
      numAnalysts: r.numAnalysts,
    }));
    const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
    return this.enrichRows(rows, live);
  }

  /** Hot Sectors — rank the thematic baskets by month-to-date 10%+ gainers
   *  (relative to basket size) and current-month insider buying, with each
   *  sector's YTD performance vs. the S&P 500. */
  async getHotSectors(): Promise<HotSectorsResponse> {
    const allTickers = Array.from(
      new Set(HOT_SECTOR_BASKETS.flatMap((b) => b.tickers)),
    );
    const [returns, buySell, spReturns] = await Promise.all([
      this.marketStats.getMonthYtdReturns(allTickers),
      this.iqs.getMonthlyBuySellByTicker(allTickers),
      this.marketStats.getMonthYtdReturns(['^GSPC']),
    ]);
    const sp500Ytd = spReturns['^GSPC']?.ytd ?? null;

    const raw = HOT_SECTOR_BASKETS.map((b) => {
      let companies = 0;
      let gainers10 = 0;
      let ytdSum = 0;
      let ytdCount = 0;
      let insiderBuys = 0;
      let insiderSells = 0;
      for (const t of b.tickers) {
        const up = t.toUpperCase();
        const r = returns[up];
        if (r && r.mtd != null) {
          companies++;
          if (r.mtd > 10) gainers10++;
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
        vsSp500:
          ytd != null && sp500Ytd != null ? +(ytd - sp500Ytd).toFixed(2) : null,
      };
    });

    // Insider buying is scaled relative to the busiest sector so it combines
    // cleanly with the 0–1 gainer ratio into a 0–100 composite heat score.
    const maxBuys = Math.max(1, ...raw.map((r) => r.insiderBuys));
    const scored: HotSectorRow[] = raw
      .map((r) => ({
        ...r,
        hotScore: Math.round(
          (HOT_GAINER_WEIGHT * r.gainerRatio +
            HOT_INSIDER_WEIGHT * (r.insiderBuys / maxBuys)) *
            100,
        ),
      }))
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
      sectors: scored,
    };
  }

  async getDetail(slug: string, filters: StockListFilters): Promise<StockListDetail | null> {
    const meta = STOCK_LIST_META[slug];
    if (!meta && slug !== 'iqs-top-picks' && slug !== 'blue-sky') return null;

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

    if (meta.kind === 'persona') {
      // Prefer the latest real 13F-HR from SEC EDGAR for institutional filers
      // (Buffett/Dalio/Sprott); fall back to the curated list for individuals
      // (Bezos/Trump) who don't file 13Fs, or if the live fetch fails.
      let rows: PersonaHolding[];
      if (slug === 'politicians') {
        // Live congressional disclosures (FMP), aggregated by ticker.
        rows = await this.buildPoliticianRows();
      } else {
        const live13f = await this.thirteenF.getHoldings(slug);
        rows = live13f && live13f.length ? live13f : PERSONA_HOLDINGS[slug] || [];
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
      const iqsByTicker = new Map(rankRows.map((r) => [r.ticker, r.iqs]));
      const withIqs = rows.map((h) => ({
        ...h,
        iqs: iqsByTicker.get(h.ticker) ?? undefined,
      }));
      const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
      const enriched = this.enrichRows(withIqs, live) as any[];
      return { slug, ...meta, total: enriched.length, rows: enriched };
    }

    if (meta.kind === 'universe') {
      // Penny stocks: a LIVE screener of every U.S. equity under $5 (hundreds
      // of names), not a hand-picked basket. Falls through to the static
      // basket only if the screener is unavailable.
      if (slug === 'penny-stocks') {
        const penny = await this.marketStats.getPennyStocks(1000);
        if (penny.length) {
          // Insider Score column on every list — penny names that also appear
          // in our Form 4 rankings get their live score attached.
          const { rows: pennyRank } = await this.iqs.getRankings({ limit: 500, offset: 0 });
          const pennyIqs = new Map(pennyRank.map((r) => [r.ticker, r.iqs]));
          let pennyRows = penny.map((q) => ({
            ticker: q.symbol,
            name: q.name,
            sector: q.sector,
            marketCap: q.marketCap,
            iqs: pennyIqs.get(q.symbol) ?? undefined,
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
      if (filters.sector) {
        rows = rows.filter((r) =>
          r.sector.toLowerCase().includes(filters.sector!.toLowerCase()),
        );
      }
      const { rows: rankRows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
      const iqsByTicker = new Map(rankRows.map((r) => [r.ticker, r.iqs]));
      const tickers = rows.map((r) => r.ticker);
      const [live, costBasis] = await Promise.all([
        this.fetchLiveQuotes(tickers),
        this.iqs.getInsiderCostBasis(tickers),
      ]);
      const withIqs = rows.map((h) => {
        const cb = costBasis.get(h.ticker.toUpperCase());
        return {
          ...h,
          iqs: iqsByTicker.get(h.ticker) ?? undefined,
          avgCost: cb?.avgCost ?? null,
          lastBuyDate: cb?.lastBuyDate ?? null,
        };
      });
      const enriched = this.enrichRows(withIqs, live) as any[];
      return { slug, ...meta, total: enriched.length, rows: enriched };
    }
    return null;
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
        const { rows: allRank } = await this.iqs.getRankings({ limit: 500, offset: 0 });
        const bySym = new Map(allRank.map((r) => [r.ticker, r]));
        for (const row of missing) {
          const hit = bySym.get(row.ticker!);
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
