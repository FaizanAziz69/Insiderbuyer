import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios, { AxiosInstance } from 'axios';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';

/**
 * IPO CALENDAR — Developer Project Brief (Aug 24 2026), Workstream E.
 *
 * "A daily-updated page tracking recently listed IPOs and how they've
 *  performed since listing."
 *
 *  §7.1 Rules
 *   - Window: IPOs that began trading within the last 90 days; older rows roll
 *     off automatically (the read query filters on listing_date, so nothing has
 *     to be deleted for a row to disappear on day 91).
 *   - Sort: most recent listing first (fixed default); re-sort by performance.
 *   - Prices update every day after market close via cron (22:30 UTC = 18:30 ET).
 *
 *  §7.2 Row spec: logo/name/ticker/exchange · listing date · IPO price ·
 *  current price (previous close) · return since IPO (hero stat) · insider
 *  activity flag when any open-market Form 4 buy was filed since listing,
 *  linking to the filing.
 *
 * Data: FMP's IPO calendar (brief §8, primary) merged with Nasdaq's public
 * calendar (exact priced amounts + the upcoming table), joined against FMP
 * daily prices. Raw-SQL tables created on demand, like every other cache on
 * this stack — no TypeORM entity, so no duplicate-index boot trap.
 */

export const IPO_WINDOW_DAYS = 90;
const STALE_MS = 26 * 3600_000;

export interface IpoListing {
  symbol: string;
  name: string;
  exchange: string | null;
  listingDate: string; // yyyy-mm-dd
  daysSinceListing: number;
  ipoPrice: number | null;
  ipoPriceSource: 'priced' | 'range-midpoint' | 'first-open' | null;
  currentPrice: number | null;
  priceAsOf: string | null;
  returnPct: number | null;
  marketCap: number | null;
  sharesOffered: number | null;
  insider: null | {
    buys: number;
    insiders: number;
    totalBought: number;
    lastBuyDate: string;
    filingUrl: string | null;
    ticker: string;
  };
}

export interface IpoUpcoming {
  symbol: string;
  name: string;
  exchange: string | null;
  expectedDate: string | null;
  priceRange: string | null;
  sharesOffered: number | null;
  source: string;
}

/** Legacy shape kept for the old /ipo/calendar consumers. */
export interface IpoRow {
  symbol: string;
  name: string;
  exchange: string | null;
  price: string | null;
  shares: string | null;
  dollarValue: string | null;
  date: string | null;
  status: 'Priced' | 'Upcoming' | 'Filed';
}

function toIso(d: string | null | undefined): string | null {
  if (!d) return null;
  const s = String(d).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  return null;
}

function isoDaysAgo(days: number): string {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function num(v: any): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v).replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** ETFs and closed-end funds list through the same calendar; the brief's page
 *  is about operating-company IPOs. */
function isFund(name: any): boolean {
  return /\b(ETF|ETFs|Fund|Funds|Trust Series|Portfolio)\b/i.test(String(name || ''));
}

/** "$10.00-$12.00" → midpoint 11; "$16.00" → 16. */
function parsePriceRange(v: any): { price: number | null; exact: boolean } {
  if (v === null || v === undefined) return { price: null, exact: false };
  const parts = String(v)
    .split(/[-–]/)
    .map((p) => num(p))
    .filter((n): n is number => n !== null && n > 0);
  if (!parts.length) return { price: null, exact: false };
  if (parts.length === 1) return { price: parts[0], exact: true };
  return { price: (parts[0] + parts[1]) / 2, exact: false };
}

interface Candidate {
  symbol: string;
  name: string;
  exchange: string | null;
  date: string;
  pricedPrice: number | null; // exact offering price when the feed has it
  rangeMid: number | null;
  shares: number | null;
  marketCap: number | null;
  source: string;
}

@Injectable()
export class IpoService implements OnModuleInit {
  private readonly logger = new Logger(IpoService.name);
  private readonly http: AxiosInstance;
  private tablesReady = false;
  private refreshing = false;
  private lastError: string | null = null;

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {
    this.http = axios.create({
      timeout: 10_000,
      headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json, text/plain, */*' },
    });
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.ensureTables();
    } catch (e: any) {
      this.logger.warn(`ipo init failed: ${e?.message || e}`);
    }
    // First fill shortly after boot when the table is empty; never blocks start-up.
    if (!process.env.VERCEL) setTimeout(() => void this.refreshIfStale().catch(() => undefined), 45_000);
  }

  /** §7.1: prices update every day after market close. 22:30 UTC = 18:30 ET,
   *  every day of the week — a weekend or holiday run is a cheap no-op that
   *  still re-stamps price_asof, so the "verified across a weekend" check in
   *  §10 has evidence. */
  @Cron('30 22 * * *')
  async nightly(): Promise<void> {
    if (process.env.VERCEL) return;
    try {
      await this.refresh();
    } catch (e: any) {
      this.logger.warn(`ipo nightly refresh failed: ${e?.message || e}`);
    }
  }

  /* ------------------------------------------------------------ schema */

  private async ensureTables(): Promise<void> {
    if (this.tablesReady) return;
    const q = (sql: string) => this.companies.query(sql);
    await q(`CREATE TABLE IF NOT EXISTS ipo_listings (
      symbol            text PRIMARY KEY,
      name              text NOT NULL,
      exchange          text,
      listing_date      date NOT NULL,
      ipo_price         float8,
      ipo_price_source  text,
      current_price     float8,
      price_asof        date,
      market_cap        float8,
      shares_offered    float8,
      source            text,
      first_seen        timestamptz NOT NULL DEFAULT now(),
      updated_at        timestamptz NOT NULL DEFAULT now()
    )`);
    await q(`CREATE INDEX IF NOT EXISTS ipo_listings_date_idx ON ipo_listings (listing_date DESC)`);
    await q(`CREATE TABLE IF NOT EXISTS ipo_upcoming (
      symbol         text PRIMARY KEY,
      name           text NOT NULL,
      exchange       text,
      expected_date  date,
      price_range    text,
      shares_offered float8,
      source         text,
      updated_at     timestamptz NOT NULL DEFAULT now()
    )`);
    this.tablesReady = true;
  }

  /* ------------------------------------------------------------ feeds */

  /** FMP stable IPO calendar — brief §8 primary source. Rows carry
   *  { symbol, date, daa, company, exchange, actions, shares, priceRange, marketCap }. */
  private async fmpCalendar(from: string, to: string): Promise<any[]> {
    if (!this.fmp.enabled) return [];
    // FMP caps the range per call; step a month at a time.
    const out: any[] = [];
    let cursor = new Date(from);
    const end = new Date(to);
    while (cursor <= end) {
      const next = new Date(cursor);
      next.setDate(next.getDate() + 30);
      const chunkTo = next > end ? end : next;
      const rows = await this.fmp.getIpoCalendar(cursor.toISOString().slice(0, 10), chunkTo.toISOString().slice(0, 10));
      out.push(...rows);
      cursor = new Date(chunkTo);
      cursor.setDate(cursor.getDate() + 1);
    }
    return out;
  }

  /** Nasdaq's public calendar: exact priced amounts + the upcoming table. */
  private async nasdaqCalendar(months: string[]): Promise<{ priced: any[]; upcoming: any[] }> {
    const priced: any[] = [];
    const upcoming: any[] = [];
    for (const month of months) {
      try {
        const { data } = await this.http.get(`https://api.nasdaq.com/api/ipo/calendar?date=${month}`);
        const d = data?.data || {};
        priced.push(...(d?.priced?.rows || []));
        upcoming.push(...(d?.upcoming?.upcomingTable?.rows || d?.upcoming?.rows || []));
      } catch (e: any) {
        this.lastError = `nasdaq ${month}: ${e?.message || e}`;
        this.logger.warn(this.lastError);
      }
    }
    return { priced, upcoming };
  }

  /* ---------------------------------------------------------- refresh */

  async refreshIfStale(): Promise<{ refreshed: boolean; asOf: string | null }> {
    await this.ensureTables();
    const [row] = await this.companies.query(`SELECT MAX(updated_at) AS t, COUNT(*)::int AS n FROM ipo_listings`);
    const t = row?.t ? new Date(row.t).getTime() : 0;
    if (Number(row?.n) > 0 && Date.now() - t < STALE_MS) return { refreshed: false, asOf: row.t };
    await this.refresh();
    return { refreshed: true, asOf: new Date().toISOString() };
  }

  /** Rebuild the trailing window from the feeds, then re-price everything. */
  async refresh(): Promise<{ listings: number; upcoming: number; priced: number }> {
    if (this.refreshing) return { listings: 0, upcoming: 0, priced: 0 };
    this.refreshing = true;
    try {
      await this.ensureTables();
      const today = new Date().toISOString().slice(0, 10);
      // Look back a little past the window so a late-priced row still lands.
      const from = isoDaysAgo(IPO_WINDOW_DAYS + 14);
      const months = new Set<string>();
      for (let d = new Date(from); d <= new Date(Date.now() + 45 * 86_400_000); d.setMonth(d.getMonth() + 1)) {
        months.add(d.toISOString().slice(0, 7));
      }
      months.add(new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 7));

      const [fmpRows, nasdaq] = await Promise.all([
        this.fmpCalendar(from, new Date(Date.now() + 45 * 86_400_000).toISOString().slice(0, 10)),
        this.nasdaqCalendar(Array.from(months).sort()),
      ]);

      const listed = new Map<string, Candidate>();
      const upcoming = new Map<string, IpoUpcoming>();
      /** FMP leaves many rows at "Expected" long after the debut (or the deal
       *  quietly died). Past-dated "expected" rows are admitted only if a live
       *  quote proves the symbol trades. */
      const pastExpected = new Map<string, Candidate>();

      for (const r of fmpRows) {
        const symbol = String(r.symbol || '').toUpperCase().trim();
        const date = toIso(r.date);
        if (!symbol || !date) continue;
        if (isFund(r.company)) continue;
        const action = String(r.actions || '').toLowerCase();
        if (/withdrawn|postponed/.test(action)) continue;
        const { price, exact } = parsePriceRange(r.priceRange);
        if (date <= today && /expected|filed/.test(action)) {
          pastExpected.set(symbol, {
            symbol,
            name: String(r.company || symbol),
            exchange: r.exchange || null,
            date,
            pricedPrice: exact ? price : null,
            rangeMid: exact ? null : price,
            shares: num(r.shares),
            marketCap: num(r.marketCap),
            source: 'fmp',
          });
          continue;
        }
        if (date <= today) {
          listed.set(symbol, {
            symbol,
            name: String(r.company || symbol),
            exchange: r.exchange || null,
            date,
            pricedPrice: exact ? price : null,
            rangeMid: exact ? null : price,
            shares: num(r.shares),
            marketCap: num(r.marketCap),
            source: 'fmp',
          });
        } else {
          upcoming.set(symbol, {
            symbol,
            name: String(r.company || symbol),
            exchange: r.exchange || null,
            expectedDate: date,
            priceRange: r.priceRange ? String(r.priceRange) : null,
            sharesOffered: num(r.shares),
            source: 'fmp',
          });
        }
      }

      for (const r of nasdaq.priced) {
        const symbol = String(r.proposedTickerSymbol || r.symbol || '').toUpperCase().trim();
        const date = toIso(r.pricedDate);
        if (!symbol || !date || date > today || isFund(r.companyName)) continue;
        pastExpected.delete(symbol);
        const price = num(r.proposedSharePrice);
        const prev = listed.get(symbol);
        listed.set(symbol, {
          symbol,
          name: prev?.name || String(r.companyName || symbol),
          exchange: prev?.exchange || r.proposedExchange || null,
          date: prev?.date || date,
          pricedPrice: price ?? prev?.pricedPrice ?? null, // Nasdaq's priced amount is exact
          rangeMid: prev?.rangeMid ?? null,
          shares: prev?.shares ?? num(r.sharesOffered),
          marketCap: prev?.marketCap ?? null,
          source: prev ? 'fmp+nasdaq' : 'nasdaq',
        });
        upcoming.delete(symbol);
      }
      for (const r of nasdaq.upcoming) {
        const symbol = String(r.proposedTickerSymbol || r.symbol || '').toUpperCase().trim();
        if (!symbol || listed.has(symbol) || isFund(r.companyName)) continue;
        const date = toIso(r.expectedPriceDate || r.pricedDate);
        if (date && date < today) continue;
        const prev = upcoming.get(symbol);
        upcoming.set(symbol, {
          symbol,
          name: prev?.name || String(r.companyName || symbol),
          exchange: prev?.exchange || r.proposedExchange || null,
          expectedDate: prev?.expectedDate || date,
          priceRange: prev?.priceRange || (r.proposedSharePrice ? String(r.proposedSharePrice) : null),
          sharesOffered: prev?.sharesOffered ?? num(r.sharesOffered),
          source: prev ? 'fmp+nasdaq' : 'nasdaq',
        });
      }

      // Past "expected" rows: admit only those that actually trade.
      const unverified = Array.from(pastExpected.values()).filter((c) => !listed.has(c.symbol) && c.date >= isoDaysAgo(IPO_WINDOW_DAYS + 14));
      if (unverified.length) {
        const quotes = await this.fmp.getQuotesBatch(unverified.map((c) => c.symbol));
        for (const c of unverified) {
          const q = quotes.get(c.symbol);
          if (num(q?.price) && num(q?.price)! > 0) listed.set(c.symbol, { ...c, source: 'fmp (verified by quote)' });
        }
      }

      // Rows admitted by an earlier build before the fund filter existed.
      await this.companies.query(`DELETE FROM ipo_listings WHERE name ~* '\\m(ETF|ETFs|Fund|Funds|Trust Series|Portfolio)\\M'`);

      // Upsert listings inside the window; the read filter does the roll-off.
      const inWindow = Array.from(listed.values()).filter((c) => c.date >= isoDaysAgo(IPO_WINDOW_DAYS + 14));
      for (const c of inWindow) {
        await this.companies.query(
          `INSERT INTO ipo_listings (symbol, name, exchange, listing_date, ipo_price, ipo_price_source, market_cap, shares_offered, source, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9, now())
           ON CONFLICT (symbol) DO UPDATE SET
             name = EXCLUDED.name,
             exchange = COALESCE(EXCLUDED.exchange, ipo_listings.exchange),
             listing_date = LEAST(ipo_listings.listing_date, EXCLUDED.listing_date),
             ipo_price = CASE WHEN EXCLUDED.ipo_price_source = 'priced' THEN EXCLUDED.ipo_price
                              WHEN ipo_listings.ipo_price_source = 'priced' THEN ipo_listings.ipo_price
                              ELSE COALESCE(ipo_listings.ipo_price, EXCLUDED.ipo_price) END,
             ipo_price_source = CASE WHEN EXCLUDED.ipo_price_source = 'priced' THEN 'priced'
                                     ELSE COALESCE(ipo_listings.ipo_price_source, EXCLUDED.ipo_price_source) END,
             market_cap = COALESCE(EXCLUDED.market_cap, ipo_listings.market_cap),
             shares_offered = COALESCE(EXCLUDED.shares_offered, ipo_listings.shares_offered),
             source = EXCLUDED.source,
             updated_at = now()`,
          [
            c.symbol,
            c.name,
            c.exchange,
            c.date,
            c.pricedPrice ?? c.rangeMid,
            c.pricedPrice !== null ? 'priced' : c.rangeMid !== null ? 'range-midpoint' : null,
            c.marketCap,
            c.shares,
            c.source,
          ],
        );
      }

      await this.companies.query(`DELETE FROM ipo_upcoming`);
      for (const u of upcoming.values()) {
        await this.companies.query(
          `INSERT INTO ipo_upcoming (symbol, name, exchange, expected_date, price_range, shares_offered, source)
           VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (symbol) DO NOTHING`,
          [u.symbol, u.name, u.exchange, u.expectedDate, u.priceRange, u.sharesOffered, u.source],
        );
      }

      // Rows well past the window can go; the read filter already hides them.
      await this.companies.query(`DELETE FROM ipo_listings WHERE listing_date < CURRENT_DATE - ${IPO_WINDOW_DAYS + 30}`);

      const priced = await this.repriceAll();
      this.lastError = null;
      this.logger.log(`ipo refresh: ${inWindow.length} listings, ${upcoming.size} upcoming, ${priced} priced`);
      return { listings: inWindow.length, upcoming: upcoming.size, priced };
    } finally {
      this.refreshing = false;
    }
  }

  /** Daily price pass: previous close for every row in the window, plus the
   *  first session's open as the IPO-price fallback when no feed priced it. */
  private async repriceAll(): Promise<number> {
    const rows: Array<{ symbol: string; listing_date: string; ipo_price: number | null; ipo_price_source: string | null }> =
      await this.companies.query(
        `SELECT symbol, listing_date::text, ipo_price, ipo_price_source FROM ipo_listings
         WHERE listing_date >= CURRENT_DATE - ${IPO_WINDOW_DAYS}`,
      );
    if (!rows.length) return 0;
    const quotes = await this.fmp.getQuotesBatch(rows.map((r) => r.symbol));
    let priced = 0;
    for (const r of rows) {
      const q = quotes.get(r.symbol.toUpperCase());
      // "Current price = previous close, updated daily" (§7.2). After the
      // close FMP's `price` IS that close; `previousClose` is the day before.
      const px = num(q?.price) ?? num(q?.previousClose);
      let ipoPrice = r.ipo_price;
      let src = r.ipo_price_source;
      if (ipoPrice === null || src === 'range-midpoint') {
        // A listed stock with only a filing range: take the first session's
        // open as the best public proxy and say so in the UI.
        const bars = await this.fmp.getEodBars(r.symbol, { from: r.listing_date, light: false, ttlMs: 6 * 3600_000 });
        const first = bars.find((b) => b.date >= r.listing_date) || bars[0];
        if (first?.open && ipoPrice === null) {
          ipoPrice = first.open;
          src = 'first-open';
        }
      }
      if (px === null && ipoPrice === null) continue;
      await this.companies.query(
        `UPDATE ipo_listings SET current_price = COALESCE($2, current_price), price_asof = CASE WHEN $2 IS NULL THEN price_asof ELSE CURRENT_DATE END,
           ipo_price = COALESCE($3, ipo_price), ipo_price_source = COALESCE($4, ipo_price_source),
           market_cap = COALESCE($5, market_cap), exchange = COALESCE(exchange, $6), updated_at = now()
         WHERE symbol = $1`,
        [r.symbol, px, ipoPrice, src, num(q?.marketCap), q?.exchange || null],
      );
      if (px !== null) priced++;
    }
    return priced;
  }

  /* ------------------------------------------------------------- read */

  /** Open-market Form 4 buys filed since each listing — the unique angle. */
  private async insiderFlags(symbols: string[]): Promise<Map<string, IpoListing['insider']>> {
    const out = new Map<string, IpoListing['insider']>();
    if (!symbols.length) return out;
    const rows: Array<{
      t: string;
      buys: number;
      insiders: number;
      total: number;
      last: string;
      url: string | null;
    }> = await this.companies.query(
      `SELECT UPPER(c.ticker) AS t, COUNT(*)::int AS buys, COUNT(DISTINCT t."insiderName")::int AS insiders,
              SUM(t."totalValue")::float8 AS total, MAX(t."transactionDate")::text AS last,
              (ARRAY_AGG(t."filingUrl" ORDER BY t."transactionDate" DESC NULLS LAST))[1] AS url
       FROM insider_transactions t
       JOIN companies c ON c.id = t.company_id
       JOIN ipo_listings l ON UPPER(l.symbol) = UPPER(c.ticker)
       WHERE UPPER(c.ticker) = ANY($1)
         AND t."transactionCode" = 'P' AND t."plannedBuy" = false AND t."totalValue" > 0
         AND t."transactionDate" >= l.listing_date
       GROUP BY UPPER(c.ticker)`,
      [symbols.map((s) => s.toUpperCase())],
    );
    for (const r of rows) {
      out.set(r.t, {
        buys: Number(r.buys),
        insiders: Number(r.insiders),
        totalBought: Number(r.total),
        lastBuyDate: r.last,
        filingUrl: r.url,
        ticker: r.t,
      });
    }
    return out;
  }

  async recent(sort: 'date' | 'return' = 'date', dir: 'asc' | 'desc' = 'desc'): Promise<{
    window: number;
    asOf: string | null;
    count: number;
    rows: IpoListing[];
    methodologyUrl: string;
  }> {
    await this.ensureTables();
    void this.refreshIfStale().catch(() => undefined);
    const rows: any[] = await this.companies.query(
      `SELECT symbol, name, exchange, listing_date::text AS listing_date, ipo_price, ipo_price_source, current_price,
              price_asof::text AS price_asof, market_cap, shares_offered,
              (CURRENT_DATE - listing_date)::int AS days
       FROM ipo_listings
       WHERE listing_date >= CURRENT_DATE - ${IPO_WINDOW_DAYS} AND listing_date <= CURRENT_DATE
       ORDER BY listing_date DESC, symbol`,
    );
    const flags = await this.insiderFlags(rows.map((r) => r.symbol));
    const out: IpoListing[] = rows.map((r) => {
      const ipo = r.ipo_price === null ? null : Number(r.ipo_price);
      const cur = r.current_price === null ? null : Number(r.current_price);
      return {
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        listingDate: r.listing_date,
        daysSinceListing: Number(r.days),
        ipoPrice: ipo,
        ipoPriceSource: r.ipo_price_source,
        currentPrice: cur,
        priceAsOf: r.price_asof,
        returnPct: ipo && cur ? ((cur - ipo) / ipo) * 100 : null,
        marketCap: r.market_cap === null ? null : Number(r.market_cap),
        sharesOffered: r.shares_offered === null ? null : Number(r.shares_offered),
        insider: flags.get(r.symbol.toUpperCase()) ?? null,
      };
    });
    if (sort === 'return') {
      out.sort((a, b) => {
        const av = a.returnPct ?? Number.NEGATIVE_INFINITY;
        const bv = b.returnPct ?? Number.NEGATIVE_INFINITY;
        return dir === 'asc' ? av - bv : bv - av;
      });
    } else if (dir === 'asc') {
      out.reverse();
    }
    const [meta] = await this.companies.query(`SELECT MAX(price_asof)::text AS t FROM ipo_listings`);
    return { window: IPO_WINDOW_DAYS, asOf: meta?.t ?? null, count: out.length, rows: out, methodologyUrl: '/methodology#ipo-calendar' };
  }

  async upcoming(): Promise<{ count: number; rows: IpoUpcoming[] }> {
    await this.ensureTables();
    const rows: any[] = await this.companies.query(
      `SELECT symbol, name, exchange, expected_date::text AS expected_date, price_range, shares_offered, source
       FROM ipo_upcoming WHERE expected_date IS NULL OR expected_date >= CURRENT_DATE ORDER BY expected_date NULLS LAST, symbol`,
    );
    return {
      count: rows.length,
      rows: rows.map((r) => ({
        symbol: r.symbol,
        name: r.name,
        exchange: r.exchange,
        expectedDate: r.expected_date,
        priceRange: r.price_range,
        sharesOffered: r.shares_offered === null ? null : Number(r.shares_offered),
        source: r.source,
      })),
    };
  }

  async status(): Promise<unknown> {
    await this.ensureTables();
    const [c] = await this.companies.query(
      `SELECT COUNT(*) FILTER (WHERE listing_date >= CURRENT_DATE - ${IPO_WINDOW_DAYS})::int AS in_window,
              COUNT(*)::int AS stored,
              COUNT(*) FILTER (WHERE current_price IS NOT NULL AND listing_date >= CURRENT_DATE - ${IPO_WINDOW_DAYS})::int AS priced,
              MAX(price_asof)::text AS price_asof, MAX(updated_at) AS updated_at
       FROM ipo_listings`,
    );
    const [u] = await this.companies.query(`SELECT COUNT(*)::int AS n FROM ipo_upcoming`);
    return {
      window: IPO_WINDOW_DAYS,
      inWindow: c?.in_window ?? 0,
      stored: c?.stored ?? 0,
      priced: c?.priced ?? 0,
      upcoming: u?.n ?? 0,
      priceAsOf: c?.price_asof ?? null,
      updatedAt: c?.updated_at ?? null,
      fmpEnabled: this.fmp.enabled,
      cron: '30 22 * * * (UTC, daily, post-close)',
      lastError: this.lastError,
    };
  }

  /** Legacy shape for the old page/consumers. */
  async getCalendar(): Promise<IpoRow[]> {
    const [r, u] = await Promise.all([this.recent(), this.upcoming()]);
    const out: IpoRow[] = r.rows.map((x) => ({
      symbol: x.symbol,
      name: x.name,
      exchange: x.exchange,
      price: x.ipoPrice === null ? null : x.ipoPrice.toFixed(2),
      shares: x.sharesOffered === null ? null : String(x.sharesOffered),
      dollarValue: null,
      date: x.listingDate,
      status: 'Priced',
    }));
    for (const x of u.rows) {
      out.push({
        symbol: x.symbol,
        name: x.name,
        exchange: x.exchange,
        price: x.priceRange,
        shares: x.sharesOffered === null ? null : String(x.sharesOffered),
        dollarValue: null,
        date: x.expectedDate,
        status: 'Upcoming',
      });
    }
    return out;
  }
}
