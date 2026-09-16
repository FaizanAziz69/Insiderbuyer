import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';
import { GermanVolumeService, GermanVolume } from './german-volume.service';
import { fxToCad } from './scoring';

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
export class ContractPerformanceService implements OnModuleInit {
  private readonly log = new Logger(ContractPerformanceService.name);

  /** Every reader of ir_contract_perf (ranking, top promoters, the issuer
   *  page) selects the newest columns, so the table must be current before
   *  the first request — not only after the first refresh. */
  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTable();
    } catch (e: any) {
      this.log.error(`ir_contract_perf schema check failed: ${e?.message || e}`);
    }
  }

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
    private readonly german: GermanVolumeService,
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
    // 2026-09-16 (George): "Volume by exchange (add Germany)" — shares traded
    // through the German venues after the engagement began, from onvista
    // (see GermanVolumeService). `de_vol_post` is the cumulative German
    // volume from the start date through the 90th day (or today if sooner);
    // `de_pct_of_total` is that against German + home-exchange volume over
    // the same sessions, so a reader sees what share of the flow was German.
    await this.q(`ALTER TABLE ir_contract_perf
      ADD COLUMN IF NOT EXISTS de_isin          varchar(12),
      ADD COLUMN IF NOT EXISTS de_venues        jsonb,
      ADD COLUMN IF NOT EXISTS de_vol_before    real,
      ADD COLUMN IF NOT EXISTS de_vol_after_30  real,
      ADD COLUMN IF NOT EXISTS de_vol_after_90  real,
      ADD COLUMN IF NOT EXISTS de_vol_growth_30 real,
      ADD COLUMN IF NOT EXISTS de_vol_growth_90 real,
      ADD COLUMN IF NOT EXISTS de_vol_post      real,
      ADD COLUMN IF NOT EXISTS de_post_days     int,
      ADD COLUMN IF NOT EXISTS de_pct_of_total  real,
      ADD COLUMN IF NOT EXISTS de_note          text`);
    // 2026-09-16 (George): "the buying volume (dollar value)" and "the return
    // based on the IR spend and the buy volume — what multiple did the
    // company get". Dollar value traded on the home listing from the contract
    // start date to the latest session (price x shares, per session, summed),
    // and the cash IR fees this contract accrued over that same span, both in
    // CAD. The multiple is one divided by the other and is computed where it
    // is read, so the two legs always describe the same period.
    await this.q(`ALTER TABLE ir_contract_perf
      ADD COLUMN IF NOT EXISTS dvol_since_start     double precision,
      ADD COLUMN IF NOT EXISTS dvol_since_start_cad double precision,
      ADD COLUMN IF NOT EXISTS dvol_currency        varchar(3),
      ADD COLUMN IF NOT EXISTS dvol_days            int,
      ADD COLUMN IF NOT EXISTS dvol_sessions        int,
      ADD COLUMN IF NOT EXISTS spend_to_date_cad    double precision,
      ADD COLUMN IF NOT EXISTS spend_months         real,
      ADD COLUMN IF NOT EXISTS spend_basis          varchar(16)`);
  }

  /**
   * Recompute performance for every agreement that has a start date and an
   * issuer we can price. One price series per ISSUER, not per agreement —
   * an issuer with six providers would otherwise cost six identical calls.
   */
  async refresh(limit = 400): Promise<{ priced: number; unpriced: number }> {
    await this.ensureTable();
    const rows: any[] = await this.q(
      `SELECT a.id, a.ticker, a.start_date, a.end_date, a.term_months, a.status,
              a.monthly_fee_cad::float8 AS monthly_fee_cad, a.total_value_cad::float8 AS total_value_cad,
              i.fmp_symbol, i.currency, COALESCE(i.name, a.issuer_name) AS issuer_name
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

      // German-venue volume, independent of whether FMP prices the home
      // listing: an OTC-only quote in our price feed can still trade briskly
      // in Frankfurt or on Tradegate.
      let de: GermanVolume | null = null;
      try {
        const isin = await this.german.resolveIsin(symbol, group[0]?.issuer_name, ticker);
        const from = new Date(Date.parse(earliest) - VOL_LOOKBACK_DAYS * DAY).toISOString().slice(0, 10);
        de = isin ? await this.german.fetch(isin, from) : { isin: null, venues: [], bars: [], note: 'Not found on onvista or in our price data, so no German quotation could be checked.' };
      } catch (e: any) {
        this.log.debug(`german volume failed for ${ticker}: ${e?.message || e}`);
      }

      for (const r of group) {
        const start = isoOf(r.start_date)!;
        const today = new Date().toISOString().slice(0, 10);
        const deFields = germanFields(de, bars, start, bars.length ? bars[bars.length - 1].date : today);
        // Fees accrue whether or not we can price the stock, so the spend leg
        // is written for every contract; the multiple simply stays empty
        // where the dollar-volume leg is missing.
        const spend = accruedSpendCad(r, start, today);
        if (!bars.length) {
          unpriced++;
          await this.write(r.id, {
            symbol: symbol ?? null,
            start,
            currency: r.currency ?? null,
            note: symbol
              ? 'No price history available for this listing.'
              : 'This issuer is not covered by our price data.',
            ...deFields,
            ...spend,
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
            ...deFields,
            ...spend,
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
        const dvol = dollarVolumeSince(bars, start, r.currency ?? null);
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
          ...deFields,
          ...dvol,
          ...accruedSpendCad(r, start, now.date),
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
      deIsin?: string | null;
      deVenues?: Array<{ code: string; name: string; volume: number }> | null;
      deVolBefore?: number | null;
      deVolAfter30?: number | null;
      deVolAfter90?: number | null;
      deVolPost?: number | null;
      dePostDays?: number | null;
      dePctOfTotal?: number | null;
      deNote?: string | null;
      dvolSinceStart?: number | null;
      dvolSinceStartCad?: number | null;
      dvolCurrency?: string | null;
      dvolDays?: number | null;
      dvolSessions?: number | null;
      spendToDateCad?: number | null;
      spendMonths?: number | null;
      spendBasis?: string | null;
    },
  ) {
    const pct = (then: number | null | undefined, base: number | null | undefined) =>
      then != null && base != null && base > 0 ? Math.round(((then - base) / base) * 10000) / 10000 : null;
    await this.q(
      `INSERT INTO ir_contract_perf
         (agreement_id, fmp_symbol, start_date, start_price, price_30d, price_90d, price_now,
          perf_30d, perf_90d, perf_now, currency, note,
          vol_before, vol_after_30, vol_after_90, vol_growth_30, vol_growth_90,
          de_isin, de_venues, de_vol_before, de_vol_after_30, de_vol_after_90,
          de_vol_growth_30, de_vol_growth_90, de_vol_post, de_post_days, de_pct_of_total, de_note,
          dvol_since_start, dvol_since_start_cad, dvol_currency, dvol_days, dvol_sessions,
          spend_to_date_cad, spend_months, spend_basis, computed_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,
               $18,$19::jsonb,$20,$21,$22,$23,$24,$25,$26,$27,$28,
               $29,$30,$31,$32,$33,$34,$35,$36, now())
       ON CONFLICT (agreement_id) DO UPDATE SET
         fmp_symbol = EXCLUDED.fmp_symbol, start_date = EXCLUDED.start_date,
         start_price = EXCLUDED.start_price, price_30d = EXCLUDED.price_30d,
         price_90d = EXCLUDED.price_90d, price_now = EXCLUDED.price_now,
         perf_30d = EXCLUDED.perf_30d, perf_90d = EXCLUDED.perf_90d, perf_now = EXCLUDED.perf_now,
         currency = EXCLUDED.currency, note = EXCLUDED.note,
         vol_before = EXCLUDED.vol_before, vol_after_30 = EXCLUDED.vol_after_30,
         vol_after_90 = EXCLUDED.vol_after_90, vol_growth_30 = EXCLUDED.vol_growth_30,
         vol_growth_90 = EXCLUDED.vol_growth_90,
         de_isin = EXCLUDED.de_isin, de_venues = EXCLUDED.de_venues, de_vol_before = EXCLUDED.de_vol_before,
         de_vol_after_30 = EXCLUDED.de_vol_after_30, de_vol_after_90 = EXCLUDED.de_vol_after_90,
         de_vol_growth_30 = EXCLUDED.de_vol_growth_30, de_vol_growth_90 = EXCLUDED.de_vol_growth_90,
         de_vol_post = EXCLUDED.de_vol_post, de_post_days = EXCLUDED.de_post_days,
         de_pct_of_total = EXCLUDED.de_pct_of_total, de_note = EXCLUDED.de_note,
         dvol_since_start = EXCLUDED.dvol_since_start, dvol_since_start_cad = EXCLUDED.dvol_since_start_cad,
         dvol_currency = EXCLUDED.dvol_currency, dvol_days = EXCLUDED.dvol_days, dvol_sessions = EXCLUDED.dvol_sessions,
         spend_to_date_cad = EXCLUDED.spend_to_date_cad, spend_months = EXCLUDED.spend_months,
         spend_basis = EXCLUDED.spend_basis, computed_at = now()`,
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
        v.deIsin ?? null,
        v.deVenues ? JSON.stringify(v.deVenues) : null,
        v.deVolBefore ?? null,
        v.deVolAfter30 ?? null,
        v.deVolAfter90 ?? null,
        pct(v.deVolAfter30, v.deVolBefore),
        pct(v.deVolAfter90, v.deVolBefore),
        v.deVolPost ?? null,
        v.dePostDays ?? null,
        v.dePctOfTotal ?? null,
        v.deNote ?? null,
        v.dvolSinceStart ?? null,
        v.dvolSinceStartCad ?? null,
        v.dvolCurrency ?? null,
        v.dvolDays ?? null,
        v.dvolSessions ?? null,
        v.spendToDateCad ?? null,
        v.spendMonths ?? null,
        v.spendBasis ?? null,
      ],
    );
  }
}

/** Average days per month, so a fee "per month" accrues evenly across a span. */
const DAYS_PER_MONTH = 30.44;

/**
 * Dollar value traded on the home listing from the contract start date to the
 * latest session: each session's close times its share volume, summed. Every
 * trade has a buyer, so this is the money that changed hands for the stock
 * after the promotion began — George's "buying volume (dollar value)". It is
 * stated in the listing currency and converted to CAD at the same fixed
 * reference rates the fees use, so the multiple compares like with like.
 * German-venue trades are not included: onvista gives us shares, not prices.
 */
export function dollarVolumeSince(bars: Bar[], start: string, currency: string | null) {
  const inSpan = bars.filter((b) => b.date >= start);
  if (!inSpan.length) return { dvolSinceStart: null, dvolSinceStartCad: null, dvolCurrency: currency, dvolDays: null, dvolSessions: 0 };
  const total = inSpan.reduce((a, b) => a + b.close * b.volume, 0);
  const last = inSpan[inSpan.length - 1].date;
  return {
    dvolSinceStart: Math.round(total),
    dvolSinceStartCad: Math.round(total * fxToCad(currency)),
    dvolCurrency: (currency || 'CAD').toUpperCase().slice(0, 3),
    dvolDays: Math.max(0, Math.round((Date.parse(last) - Date.parse(start)) / DAY)),
    dvolSessions: inSpan.length,
  };
}

/**
 * Cash IR fees this contract has accrued from its start date to `until`, in
 * CAD. A monthly fee accrues by elapsed months, stopping at the contract's
 * end (a stated end date, or start + term). A contract disclosed only as a
 * total value accrues that total pro rata over its term, or all at once when
 * no term was disclosed. A contract with a monthly fee and no end is treated
 * as still running — that is what an open-ended engagement is — but never
 * beyond twelve months, so one undated row cannot compound forever. Options
 * and share grants are not cash and are not counted here.
 */
export function accruedSpendCad(
  a: { start_date?: any; end_date?: any; term_months?: number | null; monthly_fee_cad?: number | null; total_value_cad?: number | null },
  start: string,
  until: string,
) {
  const monthly = a.monthly_fee_cad != null && a.monthly_fee_cad > 0 ? Number(a.monthly_fee_cad) : null;
  const total = a.total_value_cad != null && a.total_value_cad > 0 ? Number(a.total_value_cad) : null;
  const term = a.term_months != null && a.term_months > 0 ? Number(a.term_months) : null;
  if (!monthly && !total) return { spendToDateCad: null, spendMonths: null, spendBasis: null };
  const explicitEnd = isoOf(a.end_date ?? null);
  const termEnd = term ? addMonthsIso(start, term) : null;
  const capEnd = addMonthsIso(start, 12);
  const end = explicitEnd ?? termEnd ?? capEnd;
  const stop = end < until ? end : until;
  const months = stop > start ? (Date.parse(stop) - Date.parse(start)) / DAY / DAYS_PER_MONTH : 0;
  if (monthly) {
    return { spendToDateCad: Math.round(monthly * months), spendMonths: Math.round(months * 100) / 100, spendBasis: 'monthly' };
  }
  // Total only.
  if (term) {
    const share = Math.min(1, months / term);
    return { spendToDateCad: Math.round(total! * share), spendMonths: Math.round(months * 100) / 100, spendBasis: 'total-prorated' };
  }
  return { spendToDateCad: Math.round(total!), spendMonths: Math.round(months * 100) / 100, spendBasis: 'total' };
}

function addMonthsIso(isoDate: string, n: number): string {
  const d = new Date(isoDate);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
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

/**
 * German-venue figures for one contract. Windows follow `volumeWindows`:
 * average daily volume over the 30 German sessions before the start against
 * the 30 / 90 calendar days after it (unelapsed window = null). `deVolPost`
 * is the cumulative German volume from the start through day 90 or today,
 * and `dePctOfTotal` compares it with the home listing's volume over the
 * same calendar span — null when the home listing has no bars.
 */
export function germanFields(de: GermanVolume | null, homeBars: Bar[], start: string, lastDate: string) {
  if (!de) return { deNote: 'German venue data unavailable.' };
  const base = { deIsin: de.isin, deVenues: de.venues.length ? de.venues : null };
  if (!de.bars.length) return { ...base, deNote: de.note ?? 'Not quoted on a German exchange.' };
  const bars: Bar[] = de.bars.map((b) => ({ date: b.date, close: 0, volume: b.volume }));
  const deLast = bars[bars.length - 1].date;
  const last = deLast > lastDate ? deLast : lastDate;
  const w = volumeWindows(bars, start, last);
  const end = new Date(Date.parse(start) + 90 * DAY).toISOString().slice(0, 10);
  const until = end < last ? end : last;
  const inSpan = (b: Bar) => b.date >= start && b.date <= until;
  const dePost = bars.filter(inSpan).reduce((a, b) => a + b.volume, 0);
  const homePost = homeBars.filter(inSpan).reduce((a, b) => a + b.volume, 0);
  const postDays = Math.max(0, Math.round((Date.parse(until) - Date.parse(start)) / DAY));
  if (until < start) {
    return { ...base, deNote: 'Contract has not started yet.' };
  }
  return {
    ...base,
    deVolBefore: w.volBefore,
    deVolAfter30: w.volAfter30,
    deVolAfter90: w.volAfter90,
    deVolPost: dePost,
    dePostDays: postDays,
    dePctOfTotal: homeBars.length && dePost + homePost > 0 ? Math.round((dePost / (dePost + homePost)) * 10000) / 10000 : null,
    deNote: dePost > 0 ? null : 'No shares traded on German venues since the contract began.',
  };
}
