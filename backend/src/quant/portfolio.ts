/**
 * L3 — portfolio construction (Brief v6 §5) and the risk adjustment §7.2
 * requires inside the engine rather than only in reporting.
 *
 * Pure functions again: rankings and prices in, target weights and per-book
 * orders out, so the whole construction is reproducible in a backtest.
 *
 * The sleeve rules are the part most easily got wrong, so they are explicit:
 *   - contrarian is a MINIMUM of 5%, not a target
 *   - small-cap is a fixed 10% inside an 8-12% band
 *   - "A name may count toward the small-cap AND contrarian sleeves
 *     simultaneously", so membership is a set of tags, never one bucket
 */

import { QuantConfig } from './config';

export type Sleeve = 'core' | 'contrarian' | 'smallcap';

export interface Candidate {
  symbol: string;
  sector: string | null;
  fundRank: number;
  convictionScore: number;
  qualityScore: number;
  marketCap: number;
  price: number;
  advDollars: number;
  /** Trailing 12-month downside deviation, for §7.2 risk-adjusted sizing. */
  downsideDeviation: number | null;
  /** Sector is in sustained net capital inflow (core tilt) per the flow engine. */
  sectorInflow: boolean;
  /** Sector is bottomed-out: drawdown past the threshold plus sustained outflow. */
  sectorContrarian: boolean;
  excluded: boolean;
  excludedReason?: string | null;
}

export interface TargetPosition {
  symbol: string;
  sector: string | null;
  weight: number;
  sleeves: Sleeve[];
  fundRank: number;
  rawWeight: number;
  downsideDeviation: number | null;
  capsApplied: string[];
}

export interface TargetPortfolio {
  asOf: string;
  positions: TargetPosition[];
  cashWeight: number;
  sleeveWeights: Record<Sleeve, number>;
  sectorWeights: Record<string, number>;
  notes: string[];
}

const clamp = (x: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, x));

/**
 * §7.2: "conviction weights are scaled inversely by each name's downside
 * deviation, so a high-conviction volatile small cap sizes smaller than an
 * equally-ranked stable compounder."
 */
export function riskAdjustedWeight(c: Candidate): number {
  const dd = c.downsideDeviation;
  // A name with no measurable downside history is treated as median risk
  // rather than as risk-free, which would oversize the unknown.
  const denom = dd == null || dd <= 0 ? 0.25 : Math.max(0.05, dd);
  return c.fundRank / denom;
}

export function buildTargetPortfolio(
  candidates: Candidate[],
  cfg: QuantConfig,
  asOf: string,
): TargetPortfolio {
  const notes: string[] = [];
  const p = cfg.portfolio;
  const eligible = candidates.filter((c) => !c.excluded && c.fundRank > 0);
  const droppedForExclusion = candidates.filter((c) => c.excluded).length;
  if (droppedForExclusion) notes.push(`${droppedForExclusion} name(s) hard-excluded (client conflict).`);

  const tag = (c: Candidate): Sleeve[] => {
    const s: Sleeve[] = [];
    if (c.marketCap < p.smallCapMaxMarketCap) s.push('smallcap');
    if (c.sectorContrarian) s.push('contrarian');
    if (!s.length || c.sectorInflow) s.push('core');
    return s.length ? s : ['core'];
  };

  const ranked = [...eligible].sort((a, b) => b.fundRank - a.fundRank);
  const pick: Candidate[] = [];
  const has = new Set<string>();
  const take = (c: Candidate) => {
    if (has.has(c.symbol)) return;
    has.add(c.symbol);
    pick.push(c);
  };

  // Sleeve minimums are satisfied first, because a portfolio built purely by
  // rank can easily contain no contrarian or small-cap name at all.
  const contrarians = ranked.filter((c) => c.sectorContrarian);
  const smalls = ranked.filter((c) => c.marketCap < p.smallCapMaxMarketCap);
  const minContrarianNames = Math.max(1, Math.ceil((p.contrarianMinWeight / p.maxPositionInitial) * 0.6));
  const minSmallNames = Math.max(1, Math.ceil((p.smallCapWeight / p.maxPositionInitial) * 0.6));
  contrarians.slice(0, minContrarianNames).forEach(take);
  smalls.slice(0, minSmallNames).forEach(take);
  if (!contrarians.length) notes.push('No contrarian-sleeve candidate passed both gates; sleeve under its 5% minimum.');
  if (!smalls.length) notes.push('No small-cap candidate passed both gates; sleeve under its 10% target.');

  for (const c of ranked) {
    if (pick.length >= p.targetNamesMax) break;
    take(c);
  }
  if (pick.length < p.targetNamesMin) {
    notes.push(`Only ${pick.length} names passed both gates, below the ${p.targetNamesMin} minimum; the balance stays in cash.`);
  }

  // Raw risk-adjusted conviction weights.
  const raw = new Map<string, number>();
  for (const c of pick) raw.set(c.symbol, riskAdjustedWeight(c));
  const investable = 1 - p.cashBuffer;

  const normalise = (weights: Map<string, number>, budget: number) => {
    const total = Array.from(weights.values()).reduce((a, b) => a + b, 0);
    if (total <= 0) return new Map<string, number>();
    const out = new Map<string, number>();
    for (const [k, v] of weights) out.set(k, (v / total) * budget);
    return out;
  };

  let weights = normalise(raw, investable);
  const capsApplied = new Map<string, string[]>();
  const noteCap = (sym: string, why: string) => {
    const arr = capsApplied.get(sym) || [];
    if (!arr.includes(why)) arr.push(why);
    capsApplied.set(sym, arr);
  };

  // Position cap at initiation, then redistribute the residual pro-rata
  // across the rest — never into a single name (§5, Book A rule).
  for (let pass = 0; pass < 6; pass++) {
    let residual = 0;
    const over: string[] = [];
    for (const [sym, w] of weights) {
      if (w > p.maxPositionInitial) {
        residual += w - p.maxPositionInitial;
        weights.set(sym, p.maxPositionInitial);
        over.push(sym);
        noteCap(sym, 'position-cap');
      }
    }
    if (residual <= 1e-9) break;
    const room = Array.from(weights.entries()).filter(([s, w]) => !over.includes(s) && w < p.maxPositionInitial);
    if (!room.length) {
      notes.push('Position caps left cash undeployed: no remaining name had room.');
      break;
    }
    const roomTotal = room.reduce((a, [, w]) => a + w, 0);
    for (const [sym, w] of room) weights.set(sym, w + residual * (roomTotal > 0 ? w / roomTotal : 1 / room.length));
  }

  // Sector cap: no sector above 25% of the portfolio.
  const sectorOf = new Map(pick.map((c) => [c.symbol, c.sector || 'Unknown']));
  for (let pass = 0; pass < 6; pass++) {
    const bySector = new Map<string, number>();
    for (const [sym, w] of weights) {
      const s = sectorOf.get(sym) || 'Unknown';
      bySector.set(s, (bySector.get(s) || 0) + w);
    }
    let residual = 0;
    const capped = new Set<string>();
    for (const [sector, w] of bySector) {
      if (w > p.maxSectorWeight + 1e-9) {
        const scale = p.maxSectorWeight / w;
        for (const [sym, ww] of weights) {
          if ((sectorOf.get(sym) || 'Unknown') !== sector) continue;
          const next = ww * scale;
          residual += ww - next;
          weights.set(sym, next);
          capped.add(sym);
          noteCap(sym, 'sector-cap');
        }
      }
    }
    if (residual <= 1e-9) break;
    const room = Array.from(weights.entries()).filter(([s, w]) => !capped.has(s) && w < p.maxPositionInitial);
    if (!room.length) {
      notes.push('Sector cap left cash undeployed.');
      break;
    }
    const roomTotal = room.reduce((a, [, w]) => a + w, 0);
    for (const [sym, w] of room) {
      weights.set(sym, Math.min(p.maxPositionInitial, w + residual * (roomTotal > 0 ? w / roomTotal : 1 / room.length)));
    }
  }

  // Minimum position: a sliver is not a position. Drop and renormalise.
  for (const [sym, w] of Array.from(weights.entries())) {
    if (w < p.minPosition) {
      weights.delete(sym);
      noteCap(sym, 'below-minimum-dropped');
    }
  }
  const invested = Array.from(weights.values()).reduce((a, b) => a + b, 0);
  if (invested > 0 && Math.abs(invested - investable) > 1e-6) {
    const scale = investable / invested;
    for (const [sym, w] of weights) weights.set(sym, Math.min(p.maxPositionInitial, w * scale));
  }

  const positions: TargetPosition[] = Array.from(weights.entries())
    .map(([symbol, weight]) => {
      const c = pick.find((x) => x.symbol === symbol)!;
      return {
        symbol,
        sector: c.sector,
        weight: Math.round(weight * 1e6) / 1e6,
        sleeves: tag(c),
        fundRank: c.fundRank,
        rawWeight: Math.round((raw.get(symbol) || 0) * 1e4) / 1e4,
        downsideDeviation: c.downsideDeviation,
        capsApplied: capsApplied.get(symbol) || [],
      };
    })
    .sort((a, b) => b.weight - a.weight);

  const sleeveWeights: Record<Sleeve, number> = { core: 0, contrarian: 0, smallcap: 0 };
  for (const pos of positions) for (const s of pos.sleeves) sleeveWeights[s] += pos.weight;
  const sectorWeights: Record<string, number> = {};
  for (const pos of positions) {
    const s = pos.sector || 'Unknown';
    sectorWeights[s] = (sectorWeights[s] || 0) + pos.weight;
  }

  if (sleeveWeights.contrarian + 1e-9 < p.contrarianMinWeight && contrarians.length) {
    notes.push(`Contrarian sleeve at ${(sleeveWeights.contrarian * 100).toFixed(1)}%, under its ${(p.contrarianMinWeight * 100).toFixed(0)}% minimum.`);
  }
  if (smalls.length && (sleeveWeights.smallcap < p.smallCapBandLow || sleeveWeights.smallcap > p.smallCapBandHigh)) {
    notes.push(`Small-cap sleeve at ${(sleeveWeights.smallcap * 100).toFixed(1)}%, outside the ${(p.smallCapBandLow * 100).toFixed(0)}-${(p.smallCapBandHigh * 100).toFixed(0)}% band.`);
  }

  const totalWeight = positions.reduce((a, b) => a + b.weight, 0);
  return {
    asOf,
    positions,
    cashWeight: Math.round((1 - totalWeight) * 1e6) / 1e6,
    sleeveWeights,
    sectorWeights,
    notes,
  };
}

// ── Per-book scaling (§5 capital configuration) ──────────────────────────

export interface BookPosition {
  symbol: string;
  targetWeight: number;
  bookWeight: number;
  dollars: number;
  shares: number;
  liquidityCapDollars: number | null;
  capped: boolean;
}

export interface BookTarget {
  bookId: string;
  capital: number;
  positions: BookPosition[];
  cashWeight: number;
  redistributed: number;
  notes: string[];
}

/**
 * "the engine computes ONE target portfolio, then generates per-book orders
 * scaled to each book's capital and liquidity limits". Divergence between the
 * books must be attributable to liquidity alone, which is why the cap and the
 * redistribution are the only things that differ here.
 */
export function scaleToBook(
  target: TargetPortfolio,
  book: QuantConfig['books'][number],
  cfg: QuantConfig,
  priceOf: (symbol: string) => { price: number; advDollars: number } | null,
): BookTarget {
  const notes: string[] = [];
  const exitDays = cfg.portfolio.liquidityExitDays;
  const weights = new Map(target.positions.map((p) => [p.symbol, p.weight]));
  const capDollars = new Map<string, number | null>();

  for (const pos of target.positions) {
    const px = priceOf(pos.symbol);
    if (!px || !(px.price > 0)) {
      capDollars.set(pos.symbol, null);
      continue;
    }
    capDollars.set(pos.symbol, book.liquidityConstrained ? px.advDollars * exitDays : null);
  }

  let redistributed = 0;
  for (let pass = 0; pass < 6; pass++) {
    let residual = 0;
    const cappedNow = new Set<string>();
    for (const [sym, w] of weights) {
      const cap = capDollars.get(sym);
      if (cap == null) continue;
      const maxWeight = cap / book.capital;
      if (w > maxWeight) {
        residual += w - maxWeight;
        weights.set(sym, maxWeight);
        cappedNow.add(sym);
      }
    }
    if (residual <= 1e-9) break;
    redistributed += residual;
    // Pro-rata across the remaining eligible holdings, never into one name.
    const room = Array.from(weights.entries()).filter(([s, w]) => {
      if (cappedNow.has(s)) return false;
      const cap = capDollars.get(s);
      const headroom = cap == null ? cfg.portfolio.maxPositionDrift : cap / book.capital;
      return w < Math.min(cfg.portfolio.maxPositionDrift, headroom);
    });
    if (!room.length) {
      notes.push('Liquidity caps left cash undeployed: no remaining name had headroom.');
      break;
    }
    const roomTotal = room.reduce((a, [, w]) => a + w, 0);
    for (const [sym, w] of room) {
      const cap = capDollars.get(sym);
      const ceiling = Math.min(cfg.portfolio.maxPositionDrift, cap == null ? Infinity : cap / book.capital);
      weights.set(sym, Math.min(ceiling, w + residual * (roomTotal > 0 ? w / roomTotal : 1 / room.length)));
    }
  }

  const positions: BookPosition[] = [];
  for (const pos of target.positions) {
    const w = weights.get(pos.symbol) || 0;
    const px = priceOf(pos.symbol);
    const dollars = w * book.capital;
    positions.push({
      symbol: pos.symbol,
      targetWeight: pos.weight,
      bookWeight: Math.round(w * 1e6) / 1e6,
      dollars: Math.round(dollars),
      shares: px && px.price > 0 ? Math.floor(dollars / px.price) : 0,
      liquidityCapDollars: capDollars.get(pos.symbol) ?? null,
      capped: w + 1e-9 < pos.weight,
    });
  }
  const invested = positions.reduce((a, b) => a + b.bookWeight, 0);
  if (redistributed > 1e-6) {
    notes.push(`Liquidity scaling moved ${(redistributed * 100).toFixed(2)}% of the book pro-rata; this is the only sanctioned source of divergence between books.`);
  }
  return {
    bookId: book.id,
    capital: book.capital,
    positions,
    cashWeight: Math.round((1 - invested) * 1e6) / 1e6,
    redistributed: Math.round(redistributed * 1e6) / 1e6,
    notes,
  };
}

// ── §7.3 drawdown protocol ───────────────────────────────────────────────

export type DrawdownState = 'normal' | 'paused' | 'halted';

export interface DrawdownStatus {
  state: DrawdownState;
  drawdown: number;
  highWaterMark: number;
  cashBufferCap: number;
  allowNewEntrants: boolean;
  allowTrancheAcceleration: boolean;
  allowContrarianAdds: boolean;
  trigger: string | null;
}

/**
 * "The protocol is mechanical — it is the only mechanism permitted to raise
 * cash, and every activation is logged with the trigger snapshot."
 * Recovery is deliberately a lower threshold than the trigger so the state
 * cannot chatter around a single level.
 */
export function drawdownProtocol(
  equity: number,
  highWaterMark: number,
  previous: DrawdownState,
  cfg: QuantConfig,
): DrawdownStatus {
  const hwm = Math.max(highWaterMark, equity);
  const dd = hwm > 0 ? 1 - equity / hwm : 0;
  const r = cfg.risk;
  let state: DrawdownState = previous;
  let trigger: string | null = null;

  if (dd >= r.drawdownHalt) {
    if (previous !== 'halted') trigger = `drawdown ${(dd * 100).toFixed(1)}% >= halt ${(r.drawdownHalt * 100).toFixed(0)}%`;
    state = 'halted';
  } else if (dd >= r.drawdownPause) {
    if (previous === 'normal') trigger = `drawdown ${(dd * 100).toFixed(1)}% >= pause ${(r.drawdownPause * 100).toFixed(0)}%`;
    state = previous === 'halted' ? 'halted' : 'paused';
  } else if (dd < r.drawdownRecovery) {
    if (previous !== 'normal') trigger = `recovered to ${(dd * 100).toFixed(1)}% < ${(r.drawdownRecovery * 100).toFixed(0)}%`;
    state = 'normal';
  }

  return {
    state,
    drawdown: Math.round(dd * 1e4) / 1e4,
    highWaterMark: hwm,
    cashBufferCap:
      state === 'halted' ? r.cashBufferAtHalt : state === 'paused' ? r.cashBufferAtPause : cfg.portfolio.cashBuffer,
    allowNewEntrants: state === 'normal',
    allowTrancheAcceleration: state === 'normal',
    // The contrarian sleeve exists for exactly these moments, so its adds
    // continue while everything else stops.
    allowContrarianAdds: true,
    trigger,
  };
}
