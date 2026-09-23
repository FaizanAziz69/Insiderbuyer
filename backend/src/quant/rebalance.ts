/**
 * §6 — entry, accumulation and rebalancing, as pure decision functions.
 *
 * The rules that stop churn are the point of this file: tranche entry so a
 * position is never bought all at once, drift bands so ordinary movement does
 * not trigger trading, a hysteresis margin sustained over two rankings before
 * a name is replaced, and an annual turnover cap so this stays "an ownership
 * strategy, not a trading strategy".
 */

import { QuantConfig } from './config';
import { DrawdownStatus } from './portfolio';

export interface Holding {
  symbol: string;
  weight: number;
  targetWeight: number;
  fundRank: number;
  /** Tranches already filled for a position still being built. */
  tranchesFilled: number;
  openedAt: string | null;
  sleeves: string[];
}

export type OrderSide = 'buy' | 'sell';

export interface RebalanceOrder {
  symbol: string;
  side: OrderSide;
  weightDelta: number;
  reason: string;
  tranche?: number | null;
  sleeves?: string[];
}

export interface RankingSnapshot {
  asOf: string;
  ranks: Record<string, number>;
}

/**
 * Tranche entry: "new positions build in 3 tranches (default 40/30/30) over
 * 4-8 weeks. Tranche 2 and 3 accelerate on confirming signals ... and pause
 * if conviction score decays."
 */
export function trancheDecision(
  holding: Holding,
  signals: { freshInsiderBuying: boolean; priceWeakness: boolean; convictionDecayed: boolean },
  drawdown: DrawdownStatus,
  cfg: QuantConfig,
): { action: 'fill' | 'hold'; tranche: number | null; weightDelta: number; reason: string } {
  const tr = cfg.rebalancing.tranches;
  if (holding.tranchesFilled >= tr.length) {
    return { action: 'hold', tranche: null, weightDelta: 0, reason: 'fully built' };
  }
  if (signals.convictionDecayed) {
    return { action: 'hold', tranche: null, weightDelta: 0, reason: 'conviction decayed; tranche paused' };
  }
  const next = holding.tranchesFilled;
  const accelerating = signals.freshInsiderBuying || signals.priceWeakness;
  if (accelerating && !drawdown.allowTrancheAcceleration) {
    const contrarian = holding.sleeves.includes('contrarian');
    if (!contrarian || !drawdown.allowContrarianAdds) {
      return { action: 'hold', tranche: null, weightDelta: 0, reason: `drawdown protocol ${drawdown.state}: acceleration paused` };
    }
  }
  return {
    action: 'fill',
    tranche: next + 1,
    weightDelta: holding.targetWeight * tr[next],
    reason: accelerating
      ? `tranche ${next + 1}/${tr.length} accelerated (${signals.freshInsiderBuying ? 'fresh insider buying' : 'price weakness, thesis intact'})`
      : `tranche ${next + 1}/${tr.length} on schedule`,
  };
}

/** Between rebalances positions float within a band; a breach trims or adds. */
export function driftOrders(holdings: Holding[], cfg: QuantConfig, drawdown: DrawdownStatus): RebalanceOrder[] {
  const band = cfg.rebalancing.driftBand;
  const out: RebalanceOrder[] = [];
  for (const h of holdings) {
    if (h.targetWeight <= 0) continue;
    const rel = h.weight / h.targetWeight - 1;
    if (rel > band) {
      out.push({
        symbol: h.symbol,
        side: 'sell',
        weightDelta: h.weight - h.targetWeight,
        reason: `drift +${(rel * 100).toFixed(0)}% above target, outside the ±${(band * 100).toFixed(0)}% band`,
        sleeves: h.sleeves,
      });
    } else if (rel < -band) {
      // Adds stop under the protocol unless this is a contrarian name, the
      // sleeve that exists for exactly these moments.
      const contrarian = h.sleeves.includes('contrarian');
      if (!drawdown.allowNewEntrants && !(contrarian && drawdown.allowContrarianAdds)) continue;
      out.push({
        symbol: h.symbol,
        side: 'buy',
        weightDelta: h.targetWeight - h.weight,
        reason: `drift ${(rel * 100).toFixed(0)}% below target, outside the ±${(band * 100).toFixed(0)}% band`,
        sleeves: h.sleeves,
      });
    }
  }
  return out;
}

/**
 * "A new entrant replaces the lowest-ranked holding when its Fund Rank
 * exceeds that holding's by a hysteresis margin (default 20%) sustained for 2
 * consecutive weekly rankings — prevents churn at the boundary."
 */
export function entrantSwaps(
  holdings: Holding[],
  candidateRanks: Record<string, number>,
  recentSnapshots: RankingSnapshot[],
  cfg: QuantConfig,
  drawdown: DrawdownStatus,
): Array<{ enter: string; exit: string; margin: number; sustainedWeeks: number; reason: string }> {
  if (!drawdown.allowNewEntrants) return [];
  const need = cfg.rebalancing.entrantConsecutiveWeeks;
  const margin = cfg.rebalancing.entrantHysteresis;
  const held = new Set(holdings.map((h) => h.symbol));
  const lowest = [...holdings].sort((a, b) => a.fundRank - b.fundRank)[0];
  if (!lowest) return [];

  const contenders = Object.entries(candidateRanks)
    .filter(([sym]) => !held.has(sym))
    .sort((a, b) => b[1] - a[1]);

  const out: Array<{ enter: string; exit: string; margin: number; sustainedWeeks: number; reason: string }> = [];
  for (const [sym, rank] of contenders.slice(0, 5)) {
    if (!(rank > lowest.fundRank * (1 + margin))) continue;
    // The margin has to have held across the last N weekly snapshots, not
    // merely today, which is what stops churn at the boundary.
    const windows = recentSnapshots.slice(-need);
    const sustained =
      windows.length >= need &&
      windows.every((s) => {
        const r = s.ranks[sym];
        const l = s.ranks[lowest.symbol];
        return r != null && l != null && r > l * (1 + margin);
      });
    if (!sustained) continue;
    out.push({
      enter: sym,
      exit: lowest.symbol,
      margin: Math.round((rank / Math.max(1e-9, lowest.fundRank) - 1) * 1000) / 10,
      sustainedWeeks: windows.length,
      reason: `Fund Rank ${rank.toFixed(1)} exceeds ${lowest.symbol}'s ${lowest.fundRank.toFixed(1)} by more than ${(margin * 100).toFixed(0)}% for ${windows.length} consecutive weekly rankings`,
    });
    break; // one swap per cycle keeps turnover honest
  }
  return out;
}

/** §6 forced exits — these override the hysteresis entirely. */
export function forcedExits(
  holdings: Holding[],
  state: Record<string, { gate1Pass: boolean; heavyDiscretionarySelling: boolean; delistedOrAcquired: boolean; clientExcluded: boolean }>,
): RebalanceOrder[] {
  const out: RebalanceOrder[] = [];
  for (const h of holdings) {
    const s = state[h.symbol];
    if (!s) continue;
    const why = !s.gate1Pass
      ? 'Gate 1 failure (balance-sheet deterioration)'
      : s.heavyDiscretionarySelling
        ? 'heavy discretionary insider selling'
        : s.delistedOrAcquired
          ? 'acquisition or delisting'
          : s.clientExcluded
            ? 'entered the client-exclusion list'
            : null;
    if (!why) continue;
    out.push({ symbol: h.symbol, side: 'sell', weightDelta: h.weight, reason: `forced exit: ${why}`, sleeves: h.sleeves });
  }
  return out;
}

/**
 * Annual turnover cap. Turnover is counted one-way (the lesser of buys and
 * sells) so a rebalance that sells one name to buy another counts once, which
 * is the convention the 60% default assumes.
 */
export function turnoverGuard(
  orders: RebalanceOrder[],
  trailingTurnover: number,
  cfg: QuantConfig,
): { allowed: RebalanceOrder[]; blocked: RebalanceOrder[]; projected: number } {
  const cap = cfg.rebalancing.annualTurnoverCap;
  const buys = orders.filter((o) => o.side === 'buy').reduce((a, b) => a + Math.abs(b.weightDelta), 0);
  const sells = orders.filter((o) => o.side === 'sell').reduce((a, b) => a + Math.abs(b.weightDelta), 0);
  const add = Math.min(buys, sells);
  const projected = trailingTurnover + add;
  if (projected <= cap) return { allowed: orders, blocked: [], projected: Math.round(projected * 1e4) / 1e4 };

  // Over the cap: forced exits and risk-reducing trims still go through, and
  // discretionary additions wait.
  const allowed = orders.filter((o) => o.side === 'sell' || /forced exit/.test(o.reason));
  const blocked = orders.filter((o) => !allowed.includes(o));
  return { allowed, blocked, projected: Math.round(projected * 1e4) / 1e4 };
}
