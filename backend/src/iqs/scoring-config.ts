/**
 * Insider Buying Quality Score (IQS) — scoring configuration.
 *
 * Implements the Decode Investing proposal exactly. The IQS combines four
 * factors, all computed over open-market Form 4 purchases:
 *
 *   A. Purchase Volume Factor      = Σ(shares × price) / market cap
 *   B. Cluster Factor              = log(1 + distinct insider buyers)
 *   C. Role-Weighted Purchase Vol. = Σ(shares × price × role multiplier) / market cap
 *   D. Holding Change Factor       = Σ(shares bought / previous holdings × 100)
 *                                    / number of insiders who bought
 *
 *   IQS = log(1 + (A + B + C + D))
 *
 * The log transformation prevents extreme values from distorting rankings;
 * a higher IQS = stronger insider confidence in the stock.
 */

import type { InsiderRole } from '../entities/insider-transaction.entity';

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
