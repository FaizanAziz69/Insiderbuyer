import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';

/**
 * A MARKET-WIDE universe, kept deliberately separate from `companies`.
 *
 * George 2026-09-23 asked for a "These Stocks Just Hit 52-Week Lows" article.
 * Our `companies` table cannot answer that question: it is populated by Form 4
 * activity, so it holds the companies whose insiders file, not the market. Six
 * of the fifteen tickers in George's own example — FIS, LVS, TAP, AON, STZ,
 * CLX — are simply absent from it. A screen built on `companies` would have
 * dropped them silently, which is the worst kind of wrong: a plausible-looking
 * list that is missing its most famous names.
 *
 * So this table is the screening surface and `companies` stays the insider
 * surface. Nothing here feeds a score; it feeds lists.
 *
 * Cost per refresh: 1 screener call + ceil(n/50) batch quotes + ceil(n/50)
 * price-change calls ≈ 180 calls for a ~4,500-name universe, once a week.
 */

export interface UniverseRow {
  symbol: string;
  name: string | null;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  price: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  ytdPct: number | null;
  changePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  /** 0 = sitting exactly on the 52-week low, 1 = on the high. */
  rangePosition: number | null;
  /** How far below the 52-week high, as a negative percentage. */
  offHighPct: number | null;
  /** How far above the 52-week low, as a positive percentage. */
  offLowPct: number | null;
}

export interface ScreenOptions {
  /** 'lows' ranks the most beaten-down; 'highs' ranks the strongest. */
  kind: 'lows' | 'highs';
  /** Percent from the extreme that still counts as "at" it. */
  within?: number;
  limit?: number;
  minMarketCap?: number;
  /** Restrict to a sector, as the screener labels it. */
  sector?: string;
}

const DEFAULT_MIN_MARKET_CAP = 2_000_000_000;
const DEFAULT_WITHIN_PCT = 3;
const SCREEN_LIMIT = 15;
const STALE_MS = 8 * 86_400_000;

@Injectable()
export class MarketUniverseService implements OnModuleInit {
  private readonly log = new Logger(MarketUniverseService.name);
  private ready = false;
  private refreshing: Promise<unknown> | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
    } catch (e: any) {
      this.log.warn(`market-universe init failed: ${e?.message || e}`);
    }
  }

  /** Friday after the close, before the data-article crons at 22:30. */
  @Cron('0 22 * * 5')
  async weekly(): Promise<void> {
    if (process.env.VERCEL) return;
    await this.refresh().catch((e) => this.log.warn(`weekly refresh failed: ${e?.message || e}`));
  }

  async ensureTables(): Promise<void> {
    if (this.ready) return;
    await this.q(`CREATE TABLE IF NOT EXISTS market_universe (
      symbol       text PRIMARY KEY,
      name         text,
      exchange     text,
      sector       text,
      industry     text,
      country      text,
      market_cap   numeric,
      price        numeric,
      year_high    numeric,
      year_low     numeric,
      ytd_pct      numeric,
      change_pct   numeric,
      volume       numeric,
      avg_volume   numeric,
      refreshed_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS market_universe_cap_idx ON market_universe (market_cap DESC)`);
    await this.q(`CREATE INDEX IF NOT EXISTS market_universe_ytd_idx ON market_universe (ytd_pct)`);
    this.ready = true;
  }

  async status(): Promise<unknown> {
    await this.ensureTables();
    const [row] = await this.q<any[]>(
      `SELECT count(*)::int AS symbols,
              count(*) FILTER (WHERE year_low IS NOT NULL)::int AS quoted,
              count(*) FILTER (WHERE ytd_pct IS NOT NULL)::int AS with_ytd,
              max(refreshed_at) AS refreshed_at
       FROM market_universe`,
    );
    return { ...row, stale: !row?.refreshed_at || Date.now() - new Date(row.refreshed_at).getTime() > STALE_MS };
  }

  /**
   * Rebuild the universe. Three passes, each cheap: the screener names the
   * members, `batch-quote` prices them and carries the 52-week range, and
   * `stock-price-change` carries the year-to-date move the article's own
   * column is built from.
   */
  async refresh(opts: { minMarketCap?: number; limit?: number } = {}): Promise<unknown> {
    if (this.refreshing) return this.refreshing;
    const run = this.doRefresh(opts).finally(() => {
      this.refreshing = null;
    });
    this.refreshing = run;
    return run;
  }

  private async doRefresh(opts: { minMarketCap?: number; limit?: number }): Promise<unknown> {
    await this.ensureTables();
    if (!this.fmp.enabled) return { error: 'FMP key not configured' };
    const started = Date.now();
    const minCap = opts.minMarketCap ?? 300_000_000;

    const listed = await this.fmp.getScreener({
      exchange: 'NYSE,NASDAQ,AMEX',
      marketCapMoreThan: minCap,
      limit: opts.limit ?? 6000,
    });
    if (!listed.length) return { error: `screener returned nothing (${this.fmp.lastError ?? 'no detail'})` };

    // Suffixed symbols are foreign listings our price and article surfaces do
    // not cover; drop them here rather than carrying dead rows.
    const rows = listed.filter((r) => r.symbol && !r.symbol.includes('.') && r.isActivelyTrading !== false);
    const symbols = rows.map((r) => r.symbol);

    const quotes = await this.fmp.getQuotesBatch(symbols);
    // `getPriceChanges` already batches 50 symbols per call and runs the chunks
    // in parallel, so the whole universe costs ~90 requests, not 4,500.
    const priceChanges = await this.fmp.getPriceChanges(symbols);
    const changes = new Map<string, number>();
    for (const [sym, rec] of priceChanges) {
      if (rec?.ytd !== null && rec?.ytd !== undefined) changes.set(sym, rec.ytd);
    }

    let written = 0;
    for (let i = 0; i < rows.length; i += 250) {
      const chunk = rows.slice(i, i + 250);
      const values: string[] = [];
      const params: any[] = [];
      for (const r of chunk) {
        const q = quotes.get(r.symbol);
        const ch = changes.get(r.symbol);
        const n = params.length;
        values.push(`($${n + 1},$${n + 2},$${n + 3},$${n + 4},$${n + 5},$${n + 6},$${n + 7},$${n + 8},$${n + 9},$${n + 10},$${n + 11},$${n + 12},$${n + 13},$${n + 14},now())`);
        params.push(
          r.symbol,
          r.companyName ?? null,
          r.exchangeShortName ?? r.exchange ?? null,
          r.sector ?? null,
          r.industry ?? null,
          r.country ?? null,
          q?.marketCap ?? r.marketCap ?? null,
          q?.price ?? r.price ?? null,
          q?.fiftyTwoWeekHigh ?? null,
          q?.fiftyTwoWeekLow ?? null,
          ch ?? null,
          q?.changePct ?? null,
          q?.volume ?? r.volume ?? null,
          r.avgVolume ?? null,
        );
      }
      await this.q(
        `INSERT INTO market_universe
           (symbol,name,exchange,sector,industry,country,market_cap,price,year_high,year_low,ytd_pct,change_pct,volume,avg_volume,refreshed_at)
         VALUES ${values.join(',')}
         ON CONFLICT (symbol) DO UPDATE SET
           name = EXCLUDED.name, exchange = EXCLUDED.exchange, sector = EXCLUDED.sector,
           industry = EXCLUDED.industry, country = EXCLUDED.country, market_cap = EXCLUDED.market_cap,
           price = EXCLUDED.price, year_high = EXCLUDED.year_high, year_low = EXCLUDED.year_low,
           ytd_pct = COALESCE(EXCLUDED.ytd_pct, market_universe.ytd_pct),
           change_pct = EXCLUDED.change_pct, volume = EXCLUDED.volume,
           avg_volume = EXCLUDED.avg_volume, refreshed_at = now()`,
        params,
      );
      written += chunk.length;
    }

    // A name that leaves the screener (delisted, acquired, below the cap) must
    // not linger in a published list.
    await this.q(`DELETE FROM market_universe WHERE refreshed_at < now() - interval '2 days'`);

    const out = {
      screened: listed.length,
      kept: rows.length,
      quoted: quotes.size,
      withYtd: changes.size,
      written,
      ms: Date.now() - started,
    };
    this.log.log(`market universe refreshed: ${JSON.stringify(out)}`);
    return out;
  }

  /** Rows sitting at (or near) one end of their 52-week range. */
  async screen(opts: ScreenOptions): Promise<UniverseRow[]> {
    await this.ensureTables();
    const within = opts.within ?? DEFAULT_WITHIN_PCT;
    const limit = opts.limit ?? SCREEN_LIMIT;
    const minCap = opts.minMarketCap ?? DEFAULT_MIN_MARKET_CAP;

    // "At its 52-week low" means the last price is within `within`% of the
    // lowest print of the year. Ranked by the year-to-date move, because that
    // is the column the article shows — ranking by anything else would put the
    // bars out of order.
    const atLow = opts.kind === 'lows';
    const rows = await this.q<any[]>(
      `SELECT symbol, name, exchange, sector, industry, market_cap, price, year_high, year_low,
              ytd_pct, change_pct, volume, avg_volume
         FROM market_universe
        WHERE price > 0 AND year_low > 0 AND year_high > year_low
          AND market_cap >= $1
          AND ytd_pct IS NOT NULL
          AND ($2::text IS NULL OR sector = $2)
          AND ${atLow
            ? `price <= year_low * (1 + $3 / 100.0)`
            : `price >= year_high * (1 - $3 / 100.0)`}
        ORDER BY ytd_pct ${atLow ? 'ASC' : 'DESC'}
        LIMIT $4`,
      [minCap, opts.sector ?? null, within, limit],
    );
    return rows.map((r) => this.shape(r));
  }

  /** One row, for the per-stock breakdown to hang sector/industry off. */
  async get(symbol: string): Promise<UniverseRow | null> {
    await this.ensureTables();
    const [r] = await this.q<any[]>(`SELECT * FROM market_universe WHERE symbol = $1`, [symbol.toUpperCase()]);
    return r ? this.shape(r) : null;
  }

  async getMany(symbols: string[]): Promise<Map<string, UniverseRow>> {
    await this.ensureTables();
    const out = new Map<string, UniverseRow>();
    if (!symbols.length) return out;
    const rows = await this.q<any[]>(
      `SELECT * FROM market_universe WHERE symbol = ANY($1)`,
      [symbols.map((s) => s.toUpperCase())],
    );
    for (const r of rows) out.set(r.symbol, this.shape(r));
    return out;
  }

  private shape(r: any): UniverseRow {
    const num = (v: any) => (v === null || v === undefined ? null : Number(v));
    const price = num(r.price);
    const hi = num(r.year_high);
    const lo = num(r.year_low);
    const span = hi !== null && lo !== null ? hi - lo : null;
    return {
      symbol: r.symbol,
      name: r.name ?? null,
      exchange: r.exchange ?? null,
      sector: r.sector ?? null,
      industry: r.industry ?? null,
      marketCap: num(r.market_cap),
      price,
      yearHigh: hi,
      yearLow: lo,
      ytdPct: num(r.ytd_pct),
      changePct: num(r.change_pct),
      volume: num(r.volume),
      avgVolume: num(r.avg_volume),
      rangePosition: span && span > 0 && price !== null && lo !== null ? Math.max(0, Math.min(1, (price - lo) / span)) : null,
      offHighPct: hi && hi > 0 && price !== null ? ((price - hi) / hi) * 100 : null,
      offLowPct: lo && lo > 0 && price !== null ? ((price - lo) / lo) * 100 : null,
    };
  }
}
