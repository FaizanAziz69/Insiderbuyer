import { CONGRESS_STRATEGIES } from './defs-congress';
import { INSIDER_STRATEGIES } from './defs-insiders';
import { FUND_STRATEGIES } from './defs-funds';
import type { StrategyDef } from './strategy-types';

/**
 * Brief v8 §3's library, in the brief's own order.
 *
 * This list IS the product surface: §6 says a new strategy is a config, not a
 * code path, so adding one means adding a definition here and nothing else.
 */
export const ALL_STRATEGIES: StrategyDef[] = [
  CONGRESS_STRATEGIES[0], // 1  Congress Buys
  CONGRESS_STRATEGIES[1], // 2  Congress Top Performers Mirror
  FUND_STRATEGIES[0],     // 3  Lobbying Surge
  CONGRESS_STRATEGIES[3], // 4  Contract Winners
  CONGRESS_STRATEGIES[2], // 5  Capitol Alignment
  FUND_STRATEGIES[1],     // 6  Hedge Fund Consensus
  INSIDER_STRATEGIES[0],  // 7  Insider Buying — S&P 500
  INSIDER_STRATEGIES[1],  // 8  S&P 500 + Insider Buying
  INSIDER_STRATEGIES[2],  // 9  CEO Conviction
  INSIDER_STRATEGIES[3],  // 10 Insider Clusters — Small & Mid Cap
  INSIDER_STRATEGIES[4],  // 11 Contrarian Insiders
  INSIDER_STRATEGIES[5],  // 12 Conviction Metals
];

const BY_SLUG = new Map(ALL_STRATEGIES.map((s) => [s.slug, s]));

export function strategyBySlug(slug: string): StrategyDef | null {
  return BY_SLUG.get(String(slug || '').toLowerCase()) ?? null;
}

/**
 * §3: strategies 7 and 8 are "deliberately published side by side with a plain
 * buy-and-hold S&P 500 line, so readers can see whether the insider filter adds
 * anything". Every card already carries the benchmark, so this names the pair
 * the brief wants shown together rather than adding a second mechanism.
 */
export const SIDE_BY_SIDE_PAIR = ['insider-buying-sp500', 'sp500-plus-insider-buying'];
