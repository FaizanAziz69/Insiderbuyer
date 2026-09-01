/**
 * IQS 2.0 — Workstream A: ingestion hygiene and exclusion engine.
 *
 * Runs BEFORE scoring and tags every Form 4 transaction as scored or
 * excluded-with-reason. The brief's acceptance criterion is that "a
 * transaction can never be silently dropped (must carry `scored` or a reason
 * code)", because the score-explainer page renders the decision for every
 * transaction — that page is the trust product, so an unexplained omission is
 * a defect, not a tidy-up.
 *
 * Reason codes are machine-readable and stable: they are stored in the
 * database and consumed by the explainer, so renaming one is a migration.
 */
import { IQS2_CONFIG } from './config';

export type ExclusionReason =
  /** Not an open-market purchase: grant/award (A). */
  | 'NOT_OPEN_MARKET_AWARD'
  /** Option or derivative exercise (M). */
  | 'NOT_OPEN_MARKET_EXERCISE'
  /** Shares withheld for tax (F). */
  | 'NOT_OPEN_MARKET_TAX_WITHHOLDING'
  /** Gift (G). */
  | 'NOT_OPEN_MARKET_GIFT'
  /** A disposal, not a purchase (S and friends). */
  | 'NOT_A_PURCHASE'
  /** Any other non-P transaction code. */
  | 'NOT_OPEN_MARKET_OTHER'
  /** Derivative-only line — no change in common-share ownership. */
  | 'DERIVATIVE_ONLY'
  /** Bought under a pre-arranged Rule 10b5-1 plan. */
  | 'RULE_10B5_1_PLAN'
  /** Filer's only relationship is 10% ownership, no officer/director role. */
  | 'TEN_PERCENT_OWNER_ONLY'
  /** Purchased within the financing window of a deal the insider joined. */
  | 'FINANCING_PARTICIPANT'
  /** Implausible price/size — the existing filer-error guard. */
  | 'IMPLAUSIBLE_FILING';

/** A company-level reason the whole ticker is UNSCORED (not zero). */
export type UnscoredReason = 'BELOW_PRICE_FLOOR' | 'BELOW_LIQUIDITY_FLOOR';

export interface TxForExclusion {
  transactionCode: string | null;
  /** True when the filing marks the trade as made under a 10b5-1 plan. */
  plannedBuy?: boolean | null;
  /** 'A' acquired / 'D' disposed, where the filing carries it. */
  acquiredDisposed?: string | null;
  /** Raw Form 4 title text — carries "10% owner", "CFO", "Director"… */
  rawTitle?: string | null;
  role?: string | null;
  /** True for derivative-table lines (Table II). */
  isDerivative?: boolean | null;
  /** Set by the financing cross-reference, or by the manual flag at launch. */
  financingParticipant?: boolean | null;
  /** Result of the existing tx-sanity plausibility guard. */
  priceSuspect?: boolean | null;
}

export interface ExclusionDecision {
  scored: boolean;
  reason: ExclusionReason | null;
  /** Human sentence for the explainer page — never the only record. */
  detail: string;
}

const SCORED: ExclusionDecision = {
  scored: true,
  reason: null,
  detail: 'Open-market purchase, counted in full.',
};

const NON_P_REASONS: Record<string, [ExclusionReason, string]> = {
  A: ['NOT_OPEN_MARKET_AWARD', 'Grant or award — the insider did not pay for these shares.'],
  M: ['NOT_OPEN_MARKET_EXERCISE', 'Option or derivative exercise, not an open-market purchase.'],
  F: ['NOT_OPEN_MARKET_TAX_WITHHOLDING', 'Shares withheld by the issuer to cover tax.'],
  G: ['NOT_OPEN_MARKET_GIFT', 'Gift — no capital was committed.'],
  S: ['NOT_A_PURCHASE', 'Sale, not a purchase.'],
  D: ['NOT_A_PURCHASE', 'Disposition to the issuer, not a purchase.'],
};

/**
 * True when the filer's ONLY relationship is a 10% holding. The brief excludes
 * these because a passive block holder's buying is a different signal from an
 * officer's. A 10% owner who is ALSO an officer or director still counts.
 */
export function isTenPercentOwnerOnly(
  rawTitle?: string | null,
  role?: string | null,
): boolean {
  const t = (rawTitle || '').toLowerCase();
  if (!/10\s*%|ten percent|10 percent/.test(t)) return false;
  // Any officer/director signal in the title or the normalised role keeps it.
  if (role && role !== 'Other') return false;
  return !/officer|director|chief|president|ceo|cfo|coo|chair|vp|vice pres|treasurer|secretary|general counsel/.test(
    t,
  );
}

/** Workstream A decision for a single transaction. */
export function classifyTransaction(tx: TxForExclusion): ExclusionDecision {
  if (tx.isDerivative) {
    return {
      scored: false,
      reason: 'DERIVATIVE_ONLY',
      detail: 'Derivative-table line — no change in common-share ownership.',
    };
  }

  const code = (tx.transactionCode || '').trim().toUpperCase();
  if (code !== 'P') {
    const hit = NON_P_REASONS[code];
    return hit
      ? { scored: false, reason: hit[0], detail: hit[1] }
      : {
          scored: false,
          reason: 'NOT_OPEN_MARKET_OTHER',
          detail: `Transaction code ${code || '(blank)'} is not an open-market purchase.`,
        };
  }

  // A code-P line that the filing nonetheless marks as a disposal.
  if ((tx.acquiredDisposed || '').trim().toUpperCase() === 'D') {
    return {
      scored: false,
      reason: 'NOT_A_PURCHASE',
      detail: 'Marked as disposed on the filing despite a purchase code.',
    };
  }

  if (tx.plannedBuy) {
    return {
      scored: false,
      reason: 'RULE_10B5_1_PLAN',
      detail:
        'Bought under a pre-arranged Rule 10b5-1 plan — the timing carries no information.',
    };
  }

  if (isTenPercentOwnerOnly(tx.rawTitle, tx.role)) {
    return {
      scored: false,
      reason: 'TEN_PERCENT_OWNER_ONLY',
      detail: 'Filer is a 10% holder with no officer or director role.',
    };
  }

  if (tx.financingParticipant) {
    return {
      scored: false,
      reason: 'FINANCING_PARTICIPANT',
      detail: `Purchased within ${IQS2_CONFIG.financingWindowDays} days of a financing the insider took part in.`,
    };
  }

  if (tx.priceSuspect) {
    return {
      scored: false,
      reason: 'IMPLAUSIBLE_FILING',
      detail: 'Price or size fails the filer-error plausibility guard.',
    };
  }

  return SCORED;
}

/**
 * Company-level liquidity gate. Returns null when the company may be scored.
 * The brief is deliberate that a failure makes the company UNSCORED, not zero
 * — a zero would rank it against real companies at the bottom of the board,
 * which is a claim we have no basis for.
 */
export function liquidityGate(input: {
  lastPrice: number | null | undefined;
  medianDollarVolume30d: number | null | undefined;
}): UnscoredReason | null {
  const px = Number(input.lastPrice);
  if (!Number.isFinite(px) || px < IQS2_CONFIG.minPrice) return 'BELOW_PRICE_FLOOR';
  // Unknown volume is not a failure: absence of data is not evidence of
  // illiquidity, and the price floor already removes the worst of it. Note
  // Number(null) is 0, not NaN — the null check has to come first.
  if (input.medianDollarVolume30d == null) return null;
  const vol = Number(input.medianDollarVolume30d);
  if (!Number.isFinite(vol)) return null;
  if (vol < IQS2_CONFIG.minMedianDollarVolume) return 'BELOW_LIQUIDITY_FLOOR';
  return null;
}
