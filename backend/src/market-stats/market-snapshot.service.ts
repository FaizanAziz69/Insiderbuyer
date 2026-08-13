import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MarketProfileSnapshot } from '../entities/market-profile.entity';
import { FmpService } from '../fmp/fmp.service';
import { UNIVERSE_SCREENER_QUERY } from './market-universe';

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
    error?: string;
  }> {
    if (!this.fmp?.enabled) {
      return { universe: 0, fetched: 0, written: 0, error: 'FMP_API_KEY not set' };
    }
    await this.ensureTable();
    const snap = await this.fmp.getScreenerSnapshot(UNIVERSE_SCREENER_QUERY, {
      budgetMs: 30_000,
    });
    const keep = new Set(snap.keys());
    if (!keep.size) {
      return { universe: 0, fetched: 0, written: 0, error: 'empty screener universe' };
    }

    const profiles = await this.fmp.streamProfilesBulk(keep, opts);
    if (!profiles.size) {
      return {
        universe: keep.size,
        fetched: 0,
        written: 0,
        error: this.fmp.lastError || 'bulk feed returned no rows',
      };
    }

    const str = (n: number | null) => (n == null ? null : String(n));
    const rows = Array.from(profiles.values(), (p) => ({
      symbol: p.symbol.slice(0, 16),
      name: (p.name || '').slice(0, 220),
      price: str(p.price),
      changeAbs: str(p.changeAbs),
      changePct: str(p.changePct),
      volume: p.volume == null ? null : String(Math.round(p.volume)),
      avgVolume: p.avgVolume == null ? null : String(Math.round(p.avgVolume)),
      marketCap: str(p.marketCap),
      sector: p.sector?.slice(0, 120) ?? null,
      industry: p.industry?.slice(0, 160) ?? null,
      exchange: p.exchange?.slice(0, 32) ?? null,
      fiftyTwoWeekLow: str(p.fiftyTwoWeekLow),
      fiftyTwoWeekHigh: str(p.fiftyTwoWeekHigh),
      lastDividend: str(p.lastDividend),
      isFundLike: p.isFundLike,
    }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await this.repo.upsert(chunk, ['symbol']);
      written += chunk.length;
    }
    this.logger.log(`Market snapshot: ${written} symbols written (universe ${keep.size}).`);
    return { universe: keep.size, fetched: profiles.size, written };
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
