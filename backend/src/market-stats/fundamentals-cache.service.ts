import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { FundamentalsCache } from '../entities/fundamentals-cache.entity';
import { FmpService } from '../fmp/fmp.service';

/** What the read path gets per symbol. Numbers, not entity strings. */
export interface FundamentalsRow {
  symbol: string;
  floatShares: number | null;
  outstandingShares: number | null;
  freeFloatPct: number | null;
  ptCount: number | null;
  ptAvgTarget: number | null;
}

/**
 * Owner of `fundamentals_cache`: bulk refreshes write it, list pages read it.
 *
 * Same shape as PeCacheService, for the same reason — the analyst-target and
 * float columns could never be filled on the request path (both lived behind
 * one-symbol-per-request endpoints inside a few-second budget, so most rows
 * rendered em-dashes). The two bulk feeds answer for every symbol in one
 * fetch, so the cost moves off the request entirely.
 *
 * The two feeds are refreshed INDEPENDENTLY: each pass upserts only its own
 * columns, so a failed price-target fetch can never blank yesterday's float
 * data or vice versa.
 */
@Injectable()
export class FundamentalsCacheService {
  private readonly logger = new Logger(FundamentalsCacheService.name);

  constructor(
    @InjectRepository(FundamentalsCache)
    private readonly repo: Repository<FundamentalsCache>,
    @Optional() private readonly fmp?: FmpService,
  ) {}

  /** TypeORM `synchronize` is off under serverless (see PeCacheService), so
   *  the table is created here: idempotent, scoped, matching the entity. */
  private async ensureTable(): Promise<void> {
    try {
      await this.repo.query(
        `CREATE TABLE IF NOT EXISTS fundamentals_cache (
           symbol varchar(16) NOT NULL,
           "floatShares" bigint,
           "outstandingShares" bigint,
           "freeFloatPct" numeric(9,4),
           "ptCount" int,
           "ptAvgTarget" numeric(18,4),
           "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
           CONSTRAINT "PK_fundamentals_cache" PRIMARY KEY (symbol)
         )`,
      );
    } catch (e: any) {
      this.logger.warn(`Fundamentals table check failed: ${e?.message || e}`);
    }
  }

  /** US-listing filter for the worldwide feeds. Suffixed symbols (000001.SZ,
   *  AIR.PA) are foreign listings no page renders; storing them would triple
   *  the table for rows nothing reads. Dashed US classes (BRK-B) stay. */
  private static isUsSymbol(symbol: string): boolean {
    return !!symbol && symbol.length <= 16 && !symbol.includes('.');
  }

  /**
   * Refill from FMP. Returns per-feed counts so the admin endpoint and the
   * workflow log show which feed did what — a silent zero here is how a column
   * quietly dies.
   */
  async refresh(opts: { timeoutMs?: number } = {}): Promise<{
    floats: number;
    targets: number;
    error?: string;
  }> {
    if (!this.fmp?.enabled) {
      return { floats: 0, targets: 0, error: 'FMP_API_KEY not set' };
    }
    await this.ensureTable();

    const errors: string[] = [];

    // Feed 1: float / shares outstanding.
    let floats = 0;
    const floatMap = await this.fmp.getSharesFloatAllBulk(undefined, opts);
    if (floatMap.size) {
      const rows = Array.from(floatMap.entries())
        .filter(([sym]) => FundamentalsCacheService.isUsSymbol(sym))
        .map(([symbol, f]) => ({
          symbol,
          floatShares: f.floatShares == null ? null : String(f.floatShares),
          outstandingShares: f.outstandingShares == null ? null : String(f.outstandingShares),
          freeFloatPct: f.freeFloatPct == null ? null : String(f.freeFloatPct),
        }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await this.repo.upsert(chunk, ['symbol']);
        floats += chunk.length;
      }
    } else {
      errors.push(this.fmp.lastError || 'shares-float-all returned no rows');
    }

    // Feed 2: analyst price-target summary.
    let targets = 0;
    const ptMap = await this.fmp.streamPriceTargetSummaryBulk(undefined, opts);
    if (ptMap.size) {
      const rows = Array.from(ptMap.entries())
        .filter(([sym]) => FundamentalsCacheService.isUsSymbol(sym))
        .map(([symbol, t]) => ({
          symbol,
          ptCount: t.count,
          ptAvgTarget: String(t.avgTarget),
        }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        await this.repo.upsert(chunk, ['symbol']);
        targets += chunk.length;
      }
    } else {
      errors.push(this.fmp.lastError || 'price-target-summary-bulk returned no rows');
    }

    this.logger.log(
      `Fundamentals cache: ${floats} float rows, ${targets} target rows written.`,
    );
    return {
      floats,
      targets,
      ...(errors.length ? { error: errors.join(' | ') } : {}),
    };
  }

  /** Refresh only when stale — the public cron route's guard against a bare
   *  GET triggering the full multi-feed download on every hit. */
  async refreshIfStale(maxAgeMs = 12 * 60 * 60_000, opts: { timeoutMs?: number } = {}) {
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

  /** Row count, per-column coverage and freshness, for the admin endpoint. */
  async status(): Promise<{
    rows: number;
    withFloat: number;
    withTarget: number;
    updatedAt: string | null;
  }> {
    try {
      const [r] = await this.repo.query(
        `SELECT COUNT(*)::int AS rows,
                COUNT("floatShares")::int AS "withFloat",
                COUNT("ptAvgTarget")::int AS "withTarget",
                MAX("updatedAt") AS "updatedAt"
           FROM fundamentals_cache`,
      );
      return {
        rows: r?.rows ?? 0,
        withFloat: r?.withFloat ?? 0,
        withTarget: r?.withTarget ?? 0,
        updatedAt: r?.updatedAt ? new Date(r.updatedAt).toISOString() : null,
      };
    } catch {
      return { rows: 0, withFloat: 0, withTarget: 0, updatedAt: null };
    }
  }

  /**
   * Fundamentals for the given symbols in one indexed query. Never throws — a
   * DB failure degrades to an empty map and every caller's existing per-symbol
   * path still runs, so worst case behaviour is exactly what it was.
   */
  async lookup(symbolsRaw: string[]): Promise<Map<string, FundamentalsRow>> {
    const out = new Map<string, FundamentalsRow>();
    const symbols = Array.from(
      new Set(symbolsRaw.map((s) => (s || '').toUpperCase()).filter(Boolean)),
    );
    if (!symbols.length) return out;
    const num = (v: string | null): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    };
    try {
      for (let i = 0; i < symbols.length; i += 1000) {
        const rows = await this.repo.find({
          where: { symbol: In(symbols.slice(i, i + 1000)) },
        });
        for (const r of rows) {
          out.set(r.symbol, {
            symbol: r.symbol,
            floatShares: num(r.floatShares),
            outstandingShares: num(r.outstandingShares),
            freeFloatPct: num(r.freeFloatPct),
            ptCount: r.ptCount,
            ptAvgTarget: num(r.ptAvgTarget),
          });
        }
      }
    } catch (e: any) {
      this.logger.warn(`Fundamentals lookup failed: ${e?.message || e}`);
    }
    return out;
  }
}
