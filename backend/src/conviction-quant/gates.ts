import type { Params } from './params';
import type { GateResult, Sleeve } from './types';

/**
 * Rulebook 3.1 / Spec 6 — the hard gates. Pass/fail before any score.
 *
 * Every gate returns the value it saw and the limit it applied, so the
 * dashboard's "why not?" view can show a reader exactly which number failed
 * (Spec 6: "a pass/fail record per gate per security … kept for audit").
 * A null input FAILS closed — Spec 2, "fail loud": missing data is a Review,
 * never a silent pass.
 */

export interface GateInputs {
  ticker: string;
  sleeve: Sleeve;
  isA2?: boolean;
  isFinancial?: boolean;
  fcfTtm: number | null;
  fcfByFy: Array<number | null>; // most recent first
  fcfPositiveAtMidCycle?: boolean | null; // A2 manual flag
  totalAssets: number | null;
  totalLiabilities: number | null;
  currentRatio: number | null;
  interestCoverage: number | null;
  netDebtToEbitda: number | null;
  dilutedShareGrowthPct: number | null;
  sbcPctRevenue: number | null;
  accrualsRatioPct: number | null;
  restatement24m?: boolean | null;
  auditorChanged24m?: boolean | null;
  auditorChangeReasonLogged?: boolean;
  activeEnforcement?: boolean | null;
  adv20Usd: number | null;
  fullPositionUsd: number | null;
  marketCap: number | null;
  onRestrictedList: boolean;
  inBlackout: boolean;
  promoterFlag: boolean;
  computableScreens: number;
}

const r = (id: string, passed: boolean, value: any, limit: any, message: string): GateResult => ({
  id, passed, value, limit, message,
});

export function gatePrintsCash(i: GateInputs, p: Params): GateResult {
  if (i.sleeve === 'D') return r('G-01', true, i.fcfTtm, null, 'Sleeve D is exempt from the cash-flow gate (1.1)');
  if (i.fcfTtm == null) return r('G-01', false, null, '> 0', 'FCF TTM unknown');
  if (!(i.fcfTtm > 0)) return r('G-01', false, i.fcfTtm, '> 0', 'FCF TTM not positive');
  if (i.isA2) {
    const last5 = i.fcfByFy.slice(0, 5);
    const pos = last5.filter((v) => v != null && v > 0).length;
    if (pos < p.gates.a2FcfPositiveYearsOf5) return r('G-01', false, pos, p.gates.a2FcfPositiveYearsOf5, `FCF positive in ${pos} of last 5 FYs`);
    if (i.fcfPositiveAtMidCycle === false) return r('G-01', false, 'mid-cycle', 'positive', 'FCF not positive at mid-cycle prices');
    if (i.fcfPositiveAtMidCycle == null) return r('G-01', false, null, 'manual flag', 'A2 mid-cycle FCF flag not set');
    return r('G-01', true, pos, p.gates.a2FcfPositiveYearsOf5, 'cyclical: passes 3-of-5 and mid-cycle');
  }
  const last4 = i.fcfByFy.slice(0, 4);
  const pos = last4.filter((v) => v != null && v > 0).length;
  const ok = pos >= p.gates.fcfPositiveYearsOf4;
  return r('G-01', ok, pos, p.gates.fcfPositiveYearsOf4, ok ? 'prints cash' : `FCF positive in only ${pos} of last 4 FYs`);
}

export function gateBalanceSheet(i: GateInputs, p: Params): GateResult {
  if (i.totalAssets == null || i.totalLiabilities == null) return r('G-02', false, null, 'A > L', 'balance sheet unknown');
  if (!(i.totalAssets > i.totalLiabilities)) return r('G-02', false, i.totalAssets - i.totalLiabilities, '> 0', 'liabilities exceed assets');
  if (!i.isFinancial) {
    if (i.currentRatio == null) return r('G-02', false, null, p.gates.currentRatioMin, 'current ratio unknown');
    if (i.currentRatio < p.gates.currentRatioMin) return r('G-02', false, i.currentRatio, p.gates.currentRatioMin, 'current ratio below floor');
  }
  if (i.interestCoverage == null) return r('G-02', false, null, p.gates.interestCoverageMin, 'interest coverage unknown');
  // No interest expense at all is infinite coverage; the feed encodes that as a very large number or null-with-zero-debt.
  if (i.interestCoverage < p.gates.interestCoverageMin) return r('G-02', false, i.interestCoverage, p.gates.interestCoverageMin, 'interest coverage below 5×');
  const ndMax = p.gates.netDebtEbitdaMax[i.sleeve === 'B' ? 'B' : i.sleeve === 'D' ? 'D' : 'A'];
  if (i.netDebtToEbitda != null && i.netDebtToEbitda > ndMax) return r('G-02', false, i.netDebtToEbitda, ndMax, 'net debt / EBITDA above cap');
  return r('G-02', true, i.currentRatio, p.gates.currentRatioMin, 'balance sheet sound');
}

export function gateDilution(i: GateInputs, p: Params): GateResult {
  const max = p.gates.dilutionMaxPct[i.sleeve === 'B' ? 'B' : i.sleeve === 'D' ? 'D' : 'A'];
  if (i.dilutedShareGrowthPct == null) return r('G-03', false, null, max, 'share growth unknown');
  if (i.dilutedShareGrowthPct > max) return r('G-03', false, i.dilutedShareGrowthPct, max, 'diluted share growth above cap');
  if (i.sleeve !== 'D') {
    if (i.sbcPctRevenue == null) return r('G-03', false, null, p.gates.sbcMaxPctRevenue, 'SBC unknown');
    if (i.sbcPctRevenue > p.gates.sbcMaxPctRevenue) return r('G-03', false, i.sbcPctRevenue, p.gates.sbcMaxPctRevenue, 'SBC above 10% of revenue');
  }
  return r('G-03', true, i.dilutedShareGrowthPct, max, 'dilution within limits');
}

export function gateAccounting(i: GateInputs, p: Params): GateResult {
  if (i.accrualsRatioPct == null) return r('G-04', false, null, p.gates.accrualsMaxPct, 'accruals ratio unknown');
  if (i.accrualsRatioPct >= p.gates.accrualsMaxPct) return r('G-04', false, i.accrualsRatioPct, p.gates.accrualsMaxPct, 'accruals ratio ≥ 10%');
  if (i.restatement24m) return r('G-04', false, 'restatement', 'none', 'restatement within 24 months');
  if (i.auditorChanged24m && !i.auditorChangeReasonLogged) return r('G-04', false, 'auditor changed', 'reason logged', 'auditor changed without a logged reason');
  if (i.activeEnforcement) return r('G-04', false, 'enforcement', 'none', 'active SEC/OSC enforcement');
  return r('G-04', true, i.accrualsRatioPct, p.gates.accrualsMaxPct, 'accounting hygiene ok');
}

export function gateLiquidity(i: GateInputs, p: Params): GateResult {
  const min = p.gates.adv20MinUsd[i.sleeve === 'D' ? 'D' : i.sleeve === 'B' ? 'B' : 'A'];
  if (i.adv20Usd == null) return r('G-05', false, null, min, 'ADV$ unknown');
  if (i.adv20Usd < min) return r('G-05', false, i.adv20Usd, min, 'ADV$20 below floor');
  if (i.fullPositionUsd != null && i.fullPositionUsd > i.adv20Usd * (p.gates.positionMaxPctOfAdv / 100)) {
    return r('G-05', false, i.fullPositionUsd / i.adv20Usd, p.gates.positionMaxPctOfAdv / 100, 'full position exceeds 25% of ADV$');
  }
  return r('G-05', true, i.adv20Usd, min, 'liquid enough');
}

export function gateSize(i: GateInputs, p: Params): GateResult {
  const min = p.gates.marketCapMin[i.sleeve === 'B' ? 'B' : i.sleeve === 'D' ? 'D' : 'A'];
  if (i.marketCap == null) return r('G-06', false, null, min, 'market cap unknown');
  const ok = i.marketCap >= min;
  return r('G-06', ok, i.marketCap, min, ok ? 'size ok' : 'market cap below sleeve floor');
}

/** Hard block, no override path (11A). */
export function gateCompliance(i: GateInputs): GateResult {
  if (i.onRestrictedList) return r('G-07', false, 'restricted', 'clear', 'on the restricted list — hard block');
  if (i.inBlackout) return r('G-07', false, 'blackout', 'clear', 'inside a coverage blackout — hard block');
  if (i.promoterFlag) return r('G-07', false, 'promoter', 'clear', 'Promoter Scores flag — ineligible for every sleeve');
  return r('G-07', true, 'clear', 'clear', 'compliance clear');
}

export function gateDataSufficiency(i: GateInputs, p: Params): GateResult {
  const ok = i.computableScreens >= p.gates.minComputableScreens;
  return r('G-08', ok, i.computableScreens, p.gates.minComputableScreens, ok ? 'enough screens computable' : 'insufficient data — no score');
}

export function runGates(i: GateInputs, p: Params): { results: Record<string, GateResult>; passed: boolean } {
  const list = [
    gatePrintsCash(i, p), gateBalanceSheet(i, p), gateDilution(i, p), gateAccounting(i, p),
    gateLiquidity(i, p), gateSize(i, p), gateCompliance(i), gateDataSufficiency(i, p),
  ];
  const results: Record<string, GateResult> = {};
  for (const g of list) results[g.id] = g;
  return { results, passed: list.every((g) => g.passed) };
}
