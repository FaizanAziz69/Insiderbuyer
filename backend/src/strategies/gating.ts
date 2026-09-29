/**
 * Pure and dependency-free on purpose: the spec runs as a plain node script and
 * must not have to load Nest, TypeORM and Stripe to prove a guest sees no
 * figure. The strip mirrors `stripPremiumFields` in common/premium-access —
 * DELETE, never null, so a mask can never read as a real value.
 */
function strip<T extends Record<string, unknown>>(rows: T[], keys: readonly string[], entitled: boolean): T[] {
  if (entitled) return rows;
  return rows.map((row) => {
    const out: Record<string, unknown> = { ...row };
    for (const k of keys) delete out[k];
    return out as T;
  });
}

/**
 * Gating, in one place.
 *
 * Brief v8 §5.3 had the index, charts and metrics Free and only holdings and
 * the rebalance log Premium. Faizan 2026-09-29 ("paygate this page" —
 * /strategies): the PERFORMANCE is now the paid data too. What stays free is
 * what makes the page an SEO and social destination and lets a reader judge
 * whether the product is honest — the strategy names, their plain-English
 * rules, exact parameters, record badges, test start dates, the internal
 * portfolio panel, the limitations and the disclaimer.
 *
 *   Free    — names, rules, parameters, record type, dates, limitations
 *   Premium — every figure: sparklines, CAGR, Sortino, drawdown, returns,
 *             the equity curve, the metrics grid, holdings, rebalance log, CSV
 *
 * Fields are DELETED for a guest rather than blanked, so nothing downstream can
 * read a mask as a real value — the same rule the CQS board follows. The
 * browser draws a decoy under its blur; the real number never leaves here.
 */
export const CARD_PREMIUM_FIELDS = [
  'spark',
  'return1y',
  'cagr',
  'sortino',
  'sharpe',
  'maxDrawdown',
  'totalReturn',
  'benchmarkTotalReturn',
  'turnover',
  'hitRate',
] as const;

export const STRATEGY_PREMIUM_FIELDS = [
  'equity',
  'metrics',
  'turnover',
  'hitRate',
  'costsPaid',
  'holdings',
  'rebalanceLog',
] as const;

/**
 * The index payload as a guest may see it. Pure, so the spec can prove that
 * no figure survives for a guest and that a subscriber's payload is untouched.
 */
export function shapeIndex<T extends { cards: Record<string, unknown>[] }>(
  payload: T,
  entitled: boolean,
): T & { premium: boolean } {
  return {
    ...payload,
    cards: strip(payload.cards, CARD_PREMIUM_FIELDS, entitled),
    premium: entitled,
  };
}
