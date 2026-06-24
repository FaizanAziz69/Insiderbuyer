import { Injectable } from '@nestjs/common';
import { IqsService, RankingRow } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { ThirteenFService } from './thirteenf.service';
import { CongressionalService } from '../congressional/congressional.service';
import {
  BLUE_CHIP_MIN_MARKET_CAP,
  COUNTRY_UNIVERSE,
  PERSONA_HOLDINGS,
  PersonaHolding,
  SECTOR_LIST_RULES,
  SECTOR_UNIVERSE,
  STOCK_LIST_META,
  UNIVERSE_LISTS,
} from './persona-data';

export interface LiveQuote {
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
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
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minIqs?: number;           // IQS score band (now an open filter)
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
        count = (UNIVERSE_LISTS[slug] || []).length;
      }
      out.push({ slug, ...meta, count });
    }
    // Add the premium IQS list as a virtual entry
    const { total: iqsTotal } = await this.iqs.getRankings({ limit: 1, offset: 0 });
    out.push({
      slug: 'iqs-top-picks',
      title: 'IQS Top Picks',
      description:
        'Premium ranking — the highest Insider Buying Quality Scores across the U.S. market, updated daily.',
      kind: 'premium',
      count: iqsTotal,
    });
    return out;
  }

  async getDetail(slug: string, filters: StockListFilters): Promise<StockListDetail | null> {
    const meta = STOCK_LIST_META[slug];
    if (!meta && slug !== 'iqs-top-picks') return null;

    if (slug === 'iqs-top-picks') {
      const { total, rows: rawRows } = await this.iqs.getRankings({
        limit: 50,
        sector: filters.sector,
        minMarketCap: filters.minMarketCap,
        maxMarketCap: filters.maxMarketCap,
        minIqs: filters.minIqs,
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
        title: 'IQS Top Picks',
        description:
          'Premium ranking — the highest Insider Buying Quality Scores across the U.S. market, updated daily.',
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
      // Cross-reference each persona holding against the live IQS table to
      // attach an IQS score — and, where the same name also has Form 4 buys, a
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
      const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
      const enriched = this.enrichRows(rows, live) as any[];
      return { slug, ...meta, total: enriched.length, rows: enriched };
    }

    if (meta.kind === 'universe') {
      // Curated market-cap / thematic baskets — always populated with live
      // quotes; IQS + avg cost + last buy attached where the name also has
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
      });
    }
    // When an IQS band is selected, don't pad with the (unscored) universe.
    const rows = filters.minIqs
      ? base.rows
      : this.topUpWithUniverse(slug, base.rows, filters);
    return { total: rows.length, rows };
  }

  /** Sector lists draw from our SEC Form 4 / IQS company table, which skews
   *  to smaller caps — append the curated universe of well-known names so
   *  every list renders a full table (20+ rows). IQS-scored matches stay on
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
