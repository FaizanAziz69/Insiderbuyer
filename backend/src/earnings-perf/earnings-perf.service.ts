import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { InsiderTransaction } from '../entities/insider-transaction.entity';
import { EarningsEvent } from '../entities/earnings-event.entity';
import { MarketStatsService } from '../market-stats/market-stats.service';
import { EarningsService } from '../earnings/earnings.service';

/**
 * Insider Earnings Performance engine.
 *
 * Idea: when an insider BUYS shares in the weeks before an earnings release,
 * were they "right"? We measure the stock's post-earnings move — up = the
 * insider was right, down = wrong — and build a historical hit-rate score
 * (IES, Insider Earnings Score) per company and per insider, plus surface the
 * track record for stocks reporting earnings next.
 *
 * Pipeline (rebuild):
 *   1. Find past earnings report dates (Nasdaq calendar scan) for the tickers
 *      in our company table.
 *   2. For each (ticker, reportDate): measure the price reaction
 *      (close before earnings -> close `reactionDays` trading days after) via
 *      Yahoo historical closes.
 *   3. Find open-market BUYS (Form 4 code P) in the `buyWindowDays` before that
 *      report date; each qualifying insider gets a win/loss for that event.
 *   4. Aggregate into a confidence-shrunk score (Wilson lower bound) so a tiny
 *      sample (1-for-1) doesn't outrank a long, consistent record.
 */

export interface DefaultConfig {
  buyWindowDays: number;
  reactionDays: number;
  lookbackDays: number;
  minSample: number;
}

const DEFAULTS: DefaultConfig = {
  buyWindowDays: 60, // insider bought within this many days before earnings
  reactionDays: 1, // close N trading days after earnings vs the close before
  lookbackDays: 180, // how far back to scan for past earnings dates
  minSample: 2, // min scored events before a score is shown
};

interface CompanyTrack {
  ticker: string;
  name: string;
  sector: string | null;
  wins: number;
  total: number;
  sumReturn: number;
  ies: number; // 0-100 (Wilson lower bound × 100)
  hitRate: number; // raw wins/total (0-1)
  avgReturn: number; // mean post-earnings % move on scored events
  lastEventDate: string | null;
}

interface InsiderTrack {
  name: string;
  tickers: Set<string>;
  wins: number;
  total: number;
  sumReturn: number;
  ies: number;
  hitRate: number;
  avgReturn: number;
}

@Injectable()
export class EarningsPerfService implements OnModuleInit {
  private readonly logger = new Logger(EarningsPerfService.name);
  private building = false;
  private companyTracks = new Map<string, CompanyTrack>(); // by ticker
  private insiderTracks = new Map<string, InsiderTrack>(); // by insider name
  private sectorTracks = new Map<string, CompanyTrack>(); // reuse shape, by sector
  lastBuiltAt: Date | null = null;
  private cfg: DefaultConfig = { ...DEFAULTS };

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    @InjectRepository(InsiderTransaction)
    private readonly txRepo: Repository<InsiderTransaction>,
    @InjectRepository(EarningsEvent)
    private readonly eventsRepo: Repository<EarningsEvent>,
    private readonly marketStats: MarketStatsService,
    private readonly earnings: EarningsService,
  ) {}

  /** Idempotently store an earnings report date (ignores duplicates). */
  private async saveEvent(ticker: string, reportDate: string) {
    try {
      await this.eventsRepo
        .createQueryBuilder()
        .insert()
        .values({ ticker: ticker.toUpperCase(), reportDate })
        .orIgnore()
        .execute();
    } catch {
      /* unique violation / race — fine */
    }
  }

  onModuleInit() {
    if ((process.env.EARNINGS_PERF_ON_BOOT || 'false') !== 'true') return;
    // Heavy job — only on explicit opt-in. Delay so boot isn't blocked.
    setTimeout(() => this.rebuild().catch((e) => this.logger.error(e?.message || e)), 60_000);
  }

  /** Wilson score lower bound — shrinks small samples toward 0 so a 1/1 record
   *  doesn't read as a perfect 100. z=1.64 ≈ 90% one-sided confidence. */
  private wilson(wins: number, n: number, z = 1.64): number {
    if (n <= 0) return 0;
    const p = wins / n;
    const denom = 1 + (z * z) / n;
    const centre = p + (z * z) / (2 * n);
    const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
    return Math.max(0, (centre - margin) / denom);
  }

  /** Run the full backtest and cache the aggregates. Safe to call repeatedly. */
  async rebuild(
    opts: Partial<DefaultConfig> = {},
  ): Promise<{ events: number; scored: number; companies: number; insiders: number }> {
    if (this.building) {
      this.logger.warn('Earnings-perf rebuild already running — skipping.');
      return { events: 0, scored: 0, companies: 0, insiders: 0 };
    }
    this.building = true;
    const cfg = { ...DEFAULTS, ...opts };
    this.cfg = cfg;
    try {
      // 1. Companies we have insider data for (ticker required).
      const companies = await this.companies
        .createQueryBuilder('c')
        .where('c.ticker IS NOT NULL')
        .getMany();
      const byTicker = new Map<string, Company>();
      for (const c of companies) if (c.ticker) byTicker.set(c.ticker.toUpperCase(), c);
      const tickerSet = new Set(byTicker.keys());
      if (tickerSet.size === 0) {
        this.logger.warn('No companies with tickers — nothing to backtest.');
        return { events: 0, scored: 0, companies: 0, insiders: 0 };
      }

      const today = new Date();
      const todayIso = today.toISOString().slice(0, 10);

      // 2a. Record upcoming earnings dates (reliable feed) — they persist and
      //     become scoreable history as time passes.
      try {
        const upcoming = await this.earnings.getCalendar(14);
        for (const e of upcoming) {
          if (tickerSet.has(String(e.symbol).toUpperCase())) {
            await this.saveEvent(e.symbol, e.date);
          }
        }
      } catch {
        /* upcoming feed unavailable — skip */
      }

      // 2b. Best-effort gentle backfill of PAST report dates from Nasdaq. Every
      //     successful day is persisted immediately, so throttling only slows
      //     accumulation — it never loses what we already gathered.
      let fetched = 0;
      for (let d = 1; d <= cfg.lookbackDays; d++) {
        const day = new Date(today.getTime() - d * 86400000);
        const dow = day.getUTCDay();
        if (dow === 0 || dow === 6) continue; // skip weekends
        const iso = day.toISOString().slice(0, 10);
        const rows = await this.earnings.fetchDay(iso);
        if (rows.length) {
          fetched++;
          for (const r of rows) {
            if (tickerSet.has(r.symbol)) await this.saveEvent(r.symbol, iso);
          }
        }
        await this.delay(350); // be gentle on Nasdaq (bursts get throttled)
      }

      // 2c. Read ALL known PAST events from our local table (accumulated over
      //     every prior run) — this is what we actually score.
      const stored = await this.eventsRepo
        .createQueryBuilder('e')
        .where('e.reportDate < :today', { today: todayIso })
        .getMany();
      const events = stored
        .filter((e) => tickerSet.has(e.ticker.toUpperCase()))
        .map((e) => ({ ticker: e.ticker.toUpperCase(), iso: e.reportDate }));
      this.logger.log(
        `Earnings-perf: backfill fetched ${fetched} days; ${events.length} stored past events across ${tickerSet.size} tickers.`,
      );

      // 3. Score each event.
      const companyTracks = new Map<string, CompanyTrack>();
      const insiderTracks = new Map<string, InsiderTrack>();
      const sectorTracks = new Map<string, CompanyTrack>();
      let scored = 0;

      for (const ev of events) {
       try {
        const company = byTicker.get(ev.ticker);
        if (!company) continue;

        const reaction = await this.reactionAround(ev.ticker, ev.iso, cfg.reactionDays);
        if (reaction === null) continue;

        // Open-market buys in the window before this earnings date.
        const eventDate = new Date(ev.iso + 'T00:00:00Z');
        const windowStart = new Date(eventDate.getTime() - cfg.buyWindowDays * 86400000);
        const buys = await this.txRepo
          .createQueryBuilder('t')
          .where('t.company_id = :id', { id: company.id })
          .andWhere(`t."transactionCode" = 'P'`)
          .andWhere('t.transactionDate >= :start', { start: windowStart })
          .andWhere('t.transactionDate < :end', { end: eventDate })
          .getMany();
        if (buys.length === 0) continue;

        scored++;
        const win = reaction > 0;

        // Company-level: one scored event per earnings date.
        this.bump(
          companyTracks,
          ev.ticker,
          () => ({
            ticker: ev.ticker,
            name: company.name,
            sector: company.sector ?? null,
            wins: 0,
            total: 0,
            sumReturn: 0,
            ies: 0,
            hitRate: 0,
            avgReturn: 0,
            lastEventDate: null,
          }),
          (t) => {
            t.total++;
            if (win) t.wins++;
            t.sumReturn += reaction;
            if (!t.lastEventDate || ev.iso > t.lastEventDate) t.lastEventDate = ev.iso;
          },
        );

        // Sector-level.
        const sec = company.sector || 'Other';
        this.bump(
          sectorTracks,
          sec,
          () => ({
            ticker: sec,
            name: sec,
            sector: sec,
            wins: 0,
            total: 0,
            sumReturn: 0,
            ies: 0,
            hitRate: 0,
            avgReturn: 0,
            lastEventDate: null,
          }),
          (t) => {
            t.total++;
            if (win) t.wins++;
            t.sumReturn += reaction;
          },
        );

        // Insider-level: each distinct insider who bought before this event.
        const distinct = new Set(buys.map((b) => b.insiderName.trim()));
        for (const name of distinct) {
          let it = insiderTracks.get(name.toLowerCase());
          if (!it) {
            it = {
              name,
              tickers: new Set(),
              wins: 0,
              total: 0,
              sumReturn: 0,
              ies: 0,
              hitRate: 0,
              avgReturn: 0,
            };
            insiderTracks.set(name.toLowerCase(), it);
          }
          it.tickers.add(ev.ticker);
          it.total++;
          if (win) it.wins++;
          it.sumReturn += reaction;
        }
       } catch (err) {
        // One bad symbol/price lookup must not abort the whole backtest.
        this.logger.warn(`scoring ${ev.ticker} @ ${ev.iso}: ${(err as Error).message}`);
       }
      }

      // 4. Finalize scores.
      for (const t of companyTracks.values()) this.finalize(t);
      for (const t of sectorTracks.values()) this.finalize(t);
      for (const t of insiderTracks.values()) this.finalizeInsider(t);

      this.companyTracks = companyTracks;
      this.insiderTracks = insiderTracks;
      this.sectorTracks = sectorTracks;
      this.lastBuiltAt = new Date();
      this.logger.log(
        `Earnings-perf rebuild done: scored=${scored} companies=${companyTracks.size} insiders=${insiderTracks.size}`,
      );
      return {
        events: events.length,
        scored,
        companies: companyTracks.size,
        insiders: insiderTracks.size,
      };
    } finally {
      this.building = false;
    }
  }

  private bump<T>(
    map: Map<string, T>,
    key: string,
    create: () => T,
    update: (t: T) => void,
  ) {
    let t = map.get(key);
    if (!t) {
      t = create();
      map.set(key, t);
    }
    update(t);
  }

  private finalize(t: CompanyTrack) {
    t.hitRate = t.total ? t.wins / t.total : 0;
    t.avgReturn = t.total ? +(t.sumReturn / t.total).toFixed(2) : 0;
    t.ies = +(this.wilson(t.wins, t.total) * 100).toFixed(1);
  }

  private finalizeInsider(t: InsiderTrack) {
    t.hitRate = t.total ? t.wins / t.total : 0;
    t.avgReturn = t.total ? +(t.sumReturn / t.total).toFixed(2) : 0;
    t.ies = +(this.wilson(t.wins, t.total) * 100).toFixed(1);
  }

  /** Post-earnings % move: close the trading day BEFORE the report → close
   *  `reactionDays` trading days after. null if data is missing. */
  private async reactionAround(
    ticker: string,
    iso: string,
    reactionDays: number,
  ): Promise<number | null> {
    const closes = await this.marketStats.getDailyCloses(ticker, this.cfg.lookbackDays + 30);
    if (closes.length < 3) return null;
    const targetMs = new Date(iso + 'T00:00:00Z').getTime();
    // First close on/after the report date.
    const afterIdx = closes.findIndex((p) => p.t * 1000 >= targetMs);
    if (afterIdx <= 0) return null; // none on/after the date, or no prior close
    const postIdx = Math.min(afterIdx + (reactionDays - 1), closes.length - 1);
    const pre = closes[afterIdx - 1];
    const post = closes[postIdx];
    if (!pre || !post || !pre.c || !post.c) return null;
    const preClose = pre.c;
    const postClose = post.c;
    return +(((postClose - preClose) / preClose) * 100).toFixed(2);
  }

  private delay(ms: number) {
    return new Promise((r) => setTimeout(r, ms));
  }

  // ── Public getters ────────────────────────────────────────────────

  /** Upcoming earnings with each ticker's historical insider track record. */
  async getUpcoming(days = 7) {
    const cal = await this.earnings.getCalendar(days);
    const rows = cal.map((e) => {
      const t = this.companyTracks.get(String(e.symbol).toUpperCase());
      const hasRecord = t && t.total >= this.cfg.minSample;
      return {
        symbol: e.symbol,
        name: e.name,
        date: e.date,
        time: e.time,
        estimate: e.estimate,
        marketCap: e.marketCap,
        track: hasRecord
          ? {
              ies: t!.ies,
              hitRate: +(t!.hitRate * 100).toFixed(0),
              avgReturn: t!.avgReturn,
              sample: t!.total,
            }
          : null,
      };
    });
    // Reporting soonest first; within a day, names with a track record first.
    rows.sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (b.track?.sample || 0) - (a.track?.sample || 0);
    });
    return { windowDays: days, minSample: this.cfg.minSample, rows };
  }

  /** Leaderboard by IES — type 'company' | 'insider' | 'sector'. */
  getLeaderboard(type: 'company' | 'insider' | 'sector' = 'company', limit = 25) {
    if (type === 'insider') {
      return Array.from(this.insiderTracks.values())
        .filter((t) => t.total >= this.cfg.minSample)
        .sort((a, b) => b.ies - a.ies)
        .slice(0, limit)
        .map((t) => ({
          name: t.name,
          tickers: Array.from(t.tickers).slice(0, 6),
          ies: t.ies,
          hitRate: +(t.hitRate * 100).toFixed(0),
          avgReturn: t.avgReturn,
          sample: t.total,
        }));
    }
    const src = type === 'sector' ? this.sectorTracks : this.companyTracks;
    return Array.from(src.values())
      .filter((t) => t.total >= this.cfg.minSample)
      .sort((a, b) => b.ies - a.ies)
      .slice(0, limit)
      .map((t) => ({
        ticker: t.ticker,
        name: t.name,
        sector: t.sector,
        ies: t.ies,
        hitRate: +(t.hitRate * 100).toFixed(0),
        avgReturn: t.avgReturn,
        sample: t.total,
        lastEventDate: t.lastEventDate,
      }));
  }

  status() {
    return {
      lastBuiltAt: this.lastBuiltAt,
      building: this.building,
      config: this.cfg,
      companies: this.companyTracks.size,
      insiders: this.insiderTracks.size,
      sectors: this.sectorTracks.size,
    };
  }
}
