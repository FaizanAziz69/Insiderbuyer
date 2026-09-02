/**
 * IQS 2.0 — Workstream D: forward-return measurement.
 *
 * WHAT THIS IS NOT. The brief specifies a walk-forward design: a 60/20/20
 * chronological split and each year scored by a model fit on the prior seven.
 * Our Form 4 archive does not reach back that far — it holds 3 purchases
 * before 2025 and everything else is the last ~18 months — so a seven-year
 * refit cannot be computed, and a "held-out test period" would be a few weeks
 * drawn from the same market as the fit. Rather than dress a single-period
 * study up as walk-forward validation, this measures what the archive can
 * actually support and reports the sample size next to every figure. The full
 * protocol becomes possible once the archive is backfilled from EDGAR.
 *
 * Every figure here is HYPOTHETICAL and historical: it applies today's scoring
 * to past filings, which is not the same as having published those scores at
 * the time.
 */

export interface ForwardObservation {
  /** Trade Score 0–100 at the time of the purchase. */
  score: number;
  grade: string | null;
  /** Stock return over the horizon, in percent. */
  stockReturnPct: number;
  /** Benchmark return over the same window, in percent. */
  benchmarkReturnPct: number;
}

/** Stock return minus the benchmark over the same window. */
export const excessReturn = (o: ForwardObservation): number =>
  o.stockReturnPct - o.benchmarkReturnPct;

const mean = (xs: number[]): number =>
  xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;

export function median(xs: number[]): number {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Spearman rank correlation between score and excess return.
 *
 * Ranks rather than levels because a handful of microcap moves would otherwise
 * decide the answer — the question is whether a higher score tends to come
 * with a better outcome, not by how much in any one case. Ties take their
 * average rank.
 */
export function spearman(obs: ForwardObservation[]): number | null {
  const n = obs.length;
  if (n < 3) return null;
  const rank = (vals: number[]): number[] => {
    const idx = vals.map((v, i) => [v, i] as [number, number]).sort((a, b) => a[0] - b[0]);
    const out = new Array<number>(vals.length);
    let i = 0;
    while (i < idx.length) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      const avg = (i + j) / 2 + 1;
      for (let k = i; k <= j; k++) out[idx[k][1]] = avg;
      i = j + 1;
    }
    return out;
  };
  const rs = rank(obs.map((o) => o.score));
  const rr = rank(obs.map(excessReturn));
  const ms = mean(rs);
  const mr = mean(rr);
  let num = 0;
  let ds = 0;
  let dr = 0;
  for (let i = 0; i < n; i++) {
    const a = rs[i] - ms;
    const b = rr[i] - mr;
    num += a * b;
    ds += a * a;
    dr += b * b;
  }
  if (ds <= 0 || dr <= 0) return null;
  return +(num / Math.sqrt(ds * dr)).toFixed(4);
}

export interface Bucket {
  label: string;
  n: number;
  meanExcessPct: number;
  medianExcessPct: number;
  winRatePct: number;
}

function summarise(label: string, obs: ForwardObservation[]): Bucket {
  const ex = obs.map(excessReturn);
  return {
    label,
    n: obs.length,
    meanExcessPct: +mean(ex).toFixed(2),
    medianExcessPct: +median(ex).toFixed(2),
    winRatePct: obs.length
      ? +((ex.filter((x) => x > 0).length / ex.length) * 100).toFixed(1)
      : 0,
  };
}

/** Deciles by score, 1 = lowest. Ordered low → high so the spread is last − first. */
export function decileBuckets(obs: ForwardObservation[], count = 10): Bucket[] {
  if (obs.length < count) return [];
  const sorted = [...obs].sort((a, b) => a.score - b.score);
  const size = Math.floor(sorted.length / count);
  const out: Bucket[] = [];
  for (let i = 0; i < count; i++) {
    const slice =
      i === count - 1 ? sorted.slice(i * size) : sorted.slice(i * size, (i + 1) * size);
    out.push(summarise(`D${i + 1}`, slice));
  }
  return out;
}

/** The brief's grade check: A trades should outperform F trades. */
export const GRADE_ORDER = ['A+', 'A', 'B', 'C', 'D', 'F'];

export function gradeBuckets(obs: ForwardObservation[]): Bucket[] {
  return GRADE_ORDER.map((g) =>
    summarise(
      g,
      obs.filter((o) => o.grade === g),
    ),
  ).filter((b) => b.n > 0);
}

/**
 * "Broadly monotonic" in the brief's sense: the deciles need not be perfectly
 * ordered — with a few hundred observations they will not be — but the top
 * half must beat the bottom half and the spread must be positive.
 */
export function monotonicity(deciles: Bucket[]): {
  spreadPct: number;
  topHalfMinusBottomHalfPct: number;
  broadlyMonotonic: boolean;
} {
  if (deciles.length < 4) {
    return { spreadPct: 0, topHalfMinusBottomHalfPct: 0, broadlyMonotonic: false };
  }
  const half = Math.floor(deciles.length / 2);
  const bottom = mean(deciles.slice(0, half).map((d) => d.meanExcessPct));
  const top = mean(deciles.slice(half).map((d) => d.meanExcessPct));
  const spread = deciles[deciles.length - 1].meanExcessPct - deciles[0].meanExcessPct;
  return {
    spreadPct: +spread.toFixed(2),
    topHalfMinusBottomHalfPct: +(top - bottom).toFixed(2),
    broadlyMonotonic: spread > 0 && top > bottom,
  };
}

export const BACKTEST_DISCLAIMER =
  'Hypothetical and historical. Past scores were not published at the time, no trading costs or slippage are modelled beyond what is stated, market conditions change, and past performance does not indicate future results.';
