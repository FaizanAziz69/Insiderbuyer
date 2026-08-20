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
          currency: p.currency || null,
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
   * Trailing P/E for EVERY symbol FMP carries, from the one `ratios-ttm-bulk`
   * call — the batched counterpart to getPeRatioTtm above.
   *
   * The per-symbol endpoint cannot be batched (`ratios-ttm?symbol=AAPL,MSFT`
   * returns zero rows, `batch-quote` has no `pe`), which is what forced the
   * request-path gap-filler and left the P/E column mostly em-dashes. This
   * feed answers the same question for ~71k symbols at once.
   *
   * It is a ~70MB CSV, so it is STREAMED and parsed line by line — buffering it
   * would blow the function's memory for no reason. Pass `keep` to retain only
   * the symbols you actually render; everything else is discarded as it
   * arrives. Never throws: a failure yields whatever was parsed before it.
   */
  /** Largest trailing P/E worth storing. Above this the denominator is noise,
   *  not earnings, and no table would render the number usefully. */
  private readonly PE_SANE_MAX = 1_000_000;

  async streamPeRatiosBulk(
    keep?: Set<string>,
    opts: { timeoutMs?: number } = {},
  ): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (!this.enabled) return out;
    const readline = await import('readline');
    try {
      const res = await this.http.get(`${this.base}/ratios-ttm-bulk`, {
        params: { part: 0, apikey: this.key },
        responseType: 'stream',
        timeout: opts.timeoutMs ?? 120_000,
        headers: { Accept: 'text/csv' },
        maxRedirects: 5,
      });
      const rl = readline.createInterface({ input: res.data, crlfDelay: Infinity });
      let peIdx = -1;
      for await (const line of rl) {
        if (!line) continue;
        const cells = this.parseCsvLine(line);
        if (peIdx < 0) {
          peIdx = cells.indexOf('priceToEarningsRatioTTM');
          // A feed that renamed the column must fail loudly rather than
          // silently write an empty table over a working one.
          if (peIdx < 0) {
            this.lastError = `ratios-ttm-bulk: no priceToEarningsRatioTTM column (got ${cells.slice(0, 6).join(',')})`;
            this.log.warn(`FMP ${this.lastError}`);
            rl.close();
            break;
          }
          continue;
        }
        const symbol = (cells[0] || '').toUpperCase();
        if (!symbol || (keep && !keep.has(symbol))) continue;
        const pe = this.num(cells[peIdx]);
        if (pe == null) continue;
        // A company whose TTM earnings round to about nothing produces a ratio
        // in the billions — arithmetically true, meaningless as a multiple, and
        // wide enough to overflow the numeric column it gets stored in. Drop it
        // rather than clamp: a fabricated ceiling would render as a real P/E.
        if (Math.abs(pe) > this.PE_SANE_MAX) continue;
        out.set(symbol, +pe.toFixed(4));
      }
    } catch (e: any) {
      this.lastError = `ratios-ttm-bulk: ${e?.response?.status || ''} ${e?.message || e}`;
      this.log.warn(`FMP ${this.lastError}`);
    }
    return out;
  }

  /**
   * Price, day change, volume, cap, sector and industry for EVERY symbol, from
   * the one `profile-bulk` call — the licensed replacement for scraping Yahoo's
   * screener for the movers tables and heatmaps.
   *
   * Measured 2026-08-13: 22,799 rows, ~29MB, and the prices match a live
   * `batch-quote` exactly, so this is a real snapshot rather than end-of-day.
   * Streamed and filtered by `keep` for the same reason as the ratios feed.
   */
  async streamProfilesBulk(
    keep?: Set<string>,
    opts: { timeoutMs?: number } = {},
  ): Promise<Map<string, FmpBulkProfile>> {
    const out = new Map<string, FmpBulkProfile>();
    if (!this.enabled) return out;
    const readline = await import('readline');
    try {
      const res = await this.http.get(`${this.base}/profile-bulk`, {
        params: { part: 0, apikey: this.key },
        responseType: 'stream',
        timeout: opts.timeoutMs ?? 120_000,
        headers: { Accept: 'text/csv' },
        maxRedirects: 5,
      });
      const rl = readline.createInterface({ input: res.data, crlfDelay: Infinity });
      let idx: Record<string, number> | null = null;
      for await (const line of rl) {
        if (!line) continue;
        const cells = this.parseCsvLine(line);
        if (!idx) {
          const need = [
            'symbol', 'price', 'marketCap', 'lastDividend', 'range', 'change',
            'changePercentage', 'volume', 'averageVolume', 'companyName',
            'exchange', 'industry', 'sector', 'isEtf', 'isFund',
          ];
          const map: Record<string, number> = {};
          for (const k of need) map[k] = cells.indexOf(k);
          if (map.symbol < 0 || map.changePercentage < 0) {
            this.lastError = `profile-bulk: unexpected header (${cells.slice(0, 6).join(',')})`;
            this.log.warn(`FMP ${this.lastError}`);
            rl.close();
            break;
          }
          idx = map;
          continue;
        }
        const symbol = (cells[idx.symbol] || '').toUpperCase();
        if (!symbol || (keep && !keep.has(symbol))) continue;
        const at = (k: string) => (idx![k] >= 0 ? cells[idx![k]] : '');
        // "223.78-344.57" — a negative low would make this ambiguous, but
        // prices are never negative, so splitting on the single dash is safe.
        const [lo, hi] = String(at('range') || '').split('-');
        const truthy = (v: string) => /^(true|1)$/i.test(String(v || '').trim());
        out.set(symbol, {
          symbol,
          name: at('companyName') || '',
          price: this.num(at('price')),
          changeAbs: this.num(at('change')),
          changePct: this.num(at('changePercentage')),
          volume: this.num(at('volume')),
          avgVolume: this.num(at('averageVolume')),
          marketCap: this.num(at('marketCap')),
          sector: at('sector') || null,
          industry: at('industry') || null,
          exchange: at('exchange') || null,
          fiftyTwoWeekLow: this.num(lo),
          fiftyTwoWeekHigh: this.num(hi),
          lastDividend: this.num(at('lastDividend')),
          isFundLike: truthy(at('isEtf')) || truthy(at('isFund')),
        });
      }
    } catch (e: any) {
      this.lastError = `profile-bulk: ${e?.response?.status || ''} ${e?.message || e}`;
      this.log.warn(`FMP ${this.lastError}`);
    }
    return out;
  }

  /**
   * Daily average % change for one sector on one exchange, ascending by date —
   * the real data behind the sector-rotation chart (which rendered a seeded
   * fake SVG until 2026-08-13). One light JSON call per sector×exchange.
   */
  async getHistoricalSectorPerformance(
    sector: string,
    from: string,
    to: string,
    exchange?: string,
  ): Promise<Array<{ date: string; averageChange: number }>> {
    const rows = await this.get('historical-sector-performance', {
      sector,
      from,
      to,
      ...(exchange ? { exchange } : {}),
    });
    return rows
      .map((r: any) => ({
        date: String(r?.date || '').slice(0, 10),
        averageChange: this.num(r?.averageChange) ?? 0,
      }))
      .filter((r) => r.date)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  /**
   * Float and shares outstanding for EVERY symbol, from `shares-float-all` —
   * the batched counterpart to getSharesFloat above, and what lets the short
   * squeeze page compute %-of-float without Yahoo's one-symbol-per-request
   * quoteSummary.
   *
   * Unlike the other bulk feeds this one is JSON and PAGINATED, so it is
   * fetched page by page rather than streamed. Measured 2026-08-13: ~1,000
   * rows/page at the default limit; requested at 5,000/page it completes the
   * worldwide set in ~16 calls. Never throws: a mid-run failure yields the
   * pages fetched before it.
   */
  async getSharesFloatAllBulk(
    keep?: Set<string>,
    opts: { timeoutMs?: number } = {},
  ): Promise<Map<string, { freeFloatPct: number | null; floatShares: number | null; outstandingShares: number | null }>> {
    const out = new Map<
      string,
      { freeFloatPct: number | null; floatShares: number | null; outstandingShares: number | null }
    >();
    if (!this.enabled) return out;
    const deadline = Date.now() + (opts.timeoutMs ?? 180_000);
    const LIMIT = 5_000;
    // Page cap is a runaway guard, not an expected bound — the feed is ~80k
    // rows today, i.e. ~16 pages.
    for (let page = 0; page < 40 && Date.now() < deadline; page++) {
      let rows: any[];
      try {
        const { data } = await this.http.get(`${this.base}/shares-float-all`, {
          params: { page, limit: LIMIT, apikey: this.key },
          timeout: 30_000,
        });
        if (!Array.isArray(data)) {
          this.lastError = `shares-float-all: non-array page ${page}`;
          this.log.warn(`FMP ${this.lastError}`);
          break;
        }
        rows = data;
      } catch (e: any) {
        this.lastError = `shares-float-all: page ${page} ${e?.response?.status || ''} ${e?.message || e}`;
        this.log.warn(`FMP ${this.lastError}`);
        break;
      }
      for (const r of rows) {
        const symbol = String(r?.symbol || '').toUpperCase();
        if (!symbol || (keep && !keep.has(symbol))) continue;
        // Zero shares outstanding is the feed saying "unknown", not a real
        // count — dropping it keeps the read path's null-checks meaningful.
        const shares = (v: any): number | null => {
          const n = this.num(v);
          return n != null && n > 0 && n < 1e15 ? Math.round(n) : null;
        };
        const pct = this.num(r?.freeFloat);
        out.set(symbol, {
          freeFloatPct: pct != null && pct > 0 && pct <= 100 ? +pct.toFixed(4) : null,
          floatShares: shares(r?.floatShares),
          outstandingShares: shares(r?.outstandingShares),
        });
      }
      if (rows.length < LIMIT) break; // last page
    }
    return out;
  }

  /**
   * Average analyst price target for EVERY covered symbol, from
   * `price-target-summary-bulk` — the batched counterpart to
   * getPriceTargetConsensus above.
   *
   * This is what fills the target/upside column on LIST pages: the per-symbol
   * consensus endpoint could never run for a whole table inside the request
   * budget, so most rows rendered em-dashes. The window picked per row is the
   * most recent non-empty of month → quarter → year; the all-time average is
   * deliberately ignored because it blends in targets from years ago.
   * CSV, streamed like the other bulk feeds. Never throws.
   */
  async streamPriceTargetSummaryBulk(
    keep?: Set<string>,
    opts: { timeoutMs?: number } = {},
  ): Promise<Map<string, { count: number; avgTarget: number }>> {
    const out = new Map<string, { count: number; avgTarget: number }>();
    if (!this.enabled) return out;
    const readline = await import('readline');
    try {
      const res = await this.http.get(`${this.base}/price-target-summary-bulk`, {
        params: { part: 0, apikey: this.key },
        responseType: 'stream',
        timeout: opts.timeoutMs ?? 120_000,
        headers: { Accept: 'text/csv' },
        maxRedirects: 5,
      });
      const rl = readline.createInterface({ input: res.data, crlfDelay: Infinity });
      let idx: Record<string, number> | null = null;
      for await (const line of rl) {
        if (!line) continue;
        const cells = this.parseCsvLine(line);
        if (!idx) {
          const need = [
            'symbol',
            'lastMonthCount', 'lastMonthAvgPriceTarget',
            'lastQuarterCount', 'lastQuarterAvgPriceTarget',
            'lastYearCount', 'lastYearAvgPriceTarget',
          ];
          const map: Record<string, number> = {};
          for (const k of need) map[k] = cells.indexOf(k);
          if (map.symbol < 0 || map.lastQuarterAvgPriceTarget < 0) {
            this.lastError = `price-target-summary-bulk: unexpected header (${cells.slice(0, 6).join(',')})`;
            this.log.warn(`FMP ${this.lastError}`);
            rl.close();
            break;
          }
          idx = map;
          continue;
        }
        const symbol = (cells[idx.symbol] || '').toUpperCase();
        if (!symbol || (keep && !keep.has(symbol))) continue;
        const at = (k: string) => this.num(cells[idx![k]]);
        const windows: Array<[number | null, number | null]> = [
          [at('lastMonthCount'), at('lastMonthAvgPriceTarget')],
          [at('lastQuarterCount'), at('lastQuarterAvgPriceTarget')],
          [at('lastYearCount'), at('lastYearAvgPriceTarget')],
        ];
        for (const [count, avg] of windows) {
          if (count && count > 0 && avg && avg > 0 && avg < 1e9) {
            out.set(symbol, { count, avgTarget: +avg.toFixed(4) });
            break;
          }
        }
      }
    } catch (e: any) {
      this.lastError = `price-target-summary-bulk: ${e?.response?.status || ''} ${e?.message || e}`;
      this.log.warn(`FMP ${this.lastError}`);
    }
    return out;
  }

  /** Split one CSV row. The bulk feeds quote every cell, and company names do
   *  contain commas, so a plain `split(',')` corrupts the row. */
  private parseCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (quoted) {
        if (ch === '"') {
          if (line[i + 1] === '"') { cur += '"'; i++; } else quoted = false;
        } else cur += ch;
      } else if (ch === '"') quoted = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out;
  }

  /** True when we asked FMP for this symbol's profile recently and it had none
   *  (a delisted or OTC ticker FMP doesn't carry). The miss is remembered for
   *  PROFILE_TTL_MS like any other answer, so a caller filling gaps under a
   *  budget can skip symbols a retry could only waste it on. */
  hasFreshProfileMiss(symbolRaw: string): boolean {
    const c = this.profileCache.get((symbolRaw || '').toUpperCase());
    return !!c && c.data == null && Date.now() - c.ts < this.PROFILE_TTL_MS;
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
   * The response is multi-megabyte and takes ~3s, so the fetch is shared across
   * concurrent callers and RACED against `budgetMs`: a caller that runs out of
   * time gets an empty map.
   *
   * IMPORTANT — the caller MUST give this a real budget on the request that
   * needs the data. We run on serverless functions, which are frozen the moment
   * a response is sent: a fetch nobody is awaiting simply never finishes, so
   * "fire it and let it warm the cache" does not work here (measured in
   * production: 9 of 500 penny rows ever got a sector). A timed-out race
   * therefore also ABANDONS the shared promise, because a pending request on a
   * frozen instance may never settle and leaving it in the in-flight map would
   * make every later caller race a dead promise forever — the exact bug that
   * kept the cache permanently empty. Start the call early (concurrently with
   * the rest of the page build) and await it where the data is used.
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
      // eslint-disable-next-line prefer-const -- referenced by its own finally
      let self: Promise<Map<string, FmpScreenerRow>>;
      self = (async () => {
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
          // Only clear our OWN entry — an abandoned attempt that finishes late
          // must not evict the fresh attempt a later request registered.
          if (this.screenerInflight.get(key) === self) this.screenerInflight.delete(key);
        }
      })();
      inflight = self;
      this.screenerInflight.set(key, self);
    }
    const budgetMs = Math.max(0, opts.budgetMs ?? 0);
    if (!budgetMs) return empty; // cache read only — no warming, see above
    const pending = inflight;
    const won = await Promise.race([
      pending.then((map) => map).catch(() => null),
      new Promise<null>((resolve) => {
        const t = setTimeout(() => resolve(null), budgetMs);
        t.unref?.();
      }),
    ]);
    if (won) return won;
    // Lost the race: stop sharing this attempt so the next request starts a
    // fresh one instead of racing a promise that may never settle. If it does
    // finish, its own `finally` is a no-op and the cache write still lands.
    if (this.screenerInflight.get(key) === pending) this.screenerInflight.delete(key);
    return empty;
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

  // ══════════════════════════════════════════════════════════════════════
  // Price history — the licensed replacement for Yahoo's v8 chart endpoint.
  //
  // Verified 2026-08-13 against the production key:
  //   GET /stable/historical-price-eod/full?symbol=AAPL&from=…&to=…
  //   GET /stable/historical-price-eod/light?symbol=AAPL&from=…
  //   GET /stable/historical-price-eod/dividend-adjusted?symbol=AAPL&from=…
  //   GET /stable/historical-chart/{1min|5min|30min|1hour}?symbol=…&from=…&to=…
  //
  // Two behaviours the callers depend on and that are NOT documented:
  //  • Every one of these returns NEWEST FIRST. `toBars` reverses, so callers
  //    always get ascending series like Yahoo's chart did.
  //  • `historical-price-eod/*` is HARD CAPPED AT 5,000 ROWS — a `from` of
  //    1980-01-01 returns the most recent 5,000 sessions (≈20 years) and simply
  //    stops, with no error and no flag. That is what bounds the chart's "Max"
  //    range; asking for more does not widen it.
  //  • `historical-chart/*` timestamps are US-EASTERN WALL CLOCK with no zone
  //    ("2026-08-12 15:59:00"), unlike the EOD feeds' plain dates. Parsing them
  //    as UTC would shift every intraday point by 4–5 hours, so they go through
  //    `etToEpochMs`.
  // ══════════════════════════════════════════════════════════════════════

  private readonly historyCache = new Map<string, { ts: number; data: FmpBar[] }>();
  private readonly HISTORY_TTL_MS = 30 * 60_000;
  private readonly INTRADAY_TTL_MS = 60_000;

  /** Daily OHLCV bars, ASCENDING. `light` drops OHLC for a ~4x smaller payload
   *  (close + volume only); `adjusted` returns dividend-adjusted closes, which
   *  is what a return calculation wants. Empty on any failure, so every caller
   *  can treat empty as "fall back". */
  async getEodBars(
    symbolRaw: string,
    opts: { from?: string; to?: string; light?: boolean; adjusted?: boolean; ttlMs?: number } = {},
  ): Promise<FmpBar[]> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const variant = opts.adjusted ? 'dividend-adjusted' : opts.light ? 'light' : 'full';
    const key = `eod:${symbol}:${variant}:${opts.from || ''}:${opts.to || ''}`;
    const hit = this.historyCache.get(key);
    if (hit && Date.now() - hit.ts < (opts.ttlMs ?? this.HISTORY_TTL_MS)) return hit.data;
    const params: Record<string, any> = { symbol };
    if (opts.from) params.from = opts.from;
    if (opts.to) params.to = opts.to;
    const rows = await this.get(`historical-price-eod/${variant}`, params);
    const bars = this.toBars(rows, false);
    // Only a non-empty answer is cached: a cached empty would pin the caller to
    // its fallback for the whole TTL after one blip.
    if (bars.length) this.historyCache.set(key, { ts: Date.now(), data: bars });
    return bars;
  }

  /** Intraday OHLCV bars, ASCENDING, with true epoch `t` (see the note on
   *  Eastern wall-clock timestamps above). Cached 60s — intraday goes stale
   *  within the minute. */
  async getIntradayBars(
    symbolRaw: string,
    interval: '1min' | '5min' | '15min' | '30min' | '1hour' | '4hour',
    from: string,
    to: string,
  ): Promise<FmpBar[]> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const key = `intra:${symbol}:${interval}:${from}:${to}`;
    const hit = this.historyCache.get(key);
    if (hit && Date.now() - hit.ts < this.INTRADAY_TTL_MS) return hit.data;
    const rows = await this.get(`historical-chart/${interval}`, { symbol, from, to });
    const bars = this.toBars(rows, true);
    if (bars.length) this.historyCache.set(key, { ts: Date.now(), data: bars });
    return bars;
  }

  /** Normalise any of the history feeds into one ascending bar array.
   *  `light` rows carry `price` instead of `close` and no OHLC; adjusted rows
   *  carry `adjClose`/`adjOpen`/… — all three shapes are folded here so callers
   *  never branch on which variant they asked for. */
  private toBars(rows: any[], intraday: boolean): FmpBar[] {
    const out: FmpBar[] = [];
    for (const r of rows || []) {
      const raw = String(r?.date || '');
      if (!raw) continue;
      const close = this.num(r?.close ?? r?.adjClose ?? r?.price);
      if (close == null || close <= 0) continue;
      const t = intraday
        ? this.etToEpochMs(raw)
        : Date.parse(`${raw.slice(0, 10)}T00:00:00Z`);
      if (!Number.isFinite(t)) continue;
      out.push({
        t,
        date: intraday ? new Date(t).toISOString() : raw.slice(0, 10),
        open: this.num(r?.open ?? r?.adjOpen),
        high: this.num(r?.high ?? r?.adjHigh),
        low: this.num(r?.low ?? r?.adjLow),
        close,
        volume: this.num(r?.volume) ?? 0,
      });
    }
    // Every FMP history feed is newest-first; callers all want ascending.
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  /** "2026-08-12 15:59:00" (US Eastern, no zone) → epoch ms. Tries both ET
   *  offsets and keeps the one that round-trips through the New York calendar,
   *  so DST is handled without a tz library and without a hard-coded -4. */
  private etToEpochMs(naive: string): number {
    const asUtc = Date.parse(`${naive.slice(0, 19).replace(' ', 'T')}Z`);
    if (!Number.isFinite(asUtc)) return NaN;
    const want = naive.slice(0, 19).replace('T', ' ');
    for (const offsetHours of [4, 5]) {
      const ms = asUtc + offsetHours * 3_600_000;
      if (this.nyWallClock(ms) === want) return ms;
    }
    return asUtc + 4 * 3_600_000; // EDT — the common case
  }

  private nyWallClock(ms: number): string {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/New_York',
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(ms));
    const g = (t: string) => parts.find((p) => p.type === t)?.value || '';
    return `${g('year')}-${g('month')}-${g('day')} ${g('hour')}:${g('minute')}:${g('second')}`;
  }

  /**
   * Multi-period % price changes for MANY symbols in one call.
   *
   * Verified: `stock-price-change` accepts a comma-separated `symbol` list and
   * returned all 50 rows for a 50-symbol request. That is the whole reason the
   * heatmap's returns no longer cost one HTTP request per symbol.
   *
   * Keys are FMP's own: 1D, 5D, 1M, 3M, 6M, ytd, 1Y, 3Y, 5Y, 10Y, max.
   */
  async getPriceChanges(symbolsRaw: string[]): Promise<Map<string, Record<string, number | null>>> {
    const out = new Map<string, Record<string, number | null>>();
    const symbols = Array.from(
      new Set((symbolsRaw || []).filter(Boolean).map((s) => s.toUpperCase())),
    );
    if (!this.enabled || !symbols.length) return out;
    const chunks: string[][] = [];
    for (let i = 0; i < symbols.length; i += 50) chunks.push(symbols.slice(i, i + 50));
    // Chunks are independent, and a 150-symbol heatmap is three of them —
    // running those in sequence spent ~3s of a ~10s request budget for nothing.
    const pages = await Promise.all(
      chunks.map((c) => this.get('stock-price-change', { symbol: c.join(',') })),
    );
    for (const r of pages.flat()) {
      const sym = String(r?.symbol || '').toUpperCase();
      if (!sym) continue;
      const rec: Record<string, number | null> = {};
      for (const k of ['1D', '5D', '1M', '3M', '6M', 'ytd', '1Y', '3Y', '5Y', '10Y', 'max']) {
        rec[k] = this.num(r?.[k]);
      }
      out.set(sym, rec);
    }
    return out;
  }

  // ── Financial statements ─────────────────────────────────────────────
  private readonly statementCache = new Map<string, { ts: number; data: FmpStatements }>();
  private readonly STATEMENT_TTL_MS = 12 * 60 * 60_000;

  /** Income / balance / cash-flow statements for one symbol, NEWEST FIRST as
   *  FMP returns them. All three in parallel — the Financials tab needs the set,
   *  and three requests at once cost the same wall clock as one. Returns empty
   *  arrays (never throws) so a caller can fall back. */
  async getStatements(
    symbolRaw: string,
    period: 'annual' | 'quarter',
    limit = 8,
  ): Promise<FmpStatements> {
    const empty: FmpStatements = { income: [], balance: [], cashflow: [] };
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return empty;
    const key = `stmt:${symbol}:${period}:${limit}`;
    const hit = this.statementCache.get(key);
    if (hit && Date.now() - hit.ts < this.STATEMENT_TTL_MS) return hit.data;
    const params = { symbol, period, limit };
    const [income, balance, cashflow] = await Promise.all([
      this.get('income-statement', params),
      this.get('balance-sheet-statement', params),
      this.get('cash-flow-statement', params),
    ]);
    const data: FmpStatements = { income, balance, cashflow };
    if (income.length || balance.length || cashflow.length) {
      this.statementCache.set(key, { ts: Date.now(), data });
    }
    return data;
  }

  // ── Per-symbol fundamentals for the Overview stats grid ──────────────
  private readonly statsBitCache = new Map<string, { ts: number; data: any }>();
  private readonly STATS_BIT_TTL_MS = 6 * 60 * 60_000;

  private async statsBit<T>(key: string, fetch: () => Promise<T>, ttlMs?: number): Promise<T> {
    const hit = this.statsBitCache.get(key);
    if (hit && Date.now() - hit.ts < (ttlMs ?? this.STATS_BIT_TTL_MS)) return hit.data as T;
    const data = await fetch();
    this.statsBitCache.set(key, { ts: Date.now(), data });
    return data;
  }

  /** Live quote for ONE symbol — price, open, previous close, day range, 52-week
   *  range, volume, market cap. Cached 60s. */
  async getQuoteOne(symbolRaw: string): Promise<any | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    return this.statsBit(`q:${symbol}`, async () => {
      const rows = await this.get('quote', { symbol });
      return rows?.[0] ?? null;
    }, 60_000);
  }

  /** Trailing-twelve-month ratios for one symbol. NOTE: `ratios-ttm` takes ONE
   *  symbol per request — `?symbol=AAPL,MSFT` returns ZERO rows, verified. */
  async getRatiosTtm(symbolRaw: string): Promise<any | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    return this.statsBit(`rt:${symbol}`, async () => {
      const rows = await this.get('ratios-ttm', { symbol });
      return rows?.[0] ?? null;
    });
  }

  /** TTM income statement — the revenue / net income / EPS the Overview grid
   *  labels "(ttm)". Yahoo served these off `financialData` + `defaultKeyStatistics`. */
  async getIncomeStatementTtm(symbolRaw: string): Promise<any | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    return this.statsBit(`ittm:${symbol}`, async () => {
      const rows = await this.get('income-statement-ttm', { symbol });
      return rows?.[0] ?? null;
    });
  }

  /** Most recent ex-dividend date for one symbol (the `date` field on FMP's
   *  dividend rows IS the ex-date). Null for non-payers. */
  async getLatestExDividend(symbolRaw: string): Promise<string | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    return this.statsBit(`exdiv:${symbol}`, async () => {
      const rows = await this.get('dividends', { symbol, limit: 1 });
      const d = String(rows?.[0]?.date || '').slice(0, 10);
      return d || null;
    });
  }

  /** Next scheduled earnings date (>= today). The feed carries both reported
   *  and upcoming rows, so this picks the EARLIEST future one rather than
   *  row 0, which is whichever end of the window FMP sorted to. */
  async getNextEarningsDate(symbolRaw: string): Promise<string | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    return this.statsBit(`earn:${symbol}`, async () => {
      const rows = await this.get('earnings', { symbol, limit: 12 });
      const today = new Date().toISOString().slice(0, 10);
      const future = rows
        .map((r: any) => String(r?.date || '').slice(0, 10))
        .filter((d: string) => d && d >= today)
        .sort();
      return future[0] ?? null;
    });
  }

  /** Consensus EPS for the NEXT fiscal year — the denominator of forward P/E,
   *  which FMP publishes no ready-made ratio for. Null when uncovered or when
   *  the estimate is a loss (a negative forward P/E is not a multiple). */
  async getForwardEps(symbolRaw: string): Promise<number | null> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return null;
    return this.statsBit(`fweps:${symbol}`, async () => {
      const rows = await this.get('analyst-estimates', { symbol, period: 'annual', limit: 8 });
      // Forward P/E is quoted against the fiscal year AFTER the one in
      // progress — that is the convention Yahoo's `forwardPE` used and what
      // this page has always shown. "More than 12 months out" selects exactly
      // that year for any fiscal calendar without needing to know where the
      // company's year ends: the in-progress year always closes within 12
      // months, the one after it never does. Taking the in-progress year
      // instead put Apple at 34.3 against Yahoo's 31.8.
      const horizon = new Date(Date.now() + 366 * 86_400_000).toISOString().slice(0, 10);
      const future = rows
        .map((r: any) => ({ date: String(r?.date || '').slice(0, 10), eps: this.num(r?.epsAvg) }))
        .filter((r) => r.date && r.date > horizon && r.eps != null)
        .sort((a, b) => a.date.localeCompare(b.date));
      const next = future[0]?.eps ?? null;
      // Deliberately NOT "the first year with positive EPS". Rivian is forecast
      // to lose money next year; skipping ahead to the first profitable year
      // produced a confident-looking forward P/E of 49 built on a 2030
      // estimate. A company with no forward earnings has no forward multiple.
      return next != null && next > 0 ? next : null;
    });
  }

  /** Named executives + pay, for the profile's officer list. FMP publishes no
   *  officer roster, so this reads the DEF 14A compensation table instead:
   *  one row per executive per year, `nameAndPosition` a single unseparated
   *  string ("Luca Maestri Former Senior Vice President, Chief Financial
   *  Officer"). Split at the first title word — everything before it is the
   *  person. Latest filing year only, highest paid first. */
  async getOfficers(symbolRaw: string): Promise<Array<{ name: string; title: string | null; pay: number | null }>> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    return this.statsBit(`offi:${symbol}`, async () => {
      const rows = await this.get('governance-executive-compensation', { symbol });
      if (!rows.length) return [];
      const latest = Math.max(...rows.map((r: any) => this.num(r?.year) ?? 0));
      const TITLE =
        /\b(former|interim|chief|president|vice|senior|executive|principal|chair|chairman|chairwoman|general counsel|head of|managing|group|global|corporate|treasurer|secretary|ceo|cfo|coo|cto|cao|clo|evp|svp)\b/i;
      const seen = new Set<string>();
      const out: Array<{ name: string; title: string | null; pay: number | null }> = [];
      for (const r of rows) {
        if ((this.num(r?.year) ?? 0) !== latest) continue;
        const combined = String(r?.nameAndPosition || '').trim();
        if (!combined) continue;
        const m = combined.match(TITLE);
        const name = (m && m.index ? combined.slice(0, m.index) : combined).trim().replace(/[,;]$/, '');
        const title = m && m.index ? combined.slice(m.index).trim() : null;
        if (!name || seen.has(name.toLowerCase())) continue;
        seen.add(name.toLowerCase());
        out.push({ name, title, pay: this.num(r?.total) });
      }
      out.sort((a, b) => (b.pay ?? 0) - (a.pay ?? 0));
      return out.slice(0, 6);
    }, 24 * 60 * 60_000);
  }

  // ── ETF ownership of a stock ─────────────────────────────────────────
  private etfDirectory: { ts: number; map: Map<string, string> } | null = null;
  private readonly ETF_DIRECTORY_TTL_MS = 24 * 60 * 60_000;

  /** symbol → fund name for every ETF FMP lists (~14.5k rows, ~1.3MB).
   *  Loaded once per instance because `etf/asset-exposure` returns bare symbols
   *  AND mixes in mutual-fund share classes of the same fund (VTI, VTSAX,
   *  VSMPX and VITSX all report an identical AAPL position). Intersecting with
   *  this list is what keeps the holders table to actual ETFs and gives each
   *  row a name. */
  private async getEtfDirectory(): Promise<Map<string, string>> {
    if (this.etfDirectory && Date.now() - this.etfDirectory.ts < this.ETF_DIRECTORY_TTL_MS) {
      return this.etfDirectory.map;
    }
    const map = new Map<string, string>();
    const rows = await this.get('etf-list');
    for (const r of rows) {
      const sym = String(r?.symbol || '').toUpperCase();
      if (sym) map.set(sym, String(r?.name || sym));
    }
    if (map.size) this.etfDirectory = { ts: Date.now(), map };
    return map;
  }

  /** ETFs holding a given stock, largest dollar position first.
   *
   *  Replaces a reverse index built by asking Yahoo for 24 hand-picked ETFs'
   *  top-10 holdings — this is every ETF FMP tracks, with the fund's ACTUAL
   *  position rather than an AUM x weight estimate. Foreign listings are
   *  dropped (a Toronto-listed wrapper is not a useful row on a US page). */
  async getEtfExposure(
    symbolRaw: string,
    limit = 10,
  ): Promise<Array<{ etf: string; name: string; est: number | null; pct: number }>> {
    const symbol = (symbolRaw || '').toUpperCase();
    if (!this.enabled || !symbol) return [];
    const ck = `etfx:${symbol}`;
    const hit = this.statsBitCache.get(ck);
    if (hit && Date.now() - hit.ts < this.ETF_DIRECTORY_TTL_MS) return hit.data;
    const [rows, directory] = await Promise.all([
      this.get('etf/asset-exposure', { symbol }),
      this.getEtfDirectory(),
    ]);
    if (!rows.length) return [];
    const out: Array<{ etf: string; name: string; est: number | null; pct: number }> = [];
    for (const r of rows) {
      const etf = String(r?.symbol || '').toUpperCase();
      // A dot means a non-US listing (ZWH.TO, XEIN.DE). `directory` is the
      // ETF/mutual-fund discriminator; without it VTSAX would sit beside VTI
      // reporting the same position.
      if (!etf || etf.includes('.') || !directory.has(etf)) continue;
      const pct = this.num(r?.weightPercentage);
      out.push({
        etf,
        name: directory.get(etf) || etf,
        est: this.num(r?.marketValue),
        pct: pct == null ? 0 : +pct.toFixed(2),
      });
    }
    out.sort((a, b) => (b.est ?? 0) - (a.est ?? 0));
    const top = out.slice(0, limit);
    if (top.length) this.statsBitCache.set(ck, { ts: Date.now(), data: top });
    return top;
  }
}

/** One OHLCV bar from an FMP history feed, normalised and ASCENDING.
 *  `t` is a true epoch in ms; `date` is `YYYY-MM-DD` for daily bars and a full
 *  ISO instant for intraday ones — the shape the chart route already emits. */
export interface FmpBar {
  t: number;
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
}

/** Raw statement rows as FMP returns them (newest first). */
export interface FmpStatements {
  income: any[];
  balance: any[];
  cashflow: any[];
}

/** One symbol's row from FMP's bulk company-profile feed. */
export interface FmpBulkProfile {
  symbol: string;
  name: string;
  price: number | null;
  changeAbs: number | null;
  changePct: number | null;
  volume: number | null;
  avgVolume: number | null;
  marketCap: number | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  fiftyTwoWeekLow: number | null;
  fiftyTwoWeekHigh: number | null;
  lastDividend: number | null;
  /** ETF or mutual fund — excluded from stock lists and from P/E coverage. */
  isFundLike: boolean;
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
