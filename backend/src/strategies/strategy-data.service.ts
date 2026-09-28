import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import axios from 'axios';
import { Company } from '../entities/company.entity';
import { FmpService } from '../fmp/fmp.service';

/**
 * The three datasets Brief v8 needs that nothing else in the codebase stores.
 *
 * §7 makes confirming each strategy's data source a Faizan item, and this is
 * that answer in code: S&P 500 membership and executive pay come from our
 * existing market-data provider at no extra cost, and lobbying comes from the
 * Senate's own LDA API, which is free with a key we already hold.
 *
 * What none of them are is point-in-time. Membership and pay are CURRENT state
 * — the provider publishes today's index and the latest proxy, with no history
 * — so the strategies that read them say so in their limitations rather than
 * letting a reader assume a 2019 date was scored with 2019 facts. Lobbying is
 * the exception: LDA filings carry their own filed date and are stored with it.
 */
@Injectable()
export class StrategyDataService {
  private readonly log = new Logger(StrategyDataService.name);
  private readonly ldaKey = process.env.LDA_API_KEY || '';

  constructor(
    @InjectRepository(Company) private readonly companyRepo: Repository<Company>,
    private readonly fmp: FmpService,
  ) {}

  private q<T = any>(sql: string, params: any[] = []): Promise<T> {
    return this.companyRepo.query(sql, params) as Promise<T>;
  }

  async ensureTables(): Promise<void> {
    await this.q(`CREATE TABLE IF NOT EXISTS sp500_membership (
      symbol text PRIMARY KEY,
      name text,
      sector text,
      updated_at timestamptz NOT NULL DEFAULT now()
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS exec_compensation (
      symbol text NOT NULL,
      year int NOT NULL,
      name text,
      position text,
      total numeric(18,2),
      updated_at timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (symbol, year)
    )`);
    await this.q(`CREATE TABLE IF NOT EXISTS lobbying_quarterly (
      client_norm text NOT NULL,
      period_key  text NOT NULL,
      ticker      text,
      client_name text,
      amount      numeric(18,2) NOT NULL,
      -- The date the filing was lodged with the Senate. Everything downstream
      -- filters on THIS, never on the quarter it covers: a Q1 filing that
      -- arrived in May was not knowable in April.
      filed_date  date NOT NULL,
      updated_at  timestamptz NOT NULL DEFAULT now(),
      PRIMARY KEY (client_norm, period_key)
    )`);
    await this.q(`CREATE INDEX IF NOT EXISTS lobbying_quarterly_ticker_idx ON lobbying_quarterly (ticker, period_key DESC)`);
  }

  /** Current S&P 500 constituents. Free on the /stable/ endpoint we already use. */
  async refreshSp500(): Promise<number> {
    await this.ensureTables();
    const rows = await this.fmp.getSp500Constituents().catch(() => [] as any[]);
    if (!rows.length) {
      this.log.warn('S&P 500 constituent refresh returned nothing; membership left as it was.');
      return 0;
    }
    for (const r of rows) {
      const sym = String(r.symbol || '').toUpperCase().trim();
      if (!sym) continue;
      await this.q(
        `INSERT INTO sp500_membership (symbol, name, sector, updated_at)
         VALUES ($1,$2,$3, now())
         ON CONFLICT (symbol) DO UPDATE SET name = EXCLUDED.name, sector = EXCLUDED.sector, updated_at = now()`,
        [sym, r.name ?? null, r.sector ?? null],
      );
    }
    // Names that left the index are removed, so membership is today's truth
    // rather than an accumulating list of everything that was ever in it.
    await this.q(`DELETE FROM sp500_membership WHERE updated_at < now() - interval '1 day'`);
    this.log.log(`S&P 500 membership: ${rows.length} constituents.`);
    return rows.length;
  }

  /**
   * Executive pay for the symbols a strategy can actually pick from — the
   * companies with recent chief-executive buying, not all 3,500 on file. The
   * provider charges per call, and sweeping the whole universe to rank fifteen
   * names would spend the daily budget on companies no rule set will choose.
   */
  async refreshExecComp(limit = 150): Promise<{ tried: number; stored: number }> {
    await this.ensureTables();
    const rows: Array<{ ticker: string }> = await this.q(
      `SELECT DISTINCT upper(c.ticker) AS ticker
         FROM insider_transactions t
         JOIN companies c ON c.id = t.company_id
        WHERE t."transactionCode" = 'P' AND t."totalValue" > 0
          AND (t.role ILIKE '%CEO%' OR t.role ILIKE '%Chief Executive%' OR t."rawTitle" ILIKE '%Chief Executive%')
          AND t."transactionDate" >= (CURRENT_DATE - 400)
          AND c.ticker IS NOT NULL AND c.ticker <> ''
          AND NOT EXISTS (
            SELECT 1 FROM exec_compensation e
             WHERE e.symbol = upper(c.ticker) AND e.updated_at > now() - interval '90 days'
          )
        LIMIT $1`,
      [limit],
    );
    let stored = 0;
    for (const { ticker } of rows) {
      const comp = await this.fmp.getExecutiveCompensation(ticker).catch(() => []);
      for (const c of comp || []) {
        const year = Number(c.year);
        // peoTotal is the Principal Executive Officer's total — the chief
        // executive. avgNeoTotal averages the other named officers and is the
        // wrong denominator for a rule about the CEO's own conviction.
        const total = Number(c.peoTotal ?? 0);
        if (!Number.isFinite(year) || !(total > 0)) continue;
        await this.q(
          `INSERT INTO exec_compensation (symbol, year, name, position, total, updated_at)
           VALUES ($1,$2,$3,$4,$5, now())
           ON CONFLICT (symbol, year) DO UPDATE SET total = EXCLUDED.total, updated_at = now()`,
          [ticker, year, null, 'Principal Executive Officer', total],
        );
        stored++;
      }
    }
    this.log.log(`Executive pay: ${rows.length} symbols tried, ${stored} rows stored.`);
    return { tried: rows.length, stored };
  }

  /** Strip the suffixes that stop "Apple Inc." matching "APPLE INC". */
  private static normName(s: string): string {
    return String(s || '')
      .toUpperCase()
      .replace(/[^A-Z0-9 ]+/g, ' ')
      .replace(/\b(INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LLC|LP|LTD|LIMITED|PLC|HOLDINGS|HOLDING|GROUP|THE)\b/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Market-wide lobbying, one quarter at a time.
   *
   * THREE THINGS THIS API DOES THAT COST A FIRST ATTEMPT:
   *
   * The host moved. lda.senate.gov 301s to lda.gov, and while axios follows it,
   * the canonical host is used directly — a redirect on every one of nine
   * hundred pages is nine hundred wasted round trips.
   *
   * `page_size` is capped at 25 whatever you ask for, so a quarter is roughly
   * nine hundred pages, not the two hundred a page_size of 100 would suggest.
   *
   * And most filings carry no money at all: of 28,320 filings in 2026 Q1,
   * around 22,000 are Registrations, which announce a lobbying relationship
   * rather than report spending on it. Only the quarterly REPORT types carry an
   * amount, which is why this sweeps by filing type rather than filtering after
   * the fact — it is the difference between 900 pages and 1,100 of which 200
   * are useful.
   *
   * The amount itself lives in one of two fields and never both: a lobbying
   * firm reports `income` (what the client paid it) and a company lobbying
   * in-house reports `expenses`. Either way the CLIENT is the company whose
   * spend we want, so both are read and attributed to the client.
   */
  async refreshLobbying(
    year: number,
    period: string,
    opts: { maxPages?: number } = {},
  ): Promise<{ filings: number; clients: number; matched: number; pages: number; complete: boolean }> {
    await this.ensureTables();
    if (!this.ldaKey) {
      this.log.warn('LDA_API_KEY is not set; lobbying cannot be refreshed.');
      return { filings: 0, clients: 0, matched: 0, pages: 0, complete: false };
    }
    // The report types for this quarter: the report itself, its amendment, and
    // the termination filings, all of which carry a quarter's spend.
    const QUARTER_TYPES: Record<string, string[]> = {
      first_quarter: ['Q1', '1A', '1T'],
      second_quarter: ['Q2', '2A', '2T'],
      third_quarter: ['Q3', '3A', '3T'],
      fourth_quarter: ['Q4', '4A', '4T'],
    };
    const types = QUARTER_TYPES[period];
    if (!types) {
      this.log.warn(`Unknown filing period "${period}".`);
      return { filings: 0, clients: 0, matched: 0, pages: 0, complete: false };
    }

    const maxPages = opts.maxPages ?? 1200;
    const agg = new Map<string, { amount: number; name: string; filed: string }>();
    let filings = 0;
    let pages = 0;
    let complete = true;

    for (const ft of types) {
      let next: string | null =
        `https://lda.gov/api/v1/filings/?filing_year=${year}&filing_type=${ft}&page_size=25`;
      while (next && pages < maxPages) {
        const res: any = await axios
          .get(next, { headers: { Authorization: `Token ${this.ldaKey}` }, timeout: 40_000 })
          .catch((e: any) => {
            this.log.warn(`LDA page failed: ${e?.response?.status || ''} ${e?.message || e}`);
            return null;
          });
        pages++;
        if (!res?.data) break;
        for (const f of res.data.results || []) {
          // A firm reports income, an in-house department reports expenses.
          const amount = Number(f.income ?? f.expenses ?? 0) || 0;
          const client = f.client?.name || '';
          const filed = String(f.dt_posted || f.filing_date || '').slice(0, 10);
          if (!client || amount <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(filed)) continue;
          const key = StrategyDataService.normName(client);
          if (!key) continue;
          const e = agg.get(key) || { amount: 0, name: client, filed };
          e.amount += amount;
          // The quarter becomes knowable when its LAST filing lands.
          if (filed > e.filed) e.filed = filed;
          agg.set(key, e);
          filings++;
        }
        next = res.data.next || null;
      }
      if (next) complete = false;
    }

    // Match registrants to tickers by the same normalised name, and drop any
    // key that two different tickers claim — an ambiguous match is worse than
    // no match, because it silently attributes one company's spend to another.
    const companies: Array<{ ticker: string; name: string }> = await this.q(
      `SELECT upper(ticker) AS ticker, name FROM companies WHERE ticker IS NOT NULL AND ticker <> '' AND name IS NOT NULL`,
    );
    const byKey = new Map<string, string | null>();
    for (const c of companies) {
      const k = StrategyDataService.normName(c.name);
      if (!k || k.length < 4) continue;
      byKey.set(k, byKey.has(k) ? null : c.ticker);
    }

    let matched = 0;
    const periodKey = `${year}-${period}`;
    for (const [key, v] of agg) {
      const ticker = byKey.get(key) ?? null;
      if (ticker) matched++;
      await this.q(
        `INSERT INTO lobbying_quarterly (client_norm, period_key, ticker, client_name, amount, filed_date, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6::date, now())
         ON CONFLICT (client_norm, period_key) DO UPDATE SET amount = EXCLUDED.amount,
           ticker = EXCLUDED.ticker, filed_date = EXCLUDED.filed_date, updated_at = now()`,
        [key, periodKey, ticker, v.name, v.amount, v.filed],
      );
    }
    this.log.log(
      `Lobbying ${periodKey}: ${pages} pages, ${filings} filings with money, ${agg.size} registrants, ${matched} matched to a ticker${complete ? '' : ' (page cap hit)'}.`,
    );
    return { filings, clients: agg.size, matched, pages, complete };
  }
}
