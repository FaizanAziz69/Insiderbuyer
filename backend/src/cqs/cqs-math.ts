/**
 * Congress Quality Score (CQS) Brief v9 — Pure Mathematical Engine.
 *
 * Side-effect-free scoring logic for CQS 0–100, 8 components (C1–C8),
 * 5 signal multipliers, grade bands, and gold-tier ring qualification.
 */

export const CQS_COMPONENT_WEIGHTS = {
  c1ClusterBreadth: 0.2,
  c2PositionSize: 0.15,
  c3CommitteeInfluence: 0.15,
  c4ContractAlignment: 0.15,
  c5BuyerTrackRecord: 0.12,
  c6RelativeConviction: 0.08,
  c7Freshness: 0.1,
  c8NetDirection: 0.05,
} as const;

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));

// ── C1. Cluster Breadth (20%) ──────────────────────────────────────────────
export function scoreC1ClusterBreadth(
  distinctMembers: number,
  isBipartisan = false,
): number {
  if (distinctMembers <= 0) return 0;
  let base = 0;
  if (distinctMembers === 1) base = 0;
  else if (distinctMembers === 2) base = 55;
  else if (distinctMembers === 3) base = 80;
  else base = 100;

  if (isBipartisan && distinctMembers >= 2) {
    base += 10;
  }
  return clamp(base, 0, 100);
}

// ── C2. Position Size (15%) ────────────────────────────────────────────────
/** Band floor lookup: $15k -> 10, $50k -> 25, $100k -> 50, $250k -> 70, $500k -> 85, $1M+ -> 100 */
export function bandFloorToPoints(bandFloor: number): number {
  if (bandFloor >= 1_000_001) return 100;
  if (bandFloor >= 500_001) return 85;
  if (bandFloor >= 250_001) return 70;
  if (bandFloor >= 100_001) return 50;
  if (bandFloor >= 50_001) return 25;
  if (bandFloor >= 15_001) return 10;
  return 5;
}

export function scoreC2PositionSize(bandFloors: number[]): number {
  if (!bandFloors || bandFloors.length === 0) return 0;
  const totalPoints = bandFloors.reduce(
    (acc, f) => acc + bandFloorToPoints(f),
    0,
  );
  return clamp(totalPoints, 0, 100);
}

// ── C3. Committee Influence (15%) ──────────────────────────────────────────
export function roleToMultiplier(
  role: string | null | undefined,
): number {
  if (!role) return 0.5;
  const r = role.toLowerCase();
  if (r.includes('chair') && !r.includes('sub')) return 1.0;
  if (r.includes('ranking')) return 0.85;
  if (r.includes('subcommittee') || r.includes('sub')) return 0.8;
  return 0.5;
}

export function scoreC3CommitteeInfluence(
  roles: (string | null | undefined)[],
  hasJurisdiction = true,
): number {
  if (!roles || roles.length === 0 || !hasJurisdiction) return 0;
  const maxRoleMult = Math.max(...roles.map(roleToMultiplier));
  return clamp(maxRoleMult * 100, 0, 100);
}

// ── C4. Contract Alignment (15%) ──────────────────────────────────────────
export function scoreC4ContractAlignment(
  maxCtsScore: number | null,
  awardRatio: number | null = null,
): number {
  if (maxCtsScore == null || maxCtsScore <= 0) return 30; // neutral floor
  let score = maxCtsScore;
  if (awardRatio != null && awardRatio > 0) {
    if (awardRatio > 0.05) score = Math.min(100, score * 1.25);
  }
  return clamp(score, 0, 100);
}

// ── C5. Buyer Track Record (12%) ──────────────────────────────────────────
export function gradeToPoints(grade: string | null | undefined): number {
  if (!grade) return 40; // neutral for ungraded
  const g = grade.toUpperCase().trim();
  if (g === 'A+' || g === 'A') return 100;
  if (g === 'B+') return 85;
  if (g === 'B') return 60;
  if (g === 'C') return 20;
  return 40;
}

export function scoreC5BuyerTrackRecord(
  buyerGrades: (string | null | undefined)[],
): number {
  if (!buyerGrades || buyerGrades.length === 0) return 40;
  const points = buyerGrades.map(gradeToPoints);
  const avg = points.reduce((a, b) => a + b, 0) / points.length;
  return clamp(avg, 0, 100);
}

// ── C6. Relative Conviction (8%) ──────────────────────────────────────────
export function scoreC6RelativeConviction(
  tradeBandFloor: number,
  memberMedianBandFloor: number | null,
  isFirstPurchase = false,
): number {
  let score = 50; // baseline neutral
  if (memberMedianBandFloor != null && memberMedianBandFloor > 0) {
    const ratio = tradeBandFloor / memberMedianBandFloor;
    score = clamp(ratio * 50, 20, 90);
  }
  if (isFirstPurchase) {
    score += 20;
  }
  return clamp(score, 0, 100);
}

// ── C7. Freshness Decay (10%) ─────────────────────────────────────────────
/** Decays from tx date: 100 at <=14d -> 50 at 60d -> 0 at 120d */
export function scoreC7Freshness(daysSinceTx: number): number {
  if (daysSinceTx <= 14) return 100;
  if (daysSinceTx >= 120) return 0;
  if (daysSinceTx <= 60) {
    const t = (daysSinceTx - 14) / (60 - 14);
    return 100 - t * (100 - 50);
  } else {
    const t = (daysSinceTx - 60) / (120 - 60);
    return 50 - t * (50 - 0);
  }
}

// ── C8. Net Direction (5%) ────────────────────────────────────────────────
export function scoreC8NetDirection(
  buyValue: number,
  sellValue: number,
): number {
  const total = (buyValue || 0) + (sellValue || 0);
  if (total <= 0) return 100;
  return clamp(((buyValue || 0) / total) * 100, 0, 100);
}

// ── Multipliers Assembly ──────────────────────────────────────────────────
export interface CqsMultipliersInput {
  iqsScore?: number | null;
  hasLegislativeCatalyst?: boolean;
  priceVs52wHighPct?: number | null; // e.g. -25 means 25% below 52w high
  totalBuyVsAdvPct?: number | null;
  marketCap?: number | null;
  avgFilingLagDays?: number | null;
}

export interface CqsMultipliersResult {
  insiderOverlap: number;
  legislativeCatalyst: number;
  contrarianEntry: number;
  liquidityNorm: number;
  filingLag: number;
  combined: number;
}

export function computeCqsMultipliers(
  input: CqsMultipliersInput,
): CqsMultipliersResult {
  const insiderOverlap =
    input.iqsScore != null && input.iqsScore >= 70 ? 1.2 : 1.0;
  const legislativeCatalyst = input.hasLegislativeCatalyst ? 1.1 : 1.0;
  const contrarianEntry =
    input.priceVs52wHighPct != null && input.priceVs52wHighPct <= -20
      ? 1.1
      : 1.0;
  const isMegaCap = input.marketCap != null && input.marketCap >= 200_000_000_000;
  const liquidityNorm =
    isMegaCap &&
    input.totalBuyVsAdvPct != null &&
    input.totalBuyVsAdvPct < 0.0001
      ? 0.8
      : 1.0;
  const filingLag =
    input.avgFilingLagDays != null && input.avgFilingLagDays >= 30 ? 0.85 : 1.0;

  const combined =
    insiderOverlap *
    legislativeCatalyst *
    contrarianEntry *
    liquidityNorm *
    filingLag;

  return {
    insiderOverlap,
    legislativeCatalyst,
    contrarianEntry,
    liquidityNorm,
    filingLag,
    combined,
  };
}

// ── Grade Mapping ────────────────────────────────────────────────────────
export function cqsToGrade(cqs: number): {
  grade: string;
  isGoldRing: boolean;
} {
  const score = Math.round(cqs);
  let grade = 'C';
  if (score >= 90) grade = 'A+';
  else if (score >= 80) grade = 'A';
  else if (score >= 70) grade = 'B+';
  else if (score >= 60) grade = 'B';
  else grade = 'C';

  const isGoldRing = score >= 80;
  return { grade, isGoldRing };
}

// ── Full Composite Assembly ──────────────────────────────────────────────
export interface CqsComponentsInput {
  c1ClusterBreadth: number;
  c2PositionSize: number;
  c3CommitteeInfluence: number;
  c4ContractAlignment: number;
  c5BuyerTrackRecord: number;
  c6RelativeConviction: number;
  c7Freshness: number;
  c8NetDirection: number;
}

export function assembleCqsScore(
  components: CqsComponentsInput,
  multipliers: CqsMultipliersInput,
): {
  baseScore: number;
  cqs: number;
  grade: string;
  isGoldRing: boolean;
  multipliersResult: CqsMultipliersResult;
} {
  const W = CQS_COMPONENT_WEIGHTS;
  const baseScore =
    W.c1ClusterBreadth * components.c1ClusterBreadth +
    W.c2PositionSize * components.c2PositionSize +
    W.c3CommitteeInfluence * components.c3CommitteeInfluence +
    W.c4ContractAlignment * components.c4ContractAlignment +
    W.c5BuyerTrackRecord * components.c5BuyerTrackRecord +
    W.c6RelativeConviction * components.c6RelativeConviction +
    W.c7Freshness * components.c7Freshness +
    W.c8NetDirection * components.c8NetDirection;

  const mult = computeCqsMultipliers(multipliers);
  const finalCqs = clamp(Math.round(baseScore * mult.combined), 0, 100);
  const { grade, isGoldRing } = cqsToGrade(finalCqs);

  return {
    baseScore,
    cqs: finalCqs,
    grade,
    isGoldRing,
    multipliersResult: mult,
  };
}
