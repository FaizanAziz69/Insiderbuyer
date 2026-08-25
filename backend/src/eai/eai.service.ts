import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { EaiCache } from '../entities/eai-cache.entity';
import { FmpService } from '../fmp/fmp.service';
import { EarningsService } from '../earnings/earnings.service';

/**
 * Earnings Alignment Index (EAI).
 *
 * The /earnings page promises: "Companies where insiders bought ahead of their
 * last three strong quarters are flagged with our Earnings Alignment Index."
 * This service is that flag.
 *
 *   strong quarter  = the company beat the consensus EPS estimate.
 *   aligned quarter = at least one open-market insider BUY (Form 4 code P) in
 *                     the 30 days before that report date — the same 30-day
 *                     pre-earnings window the page describes.
 *   EAI             = aligned ÷ strong (of the last three strong quarters) ×100.
 *
 * A score needs at least two strong quarters to exist; one lucky quarter is not
 * a pattern. 100 (3-for-3) is the flag the copy refers to.
 */
export interface EaiRow {
  ticker: string;
  eai: number;
  aligned: number;
  strong: number;
  quarters: EaiQuarter[];
  updatedAt: string;
}

interface EaiQuarter {
  date: string;
  epsActual: number | null;
  epsEstimated: number | null;
  bought: boolean;
  buyValue: number;
  buyers: number;
}

/** Strong quarters examined — the "last three" of the copy. */
const QUARTERS = 3;
/** Minimum strong quarters before a score is published. */
const MIN_STRONG = 2;
/** Pre-earnings insider-buy window, in days. */
const BUY_WINDOW_DAYS = 30;
/** How many reports back to look for those strong quarters (~3 years). */
const HISTORY_LIMIT = 12;
/** Ceiling on symbols refreshed per pass, so one run can't drain the FMP quota. */
const MAX_PER_RUN = 250;

@Injectable()
export class EaiService implements OnModuleInit {
  private readonly log = new Logger(EaiService.name);
  private running = false;
  lastRunAt: Date | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderTransaction)
    private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(EaiCache) private readonly cache: Repository<EaiCache>,
    private readonly fmp: FmpService,
    private readonly earnings: EarningsService,
  ) {}

  onModuleInit() {
    // Warm on boot, but only after the app has settled — the calendar fetch and
    // the per-symbol FMP calls must never delay serving traffic.
    setTimeout(() => {
      this.refresh().catch((e) => this.log.warn(`EAI warm-up failed: ${e?.message || e}`));
    }, 90_000);
  }

  /** Nightly, after the US close — earnings dates and EPS actuals settle then. */
  @Cron('37 6 * * *')
  async nightly() {
    await this.refresh().catch((e) => this.log.warn(`EAI nightly failed: ${e?.message || e}`));
  }

  /**
   * Recompute EAI for every company reporting in the next `days` days.
   * Everything is upserted per symbol, so a mid-run failure keeps what it got.
   */
  async refresh(days = 14): Promise<{ scanned: number; scored: number; skipped: number }> {
    if (this.running) return { scanned: 0, scored: 0, skipped: 0 };
    if (!this.fmp.enabled) {
      this.log.warn('EAI refresh skipped — no FMP key.');
      return { scanned: 0, scored: 0, skipped: 0 };
    }
    this.running = true;
    try {
      const cal = await this.earnings.getCalendar(days);
      const wanted = new Set(
        cal.map((e) => String(e.symbol || '').toUpperCase()).filter(Boolean),
      );
      // Only companies we actually hold insider filings for can have alignment.
      const rows = await this.companies
        .createQueryBuilder('c')
        .select(['c.id', 'c.ticker'])
        .where('c.ticker IS NOT NULL')
        .getMany();
      const idByTicker = new Map<string, string>();
      for (const c of rows) {
        const t = (c.ticker || '').toUpperCase();
        if (t && wanted.has(t)) idByTicker.set(t, c.id);
      }

      let scanned = 0;
      let scored = 0;
      for (const [ticker, companyId] of idByTicker) {
        if (scanned >= MAX_PER_RUN) break;
        scanned++;
        try {
          const row = await this.computeOne(ticker, companyId);
          if (row) {
            await this.cache.save(
              this.cache.create({
                ticker,
                eai: row.eai,
                aligned: row.aligned,
                strong: row.strong,
                quarters: row.quarters,
              }),
            );
            scored++;
          }
        } catch (e: any) {
          this.log.warn(`EAI ${ticker}: ${e?.message || e}`);
        }
      }
      this.lastRunAt = new Date();
      this.log.log(
        `EAI refresh: ${scored}/${scanned} scored out of ${wanted.size} reporting in ${days}d.`,
      );
      return { scanned, scored, skipped: wanted.size - scanned };
    } finally {
      this.running = false;
    }
  }

  /** Score one ticker. Returns null when there isn't enough history to judge. */
  private async computeOne(
    ticker: string,
    companyId: string,
  ): Promise<Omit<EaiRow, 'updatedAt'> | null> {
    // The shared history is oldest-first and cached per symbol; EAI walks it
    // newest-first and only as far back as HISTORY_LIMIT quarters.
    const history = (await this.fmp.getEarningsHistory(ticker))
      .slice()
      .reverse()
      .slice(0, HISTORY_LIMIT);
    const todayIso = new Date().toISOString().slice(0, 10);
    // Reported quarters only, newest first, that we can actually judge.
    const reported = history.filter(
      (r) =>
        r.date < todayIso &&
        r.epsActual != null &&
        r.epsEstimated != null &&
        Number.isFinite(r.epsActual) &&
        Number.isFinite(r.epsEstimated),
    );
    const strongQuarters = reported
      .filter((r) => (r.epsActual as number) > (r.epsEstimated as number))
      .slice(0, QUARTERS);
    if (strongQuarters.length < MIN_STRONG) return null;

    const quarters: EaiQuarter[] = [];
    for (const q of strongQuarters) {
      const end = new Date(`${q.date}T00:00:00Z`);
      const start = new Date(end.getTime() - BUY_WINDOW_DAYS * 86_400_000);
      const buys = await this.txRepo
        .createQueryBuilder('t')
        .select('COUNT(DISTINCT t."insiderName")', 'buyers')
        .addSelect('COALESCE(SUM(t."totalValue"), 0)', 'value')
        .where('t.company_id = :id', { id: companyId })
        .andWhere(`t."transactionCode" = 'P'`)
        .andWhere('t.transactionDate >= :start', { start })
        .andWhere('t.transactionDate < :end', { end })
        .getRawOne<{ buyers: string; value: string }>();
      const buyers = Number(buys?.buyers || 0);
      quarters.push({
        date: q.date,
        epsActual: q.epsActual,
        epsEstimated: q.epsEstimated,
        bought: buyers > 0,
        buyValue: Math.round(Number(buys?.value || 0)),
        buyers,
      });
    }
    const aligned = quarters.filter((q) => q.bought).length;
    return {
      ticker,
      aligned,
      strong: quarters.length,
      eai: Math.round((aligned / quarters.length) * 100),
      quarters,
    };
  }

  /** Cached scores for the tickers reporting soon, keyed by ticker. */
  async getMap(tickers?: string[]): Promise<Record<string, EaiRow>> {
    const qb = this.cache.createQueryBuilder('e');
    const wanted = (tickers || []).map((t) => t.toUpperCase()).filter(Boolean);
    if (wanted.length) qb.where('e.ticker IN (:...t)', { t: wanted });
    const rows = await qb.getMany();
    const out: Record<string, EaiRow> = {};
    for (const r of rows) {
      out[r.ticker] = {
        ticker: r.ticker,
        eai: r.eai,
        aligned: r.aligned,
        strong: r.strong,
        quarters: (r.quarters as EaiQuarter[]) || [],
        updatedAt: r.updatedAt?.toISOString?.() ?? String(r.updatedAt),
      };
    }
    return out;
  }

  async status() {
    const total = await this.cache.count();
    const flagged = await this.cache.count({ where: { eai: 100 } });
    return {
      lastRunAt: this.lastRunAt,
      running: this.running,
      scored: total,
      flagged,
      config: { quarters: QUARTERS, minStrong: MIN_STRONG, buyWindowDays: BUY_WINDOW_DAYS },
    };
  }
}
