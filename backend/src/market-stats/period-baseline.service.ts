import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { EodClose } from '../entities/eod-close.entity';
import { FmpService } from '../fmp/fmp.service';

export interface PeriodBaselines {
  /** Close on the last trading day before the 1st of the current month. */
  monthBase: number | null;
  /** Close on the last trading day before Jan 1 of the current year. */
  yearBase: number | null;
}

/**
 * Month-to-date and year-to-date BASELINE closes for the whole U.S. market,
 * from two bulk FMP `batch-eod` pulls per month, persisted in `eod_closes`.
 *
 * The baseline date is "the last trading day strictly before the boundary" —
 * the same definition MarketStatsService.fetchPeriodBaselines uses for its
 * per-symbol Yahoo charts, so the two sources agree to the cent and a symbol
 * resolved either way reports the same return. Trading days are found by
 * stepping back from the boundary over weekends and asking the feed; an empty
 * answer means a holiday and the day before is tried (at most a week back).
 *
 * The feed is rate-limited to a call every few hours, so every attempt is
 * remembered for RETRY_MS and the whole thing runs off the request path (a
 * cron plus a boot warm-up); requests only ever read the table.
 */
@Injectable()
export class PeriodBaselineService {
  private readonly logger = new Logger(PeriodBaselineService.name);
  /** Dates known to be loaded (≥ MIN_ROWS rows in the table). */
  private readonly loaded = new Set<string>();
  /** Dates known to be non-trading days (feed answered empty, no error). */
  private readonly nonTrading = new Set<string>();
  /** Last attempt per date, so a 429 / outage is not hammered. */
  private readonly attempted = new Map<string, number>();
  private readonly RETRY_MS = 2 * 60 * 60_000;
  /** Below this the pull was partial or wrong and is not trusted. */
  private readonly MIN_ROWS = 2_000;
  private inflight: Promise<void> | null = null;

  constructor(
    @InjectRepository(EodClose) private readonly repo: Repository<EodClose>,
    private readonly fmp: FmpService,
  ) {}

  /** The two boundary dates for "now": the day before the 1st of this month and
   *  the day before Jan 1 (as ISO dates; weekends still to be stepped over). */
  private boundaries(now = new Date()): { month: string; year: string } {
    const iso = (d: Date) => d.toISOString().slice(0, 10);
    const y = now.getUTCFullYear();
    const m = now.getUTCMonth();
    return {
      month: iso(new Date(Date.UTC(y, m, 0))), // day 0 = last day of previous month
      year: iso(new Date(Date.UTC(y, 0, 0))), // Dec 31 of the previous year
    };
  }

  private prevDay(date: string): string {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    return d.toISOString().slice(0, 10);
  }

  private isWeekend(date: string): boolean {
    const dow = new Date(`${date}T00:00:00Z`).getUTCDay();
    return dow === 0 || dow === 6;
  }

  private async rowsFor(date: string): Promise<number> {
    return this.repo.count({ where: { date } }).catch(() => 0);
  }

  /**
   * Resolve one boundary to its trading day and make sure the closes for it are
   * in the table. Returns the resolved date, or null when it is not loaded yet.
   */
  private async ensureDate(boundary: string): Promise<string | null> {
    let date = boundary;
    for (let step = 0; step < 7; step++, date = this.prevDay(date)) {
      if (this.isWeekend(date) || this.nonTrading.has(date)) continue;
      if (this.loaded.has(date)) return date;
      if ((await this.rowsFor(date)) >= this.MIN_ROWS) {
        this.loaded.add(date);
        return date;
      }
      const last = this.attempted.get(date) ?? 0;
      if (Date.now() - last < this.RETRY_MS) return null; // asked recently; wait
      this.attempted.set(date, Date.now());
      const closes = await this.fmp.batchEod(date);
      if (!closes.size) {
        if (this.fmp.lastError) {
          this.logger.warn(`EOD baselines: ${date} not loaded — ${this.fmp.lastError}`);
          return null; // an error, not a holiday: keep this date, retry later
        }
        this.nonTrading.add(date); // empty and no error = market closed
        continue;
      }
      const rows = Array.from(closes.entries()).map(([symbol, close]) => ({
        date,
        symbol,
        close: String(close),
      }));
      for (let i = 0; i < rows.length; i += 1000) {
        await this.repo.upsert(rows.slice(i, i + 1000), ['date', 'symbol']);
      }
      this.loaded.add(date);
      this.logger.log(`EOD baselines: ${rows.length} closes stored for ${date}`);
      return date;
    }
    return null;
  }

  /** Load whatever boundary is missing. Safe to call often; serialised. */
  async ensureLoaded(): Promise<void> {
    if (this.inflight) return this.inflight;
    this.inflight = (async () => {
      const b = this.boundaries();
      await this.ensureDate(b.month);
      await this.ensureDate(b.year);
    })().finally(() => {
      this.inflight = null;
    });
    return this.inflight;
  }

  /** Resolved trading days for the current boundaries, from the table only. */
  private async resolvedDates(): Promise<{ month: string | null; year: string | null }> {
    const resolve = async (boundary: string): Promise<string | null> => {
      let date = boundary;
      for (let step = 0; step < 7; step++, date = this.prevDay(date)) {
        if (this.isWeekend(date) || this.nonTrading.has(date)) continue;
        if (this.loaded.has(date)) return date;
        if ((await this.rowsFor(date)) >= this.MIN_ROWS) {
          this.loaded.add(date);
          return date;
        }
        return null;
      }
      return null;
    };
    const b = this.boundaries();
    return { month: await resolve(b.month), year: await resolve(b.year) };
  }

  /**
   * Baselines for many symbols in one query per boundary. A symbol missing from
   * the table (new listing, non-U.S.) is simply absent from the map so the
   * caller can fall back to its per-symbol source.
   */
  async getBaselines(symbolsRaw: string[]): Promise<Map<string, PeriodBaselines>> {
    const out = new Map<string, PeriodBaselines>();
    const symbols = Array.from(
      new Set(symbolsRaw.map((s) => (s || '').toUpperCase()).filter(Boolean)),
    );
    if (!symbols.length) return out;
    const dates = await this.resolvedDates();
    if (!dates.month && !dates.year) return out;
    const load = async (date: string | null): Promise<Map<string, number>> => {
      const m = new Map<string, number>();
      if (!date) return m;
      for (let i = 0; i < symbols.length; i += 1000) {
        const rows = await this.repo
          .find({ where: { date, symbol: In(symbols.slice(i, i + 1000)) } })
          .catch(() => [] as EodClose[]);
        for (const r of rows) {
          const c = Number(r.close);
          // Same sub-cent guard as the writer, for rows stored before it existed.
          if (Number.isFinite(c) && c >= 0.01) m.set(r.symbol, c);
        }
      }
      return m;
    };
    const [month, year] = await Promise.all([load(dates.month), load(dates.year)]);
    for (const s of symbols) {
      const mb = month.get(s) ?? null;
      const yb = year.get(s) ?? null;
      if (mb == null && yb == null) continue;
      out.set(s, { monthBase: mb, yearBase: yb });
    }
    return out;
  }
}
