/**
 * Insider Buying Quality Score (IQS) — scoring configuration.
 *
 * Implements the Decode Investing proposal exactly. The IQS combines four
 * factors, all computed over open-market Form 4 purchases (code 'P'):
 *
 *   A. Purchase Volume Factor      = Σ(shares × price) / market cap
 *   B. Cluster Factor              = ln(1 + distinct insider buyers)
 *   C. Role-Weighted Purchase Vol. = Σ(shares × price × role multiplier) / market cap
 *   D. Holding Change Factor       = Σ(shares bought / previous holdings × 100)
 *                                    / number of insiders who bought
 *
 *   IQS = ln(1 + (A + B + C + D))
 *
 * The four factors are summed raw — no normalization, weighting, capping or
 * scaling. The log transformation prevents extreme values from distorting
 * rankings; a higher IQS = stronger insider confidence in the stock.
 */

import type { InsiderRole } from '../entities/insider-transaction.entity';

/** Lookback window in days. Every factor (A, B, C and D) is computed over
 *  this one window; B counts distinct buyers across the full window. */
export const IQS_WINDOW_DAYS = 90;

/** The log used in factor B and the final IQS wrapper — natural log, per the
 *  proposal. Defined once so the base can be changed in exactly one place. */
export const ln = Math.log;

/** Role multipliers — applied to each transaction's contribution to the
 *  role-weighted purchase volume factor (C). Per the proposal:
 *  CEO/CFO/COO purchases carry the most weight, directors less, others least. */
export const ROLE_MULTIPLIER: Record<InsiderRole, number> = {
  CEO: 3.0,
  CFO: 3.0,
  COO: 3.0,
  Director: 2.0,
  Other: 1.0,
};

/** Role classification from the Form 4 reportingOwner data — the uppercased
 *  officerTitle text plus the isDirector relationship flag. Matched in order,
 *  first match wins; one insider gets one multiplier, never summed:
 *
 *    contains "CHIEF EXECUTIVE" or standalone "CEO"  → 3.0
 *    contains "CHIEF FINANCIAL" or standalone "CFO"  → 3.0
 *    contains "CHIEF OPERATING" or standalone "COO"  → 3.0
 *    isDirector flag true                            → 2.0
 *    anything else                                   → 1.0
 */
export function form4RoleMultiplier(
  officerTitle: string | null | undefined,
  isDirector: boolean,
): number {
  const t = (officerTitle || '').toUpperCase();
  if (t.includes('CHIEF EXECUTIVE') || /\bCEO\b/.test(t)) return ROLE_MULTIPLIER.CEO;
  if (t.includes('CHIEF FINANCIAL') || /\bCFO\b/.test(t)) return ROLE_MULTIPLIER.CFO;
  if (t.includes('CHIEF OPERATING') || /\bCOO\b/.test(t)) return ROLE_MULTIPLIER.COO;
  if (isDirector) return ROLE_MULTIPLIER.Director;
  return ROLE_MULTIPLIER.Other;
}
