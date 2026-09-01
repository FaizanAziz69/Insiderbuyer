/**
 * Trade Grade and Signal Badges — follow-up to the IQS 2.0 brief
 * (George, 2026-09-02).
 *
 * The Workstream B Trade Score already exists per purchase; this turns it into
 * a consumer-facing product. Two rules run through everything here:
 *
 *  · Letters, never numbers, on consumer surfaces — a 0–100 trade number
 *    beside a 0–99 company IQS would be read as the same thing.
 *  · Every badge has a hard, machine-verifiable criterion. No badge may ever
 *    depend on editorial judgement, and the dilution warning is not optional:
 *    a high grade on a heavy diluter must carry it.
 */
import { IQS2_CONFIG } from './config';
import { num } from './trade-score';

export type TradeGrade = 'A+' | 'A' | 'B' | 'C' | 'D' | 'F';

/**
 * Percentile → letter. Bands are cumulative from the top: A+ is the top 2%,
 * A the next 8% (so the top decile), B the next 20%, C the next 30%, D the
 * next 25%, F the bottom 15%.
 */
export const GRADE_BANDS: Array<{ grade: TradeGrade; minPercentile: number }> = [
  { grade: 'A+', minPercentile: 0.98 },
  { grade: 'A', minPercentile: 0.9 },
  { grade: 'B', minPercentile: 0.7 },
  { grade: 'C', minPercentile: 0.4 },
  { grade: 'D', minPercentile: 0.15 },
  { grade: 'F', minPercentile: 0 },
];

/** `percentile` is 0–1 within the trailing-365-day graded population. */
export function gradeFor(percentile: number | null | undefined): TradeGrade | null {
  const p = num(percentile);
  if (p === null) return null;
  for (const band of GRADE_BANDS) if (p >= band.minPercentile) return band.grade;
  return 'F';
}

/** True for the grades the product treats as "A-grade" (list default, alerts). */
export const isTopGrade = (g: TradeGrade | null): boolean => g === 'A+' || g === 'A';

/* ── Badges ───────────────────────────────────────────────────────────── */

export type BadgeKey =
  | 'CLUSTER_BUY'
  | 'FIRST_BUY'
  | 'STAKE_DOUBLER'
  | 'CFO_BUY'
  | 'CEO_BUY'
  | 'EXEC_BUY'
  | 'BIG_BUY'
  | 'BUYING_WEAKNESS'
  | 'DILUTION_FLAG';

export interface BadgeDef {
  key: BadgeKey;
  label: string;
  /** Warnings are never truncated away and never counted against the cap. */
  warning?: true;
  /** The criterion, in the words shown to a reader who asks. */
  criterion: string;
}

export const BADGES: Record<BadgeKey, BadgeDef> = {
  CLUSTER_BUY: {
    key: 'CLUSTER_BUY',
    label: 'Cluster Buy',
    criterion: 'Three or more different insiders bought at this company within 30 days.',
  },
  FIRST_BUY: {
    key: 'FIRST_BUY',
    label: 'First Buy',
    criterion:
      "The buyer's first open-market purchase at this company, or their first in at least three years.",
  },
  STAKE_DOUBLER: {
    key: 'STAKE_DOUBLER',
    label: 'Stake Doubler',
    criterion: 'The purchase at least doubled the shares this insider already held.',
  },
  CFO_BUY: {
    key: 'CFO_BUY',
    label: 'CFO Buy',
    criterion: 'Bought by the Chief Financial Officer or another finance-titled officer.',
  },
  CEO_BUY: {
    key: 'CEO_BUY',
    label: 'CEO Buy',
    criterion: 'Bought by the Chief Executive Officer.',
  },
  EXEC_BUY: {
    key: 'EXEC_BUY',
    label: 'Exec Buy',
    criterion: 'Bought by another C-suite officer.',
  },
  BIG_BUY: {
    key: 'BIG_BUY',
    label: 'Big Buy',
    criterion: `A single purchase of $${(IQS2_CONFIG.bigBuyDollars / 1e6).toFixed(0)} million or more.`,
  },
  BUYING_WEAKNESS: {
    key: 'BUYING_WEAKNESS',
    label: 'Buying Weakness',
    criterion:
      'Bought after the stock fell at least one standard deviation behind its sector over six months.',
  },
  DILUTION_FLAG: {
    key: 'DILUTION_FLAG',
    label: 'Dilution',
    warning: true,
    criterion: `The company's share count grew more than ${(IQS2_CONFIG.dilutionFreeThreshold * 100).toFixed(0)}% over the last twelve months.`,
  },
};

/**
 * Display order for the positive badges. A row shows at most three of them
 * (brief), so the order decides what survives: the rarest, hardest-to-fake
 * signals first, seniority next, and size last — a big cheque is the easiest
 * of these for a company to arrange.
 */
export const BADGE_PRIORITY: BadgeKey[] = [
  'CLUSTER_BUY',
  'FIRST_BUY',
  'STAKE_DOUBLER',
  'CFO_BUY',
  'CEO_BUY',
  'EXEC_BUY',
  'BIG_BUY',
  'BUYING_WEAKNESS',
];

export const MAX_POSITIVE_BADGES = 3;

export interface BadgeContext {
  dollars: number | null;
  /** shares bought ÷ prior holdings; ≥ 1 doubles the stake. */
  holdingsRatio: number | null;
  /** Contrarian z from the trade score; ≤ −1 is the maxed timing component. */
  contrarianZ: number | null;
  role: string | null;
  rawTitle: string | null;
  /** Distinct insiders with graded buys at this company in the last 30 days. */
  clusterBuyers30d: number | null;
  /** No prior graded buy at this company, or none within three years. */
  firstBuy: boolean;
  /** TTM share-count growth as a FRACTION (0.32 = +32%). */
  shareGrowthTtm: number | null;
}

const CEO_RX = /chief executive|\bceo\b/i;
const CFO_RX = /chief financial|\bcfo\b|treasurer|chief accounting|controller/i;
const EXEC_RX = /chief|president|\bevp\b|\bsvp\b|officer/i;

/**
 * Every badge the trade earns, warnings included, in priority order. Callers
 * that render decide how many positives to show; `visibleBadges` applies the
 * brief's cap without ever dropping a warning.
 */
export function badgesFor(ctx: BadgeContext): BadgeKey[] {
  const out: BadgeKey[] = [];

  if ((num(ctx.clusterBuyers30d) ?? 0) >= 3) out.push('CLUSTER_BUY');
  if (ctx.firstBuy) out.push('FIRST_BUY');
  if ((num(ctx.holdingsRatio) ?? 0) >= 1) out.push('STAKE_DOUBLER');

  // One seniority badge only: finance beats chief-exec beats the rest, which
  // is the order the brief gives for signal strength.
  const title = `${ctx.rawTitle || ''} ${ctx.role || ''}`;
  if (CFO_RX.test(title)) out.push('CFO_BUY');
  else if (CEO_RX.test(title)) out.push('CEO_BUY');
  else if (EXEC_RX.test(title)) out.push('EXEC_BUY');

  if ((num(ctx.dollars) ?? 0) >= IQS2_CONFIG.bigBuyDollars) out.push('BIG_BUY');

  const z = num(ctx.contrarianZ);
  if (z !== null && z <= -1) out.push('BUYING_WEAKNESS');

  // Mandatory wherever a grade appears — a shiny letter on a heavy diluter
  // must carry the warning beside it.
  const growth = num(ctx.shareGrowthTtm);
  if (growth !== null && growth > IQS2_CONFIG.dilutionFreeThreshold) out.push('DILUTION_FLAG');

  return out.sort(
    (a, b) =>
      (BADGE_PRIORITY.indexOf(a) === -1 ? 99 : BADGE_PRIORITY.indexOf(a)) -
      (BADGE_PRIORITY.indexOf(b) === -1 ? 99 : BADGE_PRIORITY.indexOf(b)),
  );
}

/** The brief's render rule: at most three positives, every warning kept. */
export function visibleBadges(all: BadgeKey[], max = MAX_POSITIVE_BADGES): BadgeKey[] {
  const warnings = all.filter((k) => BADGES[k]?.warning);
  const positives = all
    .filter((k) => !BADGES[k]?.warning)
    .sort((a, b) => BADGE_PRIORITY.indexOf(a) - BADGE_PRIORITY.indexOf(b))
    .slice(0, max);
  return [...positives, ...warnings];
}

/** The disclaimer required wherever a grade is shown. */
export const TRADE_GRADE_DISCLAIMER =
  'The Trade Grade measures characteristics of the filing — size, role, pattern and timing. It is not a prediction, a rating, or a recommendation.';
