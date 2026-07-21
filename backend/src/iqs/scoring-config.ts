/**
 * Insider Quality ("IQ") Score v2 — scoring configuration.
 *
 * All weights, windows, role multipliers and normalization knobs live here so
 * product can tune the model WITHOUT a code change to the engine. The final IQ
 * Score is a 0–100 weighted composite of five components; each component is
 * independently normalized to 0–100 before weighting (see IQ Score v2 spec).
 *
 *   IQ = 0.50·Buying + 0.25·Sector + 0.10·MD&A + 0.10·Momentum + 0.05·Dilution
 *
 * A startup assertion (bottom of this file) guarantees the component weights
 * sum to 1.0 so a mis-edit fails fast rather than silently skewing every score.
 */

import type { InsiderRole } from '../entities/insider-transaction.entity';

/** Which score version drives the site. v2 is the composite defined here. */
export const SCORE_VERSION: 'v1' | 'v2' = 'v2';

/** No stock ever gets a perfect score — every 0–100 scale caps at 99. */
export const SCORE_CEILING = 99;

/** Top-level component weights. MUST sum to 1.0 (asserted below). */
export const COMPONENT_WEIGHTS = {
  buying: 0.5,
  sector: 0.25,
  mda: 0.1,
  momentum: 0.1,
  dilution: 0.05,
} as const;

/** Insider-Buying sub-factor weights (relative; renormalized over whichever
 *  sub-factors have data for a given company). */
export const BUYING_SUBWEIGHTS = {
  volumeVsMarketCap: 0.25, // A
  cluster: 0.2, // B
  role: 0.2, // C
  holdingChange: 0.1, // D (absolute commitment)
  priceVsBuys: 0.15, // E (NEW) avg insider buy price vs current price
  ownershipPctIncrease: 0.1, // F (NEW) relative stake growth
} as const;

/** Role multipliers — applied to each transaction's contribution to the
 *  role-weighted sub-factors (A, C, E, F). Config-driven per spec §2C. */
export const ROLE_MULTIPLIER: Record<InsiderRole, number> = {
  CEO: 1.0,
  CFO: 1.0,
  COO: 1.0,
  Director: 0.6,
  Other: 0.4,
};

/** Lookback windows (days) — spec §10. */
export const WINDOWS = {
  buys: 90, // purchase volume + VWAP window
  cluster: 45, // distinct-buyer window
  momentumShort: 20, // rel-volume numerator
  momentumLong: 90, // rel-volume denominator
  seasoned: 14, // "seasoned" buy age for historical-success
} as const;

/** Normalization knobs (clamps / scales) — spec §2E, §2F, §5, §6. */
export const NORM = {
  // A — purchase value / market cap, log-scaled. ~2% of cap ≈ strong.
  volumeVsMarketCapDivisor: 0.02,
  // C — role-weighted value / market cap.
  roleDivisor: 0.06,
  // E — insider VWAP / current price, clamped then min-max to 0–100.
  //     >1 (stock below insider cost basis) = bullish end (OQ#1 default).
  priceRatioClamp: [0.5, 2.0] as [number, number],
  // F — ownership % increase, clamped at 100% (doubling) → 100.
  ownershipPctCap: 1.0,
  // Momentum — rel dollar volume clamped then log min-max to 0–100.
  momentumClamp: [0.25, 4.0] as [number, number],
  // Momentum neutral floor when the stock is too illiquid to trust.
  momentumMinDollarVolume: 50_000,
  // Dilution — piecewise TTM share-growth → score (spec §6).
  dilution: {
    // [maxDilutionPct, scoreAtThatPoint] knees; linear between.
    knees: [
      [0.0, 100],
      [0.05, 75],
      [0.15, 30],
      [0.4, 0],
    ] as Array<[number, number]>,
  },
} as const;

/** Neutral score for a component that has no data — never zero (which would
 *  unfairly punish quiet small-caps). Spec §8. */
export const NEUTRAL = 50;

/** 10b5-1 planned-purchase conviction discount (spec §8). Applied to a
 *  transaction's contribution when flagged as a scheduled buy. */
export const PLANNED_BUY_MULTIPLIER = 0.5;

// ── Startup assertion: component weights must sum to 1.0 ──────────────────
const _weightSum = Object.values(COMPONENT_WEIGHTS).reduce((a, b) => a + b, 0);
if (Math.abs(_weightSum - 1) > 1e-9) {
  throw new Error(
    `[scoring-config] COMPONENT_WEIGHTS must sum to 1.0 (got ${_weightSum}). ` +
      `Fix the weights before boot.`,
  );
}

export type ComponentKey = keyof typeof COMPONENT_WEIGHTS;
