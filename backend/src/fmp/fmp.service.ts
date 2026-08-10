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
          avgVolume: Number(q.avgVolume) || 0,
          marketCap: Number(q.marketCap) || null,
          fiftyTwoWeekHigh: Number(q.yearHigh) || null,
          fiftyTwoWeekLow: Number(q.yearLow) || null,
          peRatio: Number(q.pe) || null,
          exchange: q.exchange || null,
        });
      }
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
}
