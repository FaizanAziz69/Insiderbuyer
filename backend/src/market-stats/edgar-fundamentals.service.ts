import { Injectable, Logger } from '@nestjs/common';
import axios, { AxiosInstance } from 'axios';
import * as https from 'https';

/**
 * Quarterly statements built straight from a company's own XBRL filings.
 *
 * The last fallback under FMP and Yahoo, for the case George described on
 * 2026-09-14: "The company may not have a quarterly financial statement, but
 * they certainly filed their financials with the exchange." They did — SEC
 * publishes every number in every 10-Q and 10-K as structured XBRL at
 * data.sec.gov/api/xbrl/companyfacts, free and keyless. A commercial vendor
 * simply has not ingested the filer yet, which is routine for a company that
 * listed weeks ago.
 *
 * Verified against a filer both sources carry: Midera Food Processing's
 * quarter ended 2026-07-04 reads $245.4M revenue here and $245.4M from FMP.
 *
 * Two shapes of fact, and they must not be mixed:
 *  • DURATION facts (revenue, net income, cash flow) carry start+end. A
 *    quarter is a period of roughly 90 days — anything longer is a half-year
 *    or full-year cumulative that would read as a huge quarter if taken at
 *    face value, which is the classic way XBRL is misread.
 *  • INSTANT facts (assets, equity, cash) carry only end.
 * A company restating a period files the same end date twice, so the most
 * recently FILED value wins.
 */

const UA =
  process.env.SEC_USER_AGENT || 'InsiderBuying contact@insiderbuying.com';

/** Quarter length in days, with room for 13-week retail calendars. */
const Q_MIN_DAYS = 80;
const Q_MAX_DAYS = 100;
const FORMS = new Set(['10-Q', '10-K', '20-F', '40-F']);

interface Fact {
  start?: string;
  end: string;
  val: number;
  form?: string;
  filed?: string;
}

/** Our row keys → the us-gaap concepts that carry them, best first. */
const INCOME: Record<string, string[]> = {
  TotalRevenue: [
    'RevenueFromContractWithCustomerExcludingAssessedTax',
    'RevenueFromContractWithCustomerIncludingAssessedTax',
    'Revenues',
    'SalesRevenueNet',
  ],
  CostOfRevenue: ['CostOfRevenue', 'CostOfGoodsAndServicesSold', 'CostOfGoodsSold'],
  GrossProfit: ['GrossProfit'],
  SellingGeneralAndAdministration: [
    'SellingGeneralAndAdministrativeExpense',
    'GeneralAndAdministrativeExpense',
  ],
  ResearchAndDevelopment: ['ResearchAndDevelopmentExpense'],
  OperatingExpense: ['OperatingExpenses', 'CostsAndExpenses'],
  OperatingIncome: ['OperatingIncomeLoss'],
  PretaxIncome: [
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesExtraordinaryItemsNoncontrollingInterest',
    'IncomeLossFromContinuingOperationsBeforeIncomeTaxesMinorityInterestAndIncomeLossFromEquityMethodInvestments',
  ],
  TaxProvision: ['IncomeTaxExpenseBenefit'],
  NetIncome: ['NetIncomeLoss', 'ProfitLoss'],
  BasicEPS: ['EarningsPerShareBasic'],
  DilutedEPS: ['EarningsPerShareDiluted'],
  BasicAverageShares: ['WeightedAverageNumberOfSharesOutstandingBasic'],
  DilutedAverageShares: ['WeightedAverageNumberOfDilutedSharesOutstanding'],
};

const BALANCE: Record<string, string[]> = {
  TotalAssets: ['Assets'],
  CurrentAssets: ['AssetsCurrent'],
  CashAndCashEquivalents: [
    'CashAndCashEquivalentsAtCarryingValue',
    'CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents',
    'Cash',
  ],
  TotalLiabilitiesNetMinorityInterest: ['Liabilities'],
  CurrentLiabilities: ['LiabilitiesCurrent'],
  TotalDebt: ['DebtLongtermAndShorttermCombinedAmount'],
  LongTermDebt: ['LongTermDebtNoncurrent', 'LongTermDebt'],
  StockholdersEquity: [
    'StockholdersEquity',
    'StockholdersEquityIncludingPortionAttributableToNoncontrollingInterest',
  ],
  RetainedEarnings: ['RetainedEarningsAccumulatedDeficit'],
};

const CASHFLOW: Record<string, string[]> = {
  OperatingCashFlow: ['NetCashProvidedByUsedInOperatingActivities'],
  CapitalExpenditure: [
    'PaymentsToAcquirePropertyPlantAndEquipment',
    'PaymentsToAcquireProductiveAssets',
  ],
  InvestingCashFlow: ['NetCashProvidedByUsedInInvestingActivities'],
  FinancingCashFlow: ['NetCashProvidedByUsedInFinancingActivities'],
  RepurchaseOfCapitalStock: ['PaymentsForRepurchaseOfCommonStock'],
};

function dayspan(start: string, end: string): number {
  return Math.round(
    (Date.parse(end) - Date.parse(start)) / 86_400_000,
  );
}

@Injectable()
export class EdgarFundamentalsService {
  private readonly logger = new Logger(EdgarFundamentalsService.name);
  private readonly http: AxiosInstance;
  private readonly cache = new Map<string, { ts: number; data: any }>();
  private readonly TTL_MS = 6 * 60 * 60 * 1000;

  constructor() {
    this.http = axios.create({
      timeout: 20_000,
      httpsAgent: new https.Agent({ family: 4, keepAlive: true }),
      headers: { 'User-Agent': UA, 'Accept-Encoding': 'gzip, deflate' },
    });
  }

  /**
   * One value per period end, merged across the listed concepts.
   *
   * Merged, not first-wins: a filer may change concept mid-history and the
   * old one keeps its rows forever. NVIDIA reported under
   * RevenueFromContractWithCustomerExcludingAssessedTax through FY2022 and
   * under Revenues after it, so taking the first concept with any data at all
   * returned a series that stopped in 2022 and left every recent quarter null.
   * Earlier concepts in the list still win for dates they both cover.
   */
  private series(
    facts: Record<string, any>,
    concepts: string[],
    kind: 'duration' | 'instant',
  ): Map<string, { val: number; days: number }> {
    const out = new Map<string, { val: number; filed: string; days: number }>();
    for (const concept of concepts) {
      const node = facts[concept];
      if (!node?.units) continue;
      const raw: Fact[] = [];
      for (const vals of Object.values(node.units) as Fact[][]) {
        for (const f of vals) {
          if (!f?.end || !Number.isFinite(Number(f.val))) continue;
          if (!FORMS.has(String(f.form || ''))) continue;
          if (kind === 'duration' ? !f.start : !!f.start) continue;
          raw.push(f);
        }
      }
      const picked =
        kind === 'instant' ? this.pickInstant(raw) : this.pickQuarters(raw);
      for (const [end, entry] of picked) {
        const prev = out.get(end);
        // First concept in the list wins the date; within one concept the
        // most recently filed value wins, so a restatement supersedes.
        if (!prev) out.set(end, entry);
      }
    }
    return new Map([...out].map(([k, v]) => [k, { val: v.val, days: v.days }]));
  }

  private pickInstant(raw: Fact[]): Map<string, { val: number; filed: string; days: number }> {
    const out = new Map<string, { val: number; filed: string; days: number }>();
    for (const f of raw) {
      const filed = String(f.filed || '');
      const prev = out.get(f.end);
      if (!prev || filed > prev.filed) out.set(f.end, { val: Number(f.val), filed, days: 0 });
    }
    return out;
  }

  /**
   * Quarterly values out of duration facts.
   *
   * A 10-Q reports the income statement for the quarter but the CASH FLOW
   * statement year-to-date, so Q2's operating cash flow is filed as a ~180-day
   * period and Q3's as ~270. Taking spans at face value dropped every cash
   * flow row after Q1 (NVIDIA's newest was three months stale) and, for any
   * concept where a cumulative slipped through, would have read a half-year as
   * one enormous quarter.
   *
   * So: a fact that already covers ~90 days is used as filed. Otherwise the
   * cumulative runs are grouped by their shared start date and differenced —
   * Q2 = YTD(Q2) − YTD(Q1) — which is how the filer's own quarter is recovered.
   */
  private pickQuarters(raw: Fact[]): Map<string, { val: number; filed: string; days: number }> {
    const out = new Map<string, { val: number; filed: string; days: number }>();

    // As-filed quarters always win.
    for (const f of raw) {
      const n = dayspan(f.start as string, f.end);
      if (n < Q_MIN_DAYS || n > Q_MAX_DAYS) continue;
      const filed = String(f.filed || '');
      const prev = out.get(f.end);
      if (!prev || filed > prev.filed) out.set(f.end, { val: Number(f.val), filed, days: n });
    }

    // Everything sharing a period START is one fiscal year's run of
    // cumulatives: Q1 (~90d), H1 (~180d), 9M (~270d), FY (~365d). Difference
    // consecutive entries to recover each quarter. Grouping ALL spans — not
    // just the long ones — matters because the run's first entry is usually
    // the as-filed Q1, and without it H1 has nothing to subtract.
    const runs = new Map<string, Map<string, Fact>>();
    for (const f of raw) {
      const n = dayspan(f.start as string, f.end);
      if (n < Q_MIN_DAYS || n > 400) continue;
      const start = f.start as string;
      const byEnd = runs.get(start) || new Map<string, Fact>();
      const prev = byEnd.get(f.end);
      if (!prev || String(f.filed || '') > String(prev.filed || '')) byEnd.set(f.end, f);
      runs.set(start, byEnd);
    }

    for (const byEnd of runs.values()) {
      const ends = [...byEnd.keys()].sort();
      for (let i = 1; i < ends.length; i++) {
        const end = ends[i];
        if (out.has(end)) continue;
        const gap = dayspan(ends[i - 1], end);
        // Consecutive periods only — a gap in the run must never become a
        // six-month "quarter".
        if (gap < Q_MIN_DAYS || gap > Q_MAX_DAYS) continue;
        const cur = byEnd.get(end)!;
        const prev = byEnd.get(ends[i - 1])!;
        out.set(end, {
          val: Number(cur.val) - Number(prev.val),
          filed: String(cur.filed || ''),
          days: gap,
        });
      }
    }

    // Last resort: a period end that no quarter could be built for, but which
    // a CUMULATIVE fact ends on. A newly-listed company's first 10-Q often
    // reports cash flow for the year to date and never for the quarter —
    // Midera Food Processing's only filing covers the 26 weeks to 2026-07-04
    // and there is no quarterly figure in existence, at SEC or at any vendor.
    // Carrying it with its true length is better than showing nothing; the
    // length travels with the row so the table can say what period it is and
    // nobody mistakes a half year for a quarter.
    for (const f of raw) {
      if (out.has(f.end)) continue;
      const n = dayspan(f.start as string, f.end);
      if (n <= Q_MAX_DAYS || n > 400) continue;
      const filed = String(f.filed || '');
      const prev = out.get(f.end);
      if (!prev || filed > prev.filed) out.set(f.end, { val: Number(f.val), filed, days: n });
    }

    return out;
  }

  private rows(
    facts: Record<string, any>,
    map: Record<string, string[]>,
    kind: 'duration' | 'instant',
    extra?: (values: Record<string, number | null>) => void,
  ): Array<{ date: string; values: Record<string, number | null>; periodDays?: number }> {
    const byField = new Map<string, Map<string, { val: number; days: number }>>();
    const dates = new Set<string>();
    for (const [field, concepts] of Object.entries(map)) {
      const s = this.series(facts, concepts, kind);
      byField.set(field, s);
      for (const d of s.keys()) dates.add(d);
    }
    return [...dates]
      .sort()
      .reverse()
      .slice(0, 13)
      .map((date) => {
        const values: Record<string, number | null> = {};
        let periodDays = 0;
        for (const field of Object.keys(map)) {
          const v = byField.get(field)?.get(date);
          values[field] = v == null ? null : v.val;
          if (v && v.days > periodDays) periodDays = v.days;
        }
        extra?.(values);
        return periodDays > 0 ? { date, values, periodDays } : { date, values };
      });
  }

  /**
   * Quarterly statements for a CIK, in the same row shape the Financials tab
   * already renders. Null when SEC has no usable facts — a company that has
   * only filed an S-1 genuinely has no quarterly statement yet, and saying so
   * is the honest answer.
   */
  async quarterlyStatements(cikRaw: string, symbol: string): Promise<any | null> {
    const cik = String(cikRaw || '').replace(/\D/g, '').padStart(10, '0');
    if (!cik || cik === '0000000000') return null;
    const hit = this.cache.get(cik);
    if (hit && Date.now() - hit.ts < this.TTL_MS) {
      return hit.data ? { ...hit.data, symbol } : null;
    }

    let facts: Record<string, any>;
    try {
      const { data } = await this.http.get(
        `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`,
      );
      facts = data?.facts?.['us-gaap'] || {};
    } catch (err: any) {
      // 404 is normal: a filer with no XBRL yet.
      if (err?.response?.status !== 404) {
        this.logger.warn(`EDGAR facts failed for CIK ${cik}: ${err?.message || err}`);
      }
      this.cache.set(cik, { ts: Date.now(), data: null });
      return null;
    }
    if (!Object.keys(facts).length) {
      this.cache.set(cik, { ts: Date.now(), data: null });
      return null;
    }

    const income = this.rows(facts, INCOME, 'duration');
    const balance = this.rows(facts, BALANCE, 'instant');
    const cashflow = this.rows(facts, CASHFLOW, 'duration', (v) => {
      // FMP ships free cash flow as a column; XBRL does not, so derive it the
      // way every filer defines it. Capex is filed as a positive outflow.
      // NULL when capex is missing rather than treating it as zero — that
      // would publish free cash flow equal to operating cash flow, which is
      // wrong for every company that owns anything.
      const ocf = v.OperatingCashFlow;
      const capex = v.CapitalExpenditure;
      v.FreeCashFlow = ocf == null || capex == null ? null : ocf - Math.abs(capex);
      // XBRL files payments as POSITIVE outflows; the vendor rows this table
      // is otherwise built from sign them negative. Left as filed, a single
      // SEC-sourced column showed capex of +6.6M beside the vendor's -3.4M for
      // the quarter before it, which reads as a company that sold plant.
      for (const key of ['CapitalExpenditure', 'RepurchaseOfCapitalStock']) {
        const x = v[key];
        if (x != null && x > 0) v[key] = -x;
      }
      v.EndCashPosition = null;
    });

    if (!income.length && !balance.length && !cashflow.length) {
      this.cache.set(cik, { ts: Date.now(), data: null });
      return null;
    }

    const data = { income, balance, cashflow, source: 'sec-xbrl' as const };
    this.cache.set(cik, { ts: Date.now(), data });
    this.logger.log(
      `EDGAR XBRL served ${symbol} (CIK ${cik}): ${income.length} income / ${balance.length} balance / ${cashflow.length} cashflow quarters`,
    );
    return { ...data, symbol };
  }
}
