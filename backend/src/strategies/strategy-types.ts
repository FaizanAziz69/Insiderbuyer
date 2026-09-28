/**
 * Brief v8 — the strategy library's vocabulary.
 *
 * §6 is the constraint everything here answers to: "one engine, many rule
 * sets; a new strategy is a config, not a code path." So a strategy is data —
 * a name, a dataset, a frozen parameter set and a selection function — and the
 * walker in strategy-backtest.service.ts is the only thing that knows how to
 * turn any of them into an equity curve.
 */

/** §5.1's filter row. A strategy belongs to exactly one. */
export type Dataset = 'Congress' | 'Insiders' | 'Lobbying' | 'Contracts' | 'Funds' | 'Sector';

/**
 * §4.1, described in the brief as "the most important spec in this brief".
 *
 * These are not decorations. A backtest curve and a live curve may never be
 * spliced into one line, and a record type may only appear where its condition
 * is met — `paper` only from the P3 paper start date, `live` only for real
 * executed P&L from Book A/B.
 */
export type RecordType = 'backtest' | 'paper' | 'live';

export const RECORD_BADGE: Record<RecordType, string> = {
  backtest: 'HYPOTHETICAL — BACKTEST',
  paper: 'PAPER — SIMULATED LIVE',
  live: 'LIVE — PROPRIETARY CAPITAL',
};

/** One position a strategy wants to hold at a rebalance. */
export interface Pick {
  ticker: string;
  /** Relative weight before normalisation; the walker normalises to 1. */
  weight: number;
  /** Why this name was picked — shown in the Premium rebalance log (§5.2). */
  trigger: string;
}

/** Everything a selector may read. Loaded once per run, never per date. */
export interface SelectorContext {
  q: <T = any>(sql: string, params?: any[]) => Promise<T>;
  /** Daily closes as [epochMs, close, volume], ascending, by UPPER ticker. */
  prices: Map<string, Array<[number, number, number]>>;
  /** Brief v7 member grades by lowercased member key, current state. */
  memberGrades: Map<string, string>;
  /** S&P 500 membership by ticker — index-weight strategies gate on this. */
  sp500: Set<string>;
  /** Latest known market cap by ticker, for the size gates. */
  marketCap: Map<string, number>;
}

export interface StrategyDef {
  slug: string;
  /** OUR name. §2: never Quiver's names, figures, copy or holdings. */
  name: string;
  dataset: Dataset;
  /** §5.2: the rules in plain English, for the public detail page. */
  rulesPlain: string;
  /**
   * §6: "Every strategy's parameters are frozen before its first published run
   * and version-stamped; changes create a new version with its own record,
   * never a silent edit." Bump `version` when any value here changes.
   */
  params: Record<string, number | string | boolean>;
  version: string;
  /** §3's cadence, in days. */
  rebalanceDays: number;
  /**
   * §6: "a congress strategy cannot trade before the PTR filing date." The
   * walker adds this to every signal's disclosure date before it may be held.
   * Zero where the dataset is already point-in-time on its filing.
   */
  disclosureLagDays: number;
  /** §5.2's dataset-specific limitations block. */
  limitations: string[];
  /** The rule set itself. Must read nothing dated after `asOfMs`. */
  select: (ctx: SelectorContext, asOfMs: number) => Promise<Pick[]>;
}
