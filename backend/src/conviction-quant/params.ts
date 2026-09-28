/**
 * Every number in the Rulebook, in one place, versioned.
 *
 * Spec 7.4: "All weights and thresholds are rows in params with effective
 * dates. The admin UI blocks changes outside the last five business days of a
 * calendar quarter unless an admin enters a documented emergency override."
 *
 * This file is the DEFAULT set — what loads when the params table is empty —
 * and the shape every stored version must conform to. Nothing in the engines
 * hard-codes a threshold; they read from a Params object handed to them, so a
 * backtest can run under the parameters that were in force on its dates.
 */

export const PARAMS_VERSION = '1.4.0'; // tracks Rulebook v1.4

export const DEFAULT_PARAMS = {
  version: PARAMS_VERSION,
  effectiveFrom: '2026-09-24',

  // ── Rulebook 1: sleeves ──────────────────────────────────────────────
  sleeves: {
    A: { target: 35, range: [20, 40], positions: [12, 15], fullSize: [2.5, 4], hardCap: 8, capAtCost: 5 },
    B: { target: 40, range: [40, 45], positions: [8, 10], fullSize: [5, 8], hardCap: 12, capAtCost: 8 },
    D: { target: 10, initialTarget: 5, range: [0, 10], positions: [10, 20], fullSize: 0.5, fullSizeWorkload: 0.7, hardCap: 2, maxLifetimeLossPct: 10 },
    C: { target: 15, range: [10, 50] },
    A1: { range: [12, 18] },
    A2: { range: [5, 15], minimum: 5 },
    A3: { range: [5, 15] },
    top10SharePct: [50, 60],
  },

  // ── Rulebook 1.1: Sleeve D ───────────────────────────────────────────
  sleeveD: {
    minSignals: 3,
    firstSixMonthsBudgetPct: 5,
    fullBudgetPct: 10,
    positionPctAtCost: 0.5,
    maxPctAtMarket: 2,
    minAdvUsd: 300_000,
    maxPctOfAdv: 25,
    minMarketCap: 50_000_000,
    maxShareGrowthPct: 25,
    ladderMultiple: 3,
    clockMonths: 12,
    lockoutLossPct: 50,
    lockoutMonths: 6,
    maxLifetimeLossPct: 10,
  },

  // ── Rulebook 2: cycle dial ───────────────────────────────────────────
  cycleDial: {
    breadthPlus: 60,
    breadthMinus: 40,
    creditWidenBpsMinus: 100,
    vixPlus: 18,
    vixMinus: 28,
    regimes: {
      Expansion: { min: 3, max: 5, A: 40, B: 40, D: 10, cash: 10, dNewEntries: true },
      Neutral: { min: 1, max: 2, A: 35, B: 40, D: 10, cash: 15, dNewEntries: true },
      Caution: { min: -1, max: 0, A: 28, B: 42, D: 5, cash: 25, dNewEntries: false },
      'Risk-off': { min: -99, max: -2, A: 20, B: 45, D: 5, cash: 30, dNewEntries: false },
    },
    upshiftConsecutiveWeeks: 2,
    buildOverWeeks: 4,
    a2CautionSizeFactor: 0.5,
  },

  // ── Rulebook 3: composite weights (percent) ──────────────────────────
  weights: {
    B: { s1: 25, s2: 15, s3: 20, s4: 20, s5: 5, s6: 5, s7: 5, s8: 5 },
    A1: { s1: 15, s2: 15, s3: 10, s4: 10, s5: 15, s6: 10, s7: 15, s8: 10 },
    A2: { s1: 15, s2: 5, s3: 0, s4: 20, s5: 15, s6: 10, s7: 25, s8: 10 },
    A3: { s1: 15, s2: 25, s3: 25, s4: 10, s5: 5, s6: 5, s7: 5, s8: 10 },
  },

  // ── Rulebook 3: confluence + bands ───────────────────────────────────
  confluence: {
    screenThreshold: 60,
    initiate: { headline: 70, count: 4, s1: 50, s4: 50 },
    tier1: { headline: 80, count: 5 },
    triple: { screens: ['s5', 's6', 's7'] as const, threshold: 70, windowDays: 90, s1: 60, s4: 60 },
    add: { headline: 65 },
    trim: { headline: 50, countDropsTo: 2 },
    exit: { headline: 40 },
    benchMinScreens: 3,
    benchSize: 100,
    watchlistSize: 40,
  },
  bands: [
    { min: 90, action: 'Tier 1, full size' },
    { min: 80, action: 'Tier 1 with 5+ screens; otherwise Tier 2' },
    { min: 70, action: 'Tier 2, initiate' },
    { min: 60, action: 'Add to existing positions only' },
    { min: 50, action: 'Hold, no adds' },
    { min: 40, action: 'Trim' },
    { min: 0, action: 'Exit' },
  ],

  // ── Rulebook 3.1: gates ──────────────────────────────────────────────
  gates: {
    fcfPositiveYearsOf4: 3,
    a2FcfPositiveYearsOf5: 3,
    currentRatioMin: 1.2,
    interestCoverageMin: 5,
    netDebtEbitdaMax: { A: 2.5, B: 2.0, D: 2.5 },
    dilutionMaxPct: { A: 8, B: 3, D: 25 },
    sbcMaxPctRevenue: 10,
    accrualsMaxPct: 10,
    adv20MinUsd: { A: 1_000_000, B: 1_000_000, D: 300_000 },
    positionMaxPctOfAdv: 25,
    marketCapMin: { A: 100_000_000, B: 3_000_000_000, D: 50_000_000 },
    minComputableScreens: 6,
  },

  // ── Rulebook 3.2–3.9: screen thresholds for full marks ──────────────
  screens: {
    s1: {
      fcfMargin: { B: 15, A: 8 },
      fcfConversion: { B: 90, A: 80 },
      roic5y: { B: 15, A: 12 },
      fScore: { B: 7, A: 6 },
      netDebtEbitda: { B: 1.0, A: 2.0 },
      payoutOfFcfMax: { B: 60 },
    },
    s2: {
      revenueGrowth: { B: 8, A: 15 },
      fcfPerShareGrowth: { B: 10, A: 15 },
      surpriseBeatsOf4: 3,
      impliedGrowth: { B: 8, A: 12 },
      ruleOf40: 40,
    },
    s3: {
      provenMoat: { roicMin: 15, years: 5, sdMax: 5, autoScore: 80 },
      testMax: 20,
      pricingPowerRevGrowth: 10,
      recurringRevenueMin: 60,
      nrrMin: 110,
      retentionMin: 90,
      opMarginUpBps: 200,
    },
    s4: {
      expectedReturn: 15,
      peg: { B: 1.5, A3: 2.0 },
      ownHistoryPercentileMax: 70,
      a2: { pbMax: 1.2, evMidcycleBottomDecile: 10 },
    },
    s5: {
      clusterInsiders: 3,
      clusterWithCsuite: 2,
      clusterWindowDays: 30,
      convictionUsd: 250_000,
      convictionPctOfHoldings: 25,
      routineYears: 3,
      placementExclusionDays: 60,
      lookbackMonths: 24,
      recentWeightMonths: 6,
      discretionarySellStopPct: 25,
      discretionarySellWindowDays: 90,
    },
    s6: {
      congressMinRange: 50_001,
      committeeRelevanceMultiplier: 2,
      congressMembersWithinDays: { members: 2, days: 60 },
      thirteenF: { funds: 2, increasePct: 25 },
      buybackPctMcap: 5,
      shortInterestPct: 15,
      shortInterestModifier: 10,
    },
    s7: {
      datedWindowMonths: 12,
      undatedCredit: 0.5,
      heatTopQuintiles: 2,
      heatShareOfSleeveA: 60,
      a2ChecklistRequired: 5,
      a2ChecklistTotal: 7,
    },
    s8: {
      reclaimSessions: 20,
      extensionAtr: 2,
      pedDays: [2, 3],
    },
  },

  // ── Rulebook 5.1: sizing ─────────────────────────────────────────────
  sizing: {
    riskBudgetPct: { A_T1: 1.0, A_T2: 0.6, A2: 0.6, B: 1.5, D: 0.5 },
    stopDistance: { atrMultiple: 2.5, floorPct: 20, capPct: { A: 30, B: 30, D: 100 }, A2: 30 },
    fullSizeCapPct: { A_T1: 4, A_T2: 3, A2: 2, A2_ETF: 4, B: 5, B_maxAtCost: 8, D: 0.5 },
    heatMaxPct: { A: 12, book: 25 },
  },

  // ── Rulebook 5.2–5.3: tranches, averaging down ──────────────────────
  tranches: {
    split: [40, 30, 30],
    t2MinWeeks: 2,
    t2MaxWeeks: 4,
    t2PullbackPct: 7,
    noT2AboveGainPct: 15,
    profile1Split: [60, 40],
  },
  averagingDown: {
    B: { triggerPct: 15, reunderwriteHours: 48, headlineMin: 65, maxAdds: 2 },
    A: { maxAdds: 1, hardStopPct: 25 },
  },

  // ── Rulebook 5.4: clock and calendar ────────────────────────────────
  clock: {
    windows: [
      { from: '09:30', to: '10:00', allow: ['thesis_stop_exit'] },
      { from: '10:00', to: '11:30', allow: ['buy', 'sell', 'trim'] },
      { from: '11:30', to: '14:00', allow: ['resting_limit'] },
      { from: '14:00', to: '15:30', allow: ['buy', 'sell', 'trim'] },
      { from: '15:30', to: '15:50', allow: ['trim', 'sell'] },
      { from: '15:50', to: '16:00', allow: ['moc_core_add', 'moc_rebalance'] },
    ],
    fomcNoOrdersBefore: '15:00',
    cpiNfpNoOrdersBefore: '10:30',
    earningsNoInitiationSessions: 5,
    earningsMaxCarryPctOfFull: 50,
    pedBuyDays: [2, 3],
    form4ActAt: '10:00',
    optionsRollBy: '14:00',
  },

  // ── Rulebook 6: exits ───────────────────────────────────────────────
  exits: {
    ladder: [
      { gainPct: 50, sellPctOfOriginal: 25 },
      { gainPct: 100, sellPctOfOriginal: 30 },
    ],
    trailingFromHighWeeklyClosePct: 25,
    targetReachedRerun: { newBaseCaseMinPct: 30, headlineMin: 65 },
    priceStop: { A: 25, A_exceptionReducePct: 50, B: 35, B_reunderwriteHours: 48 },
    sleeveBTrim: { evEbitdaPercentile: 90, trimPct: 20, capPct: 12 },
    defaultHoldMonths: 12,
    thesisStops: [
      'going_concern', 'restatement_or_auditor_resignation', 'ceo_cfo_departure_no_succession',
      'discretionary_csuite_selling_gt_25pct_90d', 'dilutive_financing_gt_20pct_discount',
      'guidance_cut_gt_20pct_A', 'regulator_action', 'dividend_cut_B', 'roic_below_wacc_2y_B',
      'fcf_negative_2q_no_plan', 'catalyst_cancelled_or_delayed_2q', 'revisions_negative_2q_A3',
    ],
  },

  // ── Rulebook 7: swing lot ───────────────────────────────────────────
  swing: {
    minHeadline: 70, minProfitPct: 20, minAdvUsd: 5_000_000, lotPct: 25,
    sellAtrMultiple: 2, sellRsi: 75, sellGainPct: 25, sellGainSessions: 10,
    rebuyDropPct: 10, rebuyWindowDays: 30, ccIvRankMin: 50, ccDelta: 0.30, ccDte: 30,
    maxRoundTripsPerNamePerMonth: 1, maxSalesPerWeek: 4, expectedContributionPct: [3, 6], maxShareOfPnlPct: 10,
  },

  // ── Rulebook 7A: options ────────────────────────────────────────────
  options: {
    minOpenInterest: 500, maxSpreadPctOfMid: 8, noShortWithinEarningsSessions: 5,
    sellPremiumIvRankMin: 40, buyProtectionIvRankMax: 30,
    csp: { strikeBelowSpotPct: [5, 10], delta: [0.25, 0.35], dte: [30, 45], minPremiumPctPerMonth: 1.5, sleeveAMinAdvUsd: 10_000_000 },
    committedCashMaxPctOfSleeveC: 50,
    cc: { dte: [30, 45], deltaB: [0.15, 0.20], deltaSwing: 0.30 },
    eventHedge: { putDelta: 0.30, callDelta: 0.20, weeksPastEvent: [1, 3], budgetPctPerEvent: 0.25, budgetPctPerQuarter: 1.0, carryAboveFullPct: 50 },
    tailHedge: { budgetPctPerYear: 0.5, vixMax: 15, spxAboveMa200Pct: 10, otmPct: 10, months: 3, monetizeAtDrawdownPct: 15, monetizeFraction: 0.5 },
    directional: {
      premiumPctNav: { T1: 1.0, T2: 0.5 }, openMaxPctNav: 3, newPerQuarterMaxPctNav: 1.5,
      debitMaxPctOfWidth: 40, ivRankMax: 60, expiryMinDaysPastCatalyst: 14, expiryMaxDays: 120,
      itmCallDeltaMin: 0.60, itmCallWhenTargetPctGt: 25, strikeWithinPctOfTarget: 3,
      closeAtPctOfMax: 80, timeStopHeadline: 65, maxShareOfPnlPct: 15, heatCountPct: 100,
    },
    rollByTime: '14:00',
  },

  // ── Rulebook 8.1: hard limits ───────────────────────────────────────
  limits: {
    singleName: { A_market: 8, A_cost: 5, B_market: 12, B_cost: 8 },
    correlatedPairCorr: 0.75, correlatedPairWindowDays: 60,
    top5MaxPct: 40,
    sectorMaxPct: 25, contrarianBucketMaxPct: 15,
    singleCatalystMaxPct: 15,
    smallCapUsd: 500_000_000, smallCapMaxPct: 25, tsxvOtcMaxPct: 15,
    sleeveDMaxPctAtCost: 10, sleeveDSingleMaxPctMarket: 2,
    leveragedEtfMaxSessions: 10,
  },

  // ── Rulebook 8.2–8.3: breakers, deployment ──────────────────────────
  breakers: {
    levels: [
      { name: 'Yellow', drawdownPct: 5, sleeveAMaxPct: null, cashMinPct: null, noNewSessions: 0 },
      { name: 'Orange', drawdownPct: 8, sleeveAMaxPct: 30, cashMinPct: 25, noNewSessions: 0 },
      { name: 'Red', drawdownPct: 12, sleeveAMaxPct: 20, cashMinPct: 35, noNewSessions: 10 },
      { name: 'Halt', drawdownPct: 15, sleeveAMaxPct: 10, cashMinPct: 50, noNewSessions: 30 },
    ],
    designLimitPct: 20,
    stepUp: { recoverFractionOfDrawdown: 0.5, orSessionsWithVolUnderTarget: 20 },
    monthlyThrottle: { worseThanPct: -6, nextMonthBudgetFactor: 0.5 },
    volThrottle: { realizedVolPct: 20, grossCutPct: 20 },
    deployment: [
      { spxDrawdownPct: 10, deployPctNav: 5 },
      { spxDrawdownPct: 15, deployPctNav: 5, monetizeTailHedge: true },
      { spxDrawdownPct: 20, deployPctNav: 5, cashFloorPct: 5 },
    ],
    deploymentOnlyIfFundDrawdownLt: 8,
  },

  // ── Spec 10A: execution guide ───────────────────────────────────────
  executionGuide: {
    horizonMinDays: 45, horizonCatalystPlusDays: 14, horizonOptionsCapDays: 120,
    stockHorizonMonths: 12, noCatalystHorizonDays: 90,
    profile3FirstTrimPct: 30,
    quoteFreshMinutes: 15, slippageSpreadPctOfDebit: 5,
    scenarioOutcomes: ['target', 'halfway', 'unchanged', 'bear'] as const,
  },

  // ── Rulebook 10: measurement ────────────────────────────────────────
  measurement: {
    benchmarks: { spx: 'SPY', tsx: 'XIC.TO', tbill: 'BIL', blend: [0.5, 0.3, 0.2] },
    screenAuditRollingYears: 2,
    targets: {
      cagr: [20, 30], maxDrawdown: 20, worstMonth: -8, recoverMonths: 3, calmarMin: 1.2,
      sleeveAHitRate: [45, 55], sleeveAPayoff: 2.5, sleeveBHitRate: 65, monthlyVol: [3, 4],
      optionsContributionPct: [1, 3], optionsMaxShareOfPnl: 15, sleeveDHitRate: [20, 35], sleeveDPayoff: 4,
    },
    proof: { paperDays: 90, liveStepsPct: [25, 50, 100] },
  },

  // ── Rulebook 11A: compliance ────────────────────────────────────────
  compliance: {
    restrictedLookbackMonths: 12,
    blackoutDaysAfterPublication: 2,
    reviewCadence: 'weekly',
  },

  // ── Spec 7.4: rule-change window ────────────────────────────────────
  governance: { changeWindowBusinessDaysBeforeQuarterEnd: 5 },
} as const;

export type Params = typeof DEFAULT_PARAMS;
