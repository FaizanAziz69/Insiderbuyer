import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScreenerUniverseCache } from '../entities/screener-universe-cache.entity';
import { FmpService } from '../fmp/fmp.service';
import { IqsService } from '../iqs/iqs.service';
import { EaiService } from '../eai/eai.service';
import { EarningsService } from '../earnings/earnings.service';
import { EXCLUDED_UNIVERSE_INDUSTRIES } from '../market-stats/market-universe';

/**
 * The IQS Screener — "filter 8,000+ stocks by insider conviction score, sector,
 * market cap, and more".
 *
 * The universe is every actively-traded US common stock FMP lists on NASDAQ,
 * NYSE, AMEX and OTC (~9,500 after shell companies are excluded), which is what
 * makes the 8,000+ claim true. Our own insider data is joined on top: the
 * Insider Score, who bought, how many of them, and how much.
 *
 * Rows without insider activity still appear — a screener the user can only
 * point at 500 pre-filtered names is a list, not a screener.
 */
export interface UniverseRow {
  s: string; // symbol
  n: string; // name
  sec: string | null; // sector
  ind: string | null; // industry
  mc: number | null; // market cap
  p: number | null; // price
  v: number | null; // volume
  x: string | null; // exchange
}

export interface ScreenerRow {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  price: number | null;
  volume: number | null;
  exchange: string | null;
  iqs: number | null;
  buyers: number;
  buyValue: number;
  lastBuyDate: string | null;
  hasCeoBuyer: boolean;
  hasFundBuyer: boolean;
  hasRepeatBuyer: boolean;
  eai: number | null;
  reportsOn: string | null;
}

export type ScreenerSetup =
  | 'cluster-buy'
  | 'small-cap-cluster'
  | 'ceo-buy'
  | 'pre-earnings'
  | 'insider-buying';

export interface ScreenerQuery {
  q?: string;
  sector?: string;
  exchange?: string;
  minMarketCap?: number;
  maxMarketCap?: number;
  minPrice?: number;
  maxPrice?: number;
  minIqs?: number;
  setup?: ScreenerSetup;
  sort?: 'iqs' | 'marketCap' | 'price' | 'buyers' | 'buyValue' | 'symbol';
  dir?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

/** The universe query. OTC is included deliberately — it is where most
 *  small-cap insider buying actually happens, and excluding it would put the
 *  universe under 6,100 names. */
const UNIVERSE_QUERY = {
  exchange: 'NASDAQ,NYSE,AMEX,OTC',
  isActivelyTrading: true,
  isEtf: false,
  isFund: false,
  limit: 10000,
} as const;

const SMALL_CAP_MAX = 2_000_000_000;
const CLUSTER_MIN_BUYERS = 2;
const REFRESH_MS = 12 * 60 * 60 * 1000;

@Injectable()
export class ScreenerService implements OnModuleInit {
  private readonly log = new Logger(ScreenerService.name);
  private universe: UniverseRow[] = [];
  private loadedAt = 0;
  private loading: Promise<void> | null = null;

  constructor(
    @InjectRepository(ScreenerUniverseCache)
    private readonly cache: Repository<ScreenerUniverseCache>,
    private readonly fmp: FmpService,
    private readonly iqs: IqsService,
    private readonly eai: EaiService,
    private readonly earnings: EarningsService,
  ) {}

  async onModuleInit() {
    // Serve the stored snapshot immediately, then refresh in the background.
    await this.loadFromCache();
    setTimeout(() => {
      this.refresh().catch((e) => this.log.warn(`Screener warm-up: ${e?.message || e}`));
    }, 20_000);
  }

  @Cron('19 4,16 * * *')
  async scheduled() {
    await this.refresh().catch((e) => this.log.warn(`Screener refresh: ${e?.message || e}`));
  }

  private async loadFromCache() {
    try {
      const row = await this.cache.findOne({ where: { key: 'universe' } });
      if (row?.rows) {
        this.universe = row.rows as UniverseRow[];
        this.loadedAt = row.updatedAt?.getTime?.() ?? Date.now();
        this.log.log(`Screener universe: ${this.universe.length} stocks from snapshot.`);
      }
    } catch (e: any) {
      this.log.warn(`Screener snapshot read failed: ${e?.message || e}`);
    }
  }

  /** Pull a fresh universe from FMP and store it. Keeps the old one on failure. */
  async refresh(): Promise<{ count: number; kept: boolean }> {
    if (this.loading) {
      await this.loading;
      return { count: this.universe.length, kept: true };
    }
    if (!this.fmp.enabled) return { count: this.universe.length, kept: true };
    let done!: () => void;
    this.loading = new Promise<void>((r) => (done = r));
    try {
      const snap = await this.fmp.getScreenerSnapshot(UNIVERSE_QUERY, { budgetMs: 120_000 });
      const rows: UniverseRow[] = [];
      for (const r of snap.values()) {
        if (r.industry && EXCLUDED_UNIVERSE_INDUSTRIES.has(r.industry)) continue;
        rows.push({
          s: r.symbol,
          n: r.name,
          sec: r.sector ?? null,
          ind: r.industry ?? null,
          mc: r.marketCap ?? null,
          p: r.price ?? null,
          v: r.volume ?? null,
          x: r.exchange ?? null,
        });
      }
      // A short read means FMP throttled us; the stored universe is better than
      // a truncated one, so it is kept rather than overwritten.
      if (rows.length < 1000) {
        this.log.warn(`Screener refresh returned only ${rows.length} rows — keeping snapshot.`);
        return { count: this.universe.length, kept: true };
      }
      this.universe = rows;
      this.loadedAt = Date.now();
      await this.cache.save(
        this.cache.create({ key: 'universe', rows, count: rows.length }),
      );
      this.log.log(`Screener universe refreshed: ${rows.length} stocks.`);
      return { count: rows.length, kept: false };
    } finally {
      done();
      this.loading = null;
    }
  }

  private async ensureUniverse() {
    if (this.universe.length && Date.now() - this.loadedAt < REFRESH_MS) return;
    if (!this.universe.length) await this.loadFromCache();
    if (!this.universe.length) await this.refresh().catch(() => undefined);
  }

  /** Run a screen. Filtering and sorting happen server-side; only a page of
   *  rows crosses the wire. */
  async screen(q: ScreenerQuery): Promise<{
    total: number;
    universe: number;
    rows: ScreenerRow[];
    sectors: string[];
    updatedAt: string | null;
  }> {
    await this.ensureUniverse();

    // Our insider data, keyed by ticker.
    const ranked = await this.iqs.getRankings({ limit: 5000 }).catch(() => ({ rows: [] as any[] }));
    const scoreByTicker = new Map<string, any>();
    for (const r of ranked.rows || []) {
      if (r.ticker) scoreByTicker.set(String(r.ticker).toUpperCase(), r);
    }
    const eaiMap = q.setup === 'pre-earnings' ? await this.eai.getMap().catch(() => ({})) : {};
    const reportsOn = q.setup === 'pre-earnings' ? await this.upcomingDates() : new Map<string, string>();

    const term = (q.q || '').trim().toUpperCase();
    const sector = (q.sector || '').trim().toLowerCase();
    const exchange = (q.exchange || '').trim().toUpperCase();

    const matched: ScreenerRow[] = [];
    for (const u of this.universe) {
      if (term && !u.s.includes(term) && !(u.n || '').toUpperCase().includes(term)) continue;
      if (sector && (u.sec || '').toLowerCase() !== sector) continue;
      if (exchange && (u.x || '').toUpperCase() !== exchange) continue;
      if (q.minMarketCap != null && !(u.mc != null && u.mc >= q.minMarketCap)) continue;
      if (q.maxMarketCap != null && !(u.mc != null && u.mc <= q.maxMarketCap)) continue;
      if (q.minPrice != null && !(u.p != null && u.p >= q.minPrice)) continue;
      if (q.maxPrice != null && !(u.p != null && u.p <= q.maxPrice)) continue;

      const sc = scoreByTicker.get(u.s);
      const iqs = sc ? Math.round(Number(sc.iqs)) : null;
      if (q.minIqs != null && !(iqs != null && iqs >= q.minIqs)) continue;

      const buyers = sc ? Number(sc.distinctBuyers) || 0 : 0;
      const hasCeoBuyer = !!sc?.hasCeoBuyer;
      const eaiRow = (eaiMap as Record<string, any>)[u.s];

      // The setups the page names, each expressed in the data we hold.
      switch (q.setup) {
        case 'insider-buying':
          if (!sc) continue;
          break;
        case 'cluster-buy':
          if (buyers < CLUSTER_MIN_BUYERS) continue;
          break;
        case 'small-cap-cluster':
          if (buyers < CLUSTER_MIN_BUYERS) continue;
          if (!(u.mc != null && u.mc <= SMALL_CAP_MAX)) continue;
          break;
        case 'ceo-buy':
          if (!hasCeoBuyer) continue;
          break;
        case 'pre-earnings':
          // Reporting inside the calendar window, and insiders have bought.
          if (!reportsOn.has(u.s)) continue;
          if (!sc && !eaiRow) continue;
          break;
        default:
          break;
      }

      matched.push({
        symbol: u.s,
        name: u.n,
        sector: u.sec,
        industry: u.ind,
        marketCap: u.mc,
        price: u.p,
        volume: u.v,
        exchange: u.x,
        iqs,
        buyers,
        buyValue: sc ? Number(sc.totalPurchaseValue) || 0 : 0,
        lastBuyDate: sc?.lastBuyDate ? String(sc.lastBuyDate).slice(0, 10) : null,
        hasCeoBuyer,
        hasFundBuyer: !!sc?.hasFundBuyer,
        hasRepeatBuyer: !!sc?.hasRepeatBuyer,
        eai: eaiRow ? Number(eaiRow.eai) : null,
        reportsOn: reportsOn.get(u.s) ?? null,
      });
    }

    const dir = q.dir === 'asc' ? 1 : -1;
    const key = q.sort || 'iqs';
    matched.sort((a, b) => {
      if (key === 'symbol') return a.symbol.localeCompare(b.symbol) * dir;
      const av = this.sortValue(a, key);
      const bv = this.sortValue(b, key);
      // Unscored names sort last on every descending numeric sort rather than
      // crowding the top as zeroes.
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return (av - bv) * dir;
    });

    const offset = Math.max(0, q.offset || 0);
    const limit = Math.min(200, Math.max(1, q.limit || 50));
    const sectors = Array.from(
      new Set(this.universe.map((u) => u.sec).filter(Boolean) as string[]),
    ).sort();
    return {
      total: matched.length,
      universe: this.universe.length,
      rows: matched.slice(offset, offset + limit),
      sectors,
      updatedAt: this.loadedAt ? new Date(this.loadedAt).toISOString() : null,
    };
  }

  private sortValue(r: ScreenerRow, key: string): number | null {
    switch (key) {
      case 'marketCap': return r.marketCap;
      case 'price': return r.price;
      case 'buyers': return r.buyers || null;
      case 'buyValue': return r.buyValue || null;
      default: return r.iqs;
    }
  }

  /** Ticker → report date for everything on the next two weeks' calendar. */
  private async upcomingDates(): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    try {
      for (const e of await this.earnings.getCalendar(14)) {
        const sym = String(e.symbol || '').toUpperCase();
        if (sym && !out.has(sym)) out.set(sym, e.date);
      }
    } catch {
      /* calendar unavailable — the pre-earnings setup just matches nothing */
    }
    return out;
  }

  status() {
    return {
      universe: this.universe.length,
      updatedAt: this.loadedAt ? new Date(this.loadedAt).toISOString() : null,
      query: UNIVERSE_QUERY,
    };
  }
}
