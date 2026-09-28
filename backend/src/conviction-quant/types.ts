/**
 * Conviction Quant — shared vocabulary.
 *
 * Source of truth is the Fund Rulebook v1.4; the Dev Spec v1.1 says how to
 * build it. Where the two disagree the Rulebook wins (Spec, page 1).
 */

export type Sleeve = 'A' | 'B' | 'C' | 'D';
/** Sleeve A sub-buckets (Rulebook 1). */
export type Bucket = 'A1' | 'A2' | 'A3' | 'B' | 'D';
export type Regime = 'Expansion' | 'Neutral' | 'Caution' | 'Risk-off';
export type BreakerLevel = 'Normal' | 'Yellow' | 'Orange' | 'Red' | 'Halt';
export type Tier = 1 | 2;
export type Tag = 'SELL' | 'TRIM' | 'BUY' | 'HOLD';
export type Tranche = 'T1' | 'T2' | 'T3';
export type ExecutionProfile = 1 | 2 | 3;

/** Percentile-ranked screen scores, 0–100, or null when < 60% of inputs exist (Spec 7.1). */
export interface ScreenScores {
  s1: number | null; // Cash Machine
  s2: number | null; // Growth & Revisions
  s3: number | null; // Moat
  s4: number | null; // Growth-adjusted Value
  s5: number | null; // Insider Conviction
  s6: number | null; // Political & Institutional Flow
  s7: number | null; // Catalyst & Cycle
  s8: number | null; // Momentum & Timing
}
export const SCREEN_KEYS = ['s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8'] as const;
export type ScreenKey = (typeof SCREEN_KEYS)[number];

export interface GateResult {
  id: string;
  passed: boolean;
  value: number | string | null;
  limit: number | string | null;
  message: string;
}

/** Every rule returns this shape (Spec 9). */
export interface RuleResult {
  rule_id: string;
  passed: boolean;
  value: number | string | null;
  limit: number | string | null;
  message: string;
  /** Hard rules block an order outright; soft ones only tag. */
  hard?: boolean;
}

export interface Position {
  securityId: string;
  ticker: string;
  sleeve: Sleeve;
  bucket: Bucket;
  tier: Tier | null;
  targetFullPct: number; // % NAV at full size
  trancheState: Tranche | 'FULL';
  avgCost: number;
  shares: number;
  originalShares: number; // ladder levels are computed on original shares (Spec 11)
  marketValue: number;
  weight: number; // % NAV at market
  stopPrice: number | null;
  ladderState: { sold50: boolean; sold100: boolean; highestWeeklyClose: number };
  swingLotShares: number;
  openedAt: string;
  nextReunderwrite: string | null;
  sector: string | null;
  catalystKey: string | null; // "single catalyst" grouping (L-05)
  isTsxvOrOtc: boolean;
  marketCap: number | null;
  adv20Usd: number | null;
  atr20: number | null;
  price: number;
  ma20: number | null;
  ma200: number | null;
  rsi14: number | null;
  ret10Sessions: number | null;
  weeklyCloses: number[];
  addDownsUsed: number;
  t1Price: number | null;
  t1Date: string | null;
}

export interface OptionsPosition {
  ticker: string;
  structure: 'csp' | 'cc' | 'put' | 'collar' | 'index_put' | 'bull_call_spread' | 'itm_call';
  premium: number; // USD, signed (paid negative? we store absolute and purpose)
  purpose: 'entry' | 'trim' | 'event_hedge' | 'tail_hedge' | 'directional';
  profile: ExecutionProfile | null;
  notional: number;
  cashCommitted: number;
  expiry: string;
  openedAt: string;
  directionalPremium: number; // 7A.7 accounting
}

export interface PortfolioState {
  nav: number;
  cash: number;
  committedCash: number;
  hwm: number;
  drawdownPct: number; // positive number, e.g. 6.2
  breaker: BreakerLevel;
  regime: Regime;
  weeksConfirmed: number;
  realizedVol20d: number | null; // annualised %
  monthToDateReturnPct: number | null;
  lastMonthReturnPct: number | null;
  positions: Position[];
  options: OptionsPosition[];
  sleeveWeights: Record<Sleeve, number>;
  heatA: number; // Σ risk-to-stop, Sleeve A, % NAV
  heatTotal: number;
  sleeveDFundedCapital: number;
  sleeveDCurrentValue: number;
  sleeveDLockoutUntil: string | null;
  quarterNewDirectionalPremiumPct: number;
  quarterEventHedgePct: number;
  yearTailHedgePct: number;
  swingSalesThisWeek: number;
  spxDrawdownFromHighPct: number;
  correlations?: Record<string, number>; // "AAA|BBB" → 60d corr
}

export interface CalendarContext {
  /** America/New_York wall clock. */
  nowEt: Date;
  isTradingDay: boolean;
  dayOfWeek: number; // 0=Sun
  isMonthlyOpex: boolean;
  isQuadWitching: boolean;
  isFomcDay: boolean;
  isCpiOrNfpDay: boolean;
  isTurnOfMonth: boolean;
  isDecemberSecondHalf: boolean;
  /** Sessions until the next earnings print for a ticker; null = unknown. */
  sessionsToEarnings: Record<string, number | null>;
  sessionsSinceEarnings: Record<string, number | null>;
}

export interface ConvictionScore {
  ticker: string;
  screens: ScreenScores;
  composites: { A1: number | null; A2: number | null; A3: number | null; B: number | null };
  bestFitSleeve: Bucket | null;
  headline: number | null;
  confluenceCount: number;
  flags: string[];
  gates: Record<string, GateResult>;
  gatesPassed: boolean;
  sleeveDSignalCount: number;
  tripleConfluence: boolean;
  insufficientData: boolean;
}
