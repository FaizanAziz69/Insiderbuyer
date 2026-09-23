import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';

/**
 * L1 — the point-in-time research database (Brief v6 §3).
 *
 * The brief's non-negotiable, quoted: "every factor is stored point-in-time
 * (what was knowable on date D, including filing lag), and the universe
 * includes delisted names historically. Without both, every backtest we run is
 * fiction — survivorship and lookahead bias are how quant projects fail
 * quietly."
 *
 * Both halves are enforced by the schema rather than by convention:
 *
 *  - `pit_fundamentals.knowable_from` is the filing's accepted timestamp, not
 *    the period end. A June quarter accepted on July 31st does not exist to
 *    any reader asking about July 1st. Every read goes through `factsAsOf`,
 *    which filters on that column, so there is no code path that can see a
 *    number before it was published.
 *  - `pit_securities` carries delisted names with their last trading date, so
 *    a historical universe is rebuilt from what was listed then, not from
 *    what survived to today.
 *
 * Restatements are additive: a re-filed quarter arrives as its own row with a
 * later `knowable_from`, and the as-of read picks whichever version was
 * current on the date asked about. Nothing is ever overwritten, which is what
 * makes a backtest reproducible.
 */

export interface PitFacts {
  symbol: string;
  periodEnd: string;
  fiscalYear: string;
  period: string;
  knowableFrom: string;
  revenue: number | null;
  grossProfit: number | null;
  operatingIncome: number | null;
  ebit: number | null;
  netIncome: number | null;
  interestExpense: number | null;
  totalAssets: number | null;
  totalDebt: number | null;
  totalLiabilities: number | null;
  cash: number | null;
  netDebt: number | null;
  totalCurrentAssets: number | null;
  totalCurrentLiabilities: number | null;
  totalEquity: number | null;
  operatingCashFlow: number | null;
  capex: number | null;
  freeCashFlow: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  grossMargin: number | null;
}

/**
 * The §12 universe is US + Canada. `companies.exchange` already holds a
 * country code ("US", "DE") rather than an exchange name, while FMP's
 * delisted register holds venue names ("NASDAQ", "TSX"), so both spellings
 * are mapped here.
 */
function countryOf(exchange: string | null | undefined): string | null {
  const e = String(exchange || '').trim().toUpperCase();
  if (!e) return null;
  if (e === 'US' || e === 'USA') return 'US';
  if (e === 'CA' || e === 'CAN') return 'CA';
  if (/TSX|TSXV|TORONTO|VENTURE|\bNEO\b|\bCSE\b/.test(e)) return 'CA';
  if (/NASDAQ|NYSE|AMEX|BATS|OTC|PINK|ARCA/.test(e)) return 'US';
  return e.length === 2 ? e : null;
}

const num = (v: any): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

@Injectable()
export class PitService {
  private readonly log = new Logger(PitService.name);

  constructor(
    @InjectRepository(Company) private readonly companies: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companies.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS pit_securities (
      symbol text PRIMARY KEY,
      name text NOT NULL DEFAULT '',
      exchange text,
      country text,
      sector text,
      industry text,
      listed_from date,
      delisted_on date,
      active boolean NOT NULL DEFAULT true,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS pit_securities_active_idx ON pit_securities (active, exchange)`);

    await this.q(`CREATE TABLE IF NOT EXISTS pit_fundamentals (
      symbol text NOT NULL,
      period_end date NOT NULL,
      knowable_from timestamptz NOT NULL,
      fiscal_year text,
      period text,
      revenue double precision, gross_profit double precision, operating_income double precision,
      ebit double precision, net_income double precision, interest_expense double precision,
      total_assets double precision, total_debt double precision, total_liabilities double precision,
      cash double precision, net_debt double precision,
      total_current_assets double precision, total_current_liabilities double precision,
      total_equity double precision,
      operating_cash_flow double precision, capex double precision, free_cash_flow double precision,
      current_ratio double precision, interest_coverage double precision, gross_margin double precision,
      source text NOT NULL DEFAULT 'fmp',
      ingested_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (symbol, period_end, knowable_from)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS pit_fundamentals_asof_idx ON pit_fundamentals (symbol, knowable_from DESC, period_end DESC)`);

    await this.q(`CREATE TABLE IF NOT EXISTS pit_price_series (
      symbol text PRIMARY KEY,
      points jsonb NOT NULL,
      first_date date,
      last_date date,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

    await this.q(`CREATE TABLE IF NOT EXISTS pit_marketcap (
      symbol text PRIMARY KEY,
      points jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);

    await this.q(`CREATE TABLE IF NOT EXISTS quant_config (
      key text PRIMARY KEY,
      value jsonb NOT NULL,
      version int NOT NULL DEFAULT 1,
      updated_at timestamptz NOT NULL DEFAULT now(),
      updated_by text
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS quant_config_history (
      id bigserial PRIMARY KEY,
      key text NOT NULL,
      value jsonb NOT NULL,
      version int NOT NULL,
      changed_at timestamptz NOT NULL DEFAULT now(),
      changed_by text
    )`);
  }

  // ── Universe ─────────────────────────────────────────────────────────

  /** Live listings from our own coverage plus FMP's delisted register. */
  async refreshUniverse(): Promise<{ active: number; delisted: number }> {
    await this.ensureTables();
    // Active side: the companies we already cover, which is what the rest of
    // the site scores, so the fund can never rank a name the site cannot show.
    // `companies` carries no country column; the exchange implies it, which
    // is all the universe filter needs (§12: US + TSX/TSXV).
    const live = await this.q<any[]>(
      `SELECT upper(ticker) AS symbol, name, exchange, sector, industry FROM companies WHERE ticker IS NOT NULL`,
    );
    // One row per symbol: `companies` can carry a ticker twice (a re-listing,
    // or two share classes normalised to the same symbol), and a batch that
    // touches the same key twice is rejected outright by ON CONFLICT.
    const liveBySymbol = new Map<string, any>();
    for (const r of live) if (r.symbol && !liveBySymbol.has(r.symbol)) liveBySymbol.set(r.symbol, r);
    const liveRows = Array.from(liveBySymbol.values());
    let active = 0;
    for (let i = 0; i < liveRows.length; i += 500) {
      const chunk = liveRows.slice(i, i + 500);
      const values: any[] = [];
      const tuples = chunk.map((r, k) => {
        const b = k * 6;
        values.push(r.symbol, r.name || '', r.exchange || null, countryOf(r.exchange), r.sector || null, r.industry || null);
        return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6})`;
      });
      await this.q(
        `INSERT INTO pit_securities (symbol,name,exchange,country,sector,industry) VALUES ${tuples.join(',')}
         ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, exchange = COALESCE(EXCLUDED.exchange, pit_securities.exchange),
           country = COALESCE(EXCLUDED.country, pit_securities.country), sector = COALESCE(EXCLUDED.sector, pit_securities.sector),
           industry = COALESCE(EXCLUDED.industry, pit_securities.industry), updated_at = now()`,
        values,
      );
      active += chunk.length;
    }
    // Delisted side: without it the historical universe is only the survivors.
    let delisted = 0;
    try {
      const goneRaw = await this.fmp.getDelistedCompanies();
      const goneBySymbol = new Map<string, any>();
      for (const r of goneRaw) if (r.symbol && !goneBySymbol.has(r.symbol)) goneBySymbol.set(r.symbol, r);
      const gone = Array.from(goneBySymbol.values());
      for (let i = 0; i < gone.length; i += 500) {
        const chunk = gone.slice(i, i + 500);
        const values: any[] = [];
        const tuples = chunk.map((r, k) => {
          const b = k * 6;
          values.push(r.symbol, r.companyName, r.exchange || null, countryOf(r.exchange), r.ipoDate, r.delistedDate);
          return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5}::date,$${b + 6}::date)`;
        });
        await this.q(
          `INSERT INTO pit_securities (symbol,name,exchange,country,listed_from,delisted_on,active)
           SELECT v.symbol, v.name, v.exchange, v.country, v.listed_from, v.delisted_on, false
           FROM (VALUES ${tuples.join(',')}) AS v(symbol,name,exchange,country,listed_from,delisted_on)
           ON CONFLICT (symbol) DO UPDATE SET delisted_on = COALESCE(EXCLUDED.delisted_on, pit_securities.delisted_on),
             listed_from = COALESCE(pit_securities.listed_from, EXCLUDED.listed_from),
             country = COALESCE(pit_securities.country, EXCLUDED.country), active = false, updated_at = now()`,
          values,
        );
        delisted += chunk.length;
      }
    } catch (e: any) {
      this.log.warn(`delisted register unavailable: ${e?.message || e}`);
    }
    this.log.log(`universe: ${active} active, ${delisted} delisted`);
    return { active, delisted };
  }

  /** Symbols listed on `asOf` — delisted names included when they were alive,
   *  restricted to the §12 universe (US + Canada by default). */
  async universeAsOf(asOf: string, countries?: string[]): Promise<string[]> {
    const rows = await this.q<Array<{ symbol: string }>>(
      `SELECT symbol FROM pit_securities
       WHERE (listed_from IS NULL OR listed_from <= $1::date)
         AND (delisted_on IS NULL OR delisted_on >= $1::date)
         AND ($2::text[] IS NULL OR country = ANY($2))`,
      [asOf, countries && countries.length ? countries : null],
    );
    return rows.map((r) => r.symbol);
  }

  /** Symbols eligible for ingestion, in the configured universe only. */
  async ingestCandidates(
    countries: string[],
    after: string | null,
    limit: number,
    freshness?: { table: string; days: number },
    activeOnly = false,
  ): Promise<string[]> {
    const join = freshness
      ? `LEFT JOIN ${freshness.table} f ON f.symbol = s.symbol`
      : '';
    const fresh = freshness
      ? `AND (f.symbol IS NULL OR f.updated_at < now() - interval '${freshness.days} days')`
      : '';
    const rows = await this.q<Array<{ symbol: string }>>(
      `SELECT s.symbol FROM pit_securities s ${join}
       WHERE ($1::text IS NULL OR s.symbol > $1)
         AND ($3::text[] IS NULL OR s.country = ANY($3))
         ${activeOnly ? 'AND s.active = true' : ''}
         ${fresh}
       ORDER BY s.symbol LIMIT $2`,
      [after, limit, countries && countries.length ? countries : null],
    );
    return rows.map((r) => r.symbol);
  }

  // ── Fundamentals ─────────────────────────────────────────────────────

  private shape(symbol: string, inc: any, bal: any, cf: any, ratio: any): PitFacts | null {
    const periodEnd = String(inc?.date || bal?.date || cf?.date || '').slice(0, 10);
    // The knowable date is the filing's acceptance, never the period end.
    const accepted = String(inc?.acceptedDate || bal?.acceptedDate || cf?.acceptedDate || '').trim();
    const filing = String(inc?.filingDate || bal?.filingDate || cf?.filingDate || '').slice(0, 10);
    const knowable = accepted ? accepted.replace(' ', 'T') + 'Z' : filing ? `${filing}T23:59:59Z` : '';
    if (!periodEnd || !knowable) return null;

    const revenue = num(inc?.revenue);
    const grossProfit = num(inc?.grossProfit);
    const ebit = num(inc?.ebit) ?? num(inc?.operatingIncome);
    const interestExpense = num(inc?.interestExpense);
    const shortTermDebt = num(bal?.shortTermDebt) ?? 0;
    const longTermDebt = num(bal?.longTermDebt) ?? 0;
    const totalDebt = num(bal?.totalDebt) ?? (shortTermDebt || longTermDebt ? shortTermDebt + longTermDebt : null);
    const tca = num(bal?.totalCurrentAssets);
    const tcl = num(bal?.totalCurrentLiabilities);
    const ocf = num(cf?.operatingCashFlow) ?? num(cf?.netCashProvidedByOperatingActivities);
    const capex = num(cf?.capitalExpenditure);
    const fcf = num(cf?.freeCashFlow) ?? (ocf != null && capex != null ? ocf + capex : null);

    return {
      symbol,
      periodEnd,
      fiscalYear: String(inc?.fiscalYear || ''),
      period: String(inc?.period || ''),
      knowableFrom: knowable,
      revenue,
      grossProfit,
      operatingIncome: num(inc?.operatingIncome),
      ebit,
      netIncome: num(inc?.netIncome),
      interestExpense,
      totalAssets: num(bal?.totalAssets),
      totalDebt,
      totalLiabilities: num(bal?.totalLiabilities),
      cash: num(bal?.cashAndCashEquivalents) ?? num(bal?.cashAndShortTermInvestments),
      netDebt: num(bal?.netDebt),
      totalCurrentAssets: tca,
      totalCurrentLiabilities: tcl,
      totalEquity: num(bal?.totalStockholdersEquity) ?? num(bal?.totalEquity),
      operatingCashFlow: ocf,
      capex,
      freeCashFlow: fcf,
      currentRatio: num(ratio?.currentRatio) ?? (tca != null && tcl ? tca / tcl : null),
      interestCoverage:
        num(ratio?.interestCoverageRatio) ??
        (ebit != null && interestExpense ? ebit / Math.abs(interestExpense) : null),
      grossMargin: num(ratio?.grossProfitMargin) ?? (grossProfit != null && revenue ? grossProfit / revenue : null),
    };
  }

  /** Ingest one symbol's quarterly history. Rows are additive: a restatement
   *  lands beside the original under its own knowable_from. */
  async ingestSymbol(symbol: string, quarters = 44): Promise<number> {
    const sym = symbol.toUpperCase();
    const [stmts, ratios] = await Promise.all([
      this.fmp.getStatements(sym, 'quarter', quarters, { noCache: true }),
      this.fmp.getRatios(sym, quarters).catch(() => [] as any[]),
    ]);
    const byDate = (rows: any[]) => new Map(rows.map((r) => [String(r?.date || '').slice(0, 10), r]));
    const bal = byDate(stmts.balance || []);
    const cf = byDate(stmts.cashflow || []);
    const rt = byDate(ratios || []);
    const facts: PitFacts[] = [];
    for (const inc of stmts.income || []) {
      const d = String(inc?.date || '').slice(0, 10);
      const f = this.shape(sym, inc, bal.get(d), cf.get(d), rt.get(d));
      if (f) facts.push(f);
    }
    if (!facts.length) return 0;
    for (let i = 0; i < facts.length; i += 200) {
      const chunk = facts.slice(i, i + 200);
      const values: any[] = [];
      const tuples = chunk.map((f, k) => {
        const b = k * 24;
        values.push(
          f.symbol, f.periodEnd, f.knowableFrom, f.fiscalYear, f.period,
          f.revenue, f.grossProfit, f.operatingIncome, f.ebit, f.netIncome, f.interestExpense,
          f.totalAssets, f.totalDebt, f.totalLiabilities, f.cash, f.netDebt,
          f.totalCurrentAssets, f.totalCurrentLiabilities, f.totalEquity,
          f.operatingCashFlow, f.capex, f.freeCashFlow,
          f.currentRatio, f.interestCoverage,
        );
        return `($${b + 1},$${b + 2}::date,$${b + 3}::timestamptz,$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 15},$${b + 16},$${b + 17},$${b + 18},$${b + 19},$${b + 20},$${b + 21},$${b + 22},$${b + 23},$${b + 24})`;
      });
      await this.q(
        `INSERT INTO pit_fundamentals (symbol,period_end,knowable_from,fiscal_year,period,revenue,gross_profit,operating_income,ebit,net_income,interest_expense,
           total_assets,total_debt,total_liabilities,cash,net_debt,total_current_assets,total_current_liabilities,total_equity,
           operating_cash_flow,capex,free_cash_flow,current_ratio,interest_coverage)
         VALUES ${tuples.join(',')} ON CONFLICT (symbol,period_end,knowable_from) DO NOTHING`,
        values,
      );
    }
    // gross_margin is derived, so it is set in one pass rather than carried.
    await this.q(
      `UPDATE pit_fundamentals SET gross_margin = gross_profit / NULLIF(revenue,0)
       WHERE symbol = $1 AND gross_margin IS NULL AND revenue IS NOT NULL AND gross_profit IS NOT NULL`,
      [sym],
    );
    return facts.length;
  }

  /** THE point-in-time read: the newest filing for each symbol that was
   *  already public at `asOf`. Every consumer goes through this. */
  async factsAsOf(symbols: string[], asOf: string): Promise<Map<string, PitFacts>> {
    const out = new Map<string, PitFacts>();
    if (!symbols.length) return out;
    for (let i = 0; i < symbols.length; i += 800) {
      const chunk = symbols.slice(i, i + 800);
      const rows = await this.q<any[]>(
        `SELECT DISTINCT ON (symbol) symbol, to_char(period_end,'YYYY-MM-DD') AS period_end,
                to_char(knowable_from,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS knowable_from, fiscal_year, period,
                revenue, gross_profit, operating_income, ebit, net_income, interest_expense,
                total_assets, total_debt, total_liabilities, cash, net_debt,
                total_current_assets, total_current_liabilities, total_equity,
                operating_cash_flow, capex, free_cash_flow, current_ratio, interest_coverage, gross_margin
         FROM pit_fundamentals
         WHERE symbol = ANY($1) AND knowable_from <= $2::timestamptz
         ORDER BY symbol, knowable_from DESC, period_end DESC`,
        [chunk, asOf],
      );
      for (const r of rows) {
        out.set(r.symbol, {
          symbol: r.symbol, periodEnd: r.period_end, fiscalYear: r.fiscal_year, period: r.period,
          knowableFrom: r.knowable_from, revenue: r.revenue, grossProfit: r.gross_profit,
          operatingIncome: r.operating_income, ebit: r.ebit, netIncome: r.net_income,
          interestExpense: r.interest_expense, totalAssets: r.total_assets, totalDebt: r.total_debt,
          totalLiabilities: r.total_liabilities, cash: r.cash, netDebt: r.net_debt,
          totalCurrentAssets: r.total_current_assets, totalCurrentLiabilities: r.total_current_liabilities,
          totalEquity: r.total_equity, operatingCashFlow: r.operating_cash_flow, capex: r.capex,
          freeCashFlow: r.free_cash_flow, currentRatio: r.current_ratio,
          interestCoverage: r.interest_coverage, grossMargin: r.gross_margin,
        });
      }
    }
    return out;
  }

  /** The four quarters public at `asOf`, for trailing-twelve-month figures and
   *  for persistence tests (ROIC, margin stability, revenue durability). */
  async historyAsOf(symbol: string, asOf: string, quarters = 12): Promise<PitFacts[]> {
    const rows = await this.q<any[]>(
      `SELECT DISTINCT ON (period_end) symbol, to_char(period_end,'YYYY-MM-DD') AS period_end,
              to_char(knowable_from,'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS knowable_from, fiscal_year, period,
              revenue, gross_profit, operating_income, ebit, net_income, interest_expense,
              total_assets, total_debt, total_liabilities, cash, net_debt,
              total_current_assets, total_current_liabilities, total_equity,
              operating_cash_flow, capex, free_cash_flow, current_ratio, interest_coverage, gross_margin
       FROM pit_fundamentals
       WHERE symbol = $1 AND knowable_from <= $2::timestamptz
       ORDER BY period_end DESC, knowable_from DESC
       LIMIT $3`,
      [symbol.toUpperCase(), asOf, quarters],
    );
    return rows.map((r) => ({
      symbol: r.symbol, periodEnd: r.period_end, fiscalYear: r.fiscal_year, period: r.period,
      knowableFrom: r.knowable_from, revenue: r.revenue, grossProfit: r.gross_profit,
      operatingIncome: r.operating_income, ebit: r.ebit, netIncome: r.net_income,
      interestExpense: r.interest_expense, totalAssets: r.total_assets, totalDebt: r.total_debt,
      totalLiabilities: r.total_liabilities, cash: r.cash, netDebt: r.net_debt,
      totalCurrentAssets: r.total_current_assets, totalCurrentLiabilities: r.total_current_liabilities,
      totalEquity: r.total_equity, operatingCashFlow: r.operating_cash_flow, capex: r.capex,
      freeCashFlow: r.free_cash_flow, currentRatio: r.current_ratio,
      interestCoverage: r.interest_coverage, grossMargin: r.gross_margin,
    }));
  }

  // ── Prices with volume (tradability + liquidity caps) ────────────────

  /** Daily closes AND volume, stored per symbol as a compact array so the
   *  table stays small: [epochMs, close, volume]. */
  async ingestPrices(symbol: string, from = '2006-01-01'): Promise<number> {
    const sym = symbol.toUpperCase();
    const bars = await this.fmp.getEodBars(sym, { from, adjusted: true, noCache: true });
    if (!bars.length) return 0;
    const points = bars.map((b) => [b.t, b.close, b.volume || 0]);
    await this.q(
      `INSERT INTO pit_price_series (symbol, points, first_date, last_date, updated_at)
       VALUES ($1, $2::jsonb, $3::date, $4::date, now())
       ON CONFLICT (symbol) DO UPDATE SET points = EXCLUDED.points, first_date = EXCLUDED.first_date,
         last_date = EXCLUDED.last_date, updated_at = now()`,
      [sym, JSON.stringify(points), bars[0].date, bars[bars.length - 1].date],
    );
    return points.length;
  }

  async priceSeries(symbol: string): Promise<Array<[number, number, number]> | null> {
    const rows = await this.q<Array<{ points: Array<[number, number, number]> }>>(
      `SELECT points FROM pit_price_series WHERE symbol = $1`,
      [symbol.toUpperCase()],
    );
    return rows[0]?.points || null;
  }

  /** Close and average daily dollar volume as of a date — the tradability
   *  gate and the liquidity cap both read this. */
  static tradabilityAt(points: Array<[number, number, number]>, asOfMs: number, window = 60): { close: number; advDollars: number } | null {
    let end = -1;
    for (let i = 0; i < points.length; i++) {
      if (points[i][0] <= asOfMs) end = i;
      else break;
    }
    if (end < 0) return null;
    const start = Math.max(0, end - window + 1);
    let sum = 0;
    let n = 0;
    for (let i = start; i <= end; i++) {
      const [, c, v] = points[i];
      if (c > 0 && v > 0) {
        sum += c * v;
        n++;
      }
    }
    return { close: points[end][1], advDollars: n ? sum / n : 0 };
  }

  async status(): Promise<any> {
    await this.ensureTables();
    const [sec] = await this.q<any[]>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE active)::int AS active,
              count(*) FILTER (WHERE delisted_on IS NOT NULL)::int AS delisted FROM pit_securities`,
    );
    const [fun] = await this.q<any[]>(
      `SELECT count(*)::int AS rows, count(DISTINCT symbol)::int AS symbols,
              to_char(min(period_end),'YYYY-MM-DD') AS first_period,
              to_char(max(period_end),'YYYY-MM-DD') AS last_period,
              count(*) FILTER (WHERE knowable_from > period_end + interval '120 days')::int AS late_filings
       FROM pit_fundamentals`,
    );
    const [px] = await this.q<any[]>(
      `SELECT count(*)::int AS symbols, to_char(min(first_date),'YYYY-MM-DD') AS first_date FROM pit_price_series`,
    );
    return { securities: sec, fundamentals: fun, prices: px };
  }
}
