/**
 * Insider Quality ("IQ") Score v2.1 — scoring configuration.
 *
 * All weights, windows, role multipliers and normalization knobs live here so
 * product can tune the model WITHOUT a code change to the engine. The final IQ
 * Score is a 0–100 weighted composite of SIX components followed by a
 * litigation deduction (v2.1 spec §1):
 *
 *   composite = 0.45·Buying + 0.22·Sector + 0.10·MD&A + 0.10·Momentum
 *             + 0.08·Pedigree + 0.05·Dilution
 *   IQ Score  = max(0, composite − LitigationDeduction)   // deduction 0–15
 *
 * A startup assertion (bottom of this file) guarantees the component weights
 * sum to 1.0 so a mis-edit fails fast rather than silently skewing every score.
 */

import type { InsiderRole } from '../entities/insider-transaction.entity';

/** Which score version drives the site. v2.1 is the composite defined here. */
export const SCORE_VERSION: 'v1' | 'v2' | 'v2.1' = 'v2.1';

/** No stock ever gets a perfect score — every 0–100 scale caps at 99. */
export const SCORE_CEILING = 99;

/** Top-level component weights (v2.1 spec §1). MUST sum to 1.0. */
export const COMPONENT_WEIGHTS = {
  buying: 0.45,
  sector: 0.22,
  mda: 0.1,
  momentum: 0.1,
  pedigree: 0.08, // NEW v2.1 — caliber of the people buying
  dilution: 0.05,
} as const;

/** Insider-Buying sub-factor weights (v2.1 spec §2; relative, renormalized
 *  over whichever sub-factors have data for a given company).
 *  buySellBalance is retained from the interim model as an informational
 *  metric at 0 weight — spec open question #6 (sales) is still open, so it
 *  renders in the breakdown without moving the score until product sets a
 *  weight here. */
export const BUYING_SUBWEIGHTS = {
  purchaseSize: 0.22, // A — ABSOLUTE $ bought (client 2026-08-13: no cap division)
  cluster: 0.18, // B
  buyerSeniority: 0.18, // C — who is buying (dollar-weighted role multiplier)
  holdingChange: 0.08, // D — absolute commitment (avg % added per buyer)
  priceVsBuys: 0.12, // E — avg insider buy price vs current price
  stakeIncrease: 0.1, // F — ownership increase per insider (relative)
  insiderOwnership: 0.12, // G — NEW v2.1: aggregate insider ownership
  buySellBalance: 0.0, // informational — pending product decision (OQ#6)
} as const;

/** G — aggregate insider ownership → sub-score (v2.1 spec §2G piecewise).
 *  [ownershipFraction, score] knees; linear between; gentle taper above 60%
 *  (controlled-company caveat, OQ#B default ON). */
export const INSIDER_OWNERSHIP_CURVE: Array<[number, number]> = [
  [0.0, 0],
  [0.01, 10],
  [0.05, 40],
  [0.15, 75],
  [0.4, 100],
  [0.6, 100],
  [0.8, 85], // taper: >70–80% = tiny float / controlled company
];

// ── v2.1 §6 — Insider Pedigree ─────────────────────────────────────────────
/** Flag points per insider (spec §6.1). Evidence-backed only; profiles live
 *  in the insider_profiles table and require review before affecting scores. */
export const PEDIGREE_FLAG_POINTS: Record<string, number> = {
  major_exit: 40, // founded/led a company sold/IPO'd at ≥ $1B
  mid_exit: 15, // same, $100M–$1B
  billionaire: 30, // recognized wealth list / documented ≥ $1B
  high_net_worth: 10, // documented ≥ $100M
  political_office: 20, // former/current elected official, cabinet, regulator
  political_connections: 10, // FEC-documented major donor / lobbying ties
  serial_public_company_director: 8, // 3+ public boards
};
/** Per-insider points cap (spec §6.2). */
export const PEDIGREE_PER_INSIDER_CAP = 60;
/** Boost for insiders with an open-market buy in the trailing 12 months
 *  (spec OQ#C, default ON — a billionaire writing checks beats one who
 *  never buys). */
export const PEDIGREE_RECENT_BUYER_MULTIPLIER = 1.5;
/** Baseline when NO pedigree data exists for any insider — absence of fame
 *  ≠ negative signal (spec §9). */
export const PEDIGREE_BASELINE = 25;

// ── v2.1 §7 — Litigation deduction ─────────────────────────────────────────
/** Deduction points per matter by severity tier (spec §7.1). */
export const LITIGATION_TIER_DEDUCTION: Record<string, number> = {
  severe: 10, // SEC/DOJ securities fraud, criminal fraud, officer bar
  serious: 5, // derivative suits, fiduciary judgments, FINRA sanctions
  moderate: 2, // civil business disputes, defendant side
  noise: 0,
};
/** Status modifiers (spec §7.1). */
export const LITIGATION_STATUS_MODIFIER: Record<string, number> = {
  adjudicated: 1.0, // judgment / settlement / plea
  pending: 0.6, // pending / alleged
  dismissed: 0.0, // dismissed / acquitted
};
/** Total deduction cap in points (spec §7.1). */
export const LITIGATION_DEDUCTION_CAP = 15;

/** §12 rollout: pedigree + litigation ship DARK first — computed and stored
 *  for audit, but NOT applied to the public score until this flag is turned
 *  on (after the 4-week false-positive review and legal sign-off, OQ#D).
 *  While dark: every company gets the pedigree baseline and a 0 deduction. */
export const PEOPLE_SIGNALS_LIVE = process.env.IQS_PEOPLE_SIGNALS_LIVE === 'true';

/** Role multipliers — applied to each transaction's contribution to the
 *  role-weighted sub-factors (C, F) and pedigree. Config-driven per spec §2C.
 *  Sub-factor C maps the dollar-weighted average of these straight to 0–100. */
export const ROLE_MULTIPLIER: Record<InsiderRole, number> = {
  CEO: 1.0,
  CFO: 1.0,
  COO: 1.0,
  Director: 0.6,
  Other: 0.4,
};

/** Lookback windows (days) — spec §10. Momentum's actual inputs come from
 *  the Yahoo quote batch fields (10-day avg vs 3-month avg SHARE volume);
 *  the 20/90 entries are the spec's nominal windows, kept for reference. */
export const WINDOWS = {
  buys: 90, // purchase volume + VWAP window
  cluster: 45, // distinct-buyer window
  momentumShort: 20, // nominal rel-volume numerator (impl: avgVol10d)
  momentumLong: 90, // nominal rel-volume denominator (impl: 3-month avg)
  seasoned: 14, // "seasoned" buy age for historical-success
} as const;

/** Normalization knobs (clamps / scales) — spec §2E, §2F, §5, §6. */
export const NORM = {
  // A — ABSOLUTE purchase dollars, log-scaled (client 2026-08-13: a $100k buy
  // is sizeable at ANY market cap, so cap division was removed). Score =
  // ln(1 + $ ÷ divisor) ÷ ln(1 + capMultiple) × 100:
  // $10k→~15, $50k→~39, $100k→~52, $250k→~70, $500k→~85, $1M+→100.
  purchaseSizeDivisor: 10_000,
  purchaseSizeCapMultiple: 100, // divisor × multiple = $1M ceiling
  // E — insider VWAP / current price, clamped then min-max to 0–100.
  //     >1 (stock below insider cost basis) = bullish end (OQ#1 default).
  priceRatioClamp: [0.5, 2.0] as [number, number],
  // F — ownership % increase, clamped at 100% (doubling) → 100.
  ownershipPctCap: 1.0,
  // Momentum — relative SHARE volume clamped then log min-max to 0–100.
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
