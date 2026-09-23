/**
 * L2 — the two-gate ranking methodology (Brief v6 §4), as pure functions.
 *
 * "every factor in our ranking must come from objective, public, point-in-time
 * data. Nothing self-reported, nothing subjective, everything reproducible."
 * So nothing here reads a clock, a network or a database: it takes facts that
 * were knowable on a date and returns a score plus the attribution that
 * explains it, which is what §4 requires the research interface to show.
 */

import { PitFacts } from './pit.service';
import { QuantConfig } from './config';

// ── Gate 1 — downside protection ─────────────────────────────────────────

export interface Gate1Input {
  symbol: string;
  facts: PitFacts | null;
  /** Oldest-last quarterly history public at the as-of date. */
  history: PitFacts[];
  marketCap: number | null;
  advDollars: number | null;
  sectorGrossMargin: number | null;
  goingConcern: boolean;
}

export interface Gate1Result {
  symbol: string;
  pass: boolean;
  failed: string[];
  qualityScore: number;
  attribution: Record<string, number | boolean | null>;
}

const ttm = (rows: PitFacts[], pick: (f: PitFacts) => number | null): number | null => {
  const vals = rows.slice(0, 4).map(pick).filter((v): v is number => v != null);
  return vals.length === 4 ? vals.reduce((a, b) => a + b, 0) : null;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const stdev = (xs: number[]) => {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - m) ** 2)));
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Gates are absolute, not weighted: "A name must pass every gate to be
 * eligible". The quality score only ranks the survivors.
 */
export function gate1(input: Gate1Input, cfg: QuantConfig): Gate1Result {
  const { symbol, facts, history, marketCap, advDollars } = input;
  const failed: string[] = [];
  const attr: Record<string, number | boolean | null> = {};

  if (!facts) {
    return { symbol, pass: false, failed: ['no-fundamentals'], qualityScore: 0, attribution: attr };
  }

  // Balance sheet: assets exceed debt, with net cash preferred.
  const assets = facts.totalAssets;
  const debt = facts.totalDebt;
  attr.totalAssets = assets;
  attr.totalDebt = debt;
  if (cfg.gate1.requireAssetsOverDebt) {
    if (assets == null || debt == null) failed.push('balance-sheet-unknown');
    else if (!(assets > debt)) failed.push('assets-not-above-debt');
  }
  const netCash = facts.cash != null && debt != null ? facts.cash - debt : null;
  attr.netCash = netCash;

  // Current ratio and interest coverage.
  attr.currentRatio = facts.currentRatio;
  if (facts.currentRatio == null || facts.currentRatio < cfg.gate1.currentRatioMin) {
    failed.push(`current-ratio<${cfg.gate1.currentRatioMin}`);
  }
  // A company with no debt has no interest to cover; that passes rather than
  // failing on a missing ratio.
  const noDebt = debt != null && debt <= 0;
  const coverage = facts.interestCoverage;
  attr.interestCoverage = coverage;
  attr.noDebt = noDebt;
  if (!noDebt && (coverage == null || coverage < cfg.gate1.interestCoverageMin)) {
    failed.push(`coverage<${cfg.gate1.interestCoverageMin}x`);
  }

  // Health and growth: revenue growing on a trailing-twelve-month basis.
  const revTtm = ttm(history, (f) => f.revenue);
  const revTtmPrior = ttm(history.slice(4), (f) => f.revenue);
  attr.revenueTtm = revTtm;
  attr.revenueTtmPrior = revTtmPrior;
  const revGrowth = revTtm != null && revTtmPrior ? revTtm / revTtmPrior - 1 : null;
  attr.revenueGrowth = revGrowth;
  if (cfg.gate1.requireRevenueGrowth) {
    if (revTtm == null || revTtm <= 0) failed.push('revenue-not-positive');
    else if (revGrowth == null) failed.push('revenue-history-short');
    else if (revGrowth <= 0) failed.push('revenue-not-growing');
  }

  // Free cash flow positive, or clearly improving.
  const fcfTtm = ttm(history, (f) => f.freeCashFlow);
  const fcfPrior = ttm(history.slice(4), (f) => f.freeCashFlow);
  attr.fcfTtm = fcfTtm;
  attr.fcfTtmPrior = fcfPrior;
  const fcfImproving = fcfTtm != null && fcfPrior != null && fcfTtm > fcfPrior;
  attr.fcfImproving = fcfImproving;
  if (cfg.gate1.requirePositiveOrImprovingFcf) {
    if (fcfTtm == null) failed.push('fcf-unknown');
    else if (!(fcfTtm > 0) && !fcfImproving) failed.push('fcf-negative-and-not-improving');
  }

  if (input.goingConcern) failed.push('going-concern-flag');

  // Tradability: never rank what the execution layer cannot buy.
  attr.marketCap = marketCap;
  attr.advDollars = advDollars;
  if (marketCap == null || marketCap < cfg.universe.minMarketCap) failed.push('market-cap-below-floor');
  if (advDollars == null || advDollars < cfg.universe.minAdvDollars) failed.push('adv-below-floor');

  // ── Quality score (0-100), only meaningful for names that passed ──────
  // Moat proxies are evidence-based stand-ins, per §4: margin level against
  // the sector, margin stability, ROIC persistence, revenue durability.
  const margins = history.map((f) => f.grossMargin).filter((v): v is number => v != null);
  const marginLevel = margins.length ? margins[0] : null;
  const marginVsSector =
    marginLevel != null && input.sectorGrossMargin ? marginLevel - input.sectorGrossMargin : null;
  const marginStability = margins.length >= 4 ? 1 - Math.min(1, stdev(margins.slice(0, 8)) / Math.max(0.05, Math.abs(mean(margins.slice(0, 8))))) : null;
  attr.grossMargin = marginLevel;
  attr.grossMarginVsSector = marginVsSector;
  attr.grossMarginStability = marginStability;

  // ROIC per quarter = ebit / (debt + equity); persistence is how often it
  // stayed above 10%.
  const roics = history
    .map((f) => {
      const cap = (f.totalDebt || 0) + (f.totalEquity || 0);
      return f.ebit != null && cap > 0 ? (f.ebit * 4) / cap : null;
    })
    .filter((v): v is number => v != null);
  const roicLatest = roics.length ? roics[0] : null;
  const roicPersistence = roics.length >= 4 ? roics.slice(0, 8).filter((r) => r > 0.1).length / Math.min(8, roics.length) : null;
  attr.roic = roicLatest;
  attr.roicPersistence = roicPersistence;

  // Revenue durability: share of the last eight quarters that grew year over year.
  let durable: number | null = null;
  if (history.length >= 8) {
    let up = 0;
    let n = 0;
    for (let i = 0; i + 4 < history.length && i < 8; i++) {
      const a = history[i].revenue;
      const b = history[i + 4].revenue;
      if (a != null && b != null && b !== 0) {
        n++;
        if (a > b) up++;
      }
    }
    durable = n ? up / n : null;
  }
  attr.revenueDurability = durable;

  const netCashBonus = netCash != null && assets ? clamp01(netCash / Math.max(1, assets)) : 0;
  const parts: Array<[number | null, number]> = [
    [marginVsSector != null ? clamp01(0.5 + marginVsSector * 2) : null, 0.2],
    [marginStability, 0.15],
    [roicPersistence, 0.2],
    [durable, 0.15],
    [revGrowth != null ? clamp01(revGrowth / 0.3) : null, 0.15],
    [netCashBonus, 0.15],
  ];
  let sum = 0;
  let weight = 0;
  for (const [v, w] of parts) {
    if (v == null) continue;
    sum += clamp01(v) * w;
    weight += w;
  }
  const qualityScore = weight > 0 ? Math.round((sum / weight) * 1000) / 10 : 0;

  return { symbol, pass: failed.length === 0, failed, qualityScore, attribution: attr };
}

// ── Gate 2 — insider conviction ──────────────────────────────────────────

export interface ConvictionTrade {
  insider: string;
  role: string | null;
  /** Form 4 transaction code. */
  code: string;
  /** True when the sale came from a 10b5-1 plan, an option exercise or tax withholding. */
  planned: boolean;
  dateMs: number;
  dollars: number;
  /** The buyer's own track-record score, when we have one. */
  insiderIqs: number | null;
  /** Buy size against that insider's disclosed compensation. */
  convictionRatio: number | null;
  /** True when this is the first purchase we have ever seen from them. */
  firstBuy: boolean;
}

export interface Gate2Result {
  symbol: string;
  score: number;
  attribution: Record<string, number | null>;
  drivers: string[];
}

/**
 * §4 Gate 2, and the asymmetry is exactly as the brief specifies: buying
 * dominates, planned sales are excluded from negative scoring ENTIRELY, and
 * discretionary sells count at a fraction of buy weight.
 */
export function gate2(symbol: string, trades: ConvictionTrade[], asOfMs: number, cfg: QuantConfig): Gate2Result {
  const c = cfg.conviction;
  const windowMs = c.windowMonths * 30.44 * 86_400_000;
  const recentMs = c.recentMonths * 30.44 * 86_400_000;
  const inWindow = trades.filter((t) => asOfMs - t.dateMs <= windowMs && t.dateMs <= asOfMs);
  const attr: Record<string, number | null> = {};
  const drivers: string[] = [];

  let buyWeighted = 0;
  let sellWeighted = 0;
  let buyCount = 0;
  let sellCount = 0;
  let plannedSellCount = 0;
  const buyers = new Set<string>();
  const buyDates: Array<{ ms: number; insider: string }> = [];
  let ceoCfoBuy = false;
  let firstBuy = false;
  let bestConvictionRatio = 0;
  let bestIqs = 0;

  for (const t of inWindow) {
    const recent = asOfMs - t.dateMs <= recentMs;
    const timeWeight = recent ? c.recentWeightMultiple : 1;
    if (t.code === 'P') {
      buyWeighted += t.dollars * timeWeight;
      buyCount++;
      buyers.add(t.insider);
      buyDates.push({ ms: t.dateMs, insider: t.insider });
      if (/CEO|CFO/i.test(t.role || '')) ceoCfoBuy = true;
      if (t.firstBuy) firstBuy = true;
      if (t.convictionRatio != null) bestConvictionRatio = Math.max(bestConvictionRatio, t.convictionRatio);
      if (t.insiderIqs != null) bestIqs = Math.max(bestIqs, t.insiderIqs);
    } else if (t.code === 'S') {
      // Planned sales are excluded from negative scoring entirely: a 10b5-1
      // schedule or a tax withholding says nothing about conviction.
      if (t.planned) {
        plannedSellCount++;
        continue;
      }
      sellWeighted += t.dollars * timeWeight * c.sellWeight;
      sellCount++;
    }
  }

  attr.buyDollarsWeighted = buyWeighted;
  attr.sellDollarsWeighted = sellWeighted;
  attr.buyCount = buyCount;
  attr.sellCount = sellCount;
  attr.plannedSellsExcluded = plannedSellCount;
  attr.distinctBuyers = buyers.size;

  const net = buyWeighted - sellWeighted;
  if (net <= 0) {
    return { symbol, score: 0, attribution: { ...attr, base: 0, multiplier: 1 }, drivers };
  }

  // A log scale so one very large buy cannot swamp a genuine cluster of
  // smaller ones; $10m of weighted buying reaches the top of the base range.
  const base = Math.min(1, Math.log10(1 + net) / Math.log10(1 + 10_000_000));
  attr.base = Math.round(base * 1000) / 10;

  // Cluster: N distinct insiders buying inside a rolling window of days.
  let cluster = false;
  const sorted = [...buyDates].sort((a, b) => a.ms - b.ms);
  const clusterMs = c.clusterDays * 86_400_000;
  for (let i = 0; i < sorted.length; i++) {
    const names = new Set<string>();
    for (let j = i; j < sorted.length && sorted[j].ms - sorted[i].ms <= clusterMs; j++) names.add(sorted[j].insider);
    if (names.size >= c.clusterInsiders) {
      cluster = true;
      break;
    }
  }

  let multiplier = 1;
  if (cluster) {
    multiplier *= c.clusterMultiplier;
    drivers.push(`cluster:${c.clusterInsiders}+ insiders/${c.clusterDays}d`);
  }
  if (ceoCfoBuy) {
    multiplier *= c.ceoCfoMultiplier;
    drivers.push('ceo-or-cfo-buy');
  }
  if (firstBuy) {
    multiplier *= c.firstBuyMultiplier;
    drivers.push('first-time-buy');
  }
  if (bestConvictionRatio >= 1) {
    multiplier *= c.convictionRatioMultiplier;
    drivers.push('buy-exceeds-annual-comp');
  }
  if (bestIqs >= 70) {
    multiplier *= c.iqsMultiplier;
    drivers.push('high-iqs-buyer');
  }
  attr.multiplier = Math.round(multiplier * 100) / 100;
  attr.convictionRatio = bestConvictionRatio || null;
  attr.buyerIqs = bestIqs || null;

  const score = Math.max(0, Math.min(100, base * 100 * multiplier));
  return { symbol, score: Math.round(score * 10) / 10, attribution: attr, drivers };
}

/** §4 composite: "Fund Rank = quality score × insider conviction score". */
export function fundRank(qualityScore: number, convictionScore: number): number {
  return Math.round(((qualityScore * convictionScore) / 100) * 10) / 10;
}
