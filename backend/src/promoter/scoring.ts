/**
 * Workstream F §2.4 — the Promoter Score weights.
 *
 * The brief says "exact weights supplied by George before phase 2 build".
 * They were not supplied. Rather than block the workstream on them, the
 * weights are DATA: these defaults ship, `PUT /promoter/admin/weights`
 * replaces them without a deploy, and the published methodology reads the
 * live values so the explanation can never drift from the arithmetic.
 *
 * The defaults are reasoned, not arbitrary:
 *
 *   perMcap   40  §2.4 calls spend / market cap "the core comparable" in so
 *                 many words — it is the only metric that means the same
 *                 thing for a $5M shell and a $300M producer.
 *   spend     20  absolute dollars still matter: they are what an IR firm
 *                 competing for the mandate wants to see, and what makes the
 *                 B2B feed worth paying for.
 *   qoq       15  §2.1's thesis is that "changes in spend are a signal in
 *                 themselves", so the delta is scored, not just the level.
 *   options   15  the dilution angle; §2.4 lists it as its own metric.
 *   contracts 10  concurrent providers — breadth of promotion, and the
 *                 weakest of the five on its own (a single large mandate can
 *                 outspend four small ones).
 *
 * Every component is a percentile rank against sector peers, so each is
 * already on 0–100 and the weights are a straight blend.
 */

export interface PromoterWeights {
  /** Spend / market cap, basis points. */
  perMcap: number;
  /** Total disclosed IR spend in the quarter, CAD. */
  spend: number;
  /** Quarter-over-quarter change in spend. */
  qoq: number;
  /** Notional value of options granted to promoters. */
  options: number;
  /** Count of concurrent active contracts. */
  contracts: number;
}

export const DEFAULT_WEIGHTS: PromoterWeights = {
  perMcap: 40,
  spend: 20,
  qoq: 15,
  options: 15,
  contracts: 10,
};

export const WEIGHT_KEYS = Object.keys(DEFAULT_WEIGHTS) as Array<keyof PromoterWeights>;

/**
 * Clamp to sane numbers and drop anything unrecognised.
 *
 * Not normalised to 100 on purpose: the score divides by the weight of the
 * components it actually has (an issuer with no market cap has no perMcap
 * leg), so the weights are ratios and forcing them to sum to 100 here would
 * imply a precision that the per-row renormalisation does not keep.
 */
export function normalizeWeights(input: Partial<PromoterWeights> | null | undefined): PromoterWeights {
  const out = { ...DEFAULT_WEIGHTS };
  for (const k of WEIGHT_KEYS) {
    const v = Number((input as any)?.[k]);
    if (isFinite(v) && v >= 0 && v <= 1000) out[k] = Math.round(v * 100) / 100;
  }
  const total = WEIGHT_KEYS.reduce((s, k) => s + out[k], 0);
  // All-zero weights would make every score null. Fall back rather than
  // publish an empty column.
  if (total <= 0) return { ...DEFAULT_WEIGHTS };
  return out;
}

/** Plain-English label for each component, used by the methodology copy and
 *  the score breakdown tooltip so both read from one place. */
export const WEIGHT_LABELS: Record<keyof PromoterWeights, string> = {
  perMcap: 'Spend relative to market capitalisation',
  spend: 'Total disclosed IR spend in the quarter',
  qoq: 'Change in spend versus the prior quarter',
  options: 'Notional value of options granted to promoters',
  contracts: 'Number of concurrent IR providers',
};
