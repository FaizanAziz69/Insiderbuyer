import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PeRatioCache } from '../entities/pe-ratio-cache.entity';
import { FmpService } from '../fmp/fmp.service';
import { UNIVERSE_SCREENER_QUERY } from './market-universe';

/**
 * Owner of `pe_ratio_cache`: one bulk refresh writes it, every list page reads
 * it.
 *
 * This exists because P/E is the one column that could never be filled on the
 * request path — FMP serves trailing ratios one symbol per request, so a
 * 500-row table needed 500 HTTP calls against a ~10s gateway limit and most
 * cells stayed em-dashes. `ratios-ttm-bulk` answers for every symbol in a
 * single call, so the cost moves off the request entirely.
 */
@Injectable()
export class PeCacheService {
  private readonly logger = new Logger(PeCacheService.name);

  constructor(
    @InjectRepository(PeRatioCache)
    private readonly repo: Repository<PeRatioCache>,
    @Optional() private readonly fmp?: FmpService,
  ) {}

  /**
   * Refill the table from FMP. Returns counts so the admin endpoint and the
   * daily cron both report something meaningful.
   *
   * Only universe symbols are stored — the feed carries ~71k symbols worldwide
   * against the few thousand US names we render, so filtering before the write
   * keeps the table and the DB traffic small.
   */
  async refresh(opts: { timeoutMs?: number } = {}): Promise<{
    universe: number;
    fetched: number;
    written: number;
    error?: string;
  }> {
    if (!this.fmp?.enabled) {
      return { universe: 0, fetched: 0, written: 0, error: 'FMP_API_KEY not set' };
    }
    // Budget generously: this runs off the request path, and an empty universe
    // here would silently narrow the refresh to nothing.
    const snap = await this.fmp.getScreenerSnapshot(UNIVERSE_SCREENER_QUERY, {
      budgetMs: 30_000,
    });
    const keep = new Set(snap.keys());
    if (!keep.size) {
      return { universe: 0, fetched: 0, written: 0, error: 'empty screener universe' };
    }

    const pes = await this.fmp.streamPeRatiosBulk(keep, { timeoutMs: opts.timeoutMs });
    if (!pes.size) {
      // Never blank a populated table because one fetch failed — the previous
      // day's ratios are far better than an empty column.
      return {
        universe: keep.size,
        fetched: 0,
        written: 0,
        error: this.fmp.lastError || 'bulk feed returned no rows',
      };
    }

    const rows = Array.from(pes, ([symbol, peRatio]) => ({
      symbol: symbol.slice(0, 12),
      peRatio: String(peRatio),
    }));
    let written = 0;
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      await this.repo.upsert(chunk, ['symbol']);
      written += chunk.length;
    }
    this.logger.log(
      `P/E cache: ${written} symbols written from ratios-ttm-bulk (universe ${keep.size}).`,
    );
    return { universe: keep.size, fetched: pes.size, written };
  }

  /**
   * Trailing P/E for the given symbols, positives only — a loss-making company
   * genuinely has no trailing P/E and must stay an em-dash rather than render a
   * negative multiple, which is the same rule the request-path filler applied.
   * Never throws: a DB failure degrades to an empty map and the caller's
   * existing per-symbol path still runs.
   */
  async lookup(symbolsRaw: string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    const symbols = Array.from(
      new Set(symbolsRaw.map((s) => (s || '').toUpperCase()).filter(Boolean)),
    );
    if (!symbols.length) return out;
    try {
      for (let i = 0; i < symbols.length; i += 1000) {
        const rows = await this.repo.find({
          where: { symbol: In(symbols.slice(i, i + 1000)) },
        });
        for (const r of rows) {
          const pe = Number(r.peRatio);
          if (Number.isFinite(pe) && pe > 0) out.set(r.symbol, +pe.toFixed(2));
        }
      }
    } catch (e: any) {
      this.logger.warn(`P/E cache lookup failed: ${e?.message || e}`);
    }
    return out;
  }

  /**
   * Refresh only if the table is older than `maxAgeMs`. This is what the daily
   * cron calls: the route has to be reachable without a token (Vercel crons
   * send a plain GET), so the freshness check is also what stops a public URL
   * from triggering a ~70MB download on every hit.
   */
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

  /** Row count + freshness, for the admin endpoint's response. */
  async status(): Promise<{ rows: number; updatedAt: string | null }> {
    try {
      const rows = await this.repo.count();
      const latest = await this.repo.find({
        order: { updatedAt: 'DESC' },
        take: 1,
      });
      return { rows, updatedAt: latest[0]?.updatedAt?.toISOString() ?? null };
    } catch {
      return { rows: 0, updatedAt: null };
    }
  }
}
