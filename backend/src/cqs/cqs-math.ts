/**
 * Congress Quality Score (CQS) — Brief v9, the pure scoring engine.
 *
 * Side-effect-free: every function here takes numbers and returns numbers, so
 * the whole methodology can be unit-tested without a database. The service
 * (cqs.service.ts) does the gathering; this file does the arithmetic and
 * nothing else.
 *
 * Two rules the brief is explicit about and that shape the code below:
 *
 *  - A component that has no evidence scores ZERO, not a friendly middle
 *    number. §4.1 is a caution against hopeful components; a neutral floor on
 *    a component nobody can evidence lifts every stock by the same amount and
 *    ranks nothing, while quietly inflating every grade.
 *  - Multipliers are only applied where the input exists. An input we cannot
 *    yet compute (ADV, the legislative calendar) is reported as UNAVAILABLE,
 *    not silently passed through as 1.0 — a reader must be able to tell
 *    "checked, did not fire" from "never checked".
 */

/**
 * Weights, set by §5 calibration rather than by opinion — which is what §2
 * always said would happen: "Weights below are proposed starting values —
 * final weights are set by the calibration protocol in §5, not by opinion."
 *
 * WHAT THE HOLDOUT SAID (3-month, 2024→present, ablation on the 58% of the
 * score that is point-in-time computable). Each figure is the change in
 * holdout excess spread when that component is removed, so a POSITIVE number
 * means the score got BETTER without it:
 *
 *     C1 cluster breadth   +2.58   removing it nearly doubled the spread
 *     C7 freshness         +0.36   no contribution
 *     C8 net direction     +0.25   no contribution
 *     C6 relative convict. −2.41   earns its place, on 8%
 *     C2 position size     −3.01   carries the most signal
 *
 * §5: "any whose removal doesn't degrade holdout decile spread is dropped or
 * down-weighted." C1, C7 and C8 all qualify. Brief §4.1 predicted precisely
 * this — "clusters are not automatically signal" — and kept C1 at 20% pending
 * exactly this test.
 *
 * HOW THE NUMBERS WERE DERIVED. The three non-earners are HALVED, not zeroed:
 * this is one horizon on a reduced score, and C1 is a pillar of the brief, so
 * the evidence justifies demotion and not deletion. The 17.5 points freed are
 * split between C2 and C6 in proportion to their measured contribution
 * (3.01 : 2.41). C3, C4 and C5 are untouched at 42% — they were NOT tested,
 * and untested is not the same as disproven.
 *
 * WHAT THIS IS NOT. The holdout was examined more than once (before and after
 * C6 joined the calibrated set), which weakens it; §5 wants a single look.
 * The next run should come after this change, once, and should be treated as
 * the real test of it.
 */
export const CQS_COMPONENT_WEIGHTS = {
  c1ClusterBreadth: 0.1,
  c2PositionSize: 0.25,
  c3CommitteeInfluence: 0.15,
  c4ContractAlignment: 0.15,
  c5BuyerTrackRecord: 0.12,
  c6RelativeConviction: 0.16,
  c7Freshness: 0.05,
  c8NetDirection: 0.02,
} as const;

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, x));

// ── C1. Cluster breadth (20%) ─────────────────────────────────────────────
/** 1 member = 0 · 2 = 55 · 3 = 80 · 4+ = 100, +10 when the cluster is bipartisan. */
export function scoreC1ClusterBreadth(
  distinctMembers: number,
  isBipartisan = false,
): number {
  if (distinctMembers <= 1) return 0;
  const base = distinctMembers === 2 ? 55 : distinctMembers === 3 ? 80 : 100;
  return clamp(isBipartisan ? base + 10 : base, 0, 100);
}

// ── C2. Position size (15%) ───────────────────────────────────────────────
/** Band-floor scale: $15k→10 · $50k→25 · $100k→50 · $250k→70 · $500k→85 · $1M+→100. */
export function bandFloorToPoints(bandFloor: number): number {
  if (bandFloor >= 1_000_001) return 100;
  if (bandFloor >= 500_001) return 85;
  if (bandFloor >= 250_001) return 70;
  if (bandFloor >= 100_001) return 50;
  if (bandFloor >= 50_001) return 25;
  if (bandFloor >= 15_001) return 10;
  return 5;
}

/**
 * "Summed across cluster, capped" — summed across the MEMBERS in the cluster,
 * with each member's own buys aggregated first.
 *
 * Summing per transaction instead is what the first cut did, and it made the
 * component meaningless: Goldman Sachs had 23 disclosed buys from 3 members
 * and hit the cap on the fourth one, scoring the same as a 4-member cluster
 * of $1M buys. Aggregating per member keeps size and breadth as two different
 * questions (breadth is C1's job).
 */
export function scoreC2PositionSize(bandFloorsByMember: number[][]): number {
  if (!bandFloorsByMember?.length) return 0;
  const total = bandFloorsByMember.reduce((acc, floors) => {
    const memberDollars = (floors || []).reduce((a, b) => a + (b || 0), 0);
    return acc + (memberDollars > 0 ? bandFloorToPoints(memberDollars) : 0);
  }, 0);
  return clamp(total, 0, 100);
}

// ── C3. Committee influence (15%) ─────────────────────────────────────────
/** Chair 1.0 · ranking 0.85 · subcommittee chair 0.8 · member 0.5 (Brief v9 §2). */
export function roleToMultiplier(role: string | null | undefined): number {
  const r = String(role || '').toLowerCase();
  if (!r) return 0.5;
  if (r.includes('sub')) return 0.8;
  if (r.includes('chair') || r.includes('chairman')) return 1.0;
  if (r.includes('ranking')) return 0.85;
  if (r.includes('vice')) return 0.8;
  return 0.5;
}

/**
 * Best buying member's jurisdiction relevance × role weight.
 *
 * `relevance` is 0–1 and comes from the Brief v5 influence map: a committee
 * with jurisdiction over an agency that actually awarded this company work is
 * 1.0, a sector-level overlap less. No jurisdiction at all means no influence
 * to score, which is 0 — this is the component most stocks legitimately fail.
 */
export function scoreC3CommitteeInfluence(
  seats: Array<{ role?: string | null; relevance?: number | null }>,
): number {
  if (!seats?.length) return 0;
  const best = seats.reduce((mx, s) => {
    const rel = s.relevance == null ? 1 : clamp(Number(s.relevance), 0, 1);
    return Math.max(mx, roleToMultiplier(s.role) * rel);
  }, 0);
  return clamp(best * 100, 0, 100);
}

// ── C4. Contract alignment (15%) ──────────────────────────────────────────
/**
 * Max CTS among the stock's intersections (Brief v5), scaled by award value ÷
 * company revenue — materiality. A $2M award to a $300B company is not the
 * same signal as a $2M award to a $40M one.
 *
 * No intersection returns 0. The first cut returned a flat 30 "neutral floor"
 * here, which is 4.5 points of free score on the total for every stock in the
 * index including the ones with no federal business at all.
 */
export function scoreC4ContractAlignment(
  maxCtsScore: number | null | undefined,
  awardToRevenueRatio: number | null | undefined = null,
): number {
  if (maxCtsScore == null || !(maxCtsScore > 0)) return 0;
  // Materiality ramp: below 0.5% of revenue the intersection is real but small
  // (0.7×); at or above 5% it counts in full.
  let materiality = 1;
  if (awardToRevenueRatio != null && Number.isFinite(awardToRevenueRatio)) {
    const r = Math.max(0, Number(awardToRevenueRatio));
    materiality = r >= 0.05 ? 1 : 0.7 + (r / 0.05) * 0.3;
  }
  return clamp(Number(maxCtsScore) * materiality, 0, 100);
}

// ── C5. Buyer track record (12%) ──────────────────────────────────────────
/**
 * Brief v9 pins two ends of the scale, "A+ = 100 … C = 20", and Brief v7
 * grades on six bands, so the intermediate steps are the even ramp between
 * them. Ungraded is 40, the brief's stated neutral.
 */
export function gradeToPoints(grade: string | null | undefined): number {
  const g = String(grade || '').toUpperCase().trim();
  if (!g) return 40;
  if (g === 'A+') return 100;
  if (g === 'A') return 84;
  if (g === 'B+') return 68;
  if (g === 'B') return 52;
  if (g === 'C+') return 36;
  if (g === 'C') return 20;
  return 40;
}

/**
 * Volume-weighted, per the brief: a $500k buyer graded A+ should move this
 * more than a $15k buyer graded C. Weight is the member's disclosed dollars
 * in this cluster; equal weights are used if no dollars are supplied.
 */
export function scoreC5BuyerTrackRecord(
  buyers: Array<{ grade?: string | null; weight?: number | null }>,
): number {
  if (!buyers?.length) return 40;
  let num = 0;
  let den = 0;
  for (const b of buyers) {
    const w = b.weight != null && Number(b.weight) > 0 ? Number(b.weight) : 1;
    num += gradeToPoints(b.grade) * w;
    den += w;
  }
  return den > 0 ? clamp(num / den, 0, 100) : 40;
}

// ── C6. Relative conviction (8%) ──────────────────────────────────────────
/**
 * "Is this big FOR THIS MEMBER?" — the cluster's largest buy measured against
 * that same member's own median trade band, plus a bonus when it is their
 * first ever purchase of the stock.
 *
 * A member with no trading history to compare against scores the 50 neutral,
 * not a ratio against an invented baseline. The first cut compared every
 * member against a hardcoded $50,001, which made this component a constant
 * 90 for anything at $100k or more.
 */
export function scoreC6RelativeConviction(
  tradeBandFloor: number,
  memberMedianBandFloor: number | null | undefined,
  isFirstPurchase = false,
): number {
  let score = 50;
  if (memberMedianBandFloor != null && Number(memberMedianBandFloor) > 0) {
    const ratio = tradeBandFloor / Number(memberMedianBandFloor);
    score = clamp(ratio * 50, 20, 90);
  }
  return clamp(isFirstPurchase ? score + 20 : score, 0, 100);
}

// ── C7. Freshness (10%) ───────────────────────────────────────────────────
/** 100 at ≤14 days from the transaction date → 50 at 60 → 0 at 120. */
export function scoreC7Freshness(daysSinceTx: number): number {
  if (!(daysSinceTx > 14)) return 100;
  if (daysSinceTx >= 120) return 0;
  if (daysSinceTx <= 60) return 100 - ((daysSinceTx - 14) / 46) * 50;
  return 50 - ((daysSinceTx - 60) / 60) * 50;
}

// ── C8. Net direction (5%) ────────────────────────────────────────────────
/**
 * Starts at 100 and member sells of the same stock in-window subtract, with
 * the IQS asymmetry the brief names: a bought dollar carries about three
 * times the information of a sold one, because members sell for tax, divestment
 * and ethics reasons that say nothing about the company.
 */
export const SELL_ASYMMETRY = 3;

export function scoreC8NetDirection(buyValue: number, sellValue: number): number {
  const b = Math.max(0, buyValue || 0) * SELL_ASYMMETRY;
  const s = Math.max(0, sellValue || 0);
  if (b + s <= 0) return 100;
  return clamp((b / (b + s)) * 100, 0, 100);
}

// ── Multipliers ───────────────────────────────────────────────────────────
export interface CqsMultipliersInput {
  /** Corporate Insider Score for the same stock, 90d. */
  iqsScore?: number | null;
  /** Pending markup/hearing affecting the sector — null = no calendar source yet. */
  hasLegislativeCatalyst?: boolean | null;
  /** Negative = below the 52-week high, e.g. -25 for 25% below. */
  priceVs52wHighPct?: number | null;
  /** Cluster dollars as a share of 20-day average daily dollar volume. */
  clusterVsAdvPct?: number | null;
  marketCap?: number | null;
  /** Days from transaction to filing, worst of the qualifying buys. */
  maxFilingLagDays?: number | null;
}

export interface CqsMultipliersResult {
  insiderOverlap: number;
  legislativeCatalyst: number;
  contrarianEntry: number;
  liquidityNorm: number;
  filingLag: number;
  combined: number;
  /** Multipliers we could not evaluate for this stock — shown as such, never as "did not fire". */
  unavailable: string[];
}

export const MEGA_CAP_USD = 200_000_000_000;

export function computeCqsMultipliers(
  input: CqsMultipliersInput,
): CqsMultipliersResult {
  const unavailable: string[] = [];

  const insiderOverlap =
    input.iqsScore != null && Number(input.iqsScore) >= 70 ? 1.2 : 1.0;
  if (input.iqsScore == null) unavailable.push('insiderOverlap');

  let legislativeCatalyst = 1.0;
  if (input.hasLegislativeCatalyst == null) unavailable.push('legislativeCatalyst');
  else if (input.hasLegislativeCatalyst) legislativeCatalyst = 1.1;

  let contrarianEntry = 1.0;
  if (input.priceVs52wHighPct == null) unavailable.push('contrarianEntry');
  else if (Number(input.priceVs52wHighPct) <= -20) contrarianEntry = 1.1;

  // Only meaningful for mega-caps; for everyone else it is not "unavailable",
  // it simply does not apply.
  let liquidityNorm = 1.0;
  const isMegaCap = input.marketCap != null && Number(input.marketCap) >= MEGA_CAP_USD;
  if (isMegaCap) {
    if (input.clusterVsAdvPct == null) unavailable.push('liquidityNorm');
    else if (Number(input.clusterVsAdvPct) < 0.0001) liquidityNorm = 0.8;
  }

  let filingLag = 1.0;
  if (input.maxFilingLagDays == null) unavailable.push('filingLag');
  else if (Number(input.maxFilingLagDays) >= 30) filingLag = 0.85;

  return {
    insiderOverlap,
    legislativeCatalyst,
    contrarianEntry,
    liquidityNorm,
    filingLag,
    combined:
      insiderOverlap * legislativeCatalyst * contrarianEntry * liquidityNorm * filingLag,
    unavailable,
  };
}

// ── Grades ────────────────────────────────────────────────────────────────
/** 90+ A+ · 80–89 A · 70–79 B+ · 60–69 B · <60 C. A and above earns the gold ring. */
export function cqsToGrade(cqs: number): { grade: string; isGoldRing: boolean } {
  const score = Math.round(cqs);
  const grade =
    score >= 90 ? 'A+' : score >= 80 ? 'A' : score >= 70 ? 'B+' : score >= 60 ? 'B' : 'C';
  return { grade, isGoldRing: score >= 80 };
}

// ── Composite ─────────────────────────────────────────────────────────────
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
  const cqs = clamp(Math.round(baseScore * mult.combined), 0, 100);
  const { grade, isGoldRing } = cqsToGrade(cqs);
  return { baseScore, cqs, grade, isGoldRing, multipliersResult: mult };
}

// ── Universe filter (Brief v9 §1 exclusions) ──────────────────────────────
/**
 * ETFs, mutual funds, Treasuries and municipal bonds are out of the universe.
 * PTRs carry no asset-class field on our table, so this reads the security's
 * own name and ticker — the same way the disclosure stream already labels
 * them. Deliberately conservative: it matches fund-issuer and bond wording,
 * not the word "Trust" on its own, which is in plenty of real REIT names.
 */
const FUND_TICKERS = new Set([
  'SPY', 'VOO', 'IVV', 'VTI', 'QQQ', 'QQQM', 'DIA', 'IWM', 'VEA', 'VWO', 'EFA', 'EEM',
  'AGG', 'BND', 'TLT', 'IEF', 'SHY', 'LQD', 'HYG', 'JNK', 'TIP', 'MUB', 'VTEB',
  'VUG', 'VTV', 'VIG', 'VYM', 'SCHD', 'SCHB', 'SCHX', 'ITOT', 'IJH', 'IJR', 'MDY',
  'XLF', 'XLK', 'XLE', 'XLV', 'XLI', 'XLY', 'XLP', 'XLU', 'XLB', 'XLRE', 'XLC',
  'GLD', 'SLV', 'IAU', 'USO', 'ARKK', 'SOXX', 'SMH', 'VGT', 'IBIT', 'FBTC',
  'BIL', 'SGOV', 'VMFXX', 'SPAXX', 'FDRXX',
]);

const FUND_NAME_PATTERNS = [
  /\bETF\b/i,
  /\bETN\b/i,
  /\bINDEX\s+FUND\b/i,
  /\bMUTUAL\s+FUND\b/i,
  /\bMONEY\s+MARKET\b/i,
  /\bUNIT\s+TRUST\b/i,
  /\bINVESTMENT\s+TRUST\b/i,
  /\bISHARES\b/i,
  /\bVANGUARD\b/i,
  /\bSPDR\b/i,
  /\bPROSHARES\b/i,
  /\bINVESCO\s+(QQQ|DB|S&P)/i,
  /\bDIREXION\b/i,
  /\bWISDOMTREE\b/i,
  /\bMUNICIPAL\b/i,
  /\bTREASUR(Y|IES)\b/i,
  /\bT-?BILLS?\b/i,
  /\b(CORPORATE|GOVERNMENT|MUNI)\s+BONDS?\b/i,
  /\bCERTIFICATE\s+OF\s+DEPOSIT\b/i,
];

export function isExcludedSecurity(
  ticker: string | null | undefined,
  name: string | null | undefined,
): boolean {
  const t = String(ticker || '').toUpperCase().trim();
  if (!t || t.length > 6 || /[^A-Z.\-]/.test(t)) return true;
  if (FUND_TICKERS.has(t)) return true;
  const n = String(name || '');
  return FUND_NAME_PATTERNS.some((re) => re.test(n));
}
