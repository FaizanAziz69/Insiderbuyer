/**
 * §7 — the metrics stack and the governing objective.
 *
 * "the entire strategy is evaluated, tuned, and reported on RISK-ADJUSTED
 * returns, never absolute returns." Sortino is the primary metric because it
 * penalises only downside deviation, which is what the objective actually
 * cares about; Sharpe is computed for comparability and is explicitly never
 * the optimisation target.
 */

export interface RiskMetrics {
  periods: number;
  years: number;
  totalReturn: number;
  cagr: number;
  sortino: number | null;
  sharpe: number | null;
  calmar: number | null;
  maxDrawdown: number;
  downsideDeviation: number;
  volatility: number;
  downsideCapture: number | null;
  upsideCapture: number | null;
  benchmarkTotalReturn: number | null;
  meetsCaptureTargets: boolean | null;
  /** No period fell below the target, so downside deviation is zero and the
   *  Sortino ratio is a division by zero rather than a bad score. Reported
   *  explicitly because the selection rule has to treat it as the best case,
   *  not the worst — and because a short sample is the usual reason for it. */
  downsideFree: boolean;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

/** Periodic simple returns from an equity curve. */
export function returnsOf(equity: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < equity.length; i++) {
    const prev = equity[i - 1];
    if (prev > 0) out.push(equity[i] / prev - 1);
  }
  return out;
}

export function maxDrawdown(equity: number[]): number {
  let peak = -Infinity;
  let worst = 0;
  for (const v of equity) {
    if (v > peak) peak = v;
    if (peak > 0) worst = Math.max(worst, 1 - v / peak);
  }
  return worst;
}

/**
 * Downside deviation: the root-mean-square of returns BELOW the target, taken
 * over the whole sample rather than only the losing periods. Dividing by the
 * count of losses instead of the count of periods is the usual mistake and it
 * flatters a strategy that rarely loses but loses hard.
 */
export function downsideDeviation(returns: number[], target = 0): number {
  if (!returns.length) return 0;
  const sq = returns.map((r) => (r < target ? (r - target) ** 2 : 0));
  return Math.sqrt(mean(sq));
}

export function volatility(returns: number[]): number {
  if (returns.length < 2) return 0;
  const m = mean(returns);
  return Math.sqrt(mean(returns.map((r) => (r - m) ** 2)));
}

/**
 * Capture ratios. §7.1 defines the targets numerically: downside capture
 * <= 80% is "protecting down cycles", upside capture >= 90% is "growth".
 * Both are computed only over the benchmark's own up or down periods.
 */
export function captureRatios(
  portfolio: number[],
  benchmark: number[],
): { downside: number | null; upside: number | null } {
  const n = Math.min(portfolio.length, benchmark.length);
  const upP: number[] = [];
  const upB: number[] = [];
  const dnP: number[] = [];
  const dnB: number[] = [];
  for (let i = 0; i < n; i++) {
    if (benchmark[i] > 0) {
      upP.push(portfolio[i]);
      upB.push(benchmark[i]);
    } else if (benchmark[i] < 0) {
      dnP.push(portfolio[i]);
      dnB.push(benchmark[i]);
    }
  }
  const up = upB.length && mean(upB) !== 0 ? mean(upP) / mean(upB) : null;
  const dn = dnB.length && mean(dnB) !== 0 ? mean(dnP) / mean(dnB) : null;
  return { upside: up, downside: dn };
}

export function riskMetrics(
  equity: number[],
  opts: { periodsPerYear: number; benchmarkEquity?: number[]; riskFreeAnnual?: number; downsideTarget?: number; upsideTarget?: number },
): RiskMetrics {
  const ppy = opts.periodsPerYear;
  const rets = returnsOf(equity);
  const periods = rets.length;
  const years = periods / ppy;
  const totalReturn = equity.length > 1 && equity[0] > 0 ? equity[equity.length - 1] / equity[0] - 1 : 0;
  const cagr = years > 0 && equity[0] > 0 ? Math.pow(equity[equity.length - 1] / equity[0], 1 / years) - 1 : 0;
  const rf = (opts.riskFreeAnnual ?? 0) / ppy;

  const dd = downsideDeviation(rets, rf);
  const vol = volatility(rets);
  const excess = mean(rets) - rf;
  const annualise = Math.sqrt(ppy);
  const mdd = maxDrawdown(equity);

  let capture: { downside: number | null; upside: number | null } = { downside: null, upside: null };
  let benchTotal: number | null = null;
  if (opts.benchmarkEquity && opts.benchmarkEquity.length > 1) {
    const bRets = returnsOf(opts.benchmarkEquity);
    capture = captureRatios(rets, bRets);
    benchTotal = opts.benchmarkEquity[0] > 0 ? opts.benchmarkEquity[opts.benchmarkEquity.length - 1] / opts.benchmarkEquity[0] - 1 : null;
  }

  const dTarget = opts.downsideTarget ?? 0.8;
  const uTarget = opts.upsideTarget ?? 0.9;
  const meets =
    capture.downside == null || capture.upside == null
      ? null
      : capture.downside <= dTarget && capture.upside >= uTarget;

  const downsideFree = dd === 0 && rets.length > 0;
  return {
    downsideFree,
    periods,
    years: Math.round(years * 100) / 100,
    totalReturn: Math.round(totalReturn * 1e4) / 1e4,
    cagr: Math.round(cagr * 1e4) / 1e4,
    sortino: dd > 0 ? Math.round((excess / dd) * annualise * 100) / 100 : null,
    sharpe: vol > 0 ? Math.round((excess / vol) * annualise * 100) / 100 : null,
    calmar: mdd > 0 ? Math.round((cagr / mdd) * 100) / 100 : null,
    maxDrawdown: Math.round(mdd * 1e4) / 1e4,
    downsideDeviation: Math.round(dd * annualise * 1e4) / 1e4,
    volatility: Math.round(vol * annualise * 1e4) / 1e4,
    downsideCapture: capture.downside == null ? null : Math.round(capture.downside * 1e4) / 1e4,
    upsideCapture: capture.upside == null ? null : Math.round(capture.upside * 1e4) / 1e4,
    benchmarkTotalReturn: benchTotal == null ? null : Math.round(benchTotal * 1e4) / 1e4,
    meetsCaptureTargets: meets,
  };
}

/**
 * §7.2 parameter selection: "backtests are optimized for Sortino and Calmar
 * subject to the capture-ratio targets — never for CAGR. Two parameter sets
 * with equal Sortino tie-break toward the lower max drawdown."
 * Returns the winner, so the rule lives in code rather than in a habit.
 */
export function chooseParameters<T extends { metrics: RiskMetrics }>(candidates: T[]): T | null {
  const viable = candidates.filter((c) => c.metrics.meetsCaptureTargets !== false);
  const pool = viable.length ? viable : candidates;
  if (!pool.length) return null;
  // A set that never had a losing period has an undefined Sortino, not a bad
  // one: it dominates on exactly the axis §7 optimises for.
  const sortinoOf = (m: RiskMetrics) =>
    m.sortino != null ? m.sortino : m.downsideFree && m.totalReturn > 0 ? Infinity : -Infinity;
  return [...pool].sort((a, b) => {
    const sa = sortinoOf(a.metrics);
    const sb = sortinoOf(b.metrics);
    if (sa === Infinity && sb === Infinity) return a.metrics.maxDrawdown - b.metrics.maxDrawdown;
    if (Math.abs(sa - sb) > 1e-9) return sb - sa;
    // Equal Sortino: the lower max drawdown wins, per §7.2.
    if (Math.abs(a.metrics.maxDrawdown - b.metrics.maxDrawdown) > 1e-9) {
      return a.metrics.maxDrawdown - b.metrics.maxDrawdown;
    }
    return (b.metrics.calmar ?? -Infinity) - (a.metrics.calmar ?? -Infinity);
  })[0];
}

/**
 * A change is accepted only if it does not worsen downside behaviour — §7's
 * rule that "a parameter change ... that raises expected return but worsens
 * downside behavior is rejected by rule".
 */
export function acceptsChange(before: RiskMetrics, after: RiskMetrics): { accept: boolean; reason: string } {
  const sortinoOf = (m: RiskMetrics) =>
    m.sortino != null ? m.sortino : m.downsideFree && m.totalReturn > 0 ? Infinity : -Infinity;
  if (sortinoOf(after) < sortinoOf(before)) {
    return { accept: false, reason: 'Sortino falls; the objective is risk-adjusted, not absolute.' };
  }
  if (after.maxDrawdown > before.maxDrawdown + 1e-9) {
    return { accept: false, reason: 'Maximum drawdown worsens.' };
  }
  if (after.downsideCapture != null && before.downsideCapture != null && after.downsideCapture > before.downsideCapture + 1e-9) {
    return { accept: false, reason: 'Downside capture worsens.' };
  }
  return { accept: true, reason: 'Sortino held or improved with no worse drawdown or downside capture.' };
}
