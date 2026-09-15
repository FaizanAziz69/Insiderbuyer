import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';

/**
 * Workstream F — what happened to the share price after the promotion started.
 *
 * THIS IS THE FRAMING (Brief v2 §2.6).
 *
 * §2.6 asks whether promotion spend should read as "visibility and liquidity"
 * or as "a caution index", and leaves the house position to George. Both
 * answers are claims we cannot support: we have no evidence that a high
 * Promoter Score predicts anything, and calling disclosed, legal spending a
 * red flag would also brand our own agency clients — the brief says so itself.
 *
 * So the page makes neither claim. It shows what the stock did after each
 * contract began and lets the reader decide. That is the same move the brief
 * makes for TV mentions in §3.1, where "the performance-since-mention column
 * is the product" — the figure carries the story, so the copy never has to.
 *
 * Honesty about coverage: FMP carries prices for roughly half of these venture
 * issuers and nothing at all for the rest (checked against the live table —
 * 6 of 12 tickers returned bars). A missing price says "no price data", never
 * a dash that could be mistaken for a flat return, and never zero.
 */

/** Returns are measured from the first session ON OR AFTER the start date. */
const WINDOWS = [30, 90] as const;
const DAY = 86_400_000;
/** Sessions averaged for the pre-engagement volume baseline. */
const VOL_BASELINE_SESSIONS = 30;
/** Calendar days of bars fetched before the earliest start so that baseline exists. */
const VOL_LOOKBACK_DAYS = 120;

interface Bar {
  date: string;
  close: number;
  volume: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/**
 * Average daily volume before and after the engagement started. "Before" is
 * the last 30 sessions strictly before the start date; "after" is every
 * session inside the 30 / 90 calendar days from the start. A window that has
 * not elapsed yet is null, for the same reason the price windows are: a
 * 90-day figure on a contract signed last week would be a label lying about
 * its own length. A baseline of zero volume gives no growth figure at all.
 */
export function volumeWindows(bars: Bar[], start: string, lastDate: string) {
  const before = bars.filter((b) => b.date < start).slice(-VOL_BASELINE_SESSIONS).map((b) => b.volume);
  const at30 = new Date(Date.parse(start) + 30 * DAY).toISOString().slice(0, 10);
  const at90 = new Date(Date.parse(start) + 90 * DAY).toISOString().slice(0, 10);
  const after = (until: string) =>
    until <= lastDate ? mean(bars.filter((b) => b.date >= start && b.date < until).map((b) => b.volume)) : null;
  const volBefore = mean(before);
  return {
    volBefore: volBefore && volBefore > 0 ? volBefore : null,
    volAfter30: after(at30),
    volAfter90: after(at90),
  };
}

@Injectable()
export class ContractPerformanceService {
  private readonly log = new Logger(ContractPerformanceService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params?: any[]): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTable(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS ir_contract_perf (
      agreement_id  bigint PRIMARY KEY,
      fmp_symbol    varchar(24),
      start_date    date,
      start_price   numeric(14,4),
      price_30d     numeric(14,4),
      price_90d     numeric(14,4),
      price_now     numeric(14,4),
      perf_30d      real,
      perf_90d      real,
      perf_now      real,
      currency      varchar(3),
      note          text,
      computed_at   timestamptz NOT NULL DEFAULT now()
    )`);
    // 2026-09-16 (George, Top IR Promoters): trade-volume growth after the
    // engagement began, alongside the price move. Average daily volume over
    // the 30 sessions before the start date against the 30 / 90 calendar days
    // after it. Added in place so the nightly refresh fills them.
    await this.q(`ALTER TABLE ir_contract_perf
      ADD COLUMN IF NOT EXISTS vol_before    real,
      ADD COLUMN IF NOT EXISTS vol_after_30  real,
      ADD COLUMN IF NOT EXISTS vol_after_90  real,
      ADD COLUMN IF NOT EXISTS vol_growth_30 real,
      ADD COLUMN IF NOT EXISTS vol_growth_90 real`);
  }

  /**
   * Recompute performance for every agreement that has a start date and an
   * issuer we can price. One price series per ISSUER, not per agreement —
   * an issuer with six providers would otherwise cost six identical calls.
   */
  async refresh(limit = 400): Promise<{ priced: number; unpriced: number }> {
    await this.ensureTable();
    const rows: any[] = await this.q(
      `SELECT a.id, a.ticker, a.start_date, i.fmp_symbol, i.currency
         FROM ir_agreements a
         LEFT JOIN ir_issuers i ON i.ticker = a.ticker
        WHERE a.start_date IS NOT NULL
          AND a.provider_slug IS NOT NULL
          AND a.status <> 'rejected'
        ORDER BY a.start_date DESC
        LIMIT $1`,
      [Math.min(Math.max(limit, 1), 5000)],
    );

    const byTicker = new Map<string, any[]>();
    for (const r of rows) {
      const arr = byTicker.get(r.ticker) ?? [];
      arr.push(r);
      byTicker.set(r.ticker, arr);
    }

    let priced = 0;
    let unpriced = 0;
    for (const [ticker, group] of byTicker) {
      const symbol = group[0]?.fmp_symbol;
      const earliest = group.reduce(
        (min: string, r: any) => (isoOf(r.start_date)! < min ? isoOf(r.start_date)! : min),
        isoOf(group[0].start_date)!,
      );
      let bars: Bar[] = [];
      if (symbol) {
        try {
          // 120 days back, not 10: the volume baseline needs the 30 sessions
          // BEFORE the earliest start, and venture names skip sessions.
          const from = new Date(Date.parse(earliest) - VOL_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
          bars = (await this.fmp.getEodBars(symbol, { from, adjusted: true }))
            .filter((b) => b.close > 0)
            .map((b) => ({ date: b.date.slice(0, 10), close: b.close, volume: Number(b.volume) || 0 }));
        } catch (e: any) {
          this.log.debug(`prices failed for ${symbol}: ${e?.message || e}`);
        }
      }

      for (const r of group) {
        const start = isoOf(r.start_date)!;
        if (!bars.length) {
          unpriced++;
          await this.write(r.id, {
            symbol: symbol ?? null,
            start,
            currency: r.currency ?? null,
            note: symbol
              ? 'No price history available for this listing.'
              : 'This issuer is not covered by our price data.',
          });
          continue;
        }
        const startPrice = closeOnOrAfter(bars, start);
        if (startPrice == null) {
          unpriced++;
          await this.write(r.id, {
            symbol,
            start,
            currency: r.currency ?? null,
            note: 'No session priced on or after the contract start date.',
          });
          continue;
        }
        const now = bars[bars.length - 1];
        const win: Record<number, number | null> = {};
        for (const d of WINDOWS) {
          const at = new Date(Date.parse(start) + d * DAY).toISOString().slice(0, 10);
          // Only report a window that has actually elapsed — a 90-day figure
          // on a contract signed last week would be the latest price wearing
          // a label that says otherwise.
          win[d] = at <= now.date ? closeOnOrAfter(bars, at) : null;
        }
        const vol = volumeWindows(bars, start, now.date);
        priced++;
        await this.write(r.id, {
          symbol,
          start,
          currency: r.currency ?? null,
          startPrice,
          p30: win[30],
          p90: win[90],
          pNow: now.close,
          note: null,
          ...vol,
        });
      }
    }
    this.log.log(`contract performance: ${priced} priced, ${unpriced} without prices`);
    return { priced, unpriced };
  }

  private async write(
    agreementId: number,
    v: {
      symbol: string | null;
      start: string;
      currency: string | null;
      startPrice?: number | null;
      p30?: number | null;
      p90?: number | null;
      pNow?: number | null;
      note: string | null;
      volBefore?: number | null;
      volAfter30?: number | null;
      volAfter90?: number | null;
    },
  ) {
    const pct = (then: number | null | undefined, base: number | null | undefined) =>
      then != null && base != null && base > 0 ? Math.round(((then - base) / base) * 10000) / 10000 : null;
    await this.q(
      `INSERT INTO ir_contract_perf
         (agreement_id, fmp_symbol, start_date, start_price, price_30d, price_90d, price_now,
          perf_30d, perf_90d, perf_now, currency, note,
          vol_before, vol_after_30, vol_after_90, vol_growth_30, vol_growth_90, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17, now())
       ON CONFLICT (agreement_id) DO UPDATE SET
         fmp_symbol = EXCLUDED.fmp_symbol, start_date = EXCLUDED.start_date,
         start_price = EXCLUDED.start_price, price_30d = EXCLUDED.price_30d,
         price_90d = EXCLUDED.price_90d, price_now = EXCLUDED.price_now,
         perf_30d = EXCLUDED.perf_30d, perf_90d = EXCLUDED.perf_90d, perf_now = EXCLUDED.perf_now,
         currency = EXCLUDED.currency, note = EXCLUDED.note,
         vol_before = EXCLUDED.vol_before, vol_after_30 = EXCLUDED.vol_after_30,
         vol_after_90 = EXCLUDED.vol_after_90, vol_growth_30 = EXCLUDED.vol_growth_30,
         vol_growth_90 = EXCLUDED.vol_growth_90, computed_at = now()`,
      [
        agreementId,
        v.symbol,
        v.start,
        v.startPrice ?? null,
        v.p30 ?? null,
        v.p90 ?? null,
        v.pNow ?? null,
        pct(v.p30, v.startPrice),
        pct(v.p90, v.startPrice),
        pct(v.pNow, v.startPrice),
        v.currency,
        v.note,
        v.volBefore ?? null,
        v.volAfter30 ?? null,
        v.volAfter90 ?? null,
        pct(v.volAfter30, v.volBefore),
        pct(v.volAfter90, v.volBefore),
      ],
    );
  }
}

/** First close on or after `date`. Venture names do not trade every session,
 *  so an exact-date lookup would miss most contracts. */
export function closeOnOrAfter(
  bars: Array<{ date: string; close: number }>,
  date: string,
): number | null {
  for (const b of bars) if (b.date >= date) return b.close;
  return null;
}

function isoOf(v: string | Date | null): string | null {
  if (!v) return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).slice(0, 10);
}
