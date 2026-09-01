/**
 * IQS 2.0 — Workstream B: the Trade Score (0–100 per surviving purchase).
 *
 * Pure functions, one per component, so Workstream D can re-fit weights and
 * the explainer can render every input, sub-score and formula step without
 * re-deriving anything. Nothing here touches the database or a vendor.
 *
 * Sign conventions worth stating once, because the brief calls them out:
 *  · contrarian timing scores UP for buying into weakness (momentum is
 *    negatively related to trade informativeness — the defect IQS 1.0 had
 *    backwards);
 *  · routine buying scores DOWN (Cohen–Malloy–Pomorski);
 *  · a missing input falls to a documented neutral, never to zero — zero is a
 *    finding, and we only publish findings we can support.
 */
import { TradeWeights, WEIGHTS_LAUNCH, IQS2_CONFIG } from './config';

export const clamp = (x: number, lo: number, hi: number): number =>
  Math.min(hi, Math.max(lo, x));

/**
 * Null-safe numeric read. `Number(null)` is 0, not NaN, so a plain
 * `Number.isFinite(Number(x))` guard silently turns "we have no data" into a
 * real value of zero — which is how a missing price history would have been
 * scored as flat performance. Every optional input goes through this.
 */
export function num(x: unknown): number | null {
  if (x === null || x === undefined || x === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

/* ── Conviction size (35) ─────────────────────────────────────────────── */

/** 20 pts: log10(dollars) mapped linearly over 3.5–7.0 (~$3K → $10M). */
export function scoreConvictionDollars(dollars: number | null | undefined): number {
  const d = num(dollars);
  if (d === null || d <= 0) return 0;
  const lo = 3.5;
  const hi = 7.0;
  return clamp((Math.log10(d) - lo) / (hi - lo), 0, 1) * 20;
}

/**
 * 15 pts: shares bought ÷ prior holdings, capped at 1.0 (doubling the stake
 * earns full marks). A first-ever holder — prior holdings 0 — takes the full
 * 15: they went from no stake to a stake, which is the strongest version of
 * this signal, not an undefined ratio.
 */
export function scoreHoldingsRatio(
  sharesBought: number | null | undefined,
  priorHoldings: number | null | undefined,
): number {
  const bought = num(sharesBought);
  if (bought === null || bought <= 0) return 0;
  const prior = num(priorHoldings);
  if (prior === null || prior <= 0) return 15;
  return clamp(bought / prior, 0, 1) * 15;
}

export function scoreConviction(
  dollars: number | null | undefined,
  sharesBought: number | null | undefined,
  priorHoldings: number | null | undefined,
): number {
  return scoreConvictionDollars(dollars) + scoreHoldingsRatio(sharesBought, priorHoldings);
}

/* ── Insider track record (10) ────────────────────────────────────────── */

/**
 * Median 6-month market-adjusted return following this insider's prior scored
 * buys, across every issuer they have filed on (identity resolves on CIK).
 * Fewer than the configured minimum of prior buys keeps the neutral prior —
 * two data points are not a track record.
 */
export function scoreTrackRecord(
  medianForwardReturnPct: number | null | undefined,
  priorBuyCount: number | null | undefined,
): number {
  const n = num(priorBuyCount) ?? 0;
  const r = num(medianForwardReturnPct);
  if (n < IQS2_CONFIG.trackRecordMinPriorBuys || r === null) {
    return IQS2_CONFIG.trackRecordNeutral;
  }
  if (r <= -5) return 2;
  if (r <= 0) return 4;
  if (r <= 10) return 7;
  return 10;
}

/* ── Seniority (15) ───────────────────────────────────────────────────── */

const SENIOR_TITLE =
  /chief executive|\bceo\b|chief financial|\bcfo\b|chief operating|\bcoo\b|president/i;
const FINANCE_TITLE =
  /chief financial|\bcfo\b|treasurer|chief accounting|controller/i;
const OFFICER_TITLE =
  /officer|chief|\bevp\b|\bsvp\b|vice president|\bvp\b|general counsel|secretary|treasurer/i;
const DIRECTOR_TITLE = /director|chair/i;

/**
 * Absorbs and retires IQS 1.0's standalone "caliber" component, which
 * double-counted seniority already inside the buying score.
 */
export function scoreSeniority(
  role: string | null | undefined,
  rawTitle: string | null | undefined,
): number {
  const title = rawTitle || '';
  const r = (role || '').toUpperCase();
  let base: number;
  if (r === 'CEO' || r === 'CFO' || r === 'COO' || SENIOR_TITLE.test(title)) base = 15;
  else if (OFFICER_TITLE.test(title)) base = 10;
  else if (r === 'DIRECTOR' || DIRECTOR_TITLE.test(title)) base = 6;
  else base = 6;
  if (FINANCE_TITLE.test(title) || r === 'CFO') base += 2;
  return clamp(base, 0, 15);
}

/* ── Opportunistic vs routine (15) ────────────────────────────────────── */

/**
 * Frequent buyers are running a programme, not reacting to information.
 * `routinePattern` is the Cohen–Malloy–Pomorski override: an insider who
 * bought in the same calendar month in three or more consecutive prior years
 * scores zero regardless of count.
 */
export function scoreOpportunistic(
  buysTrailing24m: number | null | undefined,
  routinePattern?: boolean | null,
): number {
  if (routinePattern) return 0;
  const n = num(buysTrailing24m);
  if (n === null || n <= 1) return 15;
  if (n <= 4) return 10;
  if (n <= 9) return 5;
  return 0;
}

/* ── Contrarian timing (10) ───────────────────────────────────────────── */

/**
 * z = sector-adjusted trailing 6-month return, scaled by the stock's 6-month
 * daily volatility × √126. Buying into weakness scores UP — this is the
 * component IQS 1.0 had pointing the wrong way.
 */
export function contrarianZ(
  stockReturn6mPct: number | null | undefined,
  sectorReturn6mPct: number | null | undefined,
  dailyVolPct: number | null | undefined,
): number | null {
  const s = num(stockReturn6mPct);
  const b = num(sectorReturn6mPct);
  const v = num(dailyVolPct);
  if (s === null || v === null || v <= 0) return null;
  const excess = s - (b ?? 0);
  return excess / (v * Math.sqrt(126));
}

export function scoreContrarian(z: number | null | undefined): number {
  const v = num(z);
  // No usable price history → the middle band, not a reward and not a penalty.
  if (v === null) return 4;
  if (v <= -1) return 10;
  if (v <= 0) return 7;
  if (v <= 1) return 4;
  return 1;
}

/* ── Valuation & size (10) ────────────────────────────────────────────── */

/** 5 pts: inverse percentile of price/book in-universe; negative book → 2. */
export function scoreValuation(
  priceToBookPercentile: number | null | undefined,
  negativeBookValue?: boolean | null,
): number {
  if (negativeBookValue) return 2;
  const p = num(priceToBookPercentile);
  if (p === null) return 2.5;
  return clamp(1 - clamp(p, 0, 1), 0, 1) * 5;
}

/** 5 pts by market cap — the small-cap effect (Lakonishok & Lee). */
export function scoreSize(marketCap: number | null | undefined): number {
  const m = num(marketCap);
  if (m === null || m <= 0) return 2.5;
  if (m < 300e6) return 5;
  if (m < 2e9) return 4;
  if (m < 10e9) return 2;
  return 1;
}

/* ── Ownership context (5) ────────────────────────────────────────────── */

/**
 * 3 pts: total insider ownership 5–40% of shares outstanding, linear. Above
 * 40% the company is controlled and the signal weakens, so it caps rather
 * than continuing to climb.
 */
export function scoreOwnershipLevel(ownershipFraction: number | null | undefined): number {
  const f = num(ownershipFraction);
  if (f === null || f <= 0.05) return 0;
  return clamp((Math.min(f, 0.4) - 0.05) / 0.35, 0, 1) * 3;
}

/** 2 pts: more distinct buyers than sellers over the trailing 90 days. */
export function scoreNetBuyers(netDistinctBuyers: number | null | undefined): number {
  return (num(netDistinctBuyers) ?? 0) > 0 ? 2 : 0;
}

/* ── Assembly ─────────────────────────────────────────────────────────── */

export interface TradeInputs {
  dollars: number | null;
  sharesBought: number | null;
  priorHoldings: number | null;
  medianForwardReturnPct: number | null;
  priorBuyCount: number | null;
  role: string | null;
  rawTitle: string | null;
  buysTrailing24m: number | null;
  routinePattern?: boolean | null;
  stockReturn6mPct: number | null;
  sectorReturn6mPct: number | null;
  dailyVolPct: number | null;
  priceToBookPercentile: number | null;
  negativeBookValue?: boolean | null;
  marketCap: number | null;
  ownershipFraction: number | null;
  netDistinctBuyers: number | null;
}

export interface TradeBreakdown {
  score: number;
  components: {
    conviction: number;
    trackRecord: number;
    seniority: number;
    opportunistic: number;
    contrarian: number;
    valuationSize: number;
    ownership: number;
  };
  /** Every intermediate the explainer renders. */
  detail: Record<string, number | boolean | null>;
}

/**
 * Each component is computed on its own natural scale (the brief's point
 * allocations), then rescaled if a re-fit changes its weight — so a weight
 * vector from Workstream D drops in without rewriting any component.
 */
export function scoreTrade(
  input: TradeInputs,
  weights: TradeWeights = WEIGHTS_LAUNCH,
): TradeBreakdown {
  const convictionRaw = scoreConviction(input.dollars, input.sharesBought, input.priorHoldings);
  const trackRaw = scoreTrackRecord(input.medianForwardReturnPct, input.priorBuyCount);
  const seniorityRaw = scoreSeniority(input.role, input.rawTitle);
  const oppRaw = scoreOpportunistic(input.buysTrailing24m, input.routinePattern);
  const z = contrarianZ(input.stockReturn6mPct, input.sectorReturn6mPct, input.dailyVolPct);
  const contrarianRaw = scoreContrarian(z);
  const valuationRaw =
    scoreValuation(input.priceToBookPercentile, input.negativeBookValue) +
    scoreSize(input.marketCap);
  const ownershipRaw =
    scoreOwnershipLevel(input.ownershipFraction) + scoreNetBuyers(input.netDistinctBuyers);

  // Natural maxima, i.e. the launch weights — a component's raw score is a
  // fraction of these, then multiplied by whatever weight is in force.
  const rescale = (raw: number, naturalMax: number, weight: number) =>
    naturalMax <= 0 ? 0 : (raw / naturalMax) * weight;

  const components = {
    conviction: rescale(convictionRaw, 35, weights.conviction),
    trackRecord: rescale(trackRaw, 10, weights.trackRecord),
    seniority: rescale(seniorityRaw, 15, weights.seniority),
    opportunistic: rescale(oppRaw, 15, weights.opportunistic),
    contrarian: rescale(contrarianRaw, 10, weights.contrarian),
    valuationSize: rescale(valuationRaw, 10, weights.valuationSize),
    ownership: rescale(ownershipRaw, 5, weights.ownership),
  };

  const score = Object.values(components).reduce((a, b) => a + b, 0);

  return {
    score: clamp(score, 0, 100),
    components,
    detail: {
      convictionDollarsPts: scoreConvictionDollars(input.dollars),
      holdingsRatioPts: scoreHoldingsRatio(input.sharesBought, input.priorHoldings),
      firstEverHolder: !((num(input.priorHoldings) ?? 0) > 0),
      trackRecordNeutralUsed:
        (num(input.priorBuyCount) ?? 0) < IQS2_CONFIG.trackRecordMinPriorBuys,
      contrarianZ: z,
      routinePattern: !!input.routinePattern,
      valuationPts: scoreValuation(input.priceToBookPercentile, input.negativeBookValue),
      sizePts: scoreSize(input.marketCap),
      ownershipLevelPts: scoreOwnershipLevel(input.ownershipFraction),
      netBuyerPts: scoreNetBuyers(input.netDistinctBuyers),
    },
  };
}
