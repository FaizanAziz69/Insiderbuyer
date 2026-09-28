import type { Pick, StrategyDef } from './strategy-types';

const ymd = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Brief v9 §7: "Strategy library (Brief v8): add 'Top CQS' — top 10 by CQS,
 * monthly — a test of this score in public."
 *
 * This is the item v9 could not have until v8 existed, and it is also the
 * cheapest possible test of v8's own §6 claim that "a new strategy is a config,
 * not a code path": the whole of it is below, and nothing else changed.
 *
 * WHICH CQS THIS IS, because it is not the one on the index page. The live
 * score is computed from today's committee rosters and contract flags, neither
 * of which is stored historically — using them on a 2019 date would be
 * lookahead, so the calibration walk computed a REDUCED score without C3 and
 * C4, renormalised to 100. That is what `cqs_pit_scores` holds and what this
 * strategy trades. It is 70% of the live score's weight, and a reader comparing
 * this curve to the board is comparing two related but different numbers.
 */
export const TOP_CQS: StrategyDef = {
  slug: 'top-cqs',
  name: 'Top CQS',
  dataset: 'Congress',
  version: '1.0.0',
  rebalanceDays: 30,
  // The score is built from filings already public on its as-of date, so the
  // no-lookahead rule is enforced upstream and no lag is modelled here.
  disclosureLagDays: 0,
  rulesPlain:
    'Hold the ten stocks with the highest Congress Quality Score, equally weighted, rebalanced monthly. This is our own congressional score tested in public: if it ranks stocks in an order worth acting on, that shows here, and if it does not, that shows here too.',
  params: { topN: 10, weighting: 'equal', scoreSource: 'point-in-time reduced CQS' },
  limitations: [
    'This trades the POINT-IN-TIME score, which is not identical to the score on the index page. Committee rosters and contract flags are stored as current state, so scoring a 2019 date with them would be lookahead; the historical score therefore leaves out committee influence and contract alignment and renormalises the rest. It is roughly 70% of the live score\'s weight.',
    'The scored universe is thin — around six qualifying stocks on a typical date across the whole history. A "top ten" is often simply every stock that qualified, so on many dates this is a congressional-buying portfolio rather than a ranking of one.',
    'That thinness is also why the calibration behind this score could not be validated: the brief asks for decile spread and there are not enough names on a date to form deciles. The curve below is what the ranking did, not evidence that the ranking works.',
    'PTR amounts are disclosure bands, so every dollar input to the score is a band midpoint.',
  ],
  async select(ctx, asOfMs) {
    const rows: Array<{ ticker: string; cqs: string }> = await ctx
      .q(
        // The most recent scoring date at or before this rebalance — the walk
        // scores weekly, so a monthly rebalance lands between its dates.
        `SELECT upper(ticker) AS ticker, cqs::text AS cqs
           FROM cqs_pit_scores
          WHERE as_of = (SELECT MAX(as_of) FROM cqs_pit_scores WHERE as_of <= $1::date)
          ORDER BY cqs DESC NULLS LAST
          LIMIT 10`,
        [ymd(asOfMs)],
      )
      .catch((e: any) => {
        throw new Error(`top-cqs selector: ${e?.message || e}`);
      });
    return rows.map((r): Pick => ({
      ticker: r.ticker,
      weight: 1,
      trigger: `CQS ${Number(r.cqs).toFixed(0)} on the last scoring date`,
    }));
  },
};
