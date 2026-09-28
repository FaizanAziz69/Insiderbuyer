/**
 * Spec 7.1 — normalization.
 *
 * Every input becomes a percentile rank 0–100 within the gated universe.
 * Lower-is-better inputs are inverted. Raw values are winsorized at the 1st
 * and 99th percentiles first, so one absurd print cannot shove the whole
 * distribution. Sector-relative inputs rank within GICS sector.
 */

export function winsorize(values: Array<number | null>, lo = 0.01, hi = 0.99): Array<number | null> {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v)).sort((a, b) => a - b);
  if (xs.length < 3) return values;
  const q = (f: number) => xs[Math.min(xs.length - 1, Math.max(0, Math.floor(f * (xs.length - 1))))];
  const a = q(lo);
  const b = q(hi);
  return values.map((v) => (v == null || !Number.isFinite(v) ? null : Math.min(b, Math.max(a, v))));
}

/**
 * Percentile rank of each value among the non-null values, 0–100.
 * Ties share the mean rank. `invert` flips so lower raw = higher score.
 */
export function percentileRank(values: Array<number | null>, invert = false): Array<number | null> {
  const idx: number[] = [];
  values.forEach((v, i) => { if (v != null && Number.isFinite(v)) idx.push(i); });
  const n = idx.length;
  const out: Array<number | null> = values.map(() => null);
  if (n === 0) return out;
  if (n === 1) { out[idx[0]] = 50; return out; }
  const sorted = [...idx].sort((a, b) => (values[a] as number) - (values[b] as number));
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j + 1 < sorted.length && values[sorted[j + 1]] === values[sorted[i]]) j++;
    const meanRank = (i + j) / 2; // 0-based
    const pct = (meanRank / (n - 1)) * 100;
    for (let k = i; k <= j; k++) out[sorted[k]] = invert ? 100 - pct : pct;
    i = j + 1;
  }
  return out;
}

/** Rank within groups (e.g. GICS sector); a group of one scores 50. */
export function percentileRankWithin(
  values: Array<number | null>,
  groups: Array<string | null>,
  invert = false,
): Array<number | null> {
  const out: Array<number | null> = values.map(() => null);
  const byGroup = new Map<string, number[]>();
  values.forEach((_, i) => {
    const g = groups[i] ?? '__none__';
    const list = byGroup.get(g) ?? [];
    list.push(i);
    byGroup.set(g, list);
  });
  for (const idx of byGroup.values()) {
    const sub = idx.map((i) => values[i]);
    const ranked = percentileRank(sub, invert);
    idx.forEach((i, k) => { out[i] = ranked[k]; });
  }
  return out;
}

/**
 * A screen is the equal-weighted mean of its available inputs if ≥ 60% are
 * present; otherwise null (Spec 7.1). Null is a real answer here — it feeds
 * G-08 and the confluence count — so it is never coerced to 0.
 */
export function screenMean(inputs: Array<number | null>, minCoverage = 0.6): number | null {
  const present = inputs.filter((v): v is number => v != null && Number.isFinite(v));
  if (!inputs.length || present.length / inputs.length < minCoverage) return null;
  return present.reduce((a, b) => a + b, 0) / present.length;
}

/**
 * Linear ramp from the universe median to a threshold (Spec 7.1: "acceptable
 * in Phase 1"). Used where the Rulebook states an absolute "full marks" level
 * rather than a percentile: at or above the threshold → 100, at the median →
 * 50, below the median follows the percentile rank so the bottom still
 * orders.
 */
export function rampToThreshold(value: number | null, median: number | null, threshold: number, pctRank: number | null, higherIsBetter = true): number | null {
  if (value == null || !Number.isFinite(value)) return null;
  if (median == null || pctRank == null) return pctRank;
  const reached = higherIsBetter ? value >= threshold : value <= threshold;
  if (reached) return 100;
  const pastMedian = higherIsBetter ? value > median : value < median;
  if (!pastMedian) return Math.min(pctRank, 50);
  const span = Math.abs(threshold - median) || 1;
  const progress = Math.abs(value - median) / span;
  return 50 + 50 * Math.min(1, progress);
}

export const median = (xs: Array<number | null>): number | null => {
  const v = xs.filter((x): x is number => x != null && Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
