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
  INSIDER_OWNERSHIP_CURVE,
  LITIGATION_DEDUCTION_CAP,
  LITIGATION_STATUS_MODIFIER,
  LITIGATION_TIER_DEDUCTION,
  NEUTRAL,
  NORM,
  PEDIGREE_BASELINE,
  PEDIGREE_PER_INSIDER_CAP,
  PEDIGREE_RECENT_BUYER_MULTIPLIER,
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

/** D. Holding change (absolute commitment) — avg per-buyer % add, capped
 *  (v2.1 spec §2, sub-factor D at 8%). */
export function scoreHoldingChange(avgPctAdd: number | null): number | null {
  if (avgPctAdd == null || !Number.isFinite(avgPctAdd) || avgPctAdd <= 0) return null;
  return clamp01(avgPctAdd / 100) * 100;
}

/** F. Ownership increase per insider — role-weighted average of each buyer's
 *  (shares bought ÷ previous holdings), capped at doubling (1.0 → 100);
 *  first-time buyers are pre-mapped to the cap upstream. */
export function scoreStakeIncrease(
  weightedAvgPctIncrease: number | null,
): number | null {
  if (weightedAvgPctIncrease == null || !Number.isFinite(weightedAvgPctIncrease))
    return null;
  return clamp01(weightedAvgPctIncrease / NORM.ownershipPctCap) * 100;
}

/** G (NEW v2.1). Aggregate insider ownership — what fraction of the company
 *  its insiders collectively own, mapped through the spec §2G piecewise curve
 *  (with the >60% controlled-company taper). */
export function scoreInsiderOwnership(ownershipFraction: number | null): number | null {
  if (
    ownershipFraction == null ||
    !Number.isFinite(ownershipFraction) ||
    ownershipFraction <= 0
  )
    return null;
  const curve = INSIDER_OWNERSHIP_CURVE;
  const x = Math.min(ownershipFraction, curve[curve.length - 1][0]);
  for (let i = 1; i < curve.length; i++) {
    const [x0, y0] = curve[i - 1];
    const [x1, y1] = curve[i];
    if (x <= x1) {
      const t = (x - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return curve[curve.length - 1][1];
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

/** F. Buy/Sell Balance — insider buying dollars against insider selling
 *  dollars over the same window: buy$ ÷ (buy$ + sell$) × 100. All buying =
 *  100, balanced = 50, all selling = 0. Null when there is no activity. */
export function scoreBuySellBalance(
  buyValue: number,
  sellValue: number,
): number | null {
  const total = (Number(buyValue) || 0) + (Number(sellValue) || 0);
  if (!(total > 0)) return null;
  return ((Number(buyValue) || 0) / total) * 100;
}

export interface BuyingSubScores {
  volumeVsMarketCap: number | null;
  cluster: number | null;
  role: number | null;
  holdingChange: number | null;
  priceVsBuys: number | null;
  stakeIncrease: number | null;
  insiderOwnership: number | null;
  buySellBalance: number | null;
}

/** Combine the buying sub-factors (v2.1 spec §2, A–G) into a 0–100
 *  BuyingScore, renormalizing the sub-weights over whichever sub-factors
 *  have data. Zero-weight factors (buySellBalance, pending OQ#6) render in
 *  breakdowns without moving the score. */
export function computeBuyingScore(sub: BuyingSubScores): number | null {
  const parts: Array<[number, number | null]> = [
    [BUYING_SUBWEIGHTS.volumeVsMarketCap, sub.volumeVsMarketCap],
    [BUYING_SUBWEIGHTS.cluster, sub.cluster],
    [BUYING_SUBWEIGHTS.role, sub.role],
    [BUYING_SUBWEIGHTS.holdingChange, sub.holdingChange],
    [BUYING_SUBWEIGHTS.priceVsBuys, sub.priceVsBuys],
    [BUYING_SUBWEIGHTS.stakeIncrease, sub.stakeIncrease],
    [BUYING_SUBWEIGHTS.insiderOwnership, sub.insiderOwnership],
    [BUYING_SUBWEIGHTS.buySellBalance, sub.buySellBalance],
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

// ── Pedigree (component 5, NEW v2.1 §6) ──────────────────────────────────

export interface PedigreeInsiderInput {
  /** Reviewed flag keys from the insider's profile (spec §6.1). */
  flags: string[];
  /** Same role multiplier used in §2C. */
  roleMultiplier: number;
  /** Open-market buy in the trailing 12 months → 1.5× boost (OQ#C). */
  recentBuyer: boolean;
}

/** Company Pedigree Score (spec §6.2): per-insider flag points (capped),
 *  role-weighted, recent-buyer boosted, capped at 100. Returns null when no
 *  insider has any flags — the assembler then applies the §9 baseline. */
export function computePedigreeScore(
  insiders: PedigreeInsiderInput[],
  flagPoints: Record<string, number>,
): number | null {
  let weighted = 0;
  let anyFlags = false;
  for (const ins of insiders) {
    const raw = (ins.flags || []).reduce((a, f) => a + (flagPoints[f] || 0), 0);
    if (raw <= 0) continue;
    anyFlags = true;
    const capped = Math.min(PEDIGREE_PER_INSIDER_CAP, raw);
    const boost = ins.recentBuyer ? PEDIGREE_RECENT_BUYER_MULTIPLIER : 1;
    weighted += capped * (ins.roleMultiplier || 0.4) * boost;
  }
  if (!anyFlags) return null;
  return Math.min(100, weighted);
}

// ── Litigation deduction (v2.1 §7) ────────────────────────────────────────

export interface LitigationMatterInput {
  /** severe | serious | moderate | noise */
  tier: string;
  /** adjudicated | pending | dismissed */
  status: string;
  /** Years since the matter resolved (null/undefined = current). */
  resolvedYearsAgo?: number | null;
  /** Securities-fraud judgments / officer bars never decay (spec §7.1). */
  noDecay?: boolean;
}

/** Total litigation deduction in points, 0–15 (spec §7.1): per-matter tier
 *  points × status modifier × recency decay, capped. */
export function computeLitigationDeduction(matters: LitigationMatterInput[]): number {
  let total = 0;
  for (const m of matters || []) {
    const base = LITIGATION_TIER_DEDUCTION[m.tier] ?? 0;
    const mod = LITIGATION_STATUS_MODIFIER[m.status] ?? 0;
    let decay = 1;
    if (!m.noDecay && m.resolvedYearsAgo != null) {
      if (m.resolvedYearsAgo > 10) decay = 0;
      else if (m.resolvedYearsAgo > 5) decay = 0.5;
    }
    total += base * mod * decay;
  }
  return Math.min(LITIGATION_DEDUCTION_CAP, Math.max(0, total));
}

// ── Composite assembly ───────────────────────────────────────────────────

export interface ComponentInputs {
  buying: number | null;
  sector: number | null;
  mda: number | null;
  momentum: number | null;
  pedigree: number | null;
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
export function assembleComposite(
  c: ComponentInputs,
  litigationDeduction = 0,
): CompositeResult {
  const parts: Array<[keyof ComponentInputs, number, number | null]> = [
    ['buying', COMPONENT_WEIGHTS.buying, c.buying],
    ['sector', COMPONENT_WEIGHTS.sector, c.sector],
    ['mda', COMPONENT_WEIGHTS.mda, c.mda],
    ['momentum', COMPONENT_WEIGHTS.momentum, c.momentum],
    ['pedigree', COMPONENT_WEIGHTS.pedigree, c.pedigree],
    ['dilution', COMPONENT_WEIGHTS.dilution, c.dilution],
  ];
  if (c.buying == null) {
    return {
      score: null,
      dataCompleteness: 0,
      effectiveWeights: { buying: 0, sector: 0, mda: 0, momentum: 0, pedigree: 0, dilution: 0 },
    };
  }
  const totalWeight = parts.reduce((a, [, w]) => a + w, 0);
  const realWeight = parts.reduce((a, [, w, v]) => a + (v != null ? w : 0), 0);

  const effectiveWeights = {
    buying: 0,
    sector: 0,
    mda: 0,
    momentum: 0,
    pedigree: 0,
    dilution: 0,
  } as Record<keyof ComponentInputs, number>;
  let acc = 0;
  for (const [key, w, v] of parts) {
    effectiveWeights[key] = w / totalWeight;
    // Missing pedigree falls to the §9 baseline (absence of fame ≠ negative),
    // every other missing component falls to NEUTRAL 50.
    const fallback = key === 'pedigree' ? PEDIGREE_BASELINE : NEUTRAL;
    acc += (v ?? fallback) * (w / totalWeight);
  }

  // v2.1 §1: IQ = max(0, composite − LitigationDeduction), capped at 99.
  const afterDeduction = Math.max(0, acc - Math.max(0, litigationDeduction));
  return {
    score: Math.min(SCORE_CEILING, Math.round(afterDeduction)),
    dataCompleteness: totalWeight > 0 ? realWeight / totalWeight : 0,
    effectiveWeights,
  };
}
