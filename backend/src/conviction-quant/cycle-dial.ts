import type { Params } from './params';
import type { Regime } from './types';

/**
 * Rulebook 2 / Spec 8 / rule R-01 — the cycle dial.
 *
 * Five indicators, each +1 / 0 / −1. Regime from the total. Transition:
 * "Cut fast, add slowly" — downshift on one weekly reading, upshift only after
 * two consecutive readings, one step at a time. The dial never reads the
 * fund's own P&L; aggression follows the market.
 */

export interface DialInputs {
  spxAboveMa200: boolean | null;
  tsxAboveMa200: boolean | null;
  spxMa50AboveMa200: boolean | null;
  tsxMa50AboveMa200: boolean | null;
  breadthPctAboveMa200: number | null;
  hyOas: number | null; // current, bps
  hyOasMedian252: number | null;
  hyOasChange3mBps: number | null;
  hyOasFalling: boolean | null;
  netRevisions30d: number | null; // up − down
  vix: number | null;
}

export interface DialReading {
  trend: number; breadth: number; credit: number; revisions: number; vol: number;
  total: number;
  impliedRegime: Regime;
  missing: string[];
}

const REGIME_ORDER: Regime[] = ['Risk-off', 'Caution', 'Neutral', 'Expansion'];

export function regimeForScore(total: number, p: Params): Regime {
  const R = p.cycleDial.regimes;
  if (total >= R.Expansion.min) return 'Expansion';
  if (total >= R.Neutral.min) return 'Neutral';
  if (total >= R.Caution.min) return 'Caution';
  return 'Risk-off';
}

export function readDial(i: DialInputs, p: Params): DialReading {
  const missing: string[] = [];
  let trend = 0;
  if (i.spxAboveMa200 == null || i.tsxAboveMa200 == null) missing.push('trend');
  else if (i.spxAboveMa200 && i.tsxAboveMa200) trend = 1;
  else if (!i.spxAboveMa200 && !i.tsxAboveMa200 && i.spxMa50AboveMa200 === false && i.tsxMa50AboveMa200 === false) trend = -1;

  let breadth = 0;
  if (i.breadthPctAboveMa200 == null) missing.push('breadth');
  else if (i.breadthPctAboveMa200 > p.cycleDial.breadthPlus) breadth = 1;
  else if (i.breadthPctAboveMa200 < p.cycleDial.breadthMinus) breadth = -1;

  let credit = 0;
  if (i.hyOas == null || i.hyOasMedian252 == null) missing.push('credit');
  else if (i.hyOas < i.hyOasMedian252 && i.hyOasFalling) credit = 1;
  else if ((i.hyOasChange3mBps ?? 0) > p.cycleDial.creditWidenBpsMinus) credit = -1;

  let revisions = 0;
  if (i.netRevisions30d == null) missing.push('revisions');
  else if (i.netRevisions30d > 0) revisions = 1;
  else if (i.netRevisions30d < 0) revisions = -1;

  let vol = 0;
  if (i.vix == null) missing.push('vol');
  else if (i.vix < p.cycleDial.vixPlus) vol = 1;
  else if (i.vix > p.cycleDial.vixMinus) vol = -1;

  const total = trend + breadth + credit + revisions + vol;
  return { trend, breadth, credit, revisions, vol, total, impliedRegime: regimeForScore(total, p), missing };
}

/**
 * Apply the transition rules to a previous state.
 * Returns the new regime and the upshift counter.
 */
export function transition(
  prev: { regime: Regime; weeksConfirmed: number },
  implied: Regime,
  p: Params,
): { regime: Regime; weeksConfirmed: number; changed: boolean; reason: string } {
  const from = REGIME_ORDER.indexOf(prev.regime);
  const to = REGIME_ORDER.indexOf(implied);
  if (to === from) return { regime: prev.regime, weeksConfirmed: 0, changed: false, reason: 'unchanged' };
  if (to < from) {
    // Downshift on one reading, one step at a time.
    const next = REGIME_ORDER[from - 1];
    return { regime: next, weeksConfirmed: 0, changed: true, reason: `downshift on one reading toward ${implied}` };
  }
  // Upshift: needs two consecutive readings, then one step.
  const weeks = prev.weeksConfirmed + 1;
  if (weeks >= p.cycleDial.upshiftConsecutiveWeeks) {
    const next = REGIME_ORDER[from + 1];
    return { regime: next, weeksConfirmed: 0, changed: true, reason: `upshift after ${weeks} consecutive readings toward ${implied}` };
  }
  return { regime: prev.regime, weeksConfirmed: weeks, changed: false, reason: `upshift pending (${weeks}/${p.cycleDial.upshiftConsecutiveWeeks})` };
}

export function allocationsFor(regime: Regime, p: Params) {
  const R = p.cycleDial.regimes[regime];
  return { A: R.A, B: R.B, D: R.D, cash: R.cash, dNewEntries: R.dNewEntries };
}

/** Rulebook 2: A2 cycle-bottom entries are exempt — half size in Caution; Risk-off only with the sector trigger. */
export function a2Permitted(regime: Regime, sectorTriggerConfirmed: boolean, p: Params): { allowed: boolean; sizeFactor: number } {
  if (regime === 'Expansion' || regime === 'Neutral') return { allowed: true, sizeFactor: 1 };
  if (regime === 'Caution') return { allowed: true, sizeFactor: p.cycleDial.a2CautionSizeFactor };
  return { allowed: sectorTriggerConfirmed, sizeFactor: p.cycleDial.a2CautionSizeFactor };
}
