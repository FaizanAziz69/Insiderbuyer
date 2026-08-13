import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketProfileSnapshot } from '../entities/market-profile.entity';
import { FmpService } from '../fmp/fmp.service';

/** What the movers/heatmap read path needs off a snapshot row. */
export interface SnapshotRow {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  lastDividend: number | null;
}

/**
 * Owner of `market_profile_snapshot`: one bulk refresh writes it, the
 * market-wide lists read it.
 *
 * This is the licensed replacement for scraping Yahoo. Every market-wide page
 * currently goes through a cookie+crumb handshake against Yahoo's screener,
 * which is unlicensed, breaks on crumb rotation, and 500s outright on some
 * sorts (the losers table has to pull by volume and re-sort locally because of
 * it). `profile-bulk` answers the same question for the whole universe in one
 * licensed call.
 */
@Injectable()
export class MarketSnapshotService {
  private readonly logger = new Logger(MarketSnapshotService.name);

  /** US listings kept in the snapshot. AMEX is included because plenty of real
   *  movers list there, even though the $100M screener universe excludes it. */
  private static readonly US_EXCHANGES = new Set(['NASDAQ', 'NYSE', 'AMEX']);

  /**
   * Non-common-stock share classes, which we never want on a page that claims
   * to list companies.
   *
   * FMP suffixes preferred shares `-P` plus a series letter (JPM-PK, BAC-PO,
   * MS-PE, GS-PC), and warrants/units/rights `-W`/`-U`/`-R`. 290 preferred
   * lines clear the $100M cap floor, and because they cluster in banking they
   * took over the heatmap's Financial Services block with securities that are
   * closer to bonds than to companies.
   *
   * Deliberately NOT a blanket "symbol contains a dash": BRK-B, BF-B, LEN-B,
   * HEI-A, UHAL-B, MOG-A and CRD-A/B are ordinary dual-class common stock and
   * must stay.
   */
  private static readonly NON_COMMON_SUFFIX = /-(?:P[A-Z]?|W[SI]?|U|R)$/;

  constructor(
    @InjectRepository(MarketProfileSnapshot)
    private readonly repo: Repository<MarketProfileSnapshot>,
    @Optional() private readonly fmp?: FmpService,
  ) {}

  /**
   * TypeORM's `synchronize` is off under serverless, so a new entity never gets
   * a table — create just this one rather than turning DB_SYNC on, which would
   * let TypeORM alter every other table in the schema.
   */
  private async ensureTable(): Promise<void> {
    try {
      await this.repo.query(
        `CREATE TABLE IF NOT EXISTS market_profile_snapshot (
           symbol varchar(16) NOT NULL,
           name varchar(220) NOT NULL DEFAULT '',
           price numeric(20,6),
           "changeAbs" numeric(20,6),
           "changePct" numeric(14,6),
           volume bigint,
           "avgVolume" bigint,
           "marketCap" numeric(24,2),
           sector varchar(120),
           industry varchar(160),
           exchange varchar(32),
           "fiftyTwoWeekLow" numeric(20,6),
           "fiftyTwoWeekHigh" numeric(20,6),
           "lastDividend" numeric(20,6),
           "isFundLike" boolean NOT NULL DEFAULT false,
           "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
           CONSTRAINT "PK_market_profile_snapshot" PRIMARY KEY (symbol)
         )`,
      );
      await this.repo.query(
        `CREATE INDEX IF NOT EXISTS "IDX_mps_changePct" ON market_profile_snapshot ("changePct")`,
      );
      await this.repo.query(
        `CREATE INDEX IF NOT EXISTS "IDX_mps_marketCap" ON market_profile_snapshot ("marketCap")`,
      );
    } catch (e: any) {
      this.logger.warn(`Snapshot table check failed: ${e?.message || e}`);
    }
  }

  /** Refill the snapshot from FMP. Never blanks a populated table on failure. */
  async refresh(opts: { timeoutMs?: number } = {}): Promise<{
    universe: number;
    fetched: number;
    written: number;
    purged?: number;
    error?: string;
  }> {
    if (!this.fmp?.enabled) {
      return { universe: 0, fetched: 0, written: 0, error: 'FMP_API_KEY not set' };
    }
    await this.ensureTable();
    // Deliberately NOT filtered to the $100M screener universe. The movers
    // tables are where this is read, and a market's biggest movers are mostly
    // small caps — filtering to the universe cut top gainers from 95 rows to
    // 51 and losers from 55 to 20 against the scrape it replaces. Keep every
    // US listing instead; ~14k rows is a small table and full coverage is the
    // whole point.
    const profiles = await this.fmp.streamProfilesBulk(undefined, opts);
    if (!profiles.size) {
      return {
        universe: 0,
        fetched: 0,
        written: 0,
        error: this.fmp.lastError || 'bulk feed returned no rows',
      };
    }
    const kept = Array.from(profiles.values()).filter(
      (p) =>
        MarketSnapshotService.US_EXCHANGES.has((p.exchange || '').toUpperCase()) &&
        !MarketSnapshotService.NON_COMMON_SUFFIX.test(p.symbol.toUpperCase()),
    );
    if (!kept.length) {
      return { universe: 0, fetched: profiles.size, written: 0, error: 'no US listings in feed' };
    }

    // The feed carries occasional garbage that is wider than the column it
    // lands in — TOPS reports a lastDividend of 3.8e14, i.e. $380 trillion per
    // share, which overflowed numeric(20,6) and failed the whole batch. Drop
    // anything past a plausible bound rather than clamp: a clamped figure would
    // render as a real number. Bounds are sanity limits, not column limits.
    const sane = (n: number | null, max: number): string | null =>
      n == null || !Number.isFinite(n) || Math.abs(n) > max ? null : String(n);
    const str = (n: number | null) => sane(n, 1e9);
    const bigint = (n: number | null): string | null =>
      n == null || !Number.isFinite(n) || Math.abs(n) > 1e15 ? null : String(Math.round(n));
    const rows = kept.map((p) => ({
      symbol: p.symbol.slice(0, 16),
      name: (p.name || '').slice(0, 220),
      price: str(p.price),
      changeAbs: str(p.changeAbs),
      changePct: sane(p.changePct, 1e6),
      volume: bigint(p.volume),
      avgVolume: bigint(p.avgVolume),
      marketCap: sane(p.marketCap, 1e16),
      sector: p.sector?.slice(0, 120) ?? null,
      industry: p.industry?.slice(0, 160) ?? null,
      exchange: p.exchange?.slice(0, 32) ?? null,
      fiftyTwoWeekLow: str(p.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: str(p.fiftyTwoWeekHigh),
      lastDividend: sane(p.lastDividend, 1e6),
      isFundLike: p.isFundLike,
    }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await this.repo.upsert(chunk, ['symbol']);
      written += chunk.length;
    }
    // Upsert only ever adds or updates, so anything the filters started
    // excluding stays in the table forever unless it is deleted — the
    // preferred lines were still on the heat map after the write that stopped
    // accepting them. Purge them here so the fix applies to rows already
    // stored, not just to future writes.
    let purged = 0;
    try {
      const res = await this.repo.query(
        `DELETE FROM market_profile_snapshot
          WHERE symbol ~ '-(P[A-Z]?|W[SI]?|U|R)$'`,
      );
      purged = Array.isArray(res) ? res.length : (res?.[1] ?? 0);
    } catch (e: any) {
      this.logger.warn(`Snapshot purge failed: ${e?.message || e}`);
    }

    this.logger.log(
      `Market snapshot: ${written} US symbols written (${profiles.size} in feed), ${purged} non-common purged.`,
    );
    return { universe: kept.length, fetched: profiles.size, written, purged };
  }

  /** Refresh only when stale — see PeCacheService.refreshIfStale for why the
   *  cron route cannot be token-guarded and leans on this instead. */
  async refreshIfStale(maxAgeMs = 6 * 60 * 60_000, opts: { timeoutMs?: number } = {}) {
    const status = await this.status();
    if (status.rows > 0 && status.updatedAt) {
      const age = Date.now() - new Date(status.updatedAt).getTime();
      if (age < maxAgeMs) {
        return { skipped: true, ageMinutes: Math.round(age / 60_000), ...status };
      }
    }
    const result = await this.refresh(opts);
    return { skipped: false, ...result, ...(await this.status()) };
  }

  async status(): Promise<{ rows: number; updatedAt: string | null }> {
    try {
      const rows = await this.repo.count();
      const latest = await this.repo.find({ order: { updatedAt: 'DESC' }, take: 1 });
      return { rows, updatedAt: latest[0]?.updatedAt?.toISOString() ?? null };
    } catch {
      return { rows: 0, updatedAt: null };
    }
  }

  /**
   * Ticker/name lookup for the search box. Exact ticker first, then prefix,
   * then anything containing the term — largest company first inside each
   * band, so "AP" offers AAPL before an obscure microcap.
   *
   * No freshness window: a listing's existence does not go stale the way a
   * day's price change does, and an empty search box is worse than one
   * answering from this morning's table.
   */
  async search(qRaw: string, limit = 8): Promise<SnapshotRow[]> {
    const q = (qRaw || '').trim();
    if (!q) return [];
    try {
      const rows = await this.repo
        .createQueryBuilder('m')
        .where('m."isFundLike" = false')
        .andWhere('(UPPER(m.symbol) LIKE :pre OR UPPER(m.name) LIKE :any)', {
          pre: `${q.toUpperCase()}%`,
          any: `%${q.toUpperCase()}%`,
        })
        .orderBy(
          `CASE WHEN UPPER(m.symbol) = :exact THEN 0
                WHEN UPPER(m.symbol) LIKE :pre THEN 1
                ELSE 2 END`,
          'ASC',
        )
        .addOrderBy('m."marketCap"', 'DESC', 'NULLS LAST')
        .setParameter('exact', q.toUpperCase())
        .limit(Math.max(1, Math.min(limit, 50)))
        .getMany();
      return rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        price: Number(r.price ?? 0),
        changeAbs: Number(r.changeAbs ?? 0),
        changePct: Number(r.changePct ?? 0),
        volume: Number(r.volume ?? 0),
        avgVolume: Number(r.avgVolume ?? 0),
        marketCap: r.marketCap == null ? null : Number(r.marketCap),
        sector: r.sector,
        industry: r.industry,
        exchange: r.exchange,
        fiftyTwoWeekLow: null,
        fiftyTwoWeekHigh: null,
        lastDividend: null,
      }));
    } catch (e: any) {
      this.logger.warn(`Snapshot search failed: ${e?.message || e}`);
      return [];
    }
  }

  /** Why a read fell back: which filter emptied the result. Diagnostics only. */
  async diagnose(): Promise<Record<string, unknown>> {
    const out: Record<string, unknown> = {};
    const count = async (label: string, sql: string) => {
      try {
        const r = await this.repo.query(`SELECT COUNT(*)::int AS n FROM market_profile_snapshot ${sql}`);
        out[label] = r?.[0]?.n ?? null;
      } catch (e: any) {
        out[label] = `ERR ${e?.message || e}`;
      }
    };
    await count('total', '');
    await count('notFund', 'WHERE "isFundLike" = false');
    await count('hasPriceAndChange', 'WHERE price IS NOT NULL AND "changePct" IS NOT NULL');
    await count('fresh90m', `WHERE "updatedAt" > NOW() - INTERVAL '5400 seconds'`);
    await count('nasdaqNyse', `WHERE exchange IN ('NASDAQ','NYSE')`);
    await count(
      'gainersAll',
      `WHERE "isFundLike" = false AND price IS NOT NULL AND "changePct" >= 10
         AND exchange IN ('NASDAQ','NYSE') AND "updatedAt" > NOW() - INTERVAL '5400 seconds'`,
    );
    try {
      const ex = await this.repo.query(
        `SELECT exchange, COUNT(*)::int AS n FROM market_profile_snapshot GROUP BY exchange ORDER BY n DESC LIMIT 8`,
      );
      out.exchanges = ex;
    } catch (e: any) {
      out.exchanges = `ERR ${e?.message || e}`;
    }
    out.sampleQuery = (await this.query({ order: 'gainers', limit: 5, minChangePct: 10 })).map(
      (r) => [r.symbol, r.changePct, r.exchange],
    );
    return out;
  }

  /**
   * Movers/heatmap rows straight off the snapshot, already ordered.
   *
   * Returns an empty array on any failure or when the snapshot is stale enough
   * to be misleading, so every caller can treat "empty" as "fall back to the
   * existing path" and no page can be left worse off than before.
   */
  async query(opts: {
    order: 'gainers' | 'losers' | 'volume' | 'cap';
    limit: number;
    minChangePct?: number;
    minMarketCap?: number;
    maxPrice?: number;
    exchanges?: string[];
    maxAgeMs?: number;
  }): Promise<SnapshotRow[]> {
    const maxAge = opts.maxAgeMs ?? 24 * 60 * 60_000;
    try {
      const qb = this.repo
        .createQueryBuilder('m')
        .where('m."isFundLike" = false')
        .andWhere('m.price IS NOT NULL')
        .andWhere('m."changePct" IS NOT NULL')
        .andWhere(`m."updatedAt" > NOW() - INTERVAL '${Math.round(maxAge / 1000)} seconds'`);
      if (opts.exchanges?.length) {
        qb.andWhere('m.exchange IN (:...ex)', { ex: opts.exchanges });
      }
      if (opts.minChangePct != null) {
        const cmp = opts.order === 'losers' ? '<=' : '>=';
        qb.andWhere(`m."changePct" ${cmp} :min`, { min: opts.minChangePct });
      }
      if (opts.minMarketCap != null) {
        qb.andWhere('m."marketCap" >= :mcap', { mcap: opts.minMarketCap });
      }
      if (opts.maxPrice != null) {
        qb.andWhere('m.price <= :maxPrice AND m.price > 0', { maxPrice: opts.maxPrice });
      }
      const dir =
        opts.order === 'gainers' ? { col: 'm."changePct"', d: 'DESC' as const }
        : opts.order === 'losers' ? { col: 'm."changePct"', d: 'ASC' as const }
        : opts.order === 'volume' ? { col: 'm.volume', d: 'DESC' as const }
        : { col: 'm."marketCap"', d: 'DESC' as const };
      qb.orderBy(dir.col, dir.d).limit(Math.max(1, opts.limit));
      const rows = await qb.getMany();
      return rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        price: Number(r.price),
        changeAbs: Number(r.changeAbs ?? 0),
        changePct: Number(r.changePct),
        volume: Number(r.volume ?? 0),
        avgVolume: Number(r.avgVolume ?? 0),
        marketCap: r.marketCap == null ? null : Number(r.marketCap),
        sector: r.sector,
        industry: r.industry,
        exchange: r.exchange,
        fiftyTwoWeekLow: r.fiftyTwoWeekLow == null ? null : Number(r.fiftyTwoWeekLow),
        fiftyTwoWeekHigh: r.fiftyTwoWeekHigh == null ? null : Number(r.fiftyTwoWeekHigh),
        lastDividend: r.lastDividend == null ? null : Number(r.lastDividend),
      }));
    } catch (e: any) {
      this.logger.warn(`Snapshot query failed: ${e?.message || e}`);
      return [];
    }
  }
}
