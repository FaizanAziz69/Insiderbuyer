/**
 * Badges and the congress Performance Grade — Brief v7 §2.4 and §4.2.
 *
 * "Badges are factual computations, never editorial labels — no 'suspicious',
 * no 'lucky'." Every badge below is a threshold on a number the engine
 * produced, awarded nightly, and the thresholds live here as CONFIG because
 * the brief says the defaults are starting points George approves.
 *
 * The grade is percentile-ranked WITHIN congress (a senator against senators,
 * per §4.2); the letter is the comparable layer across insider types, the
 * return numbers never are.
 */

export type BadgeKey =
  | 'TOP_PERFORMER'
  | 'HOT_HAND'
  | 'SHARPSHOOTER'
  | 'HIGH_VOLUME'
  | 'FAST_FILER'
  | 'GOLD_GRADE';

export const BADGE_META: Record<BadgeKey, { label: string; description: string }> = {
  TOP_PERFORMER: {
    label: 'Top 10 Performer',
    description: 'Top 10 estimated portfolio return since tracking began, among members with 20 or more priced trades.',
  },
  HOT_HAND: {
    label: 'Hot Hand',
    description: 'Top 10 estimated portfolio return over the trailing 90 days.',
  },
  SHARPSHOOTER: {
    label: 'Sharpshooter',
    description: '70% or more of disclosed buys are profitable so far, on 20 or more priced buys.',
  },
  HIGH_VOLUME: {
    label: 'High Volume',
    description: 'Top tenth of members by disclosed trade count over the trailing 12 months.',
  },
  FAST_FILER: {
    label: 'Fast Filer',
    description: 'Average gap between trade and disclosure under 15 days (the law allows 45).',
  },
  GOLD_GRADE: {
    label: 'Gold Grade',
    description: 'Performance Grade A or A+ among members of Congress.',
  },
};

export const BADGE_CONFIG = {
  /** Minimum priced trades to be ranked all-time, graded, or hit-rated (§2.2, §4.3). */
  minTrades: 20,
  topPerformerN: 10,
  hotHandN: 10,
  sharpshooterHitRate: 70,
  /** Fast Filer needs a few filings to mean anything. */
  fastFilerMinTrades: 5,
  fastFilerMaxLagDays: 15,
  highVolumeTopFraction: 0.1,
};

export type Grade = 'A+' | 'A' | 'B+' | 'B' | 'C+' | 'C';

/** Percentile (0 = worst … 1 = best) → letter. Cumulative from the top. */
export const GRADE_BANDS: Array<{ grade: Grade; topShare: number }> = [
  { grade: 'A+', topShare: 0.05 },
  { grade: 'A', topShare: 0.15 },
  { grade: 'B+', topShare: 0.3 },
  { grade: 'B', topShare: 0.5 },
  { grade: 'C+', topShare: 0.75 },
  { grade: 'C', topShare: 1 },
];

export function gradeForPercentile(pct: number): Grade {
  const fromTop = 1 - Math.max(0, Math.min(1, pct));
  for (const b of GRADE_BANDS) if (fromTop <= b.topShare + 1e-12) return b.grade;
  return 'C';
}

export const GOLD_GRADES: ReadonlySet<Grade> = new Set<Grade>(['A+', 'A']);

/** Percentile rank of each value within the list (ties share the average rank). 0..1. */
export function percentileRanks(values: Array<number | null>): Array<number | null> {
  const idx = values
    .map((v, i) => ({ v, i }))
    .filter((x): x is { v: number; i: number } => x.v != null && Number.isFinite(x.v))
    .sort((a, b) => a.v - b.v);
  const out: Array<number | null> = values.map(() => null);
  const n = idx.length;
  if (n === 0) return out;
  if (n === 1) {
    out[idx[0].i] = 0.5;
    return out;
  }
  let k = 0;
  while (k < n) {
    let j = k;
    while (j + 1 < n && idx[j + 1].v === idx[k].v) j++;
    const rank = (k + j) / 2; // average rank of the tie group
    for (let m = k; m <= j; m++) out[idx[m].i] = rank / (n - 1);
    k = j + 1;
  }
  return out;
}

/**
 * Congress grade inputs (§4.2): est. portfolio return, hit rate, activity,
 * disclosure speed. Weights are config too.
 */
export const GRADE_WEIGHTS = { returnAll: 0.4, hitRate: 0.3, activity: 0.15, filingSpeed: 0.15 };

export interface GradeInput {
  key: string;
  qualifies: boolean;
  retAll: number | null;
  hitRate: number | null;
  trades12m: number;
  avgLagDays: number | null;
}

/** Composite percentile per member; ungraded members come back null. */
export function gradeCongress(rows: GradeInput[]): Map<string, { grade: Grade; percentile: number }> {
  const graded = rows.filter((r) => r.qualifies && r.retAll != null);
  const pRet = percentileRanks(graded.map((r) => r.retAll));
  const pHit = percentileRanks(graded.map((r) => r.hitRate));
  const pAct = percentileRanks(graded.map((r) => r.trades12m));
  // Faster filing = better, so the sign flips.
  const pLag = percentileRanks(graded.map((r) => (r.avgLagDays == null ? null : -r.avgLagDays)));
  const composite = graded.map((_, i) => {
    let w = 0;
    let s = 0;
    const add = (p: number | null, weight: number) => {
      if (p == null) return;
      s += p * weight;
      w += weight;
    };
    add(pRet[i], GRADE_WEIGHTS.returnAll);
    add(pHit[i], GRADE_WEIGHTS.hitRate);
    add(pAct[i], GRADE_WEIGHTS.activity);
    add(pLag[i], GRADE_WEIGHTS.filingSpeed);
    return w > 0 ? s / w : null;
  });
  const final = percentileRanks(composite);
  const out = new Map<string, { grade: Grade; percentile: number }>();
  graded.forEach((r, i) => {
    const p = final[i];
    if (p == null) return;
    out.set(r.key, { grade: gradeForPercentile(p), percentile: p });
  });
  return out;
}

export interface BadgeInput {
  key: string;
  qualifies: boolean;
  retAll: number | null;
  ret90d: number | null;
  hitRate: number | null;
  hitSample: number;
  trades12m: number;
  tradesTotal: number;
  avgLagDays: number | null;
  grade: Grade | null;
}

/** Award every badge across the population at once (ranks need the whole field). */
export function awardBadges(rows: BadgeInput[], cfg = BADGE_CONFIG): Map<string, BadgeKey[]> {
  const out = new Map<string, BadgeKey[]>();
  const give = (k: string, b: BadgeKey) => {
    const arr = out.get(k) || [];
    if (!arr.includes(b)) arr.push(b);
    out.set(k, arr);
  };
  // A "top performer" with a losing record is a small-sample artefact, so a
  // positive return is required as well as a top-10 rank.
  rows
    .filter((r) => r.qualifies && r.retAll != null && r.retAll > 0)
    .sort((a, b) => (b.retAll as number) - (a.retAll as number))
    .slice(0, cfg.topPerformerN)
    .forEach((r) => give(r.key, 'TOP_PERFORMER'));
  rows
    .filter((r) => r.ret90d != null && r.ret90d > 0 && r.trades12m > 0)
    .sort((a, b) => (b.ret90d as number) - (a.ret90d as number))
    .slice(0, cfg.hotHandN)
    .forEach((r) => give(r.key, 'HOT_HAND'));
  for (const r of rows) {
    if (r.hitRate != null && r.hitSample >= cfg.minTrades && r.hitRate >= cfg.sharpshooterHitRate) give(r.key, 'SHARPSHOOTER');
    if (r.avgLagDays != null && r.tradesTotal >= cfg.fastFilerMinTrades && r.avgLagDays < cfg.fastFilerMaxLagDays) give(r.key, 'FAST_FILER');
    if (r.grade && GOLD_GRADES.has(r.grade)) give(r.key, 'GOLD_GRADE');
  }
  const active = rows.filter((r) => r.trades12m > 0).map((r) => r.trades12m).sort((a, b) => a - b);
  if (active.length) {
    const cut = active[Math.max(0, Math.floor(active.length * (1 - cfg.highVolumeTopFraction)))];
    for (const r of rows) if (r.trades12m > 0 && r.trades12m >= cut && cut > 0) give(r.key, 'HIGH_VOLUME');
  }
  return out;
}

/** The standing frame, rendered above every leaderboard (Brief v5 §5 carries over verbatim). */
export const STANDING_FRAME =
  'Members of Congress may lawfully own and trade stocks, and these trades are disclosed under the STOCK Act. ' +
  'This page reports the proximity of public records and draws no conclusion of wrongdoing. Proximity is not causation.';

export const ESTIMATE_NOTE =
  'Every figure here is an estimate from disclosed trades: filings report a dollar range, and we use its midpoint; ' +
  'disclosures can lag a trade by up to 45 days; options, bonds and unlisted assets count toward activity but not toward value; ' +
  'dividends are excluded. This is the disclosed stock portfolio, not net worth.';
