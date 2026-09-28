import type { Pick, StrategyDef } from './strategy-types';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Brief v8 §3, strategies 3 and 6 — lobbying and 13F.
 *
 * Both have a REAL disclosure date. 13F holdings carry the filing date the
 * manager actually filed on, and lobbying filings carry the quarter they were
 * filed for, so §6's no-lookahead rule is enforced against documents rather
 * than against a model. This is the opposite of the Form 4 strategies, where
 * the lag has to be assumed.
 */

/** 6. Hedge Fund Consensus — most widely ADDED among the tracked roster. */
export const HEDGE_FUND_CONSENSUS: StrategyDef = {
  slug: 'hedge-fund-consensus',
  name: 'Hedge Fund Consensus',
  dataset: 'Funds',
  version: '1.0.0',
  rebalanceDays: 91,
  disclosureLagDays: 0, // the 13F filing date is stored and used directly
  rulesPlain:
    'Hold the twenty stocks most widely ADDED — newly opened or increased — across the tracked roster of investors in their most recent quarterly filings. Weighted by how many managers added them. A position only counts once its 13F is filed, not when the quarter ended. Rebalanced quarterly.',
  params: { topN: 20, weighting: 'manager-count', minManagers: 3, lookbackQuarters: 2 },
  limitations: [
    '13F is filed up to 45 days after the quarter ends and shows what was held on the quarter-end date, not what is held now. A manager can have sold a position entirely before the filing that reveals it.',
    '13F covers long United States equity positions only. Short positions, bonds, cash and non-US holdings are invisible, so a "portfolio" here is a fragment of a real one.',
    'The roster is our tracked list of investors, not the whole market, so "consensus" means consensus among the managers we follow.',
  ],
  async select(ctx, asOfMs) {
    // Two most recent periods whose filings were PUBLIC on this date.
    const periods: Array<{ period: string }> = await ctx.q(
      `SELECT DISTINCT period::text AS period
         FROM investor_holdings
        WHERE filing_date IS NOT NULL AND filing_date <= $1::date
        ORDER BY period DESC LIMIT 2`,
      [ymd(asOfMs)],
    );
    if (periods.length < 2) return [];
    const [curr, prev] = periods.map((p) => p.period);
    const rows: Array<{ ticker: string; adders: string; names: string }> = await ctx.q(
      `WITH c AS (
         SELECT slug, upper(ticker) AS ticker, SUM(shares) AS shares
           FROM investor_holdings
          WHERE period = $1::date AND filing_date <= $3::date
            -- 'Share' is how common stock is labelled here; CALL and PUT are
            -- the options legs. An earlier cut tested for an EMPTY put_call,
            -- which excluded every row in the table and produced a strategy
            -- that held nothing while looking like it simply found nothing.
            AND ticker IS NOT NULL AND ticker <> '' AND COALESCE(put_call,'Share') NOT IN ('CALL','PUT')
          GROUP BY 1,2
       ), p AS (
         SELECT slug, upper(ticker) AS ticker, SUM(shares) AS shares
           FROM investor_holdings
          WHERE period = $2::date AND ticker IS NOT NULL AND ticker <> ''
            AND COALESCE(put_call,'Share') NOT IN ('CALL','PUT')
          GROUP BY 1,2
       )
       SELECT c.ticker,
              COUNT(*)::text AS adders,
              string_agg(DISTINCT c.slug, ', ') AS names
         FROM c LEFT JOIN p ON p.slug = c.slug AND p.ticker = c.ticker
        WHERE c.shares > COALESCE(p.shares, 0)
        GROUP BY 1
       HAVING COUNT(*) >= 3
        ORDER BY 2 DESC LIMIT 20`,
      [curr, prev, ymd(asOfMs)],
    );
    return rows.map((r): Pick => ({
      ticker: r.ticker,
      weight: Number(r.adders) || 1,
      trigger: `${r.adders} tracked managers added it last quarter`,
    }));
  },
};

/** 3. Lobbying Surge — largest quarter-over-quarter rise in federal spend. */
export const LOBBYING_SURGE: StrategyDef = {
  slug: 'lobbying-surge',
  name: 'Lobbying Surge',
  dataset: 'Lobbying',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: 0, // LDA filings carry their own filing date
  rulesPlain:
    'Hold the ten companies with the largest quarter-over-quarter increase in federal lobbying spend, equally weighted. Filings are counted from the date they were filed with the Senate, not from the quarter they cover. Rebalanced monthly.',
  params: { topN: 10, weighting: 'equal', minPriorSpendUsd: 50_000, minGrowthPct: 25 },
  limitations: [
    'Lobbying filings are quarterly and land weeks after the quarter closes, so a surge is visible to everyone at the same time and this is not a fast signal.',
    'Filings are matched to listed companies by registrant name. A company lobbying through a trade association or an outside firm registered under its own name is not captured.',
    'Spend is reported in bands by some registrants and exactly by others; both are taken at face value.',
  ],
  async select(ctx, asOfMs) {
    const rows: Array<{ ticker: string; curr: string; prev: string; growth: string }> = await ctx
      .q(
        `WITH ranked AS (
           SELECT ticker, period_key, amount,
                  ROW_NUMBER() OVER (PARTITION BY ticker ORDER BY period_key DESC) AS rn
             FROM lobbying_quarterly
            WHERE filed_date <= $1::date AND ticker IS NOT NULL AND ticker <> ''
         )
         SELECT c.ticker,
                c.amount::text AS curr,
                p.amount::text AS prev,
                ((c.amount - p.amount) / NULLIF(p.amount,0) * 100)::text AS growth
           FROM ranked c JOIN ranked p ON p.ticker = c.ticker AND p.rn = 2
          WHERE c.rn = 1 AND p.amount >= $2 AND c.amount > p.amount
            AND ((c.amount - p.amount) / NULLIF(p.amount,0) * 100) >= $3
          ORDER BY ((c.amount - p.amount) / NULLIF(p.amount,0)) DESC
          LIMIT 10`,
        [ymd(asOfMs), 50_000, 25],
      )
      .catch(() => []);
    return rows.map((r): Pick => ({
      ticker: r.ticker,
      weight: 1,
      trigger: `Lobbying spend up ${Number(r.growth).toFixed(0)}% to $${(Number(r.curr) / 1000).toFixed(0)}k`,
    }));
  },
};

export const FUND_STRATEGIES = [LOBBYING_SURGE, HEDGE_FUND_CONSENSUS];
