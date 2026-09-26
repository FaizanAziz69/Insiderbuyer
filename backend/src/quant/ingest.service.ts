import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { PitService } from './pit.service';
import { QuantService } from './quant.service';

/**
 * Filling L1 (Brief v6 §3).
 *
 * The walk is deliberately resumable and bounded: it records where it got to
 * and takes a slice per run, so a universe of thousands of symbols fills over
 * several nights instead of holding one process open for hours. Bulk fetches
 * bypass the vendor client's in-process caches, which is the lesson from the
 * heap exhaustion on 2026-09-23.
 */

@Injectable()
export class QuantIngestService {
  private readonly log = new Logger(QuantIngestService.name);
  private running = false;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly pit: PitService,
    private readonly quant: QuantService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  private async cursor(key: string): Promise<string | null> {
    const rows = await this.q<Array<{ value: any }>>(`SELECT value FROM quant_config WHERE key = $1`, [key]);
    return rows[0]?.value?.cursor ?? null;
  }

  private async setCursor(key: string, cursor: string | null): Promise<void> {
    await this.q(
      `INSERT INTO quant_config (key, value) VALUES ($1, $2::jsonb)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify({ cursor })],
    );
  }

  /** One bounded slice of the fundamentals walk. */
  async ingestFundamentals(limit = 250, quarters = 44, activeOnly = false): Promise<any> {
    if (this.running) return { started: false, reason: 'already running' };
    this.running = true;
    try {
      await this.pit.ensureTables();
      const cursorKey = activeOnly ? 'pit:fundamentals:cursor:active' : 'pit:fundamentals:cursor';
      const after = await this.cursor(cursorKey);
      const cfg = await this.quant.config();
      const queue = await this.pit.ingestCandidates(cfg.universe.countries, after, limit, undefined, activeOnly);
      const rows = queue.map((symbol) => ({ symbol }));
      let facts = 0;
      let symbols = 0;
      let failed = 0;
      for (const r of rows) {
        try {
          facts += await this.pit.ingestSymbol(r.symbol, quarters);
          symbols++;
        } catch (e: any) {
          failed++;
          this.log.warn(`pit fundamentals ${r.symbol}: ${e?.message || e}`);
        }
      }
      const next = rows.length ? rows[rows.length - 1].symbol : null;
      await this.setCursor(cursorKey, rows.length < limit ? null : next);
      const wrapped = rows.length < limit;
      this.log.log(`pit fundamentals: ${symbols} symbols, ${facts} quarters${wrapped ? ' (cursor wrapped)' : ''}`);
      return { symbols, facts, failed, cursor: rows.length < limit ? null : next, wrapped };
    } finally {
      this.running = false;
    }
  }

  /** One bounded slice of the price/volume walk. */
  async ingestPrices(limit = 250, from = '2006-01-01', activeOnly = false): Promise<any> {
    await this.pit.ensureTables();
    const pcKey = activeOnly ? 'pit:prices:cursor:active' : 'pit:prices:cursor';
    const after = await this.cursor(pcKey);
    const cfg = await this.quant.config();
    const queue = await this.pit.ingestCandidates(cfg.universe.countries, after, limit, { table: 'pit_price_series', days: 7 }, activeOnly);
    const rows = queue.map((symbol) => ({ symbol }));
    let points = 0;
    let symbols = 0;
    for (const r of rows) {
      try {
        const n = await this.pit.ingestPrices(r.symbol, from);
        if (n) symbols++;
        points += n;
      } catch (e: any) {
        this.log.warn(`pit prices ${r.symbol}: ${e?.message || e}`);
      }
    }
    const next = rows.length ? rows[rows.length - 1].symbol : null;
    await this.setCursor(pcKey, rows.length < limit ? null : next);
    return { symbols, points, cursor: rows.length < limit ? null : next, wrapped: rows.length < limit };
  }

  /**
   * Market-cap history, for point-in-time size screens.
   *
   * `from` is not optional in practice: without it FMP returns only the last
   * 65 sessions however large a `limit` is passed, and every ranking before
   * about three months ago then fails the size gate for want of a market cap.
   * With it the same endpoint returns 2,193 sessions back to 2018.
   */
  async ingestMarketCaps(limit = 200, activeOnly = false, from = '2006-01-01'): Promise<any> {
    await this.pit.ensureTables();
    const mcKey = activeOnly ? 'pit:mcap:cursor:active' : 'pit:mcap:cursor';
    const after = await this.cursor(mcKey);
    const cfg = await this.quant.config();
    const queue = await this.pit.ingestCandidates(cfg.universe.countries, after, limit, { table: 'pit_marketcap', days: 30 }, activeOnly);
    const rows = queue.map((symbol) => ({ symbol }));
    let symbols = 0;
    for (const r of rows) {
      try {
        const hist = await this.fmp.getMarketCapHistory(r.symbol, from);
        if (!hist.length) continue;
        const points = hist
          .map((h) => [new Date(`${h.date}T00:00:00Z`).getTime(), h.marketCap])
          .sort((a, b) => a[0] - b[0]);
        await this.q(
          `INSERT INTO pit_marketcap (symbol, points, updated_at) VALUES ($1,$2::jsonb,now())
           ON CONFLICT (symbol) DO UPDATE SET points = EXCLUDED.points, updated_at = now()`,
          [r.symbol, JSON.stringify(points)],
        );
        symbols++;
      } catch (e: any) {
        this.log.warn(`pit marketcap ${r.symbol}: ${e?.message || e}`);
      }
    }
    const next = rows.length ? rows[rows.length - 1].symbol : null;
    await this.setCursor(mcKey, rows.length < limit ? null : next);
    return { symbols, cursor: rows.length < limit ? null : next, wrapped: rows.length < limit };
  }

  /**
   * Seed the §7.1 benchmark blend into the price store.
   *
   * The benchmarks are not companies we cover, so the universe walk never
   * reaches them, and without their series every capture ratio comes back
   * null — which silently removes the one test §7 uses to accept or reject a
   * parameter set. Idempotent, so it can run on every boot.
   */
  async ingestBenchmarks(from = '2006-01-01'): Promise<any> {
    await this.pit.ensureTables();
    const cfg = await this.quant.config();
    const out: Record<string, number> = {};
    for (const b of cfg.risk.benchmarkBlend) {
      try {
        out[b.symbol] = await this.pit.ingestPrices(b.symbol, from);
      } catch (e: any) {
        this.log.warn(`benchmark ${b.symbol}: ${e?.message || e}`);
        out[b.symbol] = 0;
      }
    }
    return out;
  }

  /** Nightly: refresh the universe, then take one slice of each walk. */
  @Cron('40 3 * * *')
  async nightly(): Promise<void> {
    try {
      await this.pit.refreshUniverse();
      await this.ingestBenchmarks();
      // Live names first: they are what the engine ranks tonight.
      await this.ingestFundamentals(200, 44, true);
      await this.ingestPrices(200, '2006-01-01', true);
      await this.ingestMarketCaps(150, true);
      await this.ingestFundamentals(100);
      await this.ingestPrices(100);
    } catch (e: any) {
      this.log.error(`pit nightly failed: ${e?.message || e}`);
    }
  }
}
