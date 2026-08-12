import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

/** A normalized congressional disclosure (Senate or House). */
export interface FmpCongressTrade {
  politicianName: string;
  chamber: 'Senate' | 'House';
  party: string | null;
  /** Bioguide member ID (FMP's `senateID`) — the roster join key for party. */
  bioguideId: string | null;
  ticker: string | null;
  companyName: string;
  action: 'Buy' | 'Sell';
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  reportedDate: string;
}

/** A normalized insider Form 4 transaction from FMP's market-wide feed. */
export interface FmpInsiderTrade {
  ticker: string;
  insiderName: string;
  typeOfOwner: string;
  isBuy: boolean;
  shares: number;
  price: number;
  transactionDate: string;
  filingDate: string;
  url: string;
}

/** One row of a `company-screener` snapshot — the reference fundamentals FMP
 *  publishes for every listed symbol (used to fill blank sector / market-cap
 *  cells on list pages). */
export interface FmpScreenerRow {
  symbol: string;
  name: string;
  sector: string | null;
  industry: string | null;
  marketCap: number | null;
  exchange: string | null;
}

/**
 * Financial Modeling Prep client (free "stable" tier). Provides the data SEC
 * EDGAR alone can't give us cleanly: market-wide insider trades and
 * congressional (Senate + House) disclosures. Requires FMP_API_KEY in env;
 * methods return [] when the key is missing so the app degrades gracefully.
 */
@Injectable()
export class FmpService {
  private readonly log = new Logger(FmpService.name);
  private readonly http: AxiosInstance;
  private readonly key = process.env.FMP_API_KEY || '';
  private readonly base = 'https://financialmodelingprep.com/stable';

  constructor() {
    this.http = axios.create({
      timeout: 15000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': 'InsiderBuying/1.0', Accept: 'application/json' },
    });
  }

  private num(v: any): number | null { const n = Number(v); return Number.isFinite(n) ? n : null; }

  get enabled(): boolean {
    return !!this.key;
  }

  /** Last failure seen by get() — surfaced by diagnostics endpoints. */
  lastError: string | null = null;

  private async get(path: string, params: Record<string, any> = {}): Promise<any[]> {
    if (!this.key) return [];
    try {
      const { data } = await this.http.get(`${this.base}/${path}`, {
        params: { ...params, apikey: this.key },
      });
      if (!Array.isArray(data)) {
        this.lastError = `${path}: non-array response ${JSON.stringify(data).slice(0, 160)}`;
        return [];
      }
      return data;
    } catch (e: any) {
      const body = typeof e?.response?.data === 'string' ? e.response.data.slice(0, 160) : '';
      this.lastError = `${path}: ${e?.response?.status || ''} ${e?.message || e} ${body}`;
      this.log.warn(`FMP ${this.lastError}`);
      return [];
    }
  }

  // ── Company profile + quote gap-fillers ──────────────────────────────
  private readonly profileCache = new Map<string, { ts: number; data: any | null }>();
  private readonly PROFILE_TTL_MS = 24 * 60 * 60_000;

  /** Full company profile (description, sector/industry, employees, HQ,
   *  exchange, live price/cap) — fills the gaps Yahoo's quoteSummary leaves. */
  async getCompanyProfile(symbolRaw: string): Promise<any | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    const c = this.profileCache.get(symbol);
    if (c && Date.now() - c.ts < this.PROFILE_TTL_MS) return c.data;
    const rows = await this.get('profile', { symbol });
    const p = rows?.[0];
    const data = p
      ? {
          symbol,
          name: p.companyName || symbol,
          exchange: p.exchange || null,
          exchangeFullName: p.exchangeFullName || null,
          sector: p.sector || null,
          industry: p.industry || null,
          employees: Number(p.fullTimeEmployees) || null,
          website: p.website || null,
          phone: p.phone || null,
          description: p.description || null,
          address:
            [p.address, p.city, p.state, p.zip, p.country].filter(Boolean).join(', ') || null,
          country: p.country || null,
          ceo: p.ceo || null,
          image: p.image || null,
          price: Number(p.price) || null,
          marketCap: Number(p.marketCap) || null,
          averageVolume: Number(p.averageVolume) || null,
          beta: Number(p.beta) || null,
        }
      : null;
    this.profileCache.set(symbol, { ts: Date.now(), data });
    return data;
  }

  /** Batch live quotes — the gap-filler for symbols Yahoo can't resolve.
   *  Returns a Map keyed by UPPERCASE symbol. */
  async getQuotesBatch(symbolsRaw: string[]): Promise<Map<string, any>> {
    const out = new Map<string, any>();
    const symbols = Array.from(
      new Set(symbolsRaw.filter(Boolean).map((s) => s.toUpperCase())),
    );
    if (!this.enabled || !symbols.length) return out;
    for (let i = 0; i < symbols.length; i += 50) {
      const chunk = symbols.slice(i, i + 50);
      const rows = await this.get('batch-quote', { symbols: chunk.join(',') });
      for (const q of rows) {
        const sym = String(q?.symbol || '').toUpperCase();
        if (!sym || !(Number(q?.price) > 0)) continue;
        out.set(sym, {
          symbol: sym,
          name: q.name || sym,
          price: Number(q.price),
          changeAbs: Number(q.change) || 0,
          changePct: Number(q.changePercentage) || 0,
          volume: Number(q.volume) || 0,
          // DEAD FIELD — `batch-quote` carries no `avgVolume`; always 0. See the
          // note on `peRatio` below.
          avgVolume: Number(q.avgVolume) || 0,
          marketCap: Number(q.marketCap) || null,
          fiftyTwoWeekHigh: Number(q.yearHigh) || null,
          fiftyTwoWeekLow: Number(q.yearLow) || null,
          // DEAD FIELD — verified against the production key: `batch-quote` rows
          // contain no `pe` (nor `avgVolume`). The full row shape is symbol,
          // name, price, changePercentage, change, volume, dayLow, dayHigh,
          // yearHigh, yearLow, marketCap, priceAvg50, priceAvg200, exchange,
          // open, previousClose, timestamp. So this is ALWAYS null and must not
          // be treated as a P/E source — use getPeRatioTtm() (`ratios-ttm`,
          // one symbol per request) instead. Left in place because callers
          // depend on the returned shape; removing it is a separate change.
          peRatio: Number(q.pe) || null,
          exchange: q.exchange || null,
        });
      }
    }
    return out;
  }

  // ── Dividend calendar (ex-dividend dates) ────────────────────────────
  // Accumulated symbol → most-recent-ex-date, plus the set of calendar days
  // already walked, so a second build on the same instance re-requests nothing.
  private exDivCache: {
    ts: number;
    map: Map<string, string>;
    daysWalked: Set<string>;
  } | null = null;
  private readonly EXDIV_TTL_MS = 6 * 60 * 60_000;

  /** FMP's `stable` calendar endpoints SILENTLY TRUNCATE a ranged response at
   *  exactly this many rows — no error, no flag, just missing data. A single day
   *  of US ex-dividends is already ~1,800 rows, so any multi-day window loses
   *  most of its content. Verified against production: a 90-day pull came back
   *  at exactly 4,000 rows and contained none of USB/MDLZ/HSY/MDT/PM/PNC, while
   *  a single-day pull for the same ex-date found them immediately. The same cap
   *  was independently confirmed on `earnings-calendar`. Hence the one-day-at-a-
   *  time walk below, and the warning when a response arrives at the cap. */
  private readonly CALENDAR_ROW_CAP = 4000;

  /** Most recent ex-dividend date on or before today for each of `wanted`.
   *
   *  Walks the calendar ONE DAY AT A TIME (see CALENDAR_ROW_CAP — a ranged
   *  request cannot be trusted) newest-first, so the first hit for a symbol IS
   *  its latest ex-date. Bounded on every axis: a day cap, a concurrency cap, an
   *  optional wall-clock deadline, and an early exit the moment every wanted
   *  symbol is resolved — requests are only spent while something is still
   *  missing. Weekends are skipped (no ex-dividends). Days already walked on
   *  this instance are skipped, and a day that came back at the row cap is NOT
   *  marked walked so a later call can retry it.
   *
   *  Returns only the requested symbols, but caches every symbol each walked day
   *  yields (6h TTL) so the map serves any later caller for free. Callers should
   *  treat a missing symbol as "not found in the walked window" — this is a
   *  bounded top-up, not an exhaustive lookup. */
  async getExDividendDates(
    wanted: string[],
    opts: { maxDays?: number; concurrency?: number; deadlineMs?: number } = {},
  ): Promise<Map<string, string>> {
    const want = new Set((wanted || []).filter(Boolean).map((s) => s.toUpperCase()));
    const out = new Map<string, string>();
    if (!this.enabled || !want.size) return out;
    if (!this.exDivCache || Date.now() - this.exDivCache.ts > this.EXDIV_TTL_MS) {
      this.exDivCache = { ts: Date.now(), map: new Map(), daysWalked: new Set() };
    }
    const { map, daysWalked } = this.exDivCache;
    const maxDays = opts.maxDays ?? 30;
    const concurrency = opts.concurrency ?? 6;

    const stillMissing = () => {
      for (const s of want) if (!map.has(s)) return true;
      return false;
    };

    // Candidate days: today backwards, weekdays only, skipping days already
    // walked. Scanning twice maxDays leaves room for the weekends dropped.
    const days: string[] = [];
    for (let back = 0; back < maxDays * 2 && days.length < maxDays; back++) {
      const d = new Date(Date.now() - back * 86_400_000);
      const dow = d.getUTCDay();
      if (dow === 0 || dow === 6) continue;
      const iso = d.toISOString().slice(0, 10);
      if (!daysWalked.has(iso)) days.push(iso);
    }

    for (let i = 0; i < days.length && stillMissing(); i += concurrency) {
      if (opts.deadlineMs != null && Date.now() >= opts.deadlineMs) break;
      const chunk = days.slice(i, i + concurrency);
      const results = await Promise.all(
        chunk.map((day) => this.get('dividends-calendar', { from: day, to: day })),
      );
      results.forEach((rows, j) => {
        const day = chunk[j];
        if (rows.length >= this.CALENDAR_ROW_CAP) {
          this.log.warn(
            `FMP dividends-calendar ${day}: ${rows.length} rows — at the ${this.CALENDAR_ROW_CAP}-row cap, so this day is TRUNCATED and is not being marked as walked.`,
          );
        } else {
          daysWalked.add(day);
        }
        for (const r of rows) {
          const sym = String(r?.symbol || '').toUpperCase();
          // Days are walked newest-first, so the first date seen for a symbol is
          // its most recent — never let an older day overwrite it.
          if (!sym || map.has(sym)) continue;
          const d = String(r?.date || '').slice(0, 10);
          if (d) map.set(sym, d);
        }
      });
    }
    for (const s of want) {
      const d = map.get(s);
      if (d) out.set(s, d);
    }
    return out;
  }

  // ── Fundamentals gap-fillers (paid plan) ─────────────────────────────
  private readonly fundamentalsCache = new Map<string, { ts: number; data: any }>();
  private readonly FUNDAMENTALS_TTL_MS = 24 * 60 * 60_000;

  /** TTM share-count growth from FMP annual income statements
   *  (weightedAverageShsOutDil, last two fiscal years): 0.06 = +6% dilution,
   *  ≤0 = buyback. Replaces the fragile SEC-XBRL year-ago derivation as the
   *  primary source (SEC path stays as fallback). Null when unavailable. */
  async getDilutionTtm(symbolRaw: string): Promise<number | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    const key = `dil:${symbol}`;
    const c = this.fundamentalsCache.get(key);
    if (c && Date.now() - c.ts < this.FUNDAMENTALS_TTL_MS) return c.data;
    const rows = await this.get('income-statement', { symbol, limit: 2, period: 'annual' });
    let out: number | null = null;
    if (rows.length >= 2) {
      const latest =
        Number(rows[0]?.weightedAverageShsOutDil) || Number(rows[0]?.weightedAverageShsOut) || 0;
      const prior =
        Number(rows[1]?.weightedAverageShsOutDil) || Number(rows[1]?.weightedAverageShsOut) || 0;
      if (latest > 0 && prior > 0) out = latest / prior - 1;
    }
    this.fundamentalsCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  /** Real shares outstanding from FMP shares-float (sourced from the latest
   *  10-Q/10-K) — §2G denominator + market-cap validation. Null if unknown. */
  async getSharesOutstanding(symbolRaw: string): Promise<number | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    const key = `shs:${symbol}`;
    const c = this.fundamentalsCache.get(key);
    if (c && Date.now() - c.ts < this.FUNDAMENTALS_TTL_MS) return c.data;
    const rows = await this.get('shares-float', { symbol });
    const shs = Number(rows?.[0]?.outstandingShares) || 0;
    const out = shs > 0 ? shs : null;
    this.fundamentalsCache.set(key, { ts: Date.now(), data: out });
    return out;
  }

  // ── Analyst price targets ────────────────────────────────────────────
  /** The 10 most recent price-target notes market-wide — the only per-analyst
   *  (named) data on the free tier: page 0 only, limit capped at 10. */
  async priceTargetLatest(): Promise<
    Array<{
      symbol: string;
      analystName: string;
      analystCompany: string | null;
      priceTarget: number | null;
      priceWhenPosted: number | null;
      publishedDate: string;
      newsURL: string | null;
      newsPublisher: string | null;
    }>
  > {
    // Paid plan: full 100-row pages, deep paging. Pull several pages per
    // refresh so more than a trickle of named analysts accumulates.
    const pages = 5;
    const rows: any[] = [];
    for (let p = 0; p < pages; p++) {
      const batch = await this.get('price-target-latest-news', { limit: 100, page: p });
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows
      .map((r: any) => ({
        symbol: String(r?.symbol || '').toUpperCase(),
        analystName: String(r?.analystName || '').trim(),
        analystCompany: String(r?.analystCompany || '').trim() || null,
        priceTarget: r?.priceTarget != null ? Number(r.priceTarget) : null,
        priceWhenPosted: r?.priceWhenPosted != null ? Number(r.priceWhenPosted) : null,
        publishedDate: String(r?.publishedDate || ''),
        newsURL: String(r?.newsURL || '').trim() || null,
        newsPublisher: String(r?.newsPublisher || '').trim() || null,
      }))
      .filter((r) => r.symbol && r.analystName && r.publishedDate);
  }

  /** FULL named-analyst price-target history for one symbol
   *  (price-target-news, paginated) — powers the top-analysts backfill so
   *  success rates and average returns have seasoned calls to grade. */
  async priceTargetHistoryForSymbol(
    symbolRaw: string,
    pages = 3,
  ): Promise<
    Array<{
      symbol: string;
      analystName: string;
      analystCompany: string | null;
      priceTarget: number | null;
      priceWhenPosted: number | null;
      publishedDate: string;
      newsURL: string | null;
      newsPublisher: string | null;
    }>
  > {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const rows: any[] = [];
    for (let p = 0; p < pages; p++) {
      const batch = await this.get('price-target-news', { symbol, limit: 100, page: p });
      rows.push(...batch);
      if (batch.length < 100) break;
    }
    return rows
      .map((r: any) => ({
        symbol: String(r?.symbol || '').toUpperCase(),
        analystName: String(r?.analystName || '').trim(),
        analystCompany: String(r?.analystCompany || '').trim() || null,
        priceTarget: r?.priceTarget != null ? Number(r.priceTarget) : null,
        priceWhenPosted: r?.priceWhenPosted != null ? Number(r.priceWhenPosted) : null,
        publishedDate: String(r?.publishedDate || ''),
        newsURL: String(r?.newsURL || '').trim() || null,
        newsPublisher: String(r?.newsPublisher || '').trim() || null,
      }))
      .filter((r) => r.symbol && r.analystName && r.publishedDate);
  }

  /** Full open-market PURCHASE history for one symbol (insider-trading/
   *  search, paginated) — feeds the 10-year backtest event store. */
  async insiderPurchasesForSymbol(
    symbolRaw: string,
    maxPages = 10,
  ): Promise<
    Array<{
      symbol: string;
      insiderName: string;
      typeOfOwner: string | null;
      transactionDate: string;
      totalValue: number;
    }>
  > {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const out: Array<{
      symbol: string;
      insiderName: string;
      typeOfOwner: string | null;
      transactionDate: string;
      totalValue: number;
    }> = [];
    for (let p = 0; p < maxPages; p++) {
      const rows = await this.get('insider-trading/search', {
        symbol,
        transactionType: 'P-Purchase',
        limit: 100,
        page: p,
      });
      for (const r of rows) {
        const shares = Number(r?.securitiesTransacted) || 0;
        const price = Number(r?.price) || 0;
        const value = shares * price;
        const name = String(r?.reportingName || '').trim();
        const date = String(r?.transactionDate || '').slice(0, 10);
        if (!name || !date || !(value > 0)) continue;
        out.push({
          symbol,
          insiderName: name,
          typeOfOwner: String(r?.typeOfOwner || '').trim() || null,
          transactionDate: date,
          totalValue: +value.toFixed(2),
        });
      }
      if (rows.length < 100) break;
    }
    return out;
  }

  /** Analyst RATING consensus (buy/hold/sell counts) — available for foreign
   *  listings (e.g. SAP.DE) and currency-agnostic, so it fills the analyst
   *  block on non-US pages that Yahoo leaves empty. */
  async getGradesConsensus(symbolRaw: string): Promise<{
    strongBuy: number; buy: number; hold: number; sell: number; strongSell: number; consensus: string | null;
  } | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    const rows = await this.get('grades-consensus', { symbol });
    const r = rows?.[0];
    if (!r) return null;
    return {
      strongBuy: Number(r.strongBuy) || 0,
      buy: Number(r.buy) || 0,
      hold: Number(r.hold) || 0,
      sell: Number(r.sell) || 0,
      strongSell: Number(r.strongSell) || 0,
      consensus: r.consensus || null,
    };
  }

  /** Price-target consensus for THIS listing only (never grafts a US-ADR USD
   *  target onto a EUR page — FMP simply returns [] for .DE, which we honor). */
  async getPriceTargetConsensus(symbolRaw: string): Promise<{
    targetHigh: number | null; targetLow: number | null; targetConsensus: number | null; targetMedian: number | null;
  } | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    const rows = await this.get('price-target-consensus', { symbol });
    const r = rows?.[0];
    if (!r) return null;
    return {
      targetHigh: r.targetHigh != null ? Number(r.targetHigh) : null,
      targetLow: r.targetLow != null ? Number(r.targetLow) : null,
      targetConsensus: r.targetConsensus != null ? Number(r.targetConsensus) : null,
      targetMedian: r.targetMedian != null ? Number(r.targetMedian) : null,
    };
  }

  /** Quarterly income statement mapped to the Yahoo-style keys the Financials
   *  tab renders — the fallback when Yahoo's timeseries is too thin to show
   *  YoY revenue growth (only the newest quarter populated). */
  async getQuarterlyIncomeRows(symbolRaw: string, limit = 9): Promise<Array<{ date: string; values: Record<string, number | null> }>> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const rows = await this.get('income-statement', { symbol, period: 'quarter', limit });
    return rows
      .map((r: any) => ({
        date: String(r?.date || '').slice(0, 10),
        values: {
          TotalRevenue: this.num(r?.revenue),
          CostOfRevenue: this.num(r?.costOfRevenue),
          GrossProfit: this.num(r?.grossProfit),
          SellingGeneralAndAdministration: this.num(r?.sellingGeneralAndAdministrativeExpenses),
          ResearchAndDevelopment: this.num(r?.researchAndDevelopmentExpenses),
          OperatingExpense: this.num(r?.operatingExpenses),
          OperatingIncome: this.num(r?.operatingIncome),
          PretaxIncome: this.num(r?.incomeBeforeTax),
          TaxProvision: this.num(r?.incomeTaxExpense),
          NetIncome: this.num(r?.netIncome),
          BasicEPS: this.num(r?.eps),
          DilutedEPS: this.num(r?.epsdiluted ?? r?.epsDiluted),
          BasicAverageShares: this.num(r?.weightedAverageShsOut),
        } as Record<string, number | null>,
      }))
      .filter((r) => r.date && r.values.TotalRevenue != null);
  }

  /** Ticker-accurate news + press releases from FMP — the profile News tab
   *  was pulling loose market-roundup headlines from Google/Yahoo. */
  async getStockNews(symbolRaw: string, limit = 20): Promise<Array<{ title: string; source: string; date: number; link: string; kind: 'news' | 'press' }>> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const map = (rows: any[], kind: 'news' | 'press') =>
      rows.map((r: any) => ({
        title: String(r?.title || '').trim(),
        source: String(r?.publisher || r?.site || '').trim() || (kind === 'press' ? 'Press Release' : 'Newswire'),
        date: Date.parse(String(r?.publishedDate || r?.date || '')) || 0,
        link: String(r?.url || r?.link || '').trim(),
        kind,
      })).filter((r) => r.title && r.link);
    const [news, press] = await Promise.all([
      this.get('news/stock', { symbols: symbol, limit }),
      this.get('news/press-releases', { symbols: symbol, limit }),
    ]);
    return [...map(news, 'news'), ...map(press, 'press')];
  }

  // ── Congressional ────────────────────────────────────────────────────
  private parseAmount(a: string): { min: number | null; max: number | null } {
    if (!a) return { min: null, max: null };
    const nums = a.replace(/[$,]/g, '').match(/\d+/g);
    if (!nums?.length) return { min: null, max: null };
    return { min: Number(nums[0]), max: nums[1] ? Number(nums[1]) : Number(nums[0]) };
  }

  private mapCongress(r: any, chamber: 'Senate' | 'House'): FmpCongressTrade | null {
    const t = String(r.type || '').toLowerCase();
    const action: 'Buy' | 'Sell' | null = t.includes('purchase')
      ? 'Buy'
      : t.includes('sale') || t.includes('sell')
        ? 'Sell'
        : null;
    if (!action) return null; // skip exchanges/receives
    const { min, max } = this.parseAmount(r.amount);
    const name =
      `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.office || 'Unknown';
    return {
      politicianName: name,
      chamber,
      party: r.party || null, // FMP latest feed omits party — enriched via roster
      bioguideId: r.senateID ? String(r.senateID) : null,
      ticker: r.symbol ? String(r.symbol).toUpperCase() : null,
      companyName: r.assetDescription || r.symbol || '',
      action,
      amountMin: min,
      amountMax: max,
      transactionDate: r.transactionDate || r.disclosureDate,
      reportedDate: r.disclosureDate || r.transactionDate,
    };
  }

  /** Latest Senate + House disclosures, merged & normalized.
   *  Free tier serves 100 rows on page 0 ONLY (pages 1+ are restricted), so
   *  ask for the full page; history is accumulated by the caller over time. */
  /** FULL per-politician disclosure history (both chambers tried; rows
   *  filtered to the requested person). FMP's by-name endpoints return the
   *  complete record — e.g. Capito back to 2015 — unlike the latest feeds. */
  async getCongressByName(fullName: string): Promise<FmpCongressTrade[]> {
    const clean = (fullName || '').trim();
    if (!this.key || !clean) return [];
    const [senate, house] = await Promise.all([
      this.get('senate-trades-by-name', { name: clean }),
      this.get('house-trades-by-name', { name: clean }),
    ]);
    const wanted = clean.toLowerCase().split(/\s+/);
    const first = wanted[0];
    const last = wanted[wanted.length - 1];
    const matches = (r: any) => {
      const rn = `${r.firstName || ''} ${r.lastName || ''}`.trim().toLowerCase();
      if (!rn) return false;
      if (rn === clean.toLowerCase()) return true;
      const parts = rn.split(/\s+/);
      return parts[0] === first && parts[parts.length - 1] === last;
    };
    const out: FmpCongressTrade[] = [];
    for (const r of senate) {
      if (!matches(r)) continue;
      const m = this.mapCongress(r, 'Senate');
      if (m) out.push(m);
    }
    for (const r of house) {
      if (!matches(r)) continue;
      const m = this.mapCongress(r, 'House');
      if (m) out.push(m);
    }
    return out;
  }

  async getCongressional(pages = 1): Promise<FmpCongressTrade[]> {
    if (!this.key) return [];
    const out: FmpCongressTrade[] = [];
    for (let p = 0; p < pages; p++) {
      // NOTE: `limit` above 25 is a premium parameter, but OMITTING it
      // returns the full 100-row page on the free tier.
      const [senate, house] = await Promise.all([
        this.get('senate-latest', { page: p }),
        this.get('house-latest', { page: p }),
      ]);
      for (const r of senate) {
        const m = this.mapCongress(r, 'Senate');
        if (m) out.push(m);
      }
      for (const r of house) {
        const m = this.mapCongress(r, 'House');
        if (m) out.push(m);
      }
      if (!senate.length && !house.length) break;
    }
    return out;
  }

  // ── Insider (market-wide latest feed) ─────────────────────────────────
  private insiderCache: {
    ts: number;
    map: Map<string, { val: number; sh: number; last: string }>;
  } | null = null;
  private readonly INSIDER_TTL_MS = 6 * 60 * 60_000; // 6h — free tier is 250 calls/DAY

  /** Volume-weighted insider BUY cost + last buy date per ticker, derived from
   *  FMP's market-wide latest insider feed (cached 30 min). Covers any stock
   *  that recently had open-market insider buys — far beyond our SEC subset. */
  async getInsiderCostBasisMap(): Promise<
    Map<string, { avgCost: number | null; lastBuyDate: string | null }>
  > {
    const out = new Map<string, { avgCost: number | null; lastBuyDate: string | null }>();
    if (!this.key) return out;
    if (!this.insiderCache || Date.now() - this.insiderCache.ts > this.INSIDER_TTL_MS) {
      const trades = await this.getInsiderLatest(1); // free tier serves page 0 only
      const agg = new Map<string, { val: number; sh: number; last: string }>();
      for (const t of trades) {
        if (!t.isBuy || t.shares <= 0 || t.price <= 0) continue;
        const e = agg.get(t.ticker) || { val: 0, sh: 0, last: '' };
        e.val += t.shares * t.price;
        e.sh += t.shares;
        if ((t.transactionDate || '') > e.last) e.last = t.transactionDate || '';
        agg.set(t.ticker, e);
      }
      this.insiderCache = { ts: Date.now(), map: agg };
    }
    for (const [k, e] of this.insiderCache.map) {
      out.set(k, {
        avgCost: e.sh > 0 ? +(e.val / e.sh).toFixed(2) : null,
        lastBuyDate: e.last || null,
      });
    }
    return out;
  }

  /** Latest insider Form 4 transactions across the whole market. */
  async getInsiderLatest(pages = 3): Promise<FmpInsiderTrade[]> {
    if (!this.key) return [];
    const out: FmpInsiderTrade[] = [];
    for (let p = 0; p < pages; p++) {
      // No `limit` param — free tier rejects limit>25 but serves 100 without it.
      const rows = await this.get('insider-trading/latest', { page: p });
      if (!rows.length) break;
      for (const r of rows) {
        const shares = Number(r.securitiesTransacted) || 0;
        const price = Number(r.price) || 0;
        if (!r.symbol || shares <= 0) continue;
        out.push({
          ticker: String(r.symbol).toUpperCase(),
          insiderName: r.reportingName || '',
          typeOfOwner: r.typeOfOwner || '',
          // P-Purchase / acquisitionOrDisposition "A" = acquired (buy)
          isBuy: /purchase/i.test(r.transactionType || '') || r.acquisitionOrDisposition === 'A',
          shares,
          price,
          transactionDate: r.transactionDate,
          filingDate: r.filingDate,
          url: r.url || '',
        });
      }
    }
    return out;
  }

  // ── Earnings calendar ─────────────────────────────────────────────────
  /** Market-wide earnings calendar for a date range. FMP carries no company
   *  name / market cap / report time, so this is not a calendar source on its
   *  own — it exists to supply `epsEstimated` for the long tail of small caps
   *  that Nasdaq's calendar leaves blank.
   *
   *  NOTE: the range form (from != to) truncates at exactly 4000 rows and drops
   *  the EARLIEST dates when it does — a measured 7-day pull returned 636 rows
   *  for day 1 against 1579 when that same day was requested alone. So the
   *  range is walked one day at a time (no single day has come close to the
   *  cap). Days are fetched in concurrent batches, so the cost is roughly the
   *  slowest day in a batch, not the sum of the range. */
  async getEarningsCalendar(
    from: string,
    to: string,
  ): Promise<Array<{ symbol: string; date: string; epsEstimated: number | null }>> {
    if (!this.enabled || !from || !to) return [];
    const start = Date.parse(`${from}T00:00:00Z`);
    const end = Date.parse(`${to}T00:00:00Z`);
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return [];
    const DAY_MS = 86_400_000;
    const days: string[] = [];
    // Hard cap the fan-out; no caller needs more than a month of calendar.
    for (let t = start; t <= end && days.length < 31; t += DAY_MS) {
      days.push(new Date(t).toISOString().slice(0, 10));
    }
    const out: Array<{ symbol: string; date: string; epsEstimated: number | null }> = [];
    for (let i = 0; i < days.length; i += 7) {
      const batch = await Promise.all(
        days.slice(i, i + 7).map((iso) => this.get('earnings-calendar', { from: iso, to: iso })),
      );
      for (const rows of batch) {
        if (rows.length >= 4000) {
          this.log.warn('FMP earnings-calendar hit the 4000-row cap on a single day');
        }
        for (const r of rows) {
          const symbol = String(r?.symbol || '').toUpperCase();
          if (!symbol) continue;
          out.push({
            symbol,
            date: String(r?.date || '').slice(0, 10),
            // Guard the null explicitly: num() would turn a null estimate into
            // 0 (Number(null) === 0), inventing a "break even" forecast.
            epsEstimated: r?.epsEstimated == null ? null : this.num(r.epsEstimated),
          });
        }
      }
    }
    return out;
  }

  // ── Fundamentals gap-filler for list pages (sector / cap / P/E) ────────
  private readonly peCache = new Map<string, { ts: number; data: number | null }>();
  private readonly PE_TTL_MS = 24 * 60 * 60_000;

  /** Trailing P/E for one symbol from FMP's TTM ratios (cached 24h). A
   *  loss-making company genuinely HAS no trailing P/E, so a null here is an
   *  answer rather than a gap — non-positive ratios are dropped instead of
   *  being published as a negative multiple. */
  async getPeRatioTtm(symbolRaw: string): Promise<number | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    const c = this.peCache.get(symbol);
    if (c && Date.now() - c.ts < this.PE_TTL_MS) return c.data;
    const rows = await this.get('ratios-ttm', { symbol });
    const pe = this.num(rows?.[0]?.priceToEarningsRatioTTM);
    const data = pe != null && pe > 0 ? +pe.toFixed(2) : null;
    this.peCache.set(symbol, { ts: Date.now(), data });
    return data;
  }

  /**
   * Sector / industry / market cap / trailing P/E for MANY symbols — the
   * gap-filler for table rows whose own source carries no fundamentals (penny
   * screener names, non-US listings, curated baskets).
   *
   * FMP's stable `profile` endpoint takes ONE symbol per call, so the misses
   * are fetched at bounded concurrency behind a wall-clock budget: symbols
   * already in the 24h caches cost nothing, and whatever the budget doesn't
   * reach is simply absent from the returned map — the next request resumes
   * where this one stopped, since every symbol fetched is now cached. Never
   * throws; a partial map is the expected result, not an error.
   */
  async getFundamentalsBatch(
    symbolsRaw: string[],
    opts: { concurrency?: number; budgetMs?: number; withPe?: boolean } = {},
  ): Promise<
    Map<
      string,
      {
        sector: string | null;
        industry: string | null;
        marketCap: number | null;
        peRatio: number | null;
      }
    >
  > {
    type Row = {
      sector: string | null;
      industry: string | null;
      marketCap: number | null;
      peRatio: number | null;
    };
    const out = new Map<string, Row>();
    const symbols = Array.from(
      new Set(symbolsRaw.filter(Boolean).map((s) => s.toUpperCase())),
    );
    if (!this.enabled || !symbols.length) return out;
    const deadline = Date.now() + Math.max(0, opts.budgetMs ?? 3000);
    const queue = [...symbols].reverse(); // pop() walks the caller's own order
    const worker = async (): Promise<void> => {
      for (;;) {
        const symbol = queue.pop();
        if (!symbol) return;
        const cp = this.profileCache.get(symbol);
        const profileFresh = !!cp && Date.now() - cp.ts < this.PROFILE_TTL_MS;
        const cpe = this.peCache.get(symbol);
        const peFresh = !!cpe && Date.now() - cpe.ts < this.PE_TTL_MS;
        const haveTime = Date.now() < deadline;
        // Out of budget: keep draining the queue, but serve cached hits only.
        if (!haveTime && !profileFresh && !peFresh) continue;
        // Profile and ratios are independent endpoints — fetched together so a
        // symbol costs one round trip, not two.
        const [profile, peRatio]: [any | null, number | null] = await Promise.all([
          profileFresh || haveTime ? this.getCompanyProfile(symbol) : Promise.resolve(null),
          opts.withPe && (peFresh || haveTime)
            ? this.getPeRatioTtm(symbol)
            : Promise.resolve(null),
        ]);
        if (!profile && peRatio == null) continue;
        out.set(symbol, {
          sector: profile?.sector ?? null,
          industry: profile?.industry ?? null,
          marketCap: profile?.marketCap ?? null,
          peRatio,
        });
      }
    };
    await Promise.all(
      Array.from(
        { length: Math.min(Math.max(1, opts.concurrency ?? 6), symbols.length) },
        () => worker(),
      ),
    );
    return out;
  }

  // ── Whole-market-slice snapshot (company-screener) ─────────────────────
  private readonly screenerCache = new Map<string, { ts: number; map: Map<string, FmpScreenerRow> }>();
  private readonly screenerInflight = new Map<string, Promise<Map<string, FmpScreenerRow>>>();
  private readonly SCREENER_TTL_MS = 12 * 60 * 60_000;

  /**
   * Sector + market cap for a whole slice of the market in ONE call
   * (`company-screener`), keyed by UPPERCASE symbol and cached 12h — the only
   * affordable source for lists too large to look up symbol-by-symbol (the
   * 1,000-row penny screener would otherwise need 1,000 profile requests).
   *
   * The response is multi-megabyte and takes seconds, so the fetch is shared
   * across concurrent callers and RACED against `budgetMs`: a caller that runs
   * out of time gets an empty map while the fetch keeps running and fills the
   * cache for the next request. `budgetMs: 0` (the default) never waits at all
   * — pure cache read plus a background warm.
   */
  async getScreenerSnapshot(
    params: Record<string, any>,
    opts: { budgetMs?: number } = {},
  ): Promise<Map<string, FmpScreenerRow>> {
    const empty = new Map<string, FmpScreenerRow>();
    if (!this.enabled) return empty;
    const key = JSON.stringify(params);
    const hit = this.screenerCache.get(key);
    if (hit && Date.now() - hit.ts < this.SCREENER_TTL_MS) return hit.map;
    let inflight = this.screenerInflight.get(key);
    if (!inflight) {
      inflight = (async () => {
        try {
          const rows = await this.get('company-screener', params);
          const map = new Map<string, FmpScreenerRow>();
          for (const r of rows) {
            const symbol = String(r?.symbol || '').toUpperCase();
            if (!symbol) continue;
            map.set(symbol, {
              symbol,
              name: r.companyName || symbol,
              sector: r.sector || null,
              industry: r.industry || null,
              marketCap: Number(r.marketCap) || null,
              exchange: r.exchangeShortName || r.exchange || null,
            });
          }
          if (map.size) this.screenerCache.set(key, { ts: Date.now(), map });
          return map;
        } finally {
          this.screenerInflight.delete(key);
        }
      })();
      this.screenerInflight.set(key, inflight);
    }
    const budgetMs = Math.max(0, opts.budgetMs ?? 0);
    if (!budgetMs) return empty; // warm only — never block the caller
    return Promise.race([
      inflight,
      new Promise<Map<string, FmpScreenerRow>>((resolve) => {
        const t = setTimeout(() => resolve(empty), budgetMs);
        t.unref?.();
      }),
    ]);
  }

  // ── Fallbacks for the company profile page (SEC EDGAR is tried first) ──
  // Used by CompanyCivicService only when its own filing parser comes back
  // empty, so these are off the hot path. Both are cached for a day.
  private readonly civicFallbackCache = new Map<string, { ts: number; data: any }>();
  private readonly CIVIC_FALLBACK_TTL_MS = 24 * 60 * 60_000;

  /** Revenue by geography for the latest reported period.
   *
   *  `total` comes from the income statement for the *same* fiscal year, not
   *  from summing the rows: FMP nests regions inside an aggregate bucket for
   *  some filers (BA reports UNITED STATES and Non-US alongside Europe, Middle
   *  East, CANADA … which are themselves inside Non-US), so summing would
   *  overstate revenue by ~45% and make every derived percentage wrong. The
   *  caller reconciles against `total` to drop the nested rows. */
  async getGeographicRevenue(
    symbolRaw: string,
  ): Promise<{ asOf: string | null; period: string | null; rows: FmpGeoRevenueRow[]; total: number | null }> {
    const empty = { asOf: null, period: null, rows: [] as FmpGeoRevenueRow[], total: null };
    if (!this.enabled) return empty;
    const symbol = String(symbolRaw || '').toUpperCase();
    if (!symbol) return empty;
    const ck = `geo:${symbol}`;
    const hit = this.civicFallbackCache.get(ck);
    if (hit && Date.now() - hit.ts < this.CIVIC_FALLBACK_TTL_MS) return hit.data;
    const [segRows, incomeRows] = await Promise.all([
      this.get('revenue-geographic-segmentation', { symbol }),
      this.get('income-statement', { symbol, period: 'annual', limit: 5 }),
    ]);
    // Rows arrive newest-first; only the latest period is shown.
    const latest = segRows[0];
    const data = latest?.data;
    if (!data || typeof data !== 'object') return empty;
    const rows: FmpGeoRevenueRow[] = [];
    for (const [name, v] of Object.entries<any>(data)) {
      const revenue = this.num(v);
      if (!name || revenue == null || revenue <= 0) continue;
      // FMP shouts country names ("UNITED STATES"); the SEC path uses the
      // filing's own casing, so normalise for a consistent-looking table —
      // leaving genuine acronyms (EMEA, APAC) alone rather than "Emea".
      const label = /^[^a-z]+$/.test(name)
        ? name
            .split(/\s+/)
            .map((w) => (FMP_GEO_ACRONYMS.has(w) ? w : w.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase())))
            .join(' ')
        : name;
      rows.push({ name: label, revenue });
    }
    const fy = this.num(latest?.fiscalYear);
    const match = incomeRows.find((r) => this.num(r?.fiscalYear) === fy) || null;
    const out = {
      asOf: latest?.date ? String(latest.date).slice(0, 10) : null,
      period: latest?.period ? String(latest.period) : null,
      rows,
      total: match ? this.num(match.revenue) : null,
    };
    if (rows.length) this.civicFallbackCache.set(ck, { ts: Date.now(), data: out });
    return out;
  }

  /** Executive compensation collapsed to the same per-year shape the SEC
   *  Pay-versus-Performance table gives: the principal executive's total plus
   *  the average of the other named executives.
   *
   *  FMP publishes one row per executive per year. The PEO is the row whose
   *  title ENDS in CEO — a business-unit chief ("CEO, Asset & Wealth
   *  Management", "Co-CEO, Commercial & Investment Bank") is a named executive,
   *  not the principal one, and JPM's filing lists several. */
  async getExecutiveCompensation(symbolRaw: string): Promise<FmpExecCompYear[]> {
    if (!this.enabled) return [];
    const symbol = String(symbolRaw || '').toUpperCase();
    if (!symbol) return [];
    const ck = `comp:${symbol}`;
    const hit = this.civicFallbackCache.get(ck);
    if (hit && Date.now() - hit.ts < this.CIVIC_FALLBACK_TTL_MS) return hit.data;
    const rows = await this.get('governance-executive-compensation', { symbol });
    const byYear = new Map<number, { peo: number[]; neo: number[] }>();
    for (const r of rows) {
      const year = this.num(r?.year);
      const total = this.num(r?.total);
      if (year == null || !Number.isInteger(year) || total == null || total <= 0) continue;
      const title = String(r?.nameAndPosition || '');
      const isPeo = /(?:chief executive officer|\bceo)\s*$/i.test(title) && !/\bco-?ceo/i.test(title);
      const e = byYear.get(year) || { peo: [], neo: [] };
      (isPeo ? e.peo : e.neo).push(total);
      byYear.set(year, e);
    }
    const out: FmpExecCompYear[] = [];
    for (const [year, e] of byYear) {
      // No clean PEO title that year → fall back to the largest package, which
      // is how these filings read in practice. Never invent a figure.
      const peoTotal = e.peo.length ? Math.max(...e.peo) : e.neo.length ? Math.max(...e.neo) : null;
      const others = e.peo.length ? e.neo : e.neo.filter((v) => v !== peoTotal);
      out.push({
        year,
        peoTotal,
        avgNeoTotal: others.length ? Math.round(others.reduce((s, v) => s + v, 0) / others.length) : null,
      });
    }
    out.sort((a, b) => b.year - a.year);
    const top = out.slice(0, 5);
    if (top.length) this.civicFallbackCache.set(ck, { ts: Date.now(), data: top });
    return top;
  }
}

/** Region labels that are acronyms, not shouted words — kept as-is when
 *  normalising FMP's all-caps geography keys. */
const FMP_GEO_ACRONYMS = new Set(['EMEA', 'APAC', 'EMEIA', 'AMEA', 'MEA', 'LATAM', 'ANZ', 'ASEAN', 'EU', 'UK', 'US', 'USA', 'UAE', 'ROW', 'NA']);

/** One region of FMP's geographic revenue split for a single period. */
export interface FmpGeoRevenueRow {
  name: string;
  revenue: number;
}

/** Executive compensation for one fiscal year, in the SEC Pay-versus-
 *  Performance shape so both sources render through one code path. */
export interface FmpExecCompYear {
  year: number;
  peoTotal: number | null;
  avgNeoTotal: number | null;
}
