import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { GovContractCache } from '../entities/gov-contract-cache.entity';
import {
  AnalystRow,
  MarketStatRow,
  MarketStatsService,
} from '../market-stats/market-stats.service';
import { CONTRACTORS, ContractorEntry } from './gov-contracts-map';

const USA = 'https://api.usaspending.gov/api/v2';
// Definitive contracts, purchase orders, delivery orders, BPA calls.
const CONTRACT_TYPES = ['A', 'B', 'C', 'D'];

export interface GovContractRow {
  ticker: string;
  name: string;
  sector: string;
  recipientName: string;
  ttmAmount: number;
  topAgency: string | null;
  hasData: boolean;
  updatedAt: string | null;
  // Enrichment (live):
  price: number | null;
  marketCap: number | null;
  targetMean: number | null;
  upsidePct: number | null;
  recommendation: string | null;
  numAnalysts: number | null;
}

@Injectable()
export class GovContractsService {
  private readonly logger = new Logger(GovContractsService.name);
  private readonly http: AxiosInstance;
  private readonly FRESH_MS = 20 * 60 * 60_000; // ~daily refresh cadence

  constructor(
    @InjectRepository(GovContractCache)
    private readonly repo: Repository<GovContractCache>,
    private readonly market: MarketStatsService,
  ) {
    this.http = axios.create({
      timeout: 25_000,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    });
  }

  private ttmWindow(): { start_date: string; end_date: string } {
    const end = new Date();
    const start = new Date(end.getTime() - 365 * 24 * 60 * 60_000);
    const fmt = (d: Date) => d.toISOString().slice(0, 10);
    return { start_date: fmt(start), end_date: fmt(end) };
  }

  private baseFilters(recipient: string) {
    return {
      time_period: [this.ttmWindow()],
      award_type_codes: CONTRACT_TYPES,
      recipient_search_text: [recipient],
    };
  }

  /** Trailing-12-month obligated federal contract dollars for a recipient. */
  private async fetchTtmTotal(recipient: string): Promise<number> {
    try {
      const { data } = await this.http.post(`${USA}/search/spending_over_time/`, {
        group: 'quarter',
        filters: this.baseFilters(recipient),
      });
      const results: any[] = data?.results || [];
      return results.reduce((s, r) => s + (Number(r.aggregated_amount) || 0), 0);
    } catch (e: any) {
      this.logger.warn(`USAspending total failed for ${recipient}: ${e?.message || e}`);
      return 0;
    }
  }

  /** Top awarding agency by obligated dollars for a recipient over the TTM. */
  private async fetchTopAgency(recipient: string): Promise<string | null> {
    try {
      const { data } = await this.http.post(
        `${USA}/search/spending_by_category/awarding_agency/`,
        { filters: this.baseFilters(recipient), limit: 1, page: 1 },
      );
      const results: any[] = data?.results || [];
      return results[0]?.name || null;
    } catch (e: any) {
      this.logger.warn(`USAspending agency failed for ${recipient}: ${e?.message || e}`);
      return null;
    }
  }

  /**
   * Refresh a slice of the contractor universe from USAspending (cloud cron
   * calls this in a loop). `after` is the last ticker processed; entries are
   * ordered by the curated list so paging is deterministic.
   */
  async refreshSlice(opts?: { limit?: number; after?: string }): Promise<{
    processed: string[];
    remaining: number;
    cursor: string | null;
  }> {
    const limit = Math.max(1, Math.min(opts?.limit ?? 8, 20));
    const startAfter = (opts?.after || '').toUpperCase();

    // Which entries still need a refresh (stale or missing), in list order.
    const existing = await this.repo.find();
    const freshBy = new Map(existing.map((r) => [r.ticker, r.updatedAt]));
    const stale = (t: string) => {
      const u = freshBy.get(t);
      return !u || Date.now() - new Date(u).getTime() > this.FRESH_MS;
    };

    let pool: ContractorEntry[] = CONTRACTORS.filter((c) => stale(c.ticker));
    if (startAfter) {
      const i = CONTRACTORS.findIndex((c) => c.ticker === startAfter);
      if (i >= 0) {
        const allowed = new Set(CONTRACTORS.slice(i + 1).map((c) => c.ticker));
        pool = pool.filter((c) => allowed.has(c.ticker));
      }
    }

    const slice = pool.slice(0, limit);
    const processed: string[] = [];
    for (const c of slice) {
      const [ttm, agency] = await Promise.all([
        this.fetchTtmTotal(c.recipient),
        this.fetchTopAgency(c.recipient),
      ]);
      await this.repo
        .createQueryBuilder()
        .insert()
        .values({
          ticker: c.ticker,
          recipientName: c.recipient,
          ttmAmount: String(Math.round(ttm * 100) / 100),
          topAgency: agency,
          hasData: ttm > 0,
        })
        .orUpdate(['recipientName', 'ttmAmount', 'topAgency', 'hasData', 'updatedAt'], ['ticker'])
        .execute();
      processed.push(c.ticker);
    }

    const cursor = slice.length ? slice[slice.length - 1].ticker : null;
    const remaining = Math.max(0, pool.length - slice.length);
    return { processed, remaining, cursor };
  }

  /** The ranked list: cached USAspending totals + live analyst/quote data. */
  async getList(): Promise<GovContractRow[]> {
    const cached = await this.repo.find();
    const byTicker = new Map(cached.map((r) => [r.ticker, r]));
    const tickers = CONTRACTORS.map((c) => c.ticker);

    const ratings: AnalystRow[] = await this.market
      .getAnalystRatings(tickers)
      .catch(() => [] as AnalystRow[]);
    const quotes: Map<string, MarketStatRow> = await this.market
      .getQuoteBatch(tickers)
      .catch(() => new Map<string, MarketStatRow>());
    const ratingBy = new Map<string, AnalystRow>(ratings.map((r) => [r.symbol, r]));

    const rows: GovContractRow[] = CONTRACTORS.map((c) => {
      const cache = byTicker.get(c.ticker);
      const rt = ratingBy.get(c.ticker);
      const q = quotes.get(c.ticker);
      return {
        ticker: c.ticker,
        name: c.name,
        sector: c.sector,
        recipientName: cache?.recipientName || c.recipient,
        ttmAmount: cache ? Number(cache.ttmAmount) : 0,
        topAgency: cache?.topAgency || null,
        hasData: cache?.hasData ?? false,
        updatedAt: cache?.updatedAt ? new Date(cache.updatedAt).toISOString() : null,
        price: rt?.price ?? q?.price ?? null,
        marketCap: q?.marketCap ?? null,
        targetMean: rt?.targetMean ?? null,
        upsidePct: rt?.upsidePct ?? null,
        recommendation: rt?.recommendation ?? null,
        numAnalysts: rt?.numAnalysts ?? null,
      };
    });

    // Largest federal contract dollars first; unpriced/uncontracted fall last.
    rows.sort((a, b) => b.ttmAmount - a.ttmAmount);
    return rows;
  }
}
