import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { PricesService } from './prices.service';
import { RosterService } from './roster.service';

/**
 * Last-10-Trades — Brief v7 Build 2.
 *
 * One strip, three data precisions, the same shape:
 *   • congress  — PTR rows (est. bands); a buy's return comes from its
 *                 reconstructed lot: realized proceeds plus what remains at
 *                 today's price, over cost. "realized" when nothing remains.
 *   • insider   — Form 4 rows (exact price and shares); return = live price
 *                 against the filed price.
 *   • investor  — 13F quarter-over-quarter changes (approximation): a new or
 *                 added position is a BUY at the quarter-end implied price
 *                 (value ÷ shares), a reduced or closed one a SELL.
 * Returns are rendered for BUYS only (§3: a sale's "success" needs a
 * counterfactual). Every payload names its precision so the UI can flag
 * estimates where the brief requires it.
 *
 * Reads only stored rows plus a cached latest close; nothing is computed
 * from the network on request.
 */

export type Last10Type = 'congress' | 'insider' | 'investor';
export type Precision = 'exact' | 'est' | 'approx';

export interface Last10Item {
  date: string;
  ticker: string | null;
  name: string;
  side: 'BUY' | 'SELL';
  /** "$15K–$50K" / "12,000 sh @ $34.10" / "+120,000 sh (13F)". */
  sizeLabel: string;
  sizeValue: number | null;
  price: number | null;
  priceNow: number | null;
  returnPct: number | null;
  realized: boolean;
  url: string | null;
}

export interface Last10Payload {
  type: Last10Type;
  key: string;
  subject: { name: string; slug: string; photoUrl: string | null; href: string } | null;
  precision: Precision;
  precisionNote: string;
  items: Last10Item[];
  summary: { buys: number; up: number; down: number; avgReturnPct: number | null; line: string };
  asOf: string;
}

const NOTES: Record<Precision, string> = {
  exact: 'Form 4 prices and share counts, exact as filed.',
  est: 'Estimated: congressional filings report a dollar range; the midpoint is used and marked est.',
  approx: 'Approximate: 13F filings show quarter-end positions, so the entry price is the quarter-end implied price and the date is the quarter end.',
};

const CACHE_MS = 10 * 60_000;

function band(min: number | null, max: number | null): string {
  const f = (v: number) => (v >= 1e6 ? `$${(v / 1e6).toFixed(v >= 1e7 ? 0 : 1)}M` : v >= 1e3 ? `$${Math.round(v / 1e3)}K` : `$${Math.round(v)}`);
  if (min == null && max == null) return '—';
  if (min != null && max != null && max !== min) return `${f(min)}–${f(max)}`;
  return f((min ?? max) as number);
}

function summarise(items: Last10Item[], precision: Precision) {
  const buys = items.filter((i) => i.side === 'BUY' && i.returnPct != null);
  const up = buys.filter((i) => (i.returnPct as number) > 0).length;
  const down = buys.filter((i) => (i.returnPct as number) <= 0).length;
  const avg = buys.length ? buys.reduce((s, i) => s + (i.returnPct as number), 0) / buys.length : null;
  const tag = precision === 'exact' ? '' : ' (est.)';
  const line = buys.length
    ? `Last ${buys.length} buy${buys.length === 1 ? '' : 's'}: ${up} up / ${down} down · avg ${avg != null && avg >= 0 ? '+' : ''}${avg != null ? avg.toFixed(1) : '—'}%${tag}`
    : items.length
      ? 'No priced buys among the last 10 trades'
      : 'No disclosed trades on record';
  return { buys: buys.length, up, down, avgReturnPct: avg, line };
}

@Injectable()
export class Last10Service {
  private readonly log = new Logger(Last10Service.name);
  private readonly cache = new Map<string, { ts: number; data: Last10Payload | null }>();
  private readonly closeCache = new Map<string, { ts: number; px: number | null }>();

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly prices: PricesService,
    private readonly roster: RosterService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  /** Latest close we hold for a ticker: the company row first, else the price series. */
  private async closeNow(ticker: string | null): Promise<number | null> {
    if (!ticker) return null;
    const hit = this.closeCache.get(ticker);
    if (hit && Date.now() - hit.ts < CACHE_MS) return hit.px;
    let px: number | null = null;
    try {
      const row = (await this.q<any[]>(`SELECT "lastPrice" FROM companies WHERE upper(ticker) = $1 AND "lastPrice" > 0 LIMIT 1`, [ticker.toUpperCase()]))[0];
      if (row?.lastPrice) px = Number(row.lastPrice);
      if (!px) {
        const s = await this.prices.loadResolved(ticker);
        if (s && s.series.c.length) px = s.series.c[s.series.c.length - 1];
      }
    } catch {
      px = null;
    }
    this.closeCache.set(ticker, { ts: Date.now(), px });
    return px;
  }

  async get(type: Last10Type, key: string): Promise<Last10Payload | null> {
    const ck = `${type}:${key.toLowerCase()}`;
    const hit = this.cache.get(ck);
    if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;
    let data: Last10Payload | null = null;
    try {
      data = type === 'congress' ? await this.congress(key) : type === 'insider' ? await this.insider(key) : await this.investor(key);
    } catch (e: any) {
      this.log.warn(`last10 ${type}/${key}: ${e?.message || e}`);
    }
    this.cache.set(ck, { ts: Date.now(), data });
    return data;
  }

  private async congress(key: string): Promise<Last10Payload | null> {
    const bioguide = await this.roster.resolve(key);
    if (!bioguide) return null;
    const m = (await this.q<any[]>(`SELECT bioguide, name, fmp_name, photo_url FROM wt_members WHERE bioguide = $1`, [bioguide]))[0];
    if (!m) return null;
    const rows = await this.q<any[]>(
      `SELECT t.id, t.ticker, t.asset_description, t.side, t.amount_min, t.amount_max, to_char(t.transaction_date,'YYYY-MM-DD') AS date, t.source_url,
              l.shares, l.cost_per_share, l.remaining, l.sold_proceeds
       FROM wt_trades t LEFT JOIN wt_lots l ON l.trade_id = t.id
       WHERE t.bioguide = $1 AND t.side IN ('buy','sell')
       ORDER BY t.transaction_date DESC, t.id LIMIT 10`,
      [bioguide],
    );
    const items: Last10Item[] = [];
    for (const r of rows) {
      const ticker = r.ticker || null;
      const isBuy = r.side === 'buy';
      let returnPct: number | null = null;
      let realized = false;
      let price: number | null = null;
      let priceNow: number | null = null;
      if (isBuy && r.shares != null) {
        const shares = Number(r.shares);
        const cost = shares * Number(r.cost_per_share);
        const remaining = Number(r.remaining);
        price = Number(r.cost_per_share);
        priceNow = await this.closeNow(ticker);
        if (cost > 0 && (remaining <= 1e-6 || priceNow != null)) {
          returnPct = ((Number(r.sold_proceeds) + remaining * (priceNow || 0)) / cost - 1) * 100;
          realized = remaining <= 1e-6;
        }
      }
      items.push({
        date: r.date,
        ticker,
        name: r.asset_description || ticker || '',
        side: isBuy ? 'BUY' : 'SELL',
        sizeLabel: band(r.amount_min != null ? Number(r.amount_min) : null, r.amount_max != null ? Number(r.amount_max) : null),
        sizeValue: r.amount_min != null && r.amount_max != null ? (Number(r.amount_min) + Number(r.amount_max)) / 2 : null,
        price,
        priceNow,
        returnPct,
        realized,
        url: r.source_url || null,
      });
    }
    const name = m.fmp_name || m.name;
    return {
      type: 'congress',
      key: bioguide,
      subject: { name, slug: encodeURIComponent(name), photoUrl: m.photo_url, href: `/politicians/${encodeURIComponent(name)}` },
      precision: 'est',
      precisionNote: NOTES.est,
      items,
      summary: summarise(items, 'est'),
      asOf: new Date().toISOString(),
    };
  }

  private async insider(name: string): Promise<Last10Payload | null> {
    const clean = name.trim().replace(/\s+/g, ' ');
    if (!clean) return null;
    const rows = await this.q<any[]>(
      `SELECT t."insiderName", t."transactionCode", t."sharesBought", t."pricePerShare", t."totalValue",
              to_char(t."transactionDate",'YYYY-MM-DD') AS date, t."filingUrl", t."accessionNumber", c.ticker, c.name AS company, c."lastPrice"
       FROM insider_transactions t JOIN companies c ON c.id = t.company_id
       WHERE LOWER(btrim(regexp_replace(t."insiderName", '\\s+', ' ', 'g'))) = LOWER($1)
         AND t."transactionCode" IN ('P','S') AND t."sharesBought" * t."pricePerShare" > 0
       ORDER BY t."transactionDate" DESC, t."accessionNumber" DESC LIMIT 10`,
      [clean],
    );
    if (!rows.length) return null;
    const items: Last10Item[] = rows.map((r) => {
      const isBuy = r.transactionCode === 'P';
      const px = Number(r.pricePerShare);
      const live = r.lastPrice ? Number(r.lastPrice) : null;
      const shares = Number(r.sharesBought);
      return {
        date: r.date,
        ticker: r.ticker,
        name: r.company,
        side: isBuy ? 'BUY' : 'SELL',
        sizeLabel: `${Math.round(shares).toLocaleString()} sh @ $${px.toFixed(2)}`,
        sizeValue: Number(r.totalValue) || shares * px,
        price: px,
        priceNow: live,
        returnPct: isBuy && px > 0 && live ? ((live - px) / px) * 100 : null,
        realized: false,
        url: r.filingUrl || null,
      };
    });
    const display = rows[0].insiderName;
    return {
      type: 'insider',
      key: clean,
      subject: { name: display, slug: encodeURIComponent(display), photoUrl: null, href: `/insiders/${encodeURIComponent(display)}` },
      precision: 'exact',
      precisionNote: NOTES.exact,
      items,
      summary: summarise(items, 'exact'),
      asOf: new Date().toISOString(),
    };
  }

  private async investor(slug: string): Promise<Last10Payload | null> {
    const inv = (await this.q<any[]>(`SELECT slug, person, firm, photo_url FROM investors WHERE slug = $1`, [slug]))[0];
    if (!inv) return null;
    const periods = await this.q<Array<{ period: string }>>(`SELECT DISTINCT to_char(period,'YYYY-MM-DD') AS period FROM investor_holdings WHERE slug = $1 ORDER BY period DESC LIMIT 2`, [slug]);
    if (!periods.length) return null;
    const cur = periods[0].period;
    const prev = periods[1]?.period || null;
    const rows = await this.q<any[]>(
      `WITH c AS (SELECT cusip, ticker, name, shares, value FROM investor_holdings WHERE slug = $1 AND period = $2 AND put_call = 'Share'),
            p AS (SELECT cusip, ticker, name, shares, value FROM investor_holdings WHERE slug = $1 AND period = $3 AND put_call = 'Share')
       SELECT coalesce(c.cusip, p.cusip) AS cusip, coalesce(c.ticker, p.ticker) AS ticker, coalesce(c.name, p.name) AS name,
              coalesce(c.shares,0) AS shares, coalesce(p.shares,0) AS prev_shares, coalesce(c.value,0) AS value, coalesce(p.value,0) AS prev_value
       FROM c FULL OUTER JOIN p ON p.cusip = c.cusip
       WHERE coalesce(c.shares,0) <> coalesce(p.shares,0)
       ORDER BY abs(coalesce(c.value,0) - coalesce(p.value,0)) DESC LIMIT 10`,
      [slug, cur, prev || '1900-01-01'],
    );
    const items: Last10Item[] = [];
    for (const r of rows) {
      const shares = Number(r.shares);
      const prevShares = Number(r.prev_shares);
      const delta = shares - prevShares;
      const isBuy = delta > 0;
      // Implied quarter-end price of the side that has one.
      const implied = shares > 0 ? Number(r.value) / shares : prevShares > 0 ? Number(r.prev_value) / prevShares : null;
      const ticker = r.ticker || null;
      const priceNow = isBuy ? await this.closeNow(ticker) : null;
      items.push({
        date: cur,
        ticker,
        name: r.name,
        side: isBuy ? 'BUY' : 'SELL',
        sizeLabel: `${isBuy ? '+' : '−'}${Math.round(Math.abs(delta)).toLocaleString()} sh${prevShares === 0 ? ' (new)' : shares === 0 ? ' (closed)' : ''}`,
        sizeValue: implied != null ? Math.abs(delta) * implied : null,
        price: implied,
        priceNow,
        returnPct: isBuy && implied && implied > 0 && priceNow ? ((priceNow - implied) / implied) * 100 : null,
        realized: false,
        url: null,
      });
    }
    const name = inv.person || inv.firm;
    return {
      type: 'investor',
      key: slug,
      subject: { name, slug, photoUrl: inv.photo_url, href: `/investors/${slug}` },
      precision: 'approx',
      precisionNote: NOTES.approx,
      items,
      summary: summarise(items, 'approx'),
      asOf: new Date().toISOString(),
    };
  }

  /** "Recent insider trades in TICKER": Form 4 buys/sells and congressional trades, merged, newest first. */
  async forTicker(tickerRaw: string): Promise<{ ticker: string; items: Array<Last10Item & { who: string; kind: 'insider' | 'congress'; href: string }>; asOf: string }> {
    const ticker = tickerRaw.toUpperCase();
    const ck = `ticker:${ticker}`;
    const hit = this.cache.get(ck) as any;
    if (hit && Date.now() - hit.ts < CACHE_MS) return hit.data;
    const live = await this.closeNow(ticker);
    const f4 = await this.q<any[]>(
      `SELECT t."insiderName", t."transactionCode", t."sharesBought", t."pricePerShare", t."totalValue", to_char(t."transactionDate",'YYYY-MM-DD') AS date, t."filingUrl", c.name AS company
       FROM insider_transactions t JOIN companies c ON c.id = t.company_id
       WHERE upper(c.ticker) = $1 AND t."transactionCode" IN ('P','S') AND t."sharesBought" * t."pricePerShare" > 0
       ORDER BY t."transactionDate" DESC LIMIT 10`,
      [ticker],
    );
    const ptr = await this.q<any[]>(
      `SELECT t.side, t.amount_min, t.amount_max, to_char(t.transaction_date,'YYYY-MM-DD') AS date, t.source_url, t.asset_description,
              m.name, m.fmp_name, l.shares, l.cost_per_share, l.remaining, l.sold_proceeds
       FROM wt_trades t JOIN wt_members m ON m.bioguide = t.bioguide LEFT JOIN wt_lots l ON l.trade_id = t.id
       WHERE t.ticker = $1 AND t.side IN ('buy','sell') ORDER BY t.transaction_date DESC LIMIT 10`,
      [ticker],
    );
    const items: Array<Last10Item & { who: string; kind: 'insider' | 'congress'; href: string }> = [];
    for (const r of f4) {
      const isBuy = r.transactionCode === 'P';
      const px = Number(r.pricePerShare);
      items.push({
        date: r.date, ticker, name: r.company, side: isBuy ? 'BUY' : 'SELL',
        sizeLabel: `${Math.round(Number(r.sharesBought)).toLocaleString()} sh @ $${px.toFixed(2)}`, sizeValue: Number(r.totalValue) || null,
        price: px, priceNow: live, returnPct: isBuy && px > 0 && live ? ((live - px) / px) * 100 : null, realized: false, url: r.filingUrl || null,
        who: r.insiderName, kind: 'insider', href: `/insiders/${encodeURIComponent(r.insiderName)}`,
      });
    }
    for (const r of ptr) {
      const isBuy = r.side === 'buy';
      let returnPct: number | null = null;
      let realized = false;
      if (isBuy && r.shares != null) {
        const cost = Number(r.shares) * Number(r.cost_per_share);
        const remaining = Number(r.remaining);
        if (cost > 0 && (remaining <= 1e-6 || live != null)) {
          returnPct = ((Number(r.sold_proceeds) + remaining * (live || 0)) / cost - 1) * 100;
          realized = remaining <= 1e-6;
        }
      }
      const who = r.fmp_name || r.name;
      items.push({
        date: r.date, ticker, name: r.asset_description || ticker, side: isBuy ? 'BUY' : 'SELL',
        sizeLabel: `${band(r.amount_min != null ? Number(r.amount_min) : null, r.amount_max != null ? Number(r.amount_max) : null)} (est.)`,
        sizeValue: r.amount_min != null && r.amount_max != null ? (Number(r.amount_min) + Number(r.amount_max)) / 2 : null,
        price: r.cost_per_share != null ? Number(r.cost_per_share) : null, priceNow: live, returnPct, realized, url: r.source_url || null,
        who, kind: 'congress', href: `/politicians/${encodeURIComponent(who)}`,
      });
    }
    items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    const data = { ticker, items: items.slice(0, 10), asOf: new Date().toISOString() };
    this.cache.set(ck, { ts: Date.now(), data: data as any });
    return data;
  }
}
