/**
 * IQS 2.0 — Workstream C: company roll-up, penalties and calibration.
 *
 * Raw = Σ TradeScoreᵢ × 0.5^(ageᵢ/30) over a trailing 90-day window, times a
 * cluster multiplier, converted to a PERCENTILE across the scored universe
 * that day, then penalties are subtracted. Calibrating before penalties is
 * what makes "90+" mean the same thing every day: top-decile buying quality
 * as of that day, with dilution and litigation deducted after.
 *
 * Sector strength, momentum, volume and MD&A tone are gone from the score
 * entirely (brief §Workstream C, "Removed components"). Sector heat ships as
 * a display badge beside the score — never blended into it.
 */
import { IQS2_CONFIG } from './config';
import { clamp, num } from './trade-score';

export interface ScoredTrade {
  /** Trade Score from Workstream B. */
  score: number;
  /** Whole days between the transaction date and the as-of date. */
  ageDays: number;
  /** Resolved insider identity, for the distinct-buyer count. */
  insiderKey: string;
}

/** 0.5^(age/halfLife) — a 60-day-old trade counts 25%. */
export function decayFactor(ageDays: number, halfLifeDays = IQS2_CONFIG.decayHalfLifeDays): number {
  const a = num(ageDays);
  if (a === null || a < 0) return 0;
  return Math.pow(0.5, a / halfLifeDays);
}

export function decayedSum(trades: ScoredTrade[]): number {
  return trades
    .filter((t) => t.ageDays <= IQS2_CONFIG.windowDays)
    .reduce((sum, t) => sum + t.score * decayFactor(t.ageDays), 0);
}

/** M = 1 + 0.15 × (distinct net buyers − 1), capped at 1.6. */
export function clusterMultiplier(distinctNetBuyers: number | null | undefined): number {
  const n = num(distinctNetBuyers);
  if (n === null || n <= 1) return 1;
  return Math.min(IQS2_CONFIG.clusterCap, 1 + IQS2_CONFIG.clusterStep * (n - 1));
}

/**
 * Trailing-12-month split-adjusted share-count growth. ≤5% costs nothing;
 * 5–25% ramps linearly to the maximum; above 25% takes the full penalty.
 * Returns a POSITIVE number of points to subtract.
 */
export function dilutionPenalty(shareGrowthTtm: number | null | undefined): number {
  // Unknown share-count history is not evidence of no dilution, but it is
  // also not evidence of dilution — we cannot penalise on an absence, so it
  // costs nothing here and the ATM/shelf badge carries the caveat instead.
  const g = num(shareGrowthTtm);
  if (g === null || g <= IQS2_CONFIG.dilutionFreeThreshold) return 0;
  if (g >= IQS2_CONFIG.dilutionMaxThreshold) return IQS2_CONFIG.dilutionMaxPenalty;
  const span = IQS2_CONFIG.dilutionMaxThreshold - IQS2_CONFIG.dilutionFreeThreshold;
  return ((g - IQS2_CONFIG.dilutionFreeThreshold) / span) * IQS2_CONFIG.dilutionMaxPenalty;
}

/**
 * Percentile of `value` within `universe`, 0–1. Ties take the midpoint so a
 * universe of identical raws does not hand everyone the top rank.
 */
export function percentileOf(value: number, universe: number[]): number {
  if (!universe.length) return 0;
  let below = 0;
  let equal = 0;
  for (const u of universe) {
    if (u < value) below++;
    else if (u === value) equal++;
  }
  return (below + equal / 2) / universe.length;
}

export interface CompanyScoreInput {
  trades: ScoredTrade[];
  shareGrowthTtm: number | null;
  /** Existing IQS 1.0 rule, carried over unchanged (0–15, positive). */
  litigationPenalty?: number | null;
  /** Every company's M×Raw for the same as-of date — the calibration basis. */
  universeRaw: number[];
}

export interface CompanyScoreResult {
  /** Published 0–99, or null when the company is unscored. */
  score: number | null;
  raw: number;
  multiplier: number;
  calibrated: number;
  percentile: number;
  penalties: { dilution: number; litigation: number };
  distinctBuyers: number;
  countedTrades: number;
}

export function scoreCompany(input: CompanyScoreInput): CompanyScoreResult {
  const inWindow = input.trades.filter((t) => t.ageDays <= IQS2_CONFIG.windowDays);
  const distinctBuyers = new Set(inWindow.map((t) => t.insiderKey)).size;
  const raw = decayedSum(inWindow);
  const multiplier = clusterMultiplier(distinctBuyers);
  const adjusted = raw * multiplier;

  const percentile = percentileOf(adjusted, input.universeRaw);
  const calibrated = percentile * IQS2_CONFIG.ceiling;

  const dilution = dilutionPenalty(input.shareGrowthTtm);
  const litigation = clamp(
    num(input.litigationPenalty) ?? 0,
    0,
    IQS2_CONFIG.litigationMaxPenalty,
  );

  // No qualifying buying in the window is not a zero — it is no score. A zero
  // would rank the company against names we DO have evidence on.
  const score = inWindow.length
    ? clamp(calibrated - dilution - litigation, 0, IQS2_CONFIG.ceiling)
    : null;

  return {
    score: score === null ? null : Number(score.toFixed(2)),
    raw,
    multiplier,
    calibrated,
    percentile,
    penalties: { dilution, litigation },
    distinctBuyers,
    countedTrades: inWindow.length,
  };
}
