import { Injectable } from '@nestjs/common';
import { IqsService, RankingRow } from '../iqs/iqs.service';
import { MarketStatsService } from '../market-stats/market-stats.service';
import {
  BLUE_CHIP_MIN_MARKET_CAP,
  PERSONA_HOLDINGS,
  PersonaHolding,
  SECTOR_LIST_RULES,
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
  private liveCache: { ts: number; map: Map<string, LiveQuote> } | null = null;
  private readonly LIVE_TTL_MS = 5 * 60_000;

  constructor(
    private readonly iqs: IqsService,
    private readonly marketStats: MarketStatsService,
  ) {}

  private async fetchLiveQuotes(tickers: string[]): Promise<Map<string, LiveQuote>> {
    const set = new Set(tickers.filter(Boolean).map((t) => t.toUpperCase()));
    if (!set.size) return new Map();
    const now = Date.now();
    if (this.liveCache && now - this.liveCache.ts < this.LIVE_TTL_MS) {
      const cached = this.liveCache.map;
      const missing = Array.from(set).filter((t) => !cached.has(t));
      if (missing.length === 0) return cached;
    }
    const tickerArr = Array.from(set);
    const m = await this.marketStats.getQuoteBatch(tickerArr);
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
    this.liveCache = { ts: now, map: live };
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
      const { total, rows } = await this.iqs.getRankings({
        limit: 50,
        sector: filters.sector,
        minMarketCap: filters.minMarketCap,
        maxMarketCap: filters.maxMarketCap,
      });
      const live = await this.fetchLiveQuotes(
        rows.map((r) => r.ticker || '').filter(Boolean),
      );
      const enriched = rows.map((r) => ({
        ...r,
        live: r.ticker ? live.get(r.ticker.toUpperCase()) || null : null,
      })) as any[];
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
      const enriched = rows.map((r) => ({
        ...r,
        live: r.ticker ? live.get(r.ticker.toUpperCase()) || null : null,
      })) as any[];
      return { slug, ...meta, total: rows.length, rows: enriched };
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
      const annotated = rows.map((h) => ({
        ...h,
        iqs: byTicker.get(h.ticker) ?? undefined,
        live: live.get(h.ticker.toUpperCase()) || null,
      })) as any[];
      return { slug, ...meta, total: annotated.length, rows: annotated };
    }
    return null;
  }

  private async fetchSectorList(
    slug: string,
    filters: StockListFilters & { limit?: number },
  ) {
    if (slug === 'blue-chip') {
      return this.iqs.getRankings({
        limit: filters.limit ?? 200,
        sector: filters.sector,
        minMarketCap: Math.max(filters.minMarketCap ?? 0, BLUE_CHIP_MIN_MARKET_CAP),
        maxMarketCap: filters.maxMarketCap,
      });
    }
    const rx = SECTOR_LIST_RULES[slug];
    if (!rx) return { total: 0, rows: [] as RankingRow[] };
    return this.iqs.getRankings({
      limit: filters.limit ?? 200,
      sectorMatch: rx,
      sector: filters.sector,
      minMarketCap: filters.minMarketCap,
      maxMarketCap: filters.maxMarketCap,
    });
  }
}
