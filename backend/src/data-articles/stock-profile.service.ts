import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { MarketUniverseService, UniverseRow } from '../market-universe/market-universe.service';

/**
 * The per-stock breakdown that sits under every list article.
 *
 * George 2026-09-23: "A simple breakdown via List style, including stock charts
 * and financial snapshots for each. Insider score. Analyst rating and upside
 * etc. Bullish and bearish notes."
 *
 * Two rules this service is built around:
 *
 *  1. Every note is DERIVED, not written. A bull/bear line is generated from a
 *     number we hold and ships with the source of that number attached, so a
 *     weekly auto-refresh can never drift into a claim nobody can trace. No
 *     model writes prose here.
 *
 *  2. Absence is stated, never implied. A company with no Form 4 purchases on
 *     file gets "no open-market insider purchases on file", not a blank cell
 *     and not a zero — the same rule the CQS guest render had to learn.
 */

export interface ProfileNote {
  text: string;
  /** Where the number came from, shown as the note's provenance. */
  source: string;
}

export interface StockProfile {
  symbol: string;
  name: string | null;
  sector: string | null;
  industry: string | null;
  exchange: string | null;
  price: number | null;
  changePct: number | null;
  ytdPct: number | null;
  yearHigh: number | null;
  yearLow: number | null;
  rangePosition: number | null;
  marketCap: number | null;
  /** [epoch ms, close] — one trading year, downsampled for a sparkline. */
  spark: Array<[number, number]>;
  financials: {
    revenueTtm: number | null;
    netIncomeTtm: number | null;
    grossMargin: number | null;
    freeCashFlowTtm: number | null;
    totalDebt: number | null;
    cash: number | null;
    peRatio: number | null;
    periodEnd: string | null;
    /** How many quarters the trailing figures actually sum — fewer than four
     *  means the company has not been filing with us long enough. */
    quartersCounted: number;
  } | null;
  insider: {
    iqs: number | null;
    distinctBuyers: number;
    transactionCount: number;
    totalPurchaseValue: number;
    avgBuyPrice: number | null;
    topBuyerRole: string | null;
    reasoning: string | null;
    asOf: string | null;
  } | null;
  analyst: {
    targetAvg: number | null;
    targetHigh: number | null;
    targetLow: number | null;
    count: number;
    upsidePct: number | null;
    latestDate: string | null;
    firms: string[];
  } | null;
  bull: ProfileNote[];
  bear: ProfileNote[];
}

/** Targets older than this stop describing the current view. */
const TARGET_WINDOW_DAYS = 180;
/** §3.2 cluster flag, reused so the article and the score agree. */
const CLUSTER_MIN_INSIDERS = 3;
const SPARK_POINTS = 120;

const num = (v: any): number | null => {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

function usd(n: number | null): string {
  if (n === null) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}
function pct(n: number | null, digits = 1): string {
  if (n === null) return '—';
  return `${n >= 0 ? '+' : ''}${n.toFixed(digits)}%`;
}

@Injectable()
export class StockProfileService {
  private readonly log = new Logger(StockProfileService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly universe: MarketUniverseService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  /** Profiles for a whole article's row set, in as few queries as possible. */
  async many(symbols: string[]): Promise<Record<string, StockProfile>> {
    const syms = Array.from(new Set(symbols.filter(Boolean).map((s) => s.toUpperCase())));
    const out: Record<string, StockProfile> = {};
    if (!syms.length) return out;

    const [universe, quotes, sparks, facts, pe, insider, targets] = await Promise.all([
      this.universe.getMany(syms),
      this.companyQuotes(syms),
      this.sparks(syms),
      this.fundamentals(syms),
      this.peRatios(syms),
      this.insiderSummary(syms),
      this.analystTargets(syms),
    ]);

    for (const symbol of syms) {
      const u = universe.get(symbol) ?? null;
      const cq = quotes.get(symbol) ?? null;
      const price = u?.price ?? cq?.price ?? null;
      const a = targets.get(symbol) ?? null;
      const upside = a?.targetAvg && price && price > 0 ? ((a.targetAvg - price) / price) * 100 : null;
      const analyst = a ? { ...a, upsidePct: upside } : null;
      const ins = insider.get(symbol) ?? null;
      const fin = facts.get(symbol) ?? null;
      const peRatio = pe.get(symbol) ?? null;

      const profile: StockProfile = {
        symbol,
        name: u?.name ?? cq?.name ?? null,
        sector: u?.sector ?? cq?.sector ?? null,
        industry: u?.industry ?? null,
        exchange: u?.exchange ?? cq?.exchange ?? null,
        price,
        changePct: u?.changePct ?? null,
        ytdPct: u?.ytdPct ?? null,
        yearHigh: u?.yearHigh ?? null,
        yearLow: u?.yearLow ?? null,
        rangePosition: u?.rangePosition ?? null,
        marketCap: u?.marketCap ?? cq?.marketCap ?? null,
        spark: sparks.get(symbol) ?? [],
        financials: fin ? { ...fin, peRatio } : peRatio !== null
          ? { revenueTtm: null, netIncomeTtm: null, grossMargin: null, freeCashFlowTtm: null, totalDebt: null, cash: null, peRatio, periodEnd: null, quartersCounted: 0 }
          : null,
        insider: ins,
        analyst,
        bull: [],
        bear: [],
      };
      const { bull, bear } = this.notes(profile, u);
      profile.bull = bull;
      profile.bear = bear;
      out[symbol] = profile;
    }
    return out;
  }

  /* ----------------------------------------------------------- sources */

  /** Fallback identity for a ticker that is in `companies` but not the
   *  screener universe (a small cap below the cap floor, say). */
  private async companyQuotes(symbols: string[]): Promise<Map<string, any>> {
    const rows = await this.q<any[]>(
      `SELECT ticker, name, sector, exchange, "lastPrice" AS price, "marketCap"
         FROM companies WHERE ticker = ANY($1)`,
      [symbols],
    );
    const out = new Map<string, any>();
    for (const r of rows) {
      out.set(r.ticker, {
        name: r.name,
        sector: r.sector,
        exchange: r.exchange,
        price: num(r.price),
        marketCap: num(r.marketCap),
      });
    }
    return out;
  }

  /** One year of closes, downsampled. `price_history_cache` stores {c,t};
   *  `pit_price_series` stores [t,close,volume] — read whichever we hold. */
  private async sparks(symbols: string[]): Promise<Map<string, Array<[number, number]>>> {
    const out = new Map<string, Array<[number, number]>>();
    const cutoff = Date.now() - 366 * 86_400_000;

    const cached = await this.q<any[]>(`SELECT symbol, points FROM price_history_cache WHERE symbol = ANY($1)`, [symbols]);
    for (const r of cached) {
      const pts: Array<[number, number]> = [];
      for (const p of (r.points as any[]) || []) {
        const t = Number(p?.t);
        const c = Number(p?.c);
        if (Number.isFinite(t) && Number.isFinite(c) && t >= cutoff) pts.push([t, c]);
      }
      if (pts.length) out.set(r.symbol, this.downsample(pts));
    }

    const missing = symbols.filter((s) => !out.has(s));
    if (missing.length) {
      const pit = await this.q<any[]>(`SELECT symbol, points FROM pit_price_series WHERE symbol = ANY($1)`, [missing]);
      for (const r of pit) {
        const pts: Array<[number, number]> = [];
        for (const p of (r.points as any[]) || []) {
          const t = Number(p?.[0]);
          const c = Number(p?.[1]);
          if (Number.isFinite(t) && Number.isFinite(c) && t >= cutoff) pts.push([t, c]);
        }
        if (pts.length) out.set(r.symbol, this.downsample(pts));
      }
    }
    return out;
  }

  private downsample(points: Array<[number, number]>): Array<[number, number]> {
    if (points.length <= SPARK_POINTS) return points;
    const step = points.length / SPARK_POINTS;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < SPARK_POINTS; i++) out.push(points[Math.min(points.length - 1, Math.floor(i * step))]);
    out.push(points[points.length - 1]);
    return out;
  }

  /**
   * Trailing-twelve-month figures.
   *
   * `pit_fundamentals` stores QUARTERS. Reading the latest row and calling it
   * TTM understates revenue roughly fourfold — The Trade Desk came back at
   * $715M against a real TTM near $2.4bn — so the flow items are summed over
   * the last four quarters and only the balance-sheet items (which are a
   * position, not a flow) are taken from the most recent one.
   */
  private async fundamentals(symbols: string[]): Promise<Map<string, StockProfile['financials']>> {
    const rows = await this.q<any[]>(
      `WITH ranked AS (
         SELECT symbol, period_end, revenue, gross_profit, net_income, free_cash_flow,
                total_debt, cash,
                ROW_NUMBER() OVER (PARTITION BY symbol ORDER BY period_end DESC) AS rn
           FROM pit_fundamentals
          WHERE symbol = ANY($1)
       )
       SELECT symbol,
              to_char(MAX(period_end) FILTER (WHERE rn = 1),'YYYY-MM-DD') AS period_end,
              COUNT(*) FILTER (WHERE rn <= 4)::int                        AS quarters,
              SUM(revenue)        FILTER (WHERE rn <= 4)                  AS revenue,
              SUM(gross_profit)   FILTER (WHERE rn <= 4)                  AS gross_profit,
              SUM(net_income)     FILTER (WHERE rn <= 4)                  AS net_income,
              SUM(free_cash_flow) FILTER (WHERE rn <= 4)                  AS free_cash_flow,
              MAX(total_debt)     FILTER (WHERE rn = 1)                   AS total_debt,
              MAX(cash)           FILTER (WHERE rn = 1)                   AS cash
         FROM ranked
        WHERE rn <= 4
        GROUP BY symbol`,
      [symbols],
    );
    const out = new Map<string, StockProfile['financials']>();
    for (const r of rows) {
      const revenue = num(r.revenue);
      const grossProfit = num(r.gross_profit);
      // A filing that does not break out cost of revenue reports gross profit
      // equal to revenue. That is a missing disclosure, not a 100% margin, and
      // publishing it as one would be a confident false claim.
      const margin =
        revenue && revenue > 0 && grossProfit !== null && grossProfit < revenue * 0.995
          ? grossProfit / revenue
          : null;
      out.set(r.symbol, {
        revenueTtm: revenue,
        netIncomeTtm: num(r.net_income),
        grossMargin: margin,
        freeCashFlowTtm: num(r.free_cash_flow),
        totalDebt: num(r.total_debt),
        cash: num(r.cash),
        peRatio: null,
        periodEnd: r.period_end ?? null,
        quartersCounted: Number(r.quarters) || 0,
      });
    }
    return out;
  }

  private async peRatios(symbols: string[]): Promise<Map<string, number | null>> {
    const rows = await this.q<any[]>(`SELECT symbol, "peRatio" FROM pe_ratio_cache WHERE symbol = ANY($1)`, [symbols]);
    const out = new Map<string, number | null>();
    for (const r of rows) out.set(r.symbol, num(r.peRatio));
    return out;
  }

  /**
   * Open-market purchases only — code P, discretionary — over the same 90-day
   * window the Insider Score decays on, joined to the stored score so the
   * article and the stock page can never disagree.
   */
  private async insiderSummary(symbols: string[]): Promise<Map<string, StockProfile['insider']>> {
    const rows = await this.q<any[]>(
      `WITH latest AS (
         SELECT DISTINCT ON (company_id) company_id, iqs, reasoning, "asOfDate"
           FROM iqs_scores WHERE "windowDays" = 90 ORDER BY company_id, "asOfDate" DESC
       )
       SELECT c.ticker,
              l.iqs, l.reasoning, to_char(l."asOfDate",'YYYY-MM-DD') AS as_of,
              COUNT(DISTINCT t."insiderName")::int              AS buyers,
              COUNT(t.id)::int                                  AS filings,
              COALESCE(SUM(t."totalValue"), 0)                  AS total_value,
              CASE WHEN SUM(t."sharesBought") > 0
                   THEN SUM(t."totalValue") / SUM(t."sharesBought") END AS avg_price,
              MIN(CASE t.role WHEN 'CEO' THEN 1 WHEN 'CFO' THEN 2 WHEN 'COO' THEN 3
                              WHEN 'Director' THEN 4 ELSE 5 END)       AS top_role
         FROM companies c
         LEFT JOIN latest l ON l.company_id = c.id
         LEFT JOIN insider_transactions t
                ON t.company_id = c.id
               AND t."transactionCode" = 'P'
               AND t."plannedBuy" = false
               AND t."transactionDate" >= current_date - 90
        WHERE c.ticker = ANY($1)
        GROUP BY c.ticker, l.iqs, l.reasoning, l."asOfDate"`,
      [symbols],
    );
    const ROLE = ['', 'CEO', 'CFO', 'COO', 'Director', 'Other'];
    const out = new Map<string, StockProfile['insider']>();
    for (const r of rows) {
      out.set(r.ticker, {
        iqs: num(r.iqs),
        distinctBuyers: Number(r.buyers) || 0,
        transactionCount: Number(r.filings) || 0,
        totalPurchaseValue: Number(r.total_value) || 0,
        avgBuyPrice: num(r.avg_price),
        topBuyerRole: r.top_role ? ROLE[Number(r.top_role)] ?? null : null,
        reasoning: r.reasoning ?? null,
        asOf: r.as_of ?? null,
      });
    }
    return out;
  }

  private async analystTargets(symbols: string[]): Promise<Map<string, Omit<NonNullable<StockProfile['analyst']>, 'upsidePct'>>> {
    const rows = await this.q<any[]>(
      `SELECT symbol,
              AVG("priceTarget")::float                      AS avg_t,
              MAX("priceTarget")::float                      AS max_t,
              MIN("priceTarget")::float                      AS min_t,
              COUNT(*)::int                                  AS n,
              to_char(MAX("publishedDate"),'YYYY-MM-DD')     AS latest,
              (ARRAY_AGG(DISTINCT "analystCompany"))[1:4]    AS firms
         FROM analyst_price_targets
        WHERE symbol = ANY($1)
          AND "priceTarget" > 0
          AND "publishedDate" >= now() - ($2 || ' days')::interval
        GROUP BY symbol`,
      [symbols, String(TARGET_WINDOW_DAYS)],
    );
    const out = new Map<string, Omit<NonNullable<StockProfile['analyst']>, 'upsidePct'>>();
    for (const r of rows) {
      out.set(r.symbol, {
        targetAvg: num(r.avg_t),
        targetHigh: num(r.max_t),
        targetLow: num(r.min_t),
        count: Number(r.n) || 0,
        latestDate: r.latest ?? null,
        firms: (r.firms || []).filter(Boolean),
      });
    }
    return out;
  }

  /* ------------------------------------------------------------- notes */

  /**
   * Bull and bear cases, each line generated from one figure and carrying the
   * source of that figure. Ordered strongest-first; a stock with nothing to
   * say on one side gets an explicit "nothing on file" line rather than an
   * empty column, because an empty column reads as "we checked and it's fine".
   */
  private notes(p: StockProfile, u: UniverseRow | null): { bull: ProfileNote[]; bear: ProfileNote[] } {
    const bull: ProfileNote[] = [];
    const bear: ProfileNote[] = [];
    const ins = p.insider;
    const an = p.analyst;
    const fin = p.financials;

    // ── insider evidence ───────────────────────────────────────────────
    if (ins && ins.transactionCount > 0) {
      const who = ins.topBuyerRole && ins.topBuyerRole !== 'Other' ? ` (incl. ${ins.topBuyerRole})` : '';
      bull.push({
        text: `${ins.distinctBuyers} insider${ins.distinctBuyers === 1 ? '' : 's'}${who} bought ${usd(ins.totalPurchaseValue)} across ${ins.transactionCount} filing${ins.transactionCount === 1 ? '' : 's'} in the last 90 days.`,
        source: 'SEC Form 4, open-market purchases only',
      });
      if (ins.distinctBuyers >= CLUSTER_MIN_INSIDERS) {
        bull.push({
          text: `Cluster buying: ${ins.distinctBuyers} separate insiders bought inside the same window.`,
          source: 'SEC Form 4',
        });
      }
      if (ins.avgBuyPrice && p.price && p.price < ins.avgBuyPrice) {
        const below = ((ins.avgBuyPrice - p.price) / ins.avgBuyPrice) * 100;
        bull.push({
          text: `The stock trades ${below.toFixed(1)}% below the ${usd(ins.avgBuyPrice)} average price insiders paid.`,
          source: 'SEC Form 4, volume-weighted',
        });
      }
      if (ins.iqs !== null && ins.iqs >= 70) {
        bull.push({ text: `Insider Score ${ins.iqs.toFixed(0)}/99 — top-tier insider conviction.`, source: 'InsiderBuying Insider Score' });
      }
    } else {
      bear.push({
        text: 'No open-market insider purchases on file in the last 90 days.',
        source: 'SEC Form 4 — absence of filings, not a sale signal',
      });
    }

    // ── the street ─────────────────────────────────────────────────────
    if (an && an.targetAvg && an.upsidePct !== null) {
      const firms = an.firms.length ? ` (${an.firms.slice(0, 3).join(', ')}${an.count > 3 ? ' and others' : ''})` : '';
      const line = {
        text: `${an.count} analyst target${an.count === 1 ? '' : 's'} average $${an.targetAvg.toFixed(2)}, ${pct(an.upsidePct)} against the last price${firms}.`,
        source: `Analyst price targets, last ${TARGET_WINDOW_DAYS} days`,
      };
      (an.upsidePct >= 0 ? bull : bear).push(line);
    } else {
      bear.push({ text: `No analyst price target published in the last ${TARGET_WINDOW_DAYS} days.`, source: 'Analyst price targets' });
    }

    // ── price context ──────────────────────────────────────────────────
    if (p.ytdPct !== null) {
      (p.ytdPct >= 0 ? bull : bear).push({
        text: `${pct(p.ytdPct)} year to date.`,
        source: 'Year-to-date price change',
      });
    }
    if (u?.offHighPct !== null && u?.offHighPct !== undefined && u.offHighPct <= -20) {
      bear.push({ text: `Trading ${Math.abs(u.offHighPct).toFixed(1)}% below its 52-week high of $${(p.yearHigh ?? 0).toFixed(2)}.`, source: '52-week range' });
    }
    if (u?.offLowPct !== null && u?.offLowPct !== undefined && u.offLowPct <= 3 && p.yearLow) {
      bear.push({ text: `Within ${u.offLowPct.toFixed(1)}% of its 52-week low of $${p.yearLow.toFixed(2)}.`, source: '52-week range' });
    }
    if (p.rangePosition !== null && p.rangePosition >= 0.95) {
      bull.push({ text: 'Trading in the top 5% of its 52-week range.', source: '52-week range' });
    }

    // ── the balance sheet ──────────────────────────────────────────────
    if (fin) {
      if (fin.freeCashFlowTtm !== null && fin.freeCashFlowTtm > 0) {
        bull.push({ text: `Free cash flow ${usd(fin.freeCashFlowTtm)} over the trailing twelve months.`, source: `Company filings${fin.periodEnd ? `, to ${fin.periodEnd}` : ''}` });
      } else if (fin.freeCashFlowTtm !== null && fin.freeCashFlowTtm < 0) {
        bear.push({ text: `Free cash flow was ${usd(fin.freeCashFlowTtm)} over the trailing twelve months.`, source: `Company filings${fin.periodEnd ? `, to ${fin.periodEnd}` : ''}` });
      }
      if (fin.netIncomeTtm !== null && fin.netIncomeTtm < 0) {
        bear.push({ text: `Loss-making: net income ${usd(fin.netIncomeTtm)} over the trailing twelve months.`, source: 'Company filings' });
      }
      if (fin.totalDebt !== null && fin.cash !== null && p.marketCap && fin.totalDebt - fin.cash > p.marketCap * 0.5) {
        bear.push({ text: `Net debt ${usd(fin.totalDebt - fin.cash)} is more than half the company's market value.`, source: 'Company filings' });
      }
      if (fin.grossMargin !== null && fin.grossMargin >= 0.5) {
        bull.push({ text: `Gross margin ${(fin.grossMargin * 100).toFixed(0)}%.`, source: 'Company filings' });
      }
    }

    if (!bull.length) bull.push({ text: 'Nothing on the bullish side of our data for this name right now.', source: 'InsiderBuying data check' });
    if (!bear.length) bear.push({ text: 'Nothing on the bearish side of our data for this name right now.', source: 'InsiderBuying data check' });
    return { bull: bull.slice(0, 5), bear: bear.slice(0, 5) };
  }
}
