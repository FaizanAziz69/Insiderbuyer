/**
 * Every default in Brief v6 lives here, versioned (§8: "parameter config —
 * every default in this brief lives here, versioned"). §12 makes these
 * starting points George approves after the P2 backtests, so nothing is
 * hardcoded at a call site: the engine reads this object, and the admin can
 * override any field into `quant_config` without a deploy.
 */

export interface QuantConfig {
  universe: {
    exchanges: string[];
    minMarketCap: number;
    minAdvDollars: number;
    countries: string[];
  };
  gate1: {
    currentRatioMin: number;
    interestCoverageMin: number;
    requireAssetsOverDebt: boolean;
    requireRevenueGrowth: boolean;
    requirePositiveOrImprovingFcf: boolean;
  };
  conviction: {
    windowMonths: number;
    recentMonths: number;
    recentWeightMultiple: number;
    sellWeight: number;
    clusterInsiders: number;
    clusterDays: number;
    clusterMultiplier: number;
    ceoCfoMultiplier: number;
    firstBuyMultiplier: number;
    convictionRatioMultiplier: number;
    iqsMultiplier: number;
  };
  portfolio: {
    targetNamesMin: number;
    targetNamesMax: number;
    maxSectorWeight: number;
    contrarianMinWeight: number;
    smallCapWeight: number;
    smallCapBandLow: number;
    smallCapBandHigh: number;
    smallCapMaxMarketCap: number;
    maxPositionInitial: number;
    maxPositionDrift: number;
    minPosition: number;
    liquidityExitDays: number;
    cashBuffer: number;
    contrarianDrawdownThreshold: number;
  };
  rebalancing: {
    tranches: number[];
    tranceWeeksMin: number;
    tranceWeeksMax: number;
    driftBand: number;
    annualTurnoverCap: number;
    entrantHysteresis: number;
    entrantConsecutiveWeeks: number;
  };
  risk: {
    benchmarkBlend: Array<{ symbol: string; weight: number }>;
    downsideCaptureTarget: number;
    upsideCaptureTarget: number;
    drawdownPause: number;
    drawdownHalt: number;
    drawdownRecovery: number;
    cashBufferAtPause: number;
    cashBufferAtHalt: number;
  };
  books: Array<{ id: string; name: string; capital: number; liquidityConstrained: boolean; rampWeeks: number }>;
  execution: {
    maxDailyDeployment: number;
    participationCap: number;
    slippageTolerance: number;
    requireApproval: boolean;
    killSwitch: boolean;
    broker: 'paper' | 'ibkr';
  };
}

export const DEFAULT_CONFIG: QuantConfig = {
  // §12 open item (George): exchanges, min market cap, min ADV. These are the
  // brief's own starting points until he sets them.
  universe: {
    exchanges: ['NASDAQ', 'NYSE', 'AMEX', 'TSX', 'TSXV'],
    minMarketCap: 100_000_000,
    minAdvDollars: 500_000,
    countries: ['US', 'CA'],
  },
  // §4 Gate 1 defaults, quoted: "current ratio >= 1.5, coverage >= 3x".
  gate1: {
    currentRatioMin: 1.5,
    interestCoverageMin: 3,
    requireAssetsOverDebt: true,
    requireRevenueGrowth: true,
    requirePositiveOrImprovingFcf: true,
  },
  // §4 Gate 2: 24-month window, last 6 months at 3x, sells at 0.3x.
  conviction: {
    windowMonths: 24,
    recentMonths: 6,
    recentWeightMultiple: 3,
    sellWeight: 0.3,
    clusterInsiders: 3,
    clusterDays: 14,
    clusterMultiplier: 1.6,
    ceoCfoMultiplier: 1.35,
    firstBuyMultiplier: 1.2,
    convictionRatioMultiplier: 1.3,
    iqsMultiplier: 1.25,
  },
  // §5 construction.
  portfolio: {
    targetNamesMin: 20,
    targetNamesMax: 35,
    maxSectorWeight: 0.25,
    contrarianMinWeight: 0.05,
    smallCapWeight: 0.1,
    smallCapBandLow: 0.08,
    smallCapBandHigh: 0.12,
    smallCapMaxMarketCap: 2_000_000_000,
    maxPositionInitial: 0.06,
    maxPositionDrift: 0.09,
    minPosition: 0.015,
    liquidityExitDays: 5,
    cashBuffer: 0.05,
    contrarianDrawdownThreshold: 0.25,
  },
  // §6 entry and rebalancing.
  rebalancing: {
    tranches: [0.4, 0.3, 0.3],
    tranceWeeksMin: 4,
    tranceWeeksMax: 8,
    driftBand: 0.25,
    annualTurnoverCap: 0.6,
    entrantHysteresis: 0.2,
    entrantConsecutiveWeeks: 2,
  },
  // §7 risk. Benchmark blend is George's to approve (§12).
  risk: {
    benchmarkBlend: [
      { symbol: 'SPY', weight: 0.6 },
      { symbol: 'XIC.TO', weight: 0.2 },
      { symbol: 'IWM', weight: 0.2 },
    ],
    downsideCaptureTarget: 0.8,
    upsideCaptureTarget: 0.9,
    drawdownPause: 0.1,
    drawdownHalt: 0.15,
    drawdownRecovery: 0.07,
    cashBufferAtPause: 0.1,
    cashBufferAtHalt: 0.15,
  },
  // §5 capital configuration: two books, one portfolio.
  books: [
    { id: 'A', name: 'Flagship', capital: 50_000_000, liquidityConstrained: true, rampWeeks: 14 },
    { id: 'B', name: 'Mirror', capital: 1_000_000, liquidityConstrained: false, rampWeeks: 6 },
  ],
  // §9 execution. Paper until 60 clean days, and approval-queued after that.
  execution: {
    maxDailyDeployment: 2_000_000,
    participationCap: 0.1,
    slippageTolerance: 0.005,
    requireApproval: true,
    killSwitch: false,
    broker: 'paper',
  },
};

/** Deep merge of a stored override onto the defaults. */
export function mergeConfig(base: QuantConfig, override: any): QuantConfig {
  if (!override || typeof override !== 'object') return base;
  const out: any = Array.isArray(base) ? [...(base as any)] : { ...(base as any) };
  for (const [k, v] of Object.entries(override)) {
    const cur = (base as any)[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && cur && typeof cur === 'object' && !Array.isArray(cur)) {
      out[k] = mergeConfig(cur, v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out as QuantConfig;
}
