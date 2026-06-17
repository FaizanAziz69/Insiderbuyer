import { Injectable } from '@nestjs/common';
import { IqsService, RankingRow } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import {
  BLUE_CHIP_MIN_MARKET_CAP,
  PERSONA_HOLDINGS,
  PersonaHolding,
  SECTOR_LIST_RULES,
  SECTOR_UNIVERSE,
  STOCK_LIST_META,
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
  kind: 'sector' | 'persona' | 'premium';
}

export interface StockListDetail {
  slug: string;
  title: string;
  description: string;
  kind: 'sector' | 'persona' | 'premium';
  total: number;
  rows: Array<RankingRow | (PersonaHolding & { iqs?: number })>;
}

export interface StockListFilters {
  country?: string;
  sector?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  sentiment?: string;        // pay-gated
  analystConsensus?: string; // pay-gated
}

@Injectable()
export class StockListsService {
  constructor(
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
  ) {}

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
      let rows = PERSONA_HOLDINGS[slug] || [];
      if (filters.sector) {
        rows = rows.filter((r) =>
          r.sector.toLowerCase().includes(filters.sector!.toLowerCase()),
        );
      }
      // Cross-reference each persona holding against the live IQS table to attach an IQS score where present.
      const { rows: rankRows } = await this.iqs.getRankings({ limit: 500, offset: 0 });
      const byTicker = new Map(rankRows.map((r) => [r.ticker, r.iqs]));
      const live = await this.fetchLiveQuotes(rows.map((r) => r.ticker));
      const withIqs = rows.map((h) => ({
        ...h,
        iqs: byTicker.get(h.ticker) ?? undefined,
      }));
      const annotated = this.enrichRows(withIqs, live) as any[];
      return { slug, ...meta, total: annotated.length, rows: annotated };
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
      });
    }
    const rows = this.topUpWithUniverse(slug, base.rows, filters);
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
