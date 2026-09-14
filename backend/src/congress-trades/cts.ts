/**
 * Congress Trade Score — Brief v5 §3, and the §5 editorial rules that bind
 * every line of copy this product emits.
 *
 * §3 is unambiguous about what the number is not: "The CTS measures documented
 * proximity between disclosed facts. It is explicitly NOT a corruption
 * probability, and no surface may describe it as one." That sentence is the
 * reason the vocabulary rules below are executable code rather than a style
 * note — §5 says the rules are "enforced at the template level, not left to
 * judgment", and a rule enforced by judgment is a rule that fails on the day
 * somebody is in a hurry.
 */

// ── Scoring (§3) ─────────────────────────────────────────────────────────

export interface CtsWeights {
  /** Chair/ranking on the overseeing committee over rank-and-file; a
   *  subcommittee with direct jurisdiction over full-committee membership. */
  committeeRole: number;
  /** Trade date against award date. Buys shortly before an award score
   *  highest; long-held positions lower. */
  timing: number;
  /** Estimated position value against that member's typical trade size. */
  positionSize: number;
  /** Award value against company revenue — "$2B to a small cap ≫ $5M to a
   *  mega cap". */
  awardMateriality: number;
}

/** §3's suggested weights. "George approves final weights before launch", so
 *  these are the starting point and the admin can change them without a
 *  deploy — the same arrangement the Promoter Score uses. */
export const CTS_DEFAULT_WEIGHTS: CtsWeights = {
  committeeRole: 30,
  timing: 30,
  positionSize: 20,
  awardMateriality: 20,
};

export const CTS_WEIGHT_KEYS = Object.keys(CTS_DEFAULT_WEIGHTS) as Array<keyof CtsWeights>;

export function normalizeCtsWeights(input: Partial<CtsWeights> | null | undefined): CtsWeights {
  const out = { ...CTS_DEFAULT_WEIGHTS };
  for (const k of CTS_WEIGHT_KEYS) {
    const v = Number((input as any)?.[k]);
    if (isFinite(v) && v >= 0 && v <= 1000) out[k] = Math.round(v * 100) / 100;
  }
  return CTS_WEIGHT_KEYS.reduce((s, k) => s + out[k], 0) > 0 ? out : { ...CTS_DEFAULT_WEIGHTS };
}

export type CommitteeRole = 'chair' | 'ranking' | 'viceChair' | 'member';

export interface CtsInputs {
  role: CommitteeRole;
  /** The jurisdiction came from a subcommittee, which §3 scores above
   *  full-committee-only membership. */
  viaSubcommittee: boolean;
  /** Days from the trade to the award. Negative = bought BEFORE the award,
   *  which §3 scores highest. Null for a holding with no trade in window. */
  daysTradeToAward: number | null;
  /** Estimated value of this position/trade, CAD-agnostic (USD here). */
  positionValue: number | null;
  /** That member's median disclosed trade value, for the "relative to the
   *  member's typical trade size" comparison. */
  memberMedianTrade: number | null;
  /** Award value and the company's annual revenue, for materiality. */
  awardValue: number | null;
  companyRevenue: number | null;
}

export interface CtsBreakdown {
  score: number | null;
  components: Record<keyof CtsWeights, number | null>;
  weights: CtsWeights;
}

const clamp100 = (v: number) => Math.max(0, Math.min(100, v));

/**
 * Each component is scored 0–100 on its own terms, then blended. A component
 * with no data is DROPPED and the remaining weights rescaled rather than
 * scored zero — a member whose typical trade size we cannot compute should be
 * ranked on what is known about them, not pushed down the leaderboard for a
 * gap in someone else's dataset.
 */
export function scoreCts(i: CtsInputs, weights: CtsWeights = CTS_DEFAULT_WEIGHTS): CtsBreakdown {
  const components: Record<keyof CtsWeights, number | null> = {
    committeeRole: roleScore(i.role, i.viaSubcommittee),
    timing: timingScore(i.daysTradeToAward),
    positionSize: sizeScore(i.positionValue, i.memberMedianTrade),
    awardMateriality: materialityScore(i.awardValue, i.companyRevenue),
  };

  let num = 0;
  let den = 0;
  for (const k of CTS_WEIGHT_KEYS) {
    const v = components[k];
    if (v == null) continue;
    num += v * weights[k];
    den += weights[k];
  }
  return {
    score: den > 0 ? Math.round((num / den) * 100) / 100 : null,
    components,
    weights,
  };
}

/** §3: "Chair/ranking on the overseeing committee scores higher than
 *  rank-and-file; subcommittee with direct jurisdiction higher than full
 *  committee only". */
function roleScore(role: CommitteeRole, viaSubcommittee: boolean): number {
  const base = role === 'chair' ? 100 : role === 'ranking' ? 85 : role === 'viceChair' ? 75 : 50;
  // A seat on the subcommittee that actually writes the cheque is closer to
  // the money than a seat on the parent committee.
  return clamp100(viaSubcommittee ? base : base - 12);
}

/**
 * §3: "buys shortly before an award score highest; long-held positions lower".
 *
 * Negative days = the trade came first. The peak is a purchase in the weeks
 * immediately before the award; it decays in both directions, and a position
 * merely held with no trade in the window scores lowest of all — which is the
 * honest ordering, because a long-held position is the least remarkable thing
 * on this list.
 */
function timingScore(days: number | null): number | null {
  if (days == null) return 20; // holding only, no trade in window
  const d = Math.abs(days);
  const before = days <= 0;
  if (before) {
    if (d <= 30) return 100;
    if (d <= 60) return 88;
    if (d <= 90) return 75;
    if (d <= 180) return 60;
    return 45;
  }
  // Bought AFTER the award is public information — materially less pointed,
  // but still inside the window the brief asks us to surface.
  if (d <= 30) return 55;
  if (d <= 90) return 40;
  return 30;
}

/** §3: position value "relative to the member's typical trade size". */
function sizeScore(value: number | null, median: number | null): number | null {
  if (value == null || !isFinite(value) || value <= 0) return null;
  if (median == null || !isFinite(median) || median <= 0) {
    // No baseline for this member: fall back to absolute size, which still
    // separates a $1,001 disclosure from a $1M one.
    return clamp100((Math.log10(value) - 3) * 25);
  }
  const ratio = value / median;
  if (ratio >= 10) return 100;
  if (ratio >= 5) return 88;
  if (ratio >= 2) return 72;
  if (ratio >= 1) return 55;
  if (ratio >= 0.5) return 38;
  return 22;
}

/** §3: "a $2B award to a small cap ≫ $5M to a mega cap". */
function materialityScore(award: number | null, revenue: number | null): number | null {
  if (award == null || !isFinite(award) || award <= 0) return null;
  if (revenue == null || !isFinite(revenue) || revenue <= 0) {
    return clamp100((Math.log10(award) - 6) * 22);
  }
  const share = award / revenue;
  if (share >= 0.5) return 100;
  if (share >= 0.2) return 90;
  if (share >= 0.1) return 78;
  if (share >= 0.05) return 64;
  if (share >= 0.01) return 45;
  return 25;
}

// ── Editorial rules (§5), executable ─────────────────────────────────────

/**
 * §5: "Banned words in generated copy: corruption, insider trading (in the
 * criminal sense), profiteering, kickback, bribe, and any synonym."
 *
 * "And any synonym" is the part that matters, so this list is deliberately
 * wider than the five words named. It is checked against every string this
 * product publishes — first publication and the verification agent's
 * regenerated prose alike (§2 Stage 5: "the banned-word list and template
 * rules bind the agent's regenerated prose exactly as they bind first
 * publication").
 */
export const BANNED_TERMS: string[] = [
  'corrupt', 'corruption', 'bribe', 'bribery', 'kickback', 'kick-back',
  'profiteer', 'profiteering', 'insider trading', 'insider-trading',
  'front-running', 'front running', 'self-dealing', 'self dealing',
  'graft', 'crony', 'cronyism', 'collusion', 'colluded', 'conspiracy',
  'scheme', 'scandal', 'illegal', 'unlawful', 'criminal', 'fraud',
  'exploit', 'rigged', 'shady', 'suspicious', 'shameless',
];

/**
 * Words that assert a state of mind. §5: "No inference about motive,
 * knowledge, or intent — ever." These are rejected separately from the banned
 * list because they are the failure a careful writer actually makes: not
 * calling someone corrupt, but writing that they "knew" or "positioned
 * themselves ahead of" an award.
 */
export const INTENT_TERMS: string[] = [
  'knew', 'knowingly', 'aware of', 'anticipating', 'ahead of the announcement',
  'positioned themselves', 'positioned himself', 'positioned herself',
  'cashed in', 'profited from', 'took advantage', 'benefited from',
  'timed the', 'tipped off', 'in the know',
];

export interface CopyCheck {
  ok: boolean;
  violations: Array<{ term: string; kind: 'banned' | 'intent' }>;
}

/**
 * Gate every published string through this. Returns what is wrong rather than
 * throwing, so a caller can log the row and keep the pipeline running instead
 * of failing a whole batch on one sentence.
 */
export function checkCopy(text: string): CopyCheck {
  const low = ` ${String(text || '').toLowerCase()} `;
  const violations: CopyCheck['violations'] = [];
  for (const term of BANNED_TERMS) {
    if (low.includes(term)) violations.push({ term, kind: 'banned' });
  }
  for (const term of INTENT_TERMS) {
    if (low.includes(term)) violations.push({ term, kind: 'intent' });
  }
  return { ok: violations.length === 0, violations };
}

/**
 * §5's standing frame, carried on every surface that shows a flag. Kept here
 * so the page, the alert and the data article cannot drift from each other.
 */
export const STANDING_FRAME =
  'Members of Congress may lawfully own and trade stocks, and these trades are disclosed under the STOCK Act. ' +
  'This page reports the proximity of public records — a disclosed trade, a public committee assignment and a ' +
  'public contract award — and draws no conclusion of wrongdoing. Proximity is not causation.';

/** §5: "Every date shown distinguishes transaction date vs. disclosure date;
 *  every amount is labeled an estimate from the disclosed range." */
export const AMOUNT_NOTE =
  'Amounts are estimates: disclosures report a range, and the figure shown is that range’s midpoint.';

/**
 * §5's headline standard: "name + neutral verb + verifiable number".
 *
 * Built here rather than in a template string at the call site so there is
 * exactly one shape of sentence to review with counsel, and so the copy check
 * runs on the way out.
 */
export function flagHeadline(input: {
  member: string;
  committee: string;
  agency: string;
  awardValue: number;
  company: string;
  ticker: string;
}): string {
  const money =
    input.awardValue >= 1e9
      ? `$${(input.awardValue / 1e9).toFixed(2)}B`
      : `$${Math.round(input.awardValue / 1e6)}M`;
  return (
    `${input.member} sits on the ${input.committee}, which has jurisdiction over the ${input.agency}. ` +
    `The ${input.agency} awarded ${money} to ${input.company} (${input.ticker}), a company ${input.member} reports holding.`
  );
}
