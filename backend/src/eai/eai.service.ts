import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { EaiCache } from '../entities/eai-cache.entity';
import { FmpService } from '../fmp/fmp.service';
import { EarningsService } from '../earnings/earnings.service';
import { MarketStatsService } from '../market-stats/market-stats.service';

/**
 * Earnings Alignment Index (EAI).
 *
 * The /earnings page promises: "Companies where insiders bought ahead of their
 * last three strong quarters are flagged with our Earnings Alignment Index."
 * This service is that flag.
 *
 *   strong quarter  = the market rewarded the report — the stock closed higher
 *                     the session after it than the session before. Where we
 *                     have no price history, an EPS beat stands in.
 *   aligned quarter = at least one open-market insider BUY (Form 4 code P) in
 *                     the 30 days before that report date — the same 30-day
 *                     pre-earnings window the page describes.
 *   EAI             = aligned ÷ strong (of the last three strong quarters) ×100.
 *
 * A score needs at least two strong quarters to exist; one lucky quarter is not
 * a pattern. 100 (3-for-3) is the flag the copy refers to.
 *
 * Why the market's verdict rather than the EPS line: measured on beats alone
 * the index was empty in production (2026-08-26, 68 companies, every score 0).
 * The companies that beat consensus are large caps whose insiders sell, and the
 * companies whose insiders buy are small caps that miss almost every quarter —
 * the two sets barely intersect. A quarter the market paid up for is both the
 * plainer meaning of "strong" and the definition this codebase's earnings
 * backtest already uses.
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
  /** Post-earnings % move (close before → close after); null if unavailable. */
  reactionPct: number | null;
  /** What made this quarter count as strong. */
  basis: 'price' | 'eps';
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
const MAX_PER_RUN = 800;
/** How far back a company must have bought to be worth scoring, in days. */
const BUYER_LOOKBACK_DAYS = 1095;
/** Boot refreshes only when the stored scores are older than this. */
const WARM_MAX_AGE_HOURS = 12;

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
    private readonly marketStats: MarketStatsService,
  ) {}

  onModuleInit() {
    // Warm on boot, but only after the app has settled — the calendar fetch and
    // the per-symbol FMP calls must never delay serving traffic.
    setTimeout(() => {
      this.warmUp().catch((e) => this.log.warn(`EAI warm-up failed: ${e?.message || e}`));
    }, 90_000);
  }

  /**
   * Refresh on boot only if the stored scores are stale.
   *
   * A full pass is ~700 companies × two upstream calls each. Running it on
   * every restart would spend that on a deploy-day's worth of restarts for
   * scores that change once a day at most — the table survives restarts
   * precisely so it doesn't have to.
   */
  private async warmUp(): Promise<void> {
    const newest = await this.cache
      .createQueryBuilder('e')
      .select('MAX(e.updatedAt)', 'ts')
      .getRawOne<{ ts: Date | null }>()
      .catch(() => null);
    const ts = newest?.ts ? new Date(newest.ts).getTime() : 0;
    const ageH = ts ? (Date.now() - ts) / 3_600_000 : Infinity;
    if (ageH < WARM_MAX_AGE_HOURS) {
      this.log.log(`EAI warm-up skipped — scores are ${ageH.toFixed(1)}h old.`);
      return;
    }
    await this.refresh();
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
      // Score every company whose insiders have actually bought — not just the
      // ones reporting this fortnight.
      //
      // Scoped to the calendar the index was empty in production: only 4 of the
      // 72 companies reporting in 14 days had ANY insider buying, so 68 columns
      // of "0" said nothing. The population where alignment can exist is the
      // set of companies with open-market buys, and a company keeps its score
      // until the day it reports, which is when the earnings page needs it.
      const since = new Date(Date.now() - BUYER_LOOKBACK_DAYS * 86_400_000);
      // GROUP BY rather than SELECT DISTINCT: TypeORM quotes a "DISTINCT col"
      // select as a single alias and Postgres rejects the result.
      const buyers = await this.txRepo
        .createQueryBuilder('t')
        .innerJoin('t.company', 'c')
        .select('c.id', 'id')
        .addSelect('c.ticker', 'ticker')
        .where(`t."transactionCode" = 'P'`)
        .andWhere('t.transactionDate >= :since', { since })
        .andWhere('c.ticker IS NOT NULL')
        .groupBy('c.id')
        .addGroupBy('c.ticker')
        .getRawMany<{ id: string; ticker: string }>();
      const idByTicker = new Map<string, string>();
      for (const b of buyers) {
        const t = (b.ticker || '').toUpperCase();
        if (t) idByTicker.set(t, b.id);
      }

      // Plus anything reporting soon that we hold filings for, so a name the
      // earnings page is about to show is never missing purely by ordering.
      const cal = await this.earnings.getCalendar(days);
      const wanted = new Set(
        cal.map((e) => String(e.symbol || '').toUpperCase()).filter(Boolean),
      );
      if (wanted.size) {
        const rows = await this.companies
          .createQueryBuilder('c')
          .select(['c.id', 'c.ticker'])
          .where('c.ticker IS NOT NULL')
          .getMany();
        for (const c of rows) {
          const t = (c.ticker || '').toUpperCase();
          if (t && wanted.has(t) && !idByTicker.has(t)) idByTicker.set(t, c.id);
        }
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
        `EAI refresh: ${scored}/${scanned} scored (${idByTicker.size} candidates: buyers + ${days}d calendar).`,
      );
      return { scanned, scored, skipped: Math.max(0, idByTicker.size - scanned) };
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
    // One price series covers every quarter we test; getDailyCloses caches it.
    const closes = await this.marketStats.getDailyCloses(ticker, 800).catch(() => []);
    const strongQuarters: Array<{
      row: (typeof reported)[number];
      reactionPct: number | null;
      basis: 'price' | 'eps';
    }> = [];
    for (const r of reported) {
      if (strongQuarters.length >= QUARTERS) break;
      const reactionPct = this.reaction(closes, r.date);
      if (reactionPct != null) {
        if (reactionPct > 0) strongQuarters.push({ row: r, reactionPct, basis: 'price' });
        continue;
      }
      // No usable closes around this date — fall back to the EPS line.
      if ((r.epsActual as number) > (r.epsEstimated as number)) {
        strongQuarters.push({ row: r, reactionPct: null, basis: 'eps' });
      }
    }
    if (strongQuarters.length < MIN_STRONG) return null;

    const quarters: EaiQuarter[] = [];
    for (const { row: q, reactionPct, basis } of strongQuarters) {
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
        reactionPct,
        basis,
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

  /**
   * Post-earnings move for one report date: the close before the report to the
   * first close on or after it. Null when the series doesn't cover the date.
   */
  private reaction(closes: { t: number; c: number }[], iso: string): number | null {
    if (closes.length < 3) return null;
    const target = new Date(`${iso}T00:00:00Z`).getTime();
    const afterIdx = closes.findIndex((p) => p.t * 1000 >= target);
    if (afterIdx <= 0) return null; // before the series starts, or no prior close
    const pre = closes[afterIdx - 1];
    const post = closes[afterIdx];
    if (!pre?.c || !post?.c) return null;
    return +(((post.c - pre.c) / pre.c) * 100).toFixed(2);
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
