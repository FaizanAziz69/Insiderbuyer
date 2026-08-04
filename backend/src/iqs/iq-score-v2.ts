/**
 * IQ Score v2 — pure scoring math.
 *
 * Every function here is side-effect-free and takes raw inputs → a 0–100 score,
 * so the model is unit-testable in isolation from the DB/ingest loop. The DB
 * loop (iqs.service.recalculateAll) gathers raw inputs and calls these.
 *
 * Normalization follows the spec's proposed per-factor formulas (clamp + log /
 * min-max). Missing inputs return null and are dropped from the relevant
 * weighted average so coverage — not a zero — reflects absent data.
 */

import {
  BUYING_SUBWEIGHTS,
  COMPONENT_WEIGHTS,
  NEUTRAL,
  NORM,
  SCORE_CEILING,
} from './scoring-config';

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));
const clamp01 = (x: number): number => clamp(x, 0, 1);

// ── Buying sub-factors (each → 0–100 or null) ────────────────────────────

/** A. Purchase value / market cap, log-scaled so micro-caps with outsized
 *  buys rank high without one filing blowing out the top. */
export function scoreVolumeVsMarketCap(ratio: number | null): number | null {
  if (ratio == null || !Number.isFinite(ratio) || ratio <= 0) return null;
  const d = NORM.volumeVsMarketCapDivisor;
  return clamp01(Math.log1p(ratio / d) / Math.log1p(4)) * 100;
}

/** B. Cluster — distinct insider buyers, log-dampened. */
export function scoreCluster(distinctBuyers: number): number {
  return clamp01(Math.log(1 + distinctBuyers) / Math.log(1 + 6)) * 100;
}

/** C. Role-weighted purchase value / market cap. */
export function scoreRole(roleWeightedRatio: number | null): number | null {
  if (roleWeightedRatio == null || !Number.isFinite(roleWeightedRatio) || roleWeightedRatio <= 0)
    return null;
  return clamp01(Math.log1p(roleWeightedRatio / NORM.roleDivisor) / Math.log1p(4)) * 100;
}

/** D. Stake Increase — the merged holding-change / ownership-increase metric
 *  (the two measured the same thing: relative stake growth). Role-weighted
 *  average of each buyer's (shares bought ÷ previous holdings), capped at
 *  doubling (1.0 → 100); first-time buyers are pre-mapped to the cap
 *  upstream. */
export function scoreStakeIncrease(
  weightedAvgPctIncrease: number | null,
): number | null {
  if (weightedAvgPctIncrease == null || !Number.isFinite(weightedAvgPctIncrease))
    return null;
  return clamp01(weightedAvgPctIncrease / NORM.ownershipPctCap) * 100;
}

/** E (NEW). Avg insider buy price vs current price. price_ratio = vwap/price.
 *  >1 → stock trades BELOW insiders' cost basis (buy cheaper than they did) =
 *  bullish end (spec OQ#1 default). Clamp [0.5,2.0] → min-max 0–100. */
export function scorePriceVsBuys(
  insiderVwap: number | null,
  currentPrice: number | null,
): number | null {
  if (
    insiderVwap == null ||
    currentPrice == null ||
    !(insiderVwap > 0) ||
    !(currentPrice > 0)
  )
    return null;
  const [lo, hi] = NORM.priceRatioClamp;
  const r = clamp(insiderVwap / currentPrice, lo, hi);
  return ((r - lo) / (hi - lo)) * 100;
}

export interface BuyingSubScores {
  volumeVsMarketCap: number | null;
  cluster: number | null;
  role: number | null;
  stakeIncrease: number | null;
  priceVsBuys: number | null;
}

/** Combine the five buying sub-factors into a 0–100 BuyingScore, renormalizing
 *  the sub-weights over whichever sub-factors have data. */
export function computeBuyingScore(sub: BuyingSubScores): number | null {
  const parts: Array<[number, number | null]> = [
    [BUYING_SUBWEIGHTS.volumeVsMarketCap, sub.volumeVsMarketCap],
    [BUYING_SUBWEIGHTS.cluster, sub.cluster],
    [BUYING_SUBWEIGHTS.role, sub.role],
    [BUYING_SUBWEIGHTS.stakeIncrease, sub.stakeIncrease],
    [BUYING_SUBWEIGHTS.priceVsBuys, sub.priceVsBuys],
  ];
  const present = parts.filter(([, v]) => v != null);
  const wSum = present.reduce((a, [w]) => a + w, 0);
  if (wSum <= 0) return null;
  return present.reduce((a, [w, v]) => a + (v as number) * (w / wSum), 0);
}

// ── Momentum (component 4) ───────────────────────────────────────────────

/** Relative SHARE volume (10-day avg ÷ 3-month avg, from the Yahoo quote
 *  batch) → 0–100, log-symmetric around 1.0 (flat = 50, 4× surge = 100,
 *  ¼× dry-up = 0). Direction-agnostic: it measures attention/liquidity
 *  surge, not price trend. Dollar volume is used only as the illiquidity
 *  gate — names below the floor return neutral. */
export function scoreMomentum(
  relVolume: number | null,
  recentDollarVolume: number | null,
): number | null {
  if (recentDollarVolume != null && recentDollarVolume < NORM.momentumMinDollarVolume)
    return null; // too illiquid to trust → neutral (handled by caller)
  if (relVolume == null || !Number.isFinite(relVolume) || relVolume <= 0) return null;
  const [lo, hi] = NORM.momentumClamp;
  const r = clamp(relVolume, lo, hi);
  // log min-max so a 4× surge = 100, 4× collapse = 0, flat ≈ 50.
  return ((Math.log(r) - Math.log(lo)) / (Math.log(hi) - Math.log(lo))) * 100;
}

// ── Dilution (component 5) ───────────────────────────────────────────────

/** TTM share-growth % → 0–100 via the config piecewise curve. Less dilution
 *  (or buybacks) scores high; heavy dilution is penalized. */
export function scoreDilution(dilutionPct: number | null): number | null {
  if (dilutionPct == null || !Number.isFinite(dilutionPct)) return null;
  const knees = NORM.dilution.knees;
  if (dilutionPct <= knees[0][0]) return knees[0][1];
  for (let i = 1; i < knees.length; i++) {
    const [x0, y0] = knees[i - 1];
    const [x1, y1] = knees[i];
    if (dilutionPct <= x1) {
      const t = (dilutionPct - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return knees[knees.length - 1][1]; // beyond last knee → floor
}

// ── Composite assembly ───────────────────────────────────────────────────

export interface ComponentInputs {
  buying: number | null;
  sector: number | null;
  mda: number | null;
  momentum: number | null;
  dilution: number | null;
}

export interface CompositeResult {
  /** 0–99 headline IQ Score, or null when no component has data. */
  score: number | null;
  /** Share of total model weight that had data (0–1). */
  dataCompleteness: number;
  /** Effective (renormalized) weight actually applied per component. */
  effectiveWeights: Record<keyof ComponentInputs, number>;
}

/** Weighted composite (spec §1 + §8 degradation). Missing components fall back
 *  to a NEUTRAL 50 rather than being dropped — so the fixed component weights
 *  always apply (a quiet small-cap isn't punished, just pulled toward neutral),
 *  and `dataCompleteness` reports the share of weight backed by REAL data.
 *  Buying must be present (callers skip companies with no qualifying buys). */
export function assembleComposite(c: ComponentInputs): CompositeResult {
  const parts: Array<[keyof ComponentInputs, number, number | null]> = [
    ['buying', COMPONENT_WEIGHTS.buying, c.buying],
    ['sector', COMPONENT_WEIGHTS.sector, c.sector],
    ['mda', COMPONENT_WEIGHTS.mda, c.mda],
    ['momentum', COMPONENT_WEIGHTS.momentum, c.momentum],
    ['dilution', COMPONENT_WEIGHTS.dilution, c.dilution],
  ];
  if (c.buying == null) {
    return {
      score: null,
      dataCompleteness: 0,
      effectiveWeights: { buying: 0, sector: 0, mda: 0, momentum: 0, dilution: 0 },
    };
  }
  const totalWeight = parts.reduce((a, [, w]) => a + w, 0);
  const realWeight = parts.reduce((a, [, w, v]) => a + (v != null ? w : 0), 0);

  const effectiveWeights = {
    buying: 0,
    sector: 0,
    mda: 0,
    momentum: 0,
    dilution: 0,
  } as Record<keyof ComponentInputs, number>;
  let acc = 0;
  for (const [key, w, v] of parts) {
    effectiveWeights[key] = w / totalWeight;
    acc += (v ?? NEUTRAL) * (w / totalWeight);
  }

  return {
    score: Math.min(SCORE_CEILING, Math.round(acc)),
    dataCompleteness: totalWeight > 0 ? realWeight / totalWeight : 0,
    effectiveWeights,
  };
}
