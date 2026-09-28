/**
 * Spec 10A.1 — pricing and probability models for the Execution Guide.
 *
 * Pricing: live chain mids when fresh, otherwise Black–Scholes with a
 * continuous dividend yield. Probability v1: lognormal on the option-implied
 * volatility for the horizon — P(finish ≥ target) and P(touch target). The
 * guide prints "implied-vol model" beside every probability until a
 * calibrated classifier beats it on held-out data (10A.1, v2).
 *
 * Pure functions, no I/O, so the 5A worked example can be reproduced in a
 * unit test to ±5% (10A.5).
 */

const SQRT2 = Math.SQRT2;
/** Standard normal CDF via erf (Abramowitz–Stegun 7.1.26, |err| < 1.5e-7). */
export function normCdf(x: number): number {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return 0.5 * (1 + (x >= 0 ? y : -y));
}

export interface BsInput {
  spot: number; strike: number; tYears: number; rate: number; vol: number; divYield?: number;
}

export function blackScholes(i: BsInput): { call: number; put: number; callDelta: number; putDelta: number } {
  const q = i.divYield ?? 0;
  if (i.tYears <= 0 || i.vol <= 0) {
    const call = Math.max(0, i.spot - i.strike);
    const put = Math.max(0, i.strike - i.spot);
    return { call, put, callDelta: i.spot > i.strike ? 1 : 0, putDelta: i.spot < i.strike ? -1 : 0 };
  }
  const sT = i.vol * Math.sqrt(i.tYears);
  const d1 = (Math.log(i.spot / i.strike) + (i.rate - q + (i.vol * i.vol) / 2) * i.tYears) / sT;
  const d2 = d1 - sT;
  const df = Math.exp(-i.rate * i.tYears);
  const dq = Math.exp(-q * i.tYears);
  const call = i.spot * dq * normCdf(d1) - i.strike * df * normCdf(d2);
  const put = i.strike * df * normCdf(-d2) - i.spot * dq * normCdf(-d1);
  return { call, put, callDelta: dq * normCdf(d1), putDelta: dq * (normCdf(d1) - 1) };
}

/** P(S_T ≥ target) under a driftless lognormal at the implied vol. */
export function probFinishAbove(spot: number, target: number, vol: number, tYears: number, rate = 0, divYield = 0): number {
  if (tYears <= 0 || vol <= 0) return spot >= target ? 1 : 0;
  const sT = vol * Math.sqrt(tYears);
  const mu = (rate - divYield - (vol * vol) / 2) * tYears;
  const z = (Math.log(target / spot) - mu) / sT;
  return 1 - normCdf(z);
}

/** P(max_{t≤T} S_t ≥ target) — reflection-principle touch probability for a driftless lognormal. */
export function probTouch(spot: number, target: number, vol: number, tYears: number): number {
  if (target <= spot) return 1;
  if (tYears <= 0 || vol <= 0) return 0;
  const sT = vol * Math.sqrt(tYears);
  const b = Math.log(target / spot);
  // Driftless: P(touch) = 2 · P(finish ≥ target)
  return Math.min(1, 2 * (1 - normCdf(b / sT)));
}

/** P(S_T ≤ level) — for the bear/stop outcome. */
export function probFinishBelow(spot: number, level: number, vol: number, tYears: number, rate = 0, divYield = 0): number {
  return 1 - probFinishAbove(spot, level, vol, tYears, rate, divYield);
}

/**
 * Standard listed strike ladder: $0.50 under $25, $1 to $200, $2.50 to
 * $500, $5 above. Real chains deviate; when a chain is on file its own
 * strikes are used and this is only the fallback.
 */
export function standardStrikes(spot: number, count = 30): number[] {
  const step = spot < 25 ? 0.5 : spot < 200 ? 1 : spot < 500 ? 2.5 : 5;
  const base = Math.round(spot / step) * step;
  const out: number[] = [];
  for (let k = -count; k <= count; k++) out.push(+(base + k * step).toFixed(2));
  return out.filter((s) => s > 0);
}

/** Third Friday of a month (monthly expiry); ISO date. */
export function thirdFriday(year: number, month0: number): string {
  const d = new Date(Date.UTC(year, month0, 1));
  const dow = d.getUTCDay();
  const first = dow <= 5 ? 5 - dow : 12 - dow;
  const day = 1 + first + 14;
  return new Date(Date.UTC(year, month0, day)).toISOString().slice(0, 10);
}

/** First monthly expiry on/after `minDate`, then those within `maxDays` of `from`. */
export function monthlyExpiries(from: string, minDate: string, maxDays: number): string[] {
  const start = new Date(`${from}T00:00:00Z`);
  const out: string[] = [];
  for (let m = 0; m < 8; m++) {
    const d = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + m, 1));
    const exp = thirdFriday(d.getUTCFullYear(), d.getUTCMonth());
    const days = (Date.parse(`${exp}T00:00:00Z`) - start.getTime()) / 86_400_000;
    if (exp >= minDate && days <= maxDays && days > 0) out.push(exp);
  }
  return out;
}
