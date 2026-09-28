import type { Pick, SelectorContext, StrategyDef } from './strategy-types';

const DAY = 86_400_000;
const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Brief v8 §3, strategies 1, 2 and 5 — the congressional datasets.
 *
 * These are the only strategies in the library with a REAL disclosure date.
 * `congressional_transactions.reportedDate` is the day the PTR was filed, so
 * §6's "a congress strategy cannot trade before the PTR filing date" is
 * enforced against the filing itself rather than against a modelled lag. Every
 * query below filters on reportedDate, never on transactionDate.
 */

/** PTR bands are ranges; §5.2 requires that to be said wherever they are used. */
const PTR_LIMITS = [
  'PTR amounts are disclosure BANDS, not amounts. Every dollar figure here is a band midpoint and is labelled as an estimate.',
  'Members have up to 45 days to file. The strategy can only hold a name from its filing date, so a trade made in March may not enter until May — which is exactly what a reader could have done.',
  'Filings name the account (self, spouse, joint) but carry no marker for a blind trust or a third-party manager, so those cannot be weighted differently.',
];

async function disclosedBuys(
  ctx: SelectorContext,
  asOfMs: number,
  windowDays: number,
): Promise<Array<{ ticker: string; member: string; mid: number; reported: string }>> {
  const rows: Array<{ ticker: string; member: string; mid: string; reported: string }> = await ctx.q(
    `SELECT upper(t.ticker) AS ticker,
            t."politicianName" AS member,
            ((COALESCE(t."amountMin",0) + COALESCE(t."amountMax", t."amountMin", 0)) / 2.0)::text AS mid,
            t."reportedDate"::text AS reported
       FROM congressional_transactions t
      WHERE t.action = 'Buy'
        AND t."reportedDate" IS NOT NULL
        AND t."reportedDate" <= $1::date
        AND t."reportedDate" >= ($1::date - $2::int)
        AND t.ticker <> ''
        AND COALESCE(t."assetType",'Stock') NOT IN ('ETF','Mutual Fund','Corporate Bond','Government Securities','Stock Option','Cryptocurrency','Non-Public Stock')`,
    [ymd(asOfMs), windowDays],
  );
  return rows.map((r) => ({ ...r, mid: Number(r.mid) || 0 }));
}

/** 1. Congress Buys — weighted by estimated purchase size, weekly. */
export const CONGRESS_BUYS: StrategyDef = {
  slug: 'congress-buys',
  name: 'Congress Buys',
  dataset: 'Congress',
  version: '1.0.0',
  rebalanceDays: 7,
  disclosureLagDays: 0, // the filing date IS the entry date; no model needed
  rulesPlain:
    'Hold every stock a member of Congress has disclosed buying in the last 90 days, weighted by the estimated size of those purchases. A stock enters the week its filing appears, not the week the trade happened. Rebalanced weekly.',
  params: { lookbackDays: 90, maxNames: 40, weighting: 'estimated-purchase-size' },
  limitations: PTR_LIMITS,
  async select(ctx, asOfMs) {
    const rows = await disclosedBuys(ctx, asOfMs, 90);
    const byTicker = new Map<string, { size: number; members: Set<string> }>();
    for (const r of rows) {
      if (!r.ticker) continue;
      const e = byTicker.get(r.ticker) || { size: 0, members: new Set<string>() };
      e.size += r.mid;
      e.members.add(r.member);
      byTicker.set(r.ticker, e);
    }
    return [...byTicker.entries()]
      .filter(([, v]) => v.size > 0)
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 40)
      .map(([ticker, v]): Pick => ({
        ticker,
        weight: v.size,
        trigger: `${v.members.size} member${v.members.size === 1 ? '' : 's'} disclosed roughly $${Math.round(v.size).toLocaleString()} of buying`,
      }));
  },
};

/** 2. Congress Top Performers Mirror — A-graded members' disclosed holdings. */
export const CONGRESS_MIRROR: StrategyDef = {
  slug: 'congress-top-performers-mirror',
  name: 'Congress Top Performers Mirror',
  dataset: 'Congress',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: 0,
  rulesPlain:
    'Hold, equally weighted, the stocks currently disclosed as bought by the members who carry an A or A+ Performance Grade. Grades come from the reconstruction engine behind the politician leaderboard. Rebalanced monthly.',
  params: { minGrade: 'A', lookbackDays: 365, weighting: 'equal', maxNames: 30 },
  limitations: [
    ...PTR_LIMITS,
    'Member grades are read as they stand TODAY, not as they stood on each historical date — the grade table stores current state only. A member who earned an A recently is treated as having had it throughout, which flatters this strategy and cannot be corrected without a stored grade history.',
  ],
  async select(ctx, asOfMs) {
    const rows = await disclosedBuys(ctx, asOfMs, 365);
    const byTicker = new Map<string, Set<string>>();
    for (const r of rows) {
      const grade = ctx.memberGrades.get(r.member.trim().toLowerCase());
      if (!grade || !/^A/.test(grade)) continue;
      const set = byTicker.get(r.ticker) || new Set<string>();
      set.add(r.member);
      byTicker.set(r.ticker, set);
    }
    return [...byTicker.entries()]
      .sort((a, b) => b[1].size - a[1].size)
      .slice(0, 30)
      .map(([ticker, members]): Pick => ({
        ticker,
        weight: 1,
        trigger: `Held by ${[...members].slice(0, 3).join(', ')}${members.size > 3 ? ` +${members.size - 3}` : ''} (A-graded)`,
      }));
  },
};

/** 5. Capitol Alignment — committee influence × contract alignment (Brief v5). */
export const CAPITOL_ALIGNMENT: StrategyDef = {
  slug: 'capitol-alignment',
  name: 'Capitol Alignment',
  dataset: 'Congress',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: 0,
  rulesPlain:
    'Hold the stocks with the highest Congress Trade Scores — a buying member sits on a committee with jurisdiction over an agency that awarded the company federal work. Ranked by score, top 15, equally weighted. Rebalanced monthly.',
  params: { topN: 15, weighting: 'equal', minScore: 0 },
  limitations: [
    ...PTR_LIMITS,
    'This strategy depends on verified committee-to-contract intersections, and there are very few of them: the flag table holds single digits. A strategy that can only ever hold a handful of names is reported as thin rather than presented as a diversified portfolio.',
  ],
  async select(ctx, asOfMs) {
    const rows: Array<{ ticker: string; score: string; member: string; committee: string }> = await ctx
      .q(
        // `created_at` is when the flag entered our table — the earliest date
        // it could have been acted on. An earlier cut named a `flagged_at`
        // column that does not exist, the query threw, and the catch turned it
        // into an empty result: a strategy that looked like it found nothing
        // rather than one that could not run.
        `SELECT upper(ticker) AS ticker, score::text AS score, member, committee
           FROM ct_flags
          WHERE status = 'verified' AND ticker IS NOT NULL AND ticker <> ''
            AND COALESCE(verified_at, created_at) <= $1::timestamptz
          ORDER BY score DESC NULLS LAST LIMIT 15`,
        [ymd(asOfMs)],
      )
      .catch((e: any) => {
        throw new Error(`capitol-alignment selector: ${e?.message || e}`);
      });
    return rows.map((r): Pick => ({
      ticker: r.ticker,
      weight: 1,
      trigger: `${r.member} — ${r.committee} (CTS ${Number(r.score).toFixed(0)})`,
    }));
  },
};

/** 4. Contract Winners — largest new federal award relative to revenue. */
export const CONTRACT_WINNERS: StrategyDef = {
  slug: 'contract-winners',
  name: 'Contract Winners',
  dataset: 'Contracts',
  version: '1.0.0',
  rebalanceDays: 30,
  disclosureLagDays: 0, // USAspending publishes on the action date
  rulesPlain:
    'Hold the 15 companies whose new federal awards in the last quarter are largest relative to their own revenue, equally weighted. A $50m award means more to a $200m company than to a $200bn one. Rebalanced monthly.',
  params: { lookbackDays: 90, topN: 15, weighting: 'equal', minAwardUsd: 1_000_000 },
  limitations: [
    'Awards are matched to listed companies by recipient name, and a recipient that files under several registrations is summed across them. A subsidiary awarded work under a name we cannot resolve is simply absent.',
    'Award value is the obligated amount on the action date, not the full contract ceiling.',
    'Revenue comes from the most recent filed quarter available on the date in question, so a company with stale filings is compared on stale revenue.',
  ],
  async select(ctx, asOfMs) {
    const rows: Array<{ ticker: string; total: string; n: string }> = await ctx
      .q(
        `WITH won AS (
           SELECT upper(m.ticker) AS ticker, SUM(a.amount) AS total, COUNT(*) AS n
             FROM ct_awards a
             JOIN gov_contractor_map m ON m.uei = a.recipient_uei
            WHERE a.action_date <= $1::date
              AND a.action_date >= ($1::date - $2::int)
              AND a.amount >= $3
              AND m.ticker IS NOT NULL AND m.ticker <> ''
            GROUP BY 1
         )
         SELECT ticker, total::text AS total, n::text AS n FROM won`,
        [ymd(asOfMs), 90, 1_000_000],
      )
      .catch((e: any) => {
        // Swallowing this is how three schema mistakes reached production
        // looking like empty datasets. The engine records a selector failure
        // as a run note, which is a visible answer; [] is a silent wrong one.
        throw new Error(`selector query failed: ${e?.message || e}`);
      });
    if (!rows.length) return [];
    // Materiality = award ÷ revenue, revenue as of the date (never later).
    const revRows: Array<{ symbol: string; revenue: string }> = await ctx
      .q(
        `SELECT DISTINCT ON (symbol) upper(symbol) AS symbol, revenue::text AS revenue
           FROM pit_fundamentals
          WHERE knowable_from <= $1::date AND revenue > 0
          ORDER BY symbol, knowable_from DESC`,
        [ymd(asOfMs)],
      )
      .catch((e: any) => {
        // Swallowing this is how three schema mistakes reached production
        // looking like empty datasets. The engine records a selector failure
        // as a run note, which is a visible answer; [] is a silent wrong one.
        throw new Error(`selector query failed: ${e?.message || e}`);
      });
    const rev = new Map<string, number>();
    for (const r of revRows) rev.set(r.symbol, Number(r.revenue) || 0);
    return rows
      .map((r) => {
        const total = Number(r.total) || 0;
        const revenue = rev.get(r.ticker) || 0;
        // No revenue on file is not a ratio of infinity — it is unknown, and an
        // unknown must not outrank a measured one.
        const ratio = revenue > 0 ? total / revenue : null;
        return { ticker: r.ticker, total, ratio, n: Number(r.n) || 0 };
      })
      .filter((r) => r.ratio != null)
      .sort((a, b) => (b.ratio as number) - (a.ratio as number))
      .slice(0, 15)
      .map((r): Pick => ({
        ticker: r.ticker,
        weight: 1,
        trigger: `$${(r.total / 1e6).toFixed(1)}m in new awards — ${((r.ratio as number) * 100).toFixed(1)}% of revenue`,
      }));
  },
};

export const CONGRESS_STRATEGIES = [
  CONGRESS_BUYS,
  CONGRESS_MIRROR,
  CAPITOL_ALIGNMENT,
  CONTRACT_WINNERS,
];
export { DAY, ymd };
