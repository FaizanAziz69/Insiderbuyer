/**
 * IQS 2.0 configuration — Developer Project Brief "IQS 2.0 — Insider Score
 * Rebuild" (George, 2026-09-01).
 *
 * The brief is explicit that Workstream B/C weights are "the starting point
 * and are re-fit in Workstream D; treat them as config, not constants", and
 * that "no weight ships until validated" by the backtest. Everything tunable
 * therefore lives here, in one object, so a re-fit is a config change and the
 * walk-forward run can store a weight vector per year.
 */

/** Trade Score component weights (Workstream B). Must total 100. */
export interface TradeWeights {
  conviction: number;
  trackRecord: number;
  seniority: number;
  opportunistic: number;
  contrarian: number;
  valuationSize: number;
  ownership: number;
}

/** Launch default: Conviction 35 / Track record 10 (brief §Workstream B). */
export const WEIGHTS_LAUNCH: TradeWeights = {
  conviction: 35,
  trackRecord: 10,
  seniority: 15,
  opportunistic: 15,
  contrarian: 10,
  valuationSize: 10,
  ownership: 5,
};

/**
 * The alternate configuration the brief requires be backtested side by side
 * (Workstream D): Conviction 25 / Track record 20. The remaining components
 * are unchanged, so the vector still totals 100.
 */
export const WEIGHTS_ALTERNATE: TradeWeights = {
  ...WEIGHTS_LAUNCH,
  conviction: 25,
  trackRecord: 20,
};

export const IQS2_CONFIG = {
  /** Roll-up window and decay (Workstream C). */
  windowDays: 90,
  decayHalfLifeDays: 30,

  /** Cluster multiplier: 1 + step × (distinct net buyers − 1), capped. */
  clusterStep: 0.15,
  clusterCap: 1.6,

  /** Dilution penalty: TTM split-adjusted share-count growth. */
  dilutionFreeThreshold: 0.05,
  dilutionMaxThreshold: 0.25,
  dilutionMaxPenalty: 30,

  /** Litigation penalty is carried over unchanged from IQS 1.0. */
  litigationMaxPenalty: 15,

  /** Workstream A liquidity floor — below this a company is UNSCORED. */
  minPrice: 0.1,
  minMedianDollarVolume: 50_000,

  /** Days around a financing the insider participated in. */
  financingWindowDays: 14,

  /** Track record needs this many prior scored buys to leave the neutral prior. */
  trackRecordMinPriorBuys: 2,
  /** Neutral prior, out of 10, for an insider with no usable history. */
  trackRecordNeutral: 4,

  /** Published score ceiling — unchanged from IQS 1.0. */
  ceiling: 99,
} as const;
