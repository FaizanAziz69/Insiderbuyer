/**
 * IQS 2.0 unit tests — the brief's acceptance criteria, §5:
 *   · "Unit tests cover every exclusion rule with fixture filings; a
 *      transaction can never be silently dropped."
 *   · 'Regression test "BIVI case" (Appendix A) scores below the 60th
 *      percentile under IQS 2.0.'
 *
 * Same convention as tx-sanity.spec.ts — no test runner in this repo, so this
 * is a node:assert suite that compiles with the app:
 *
 *   npm run build && node dist/iqs2/iqs2.spec.js
 */
import * as assert from 'assert';
import {
  classifyTransaction,
  liquidityGate,
  isTenPercentOwnerOnly,
  isOfficerOrDirector,
} from './exclusions';
import {
  scoreTrade,
  scoreConvictionDollars,
  scoreHoldingsRatio,
  scoreTrackRecord,
  scoreSeniority,
  scoreOpportunistic,
  scoreContrarian,
  contrarianZ,
  TradeInputs,
} from './trade-score';
import {
  scoreCompany,
  decayFactor,
  clusterMultiplier,
  dilutionPenalty,
  percentileOf,
} from './company-score';
import { WEIGHTS_LAUNCH, WEIGHTS_ALTERNATE } from './config';

let checks = 0;
const ok = (cond: boolean, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};

/* ── Workstream A: every exclusion rule ───────────────────────────────── */

const base = { transactionCode: 'P', plannedBuy: false, rawTitle: 'Chief Executive Officer', role: 'CEO' };

ok(classifyTransaction(base).scored, 'a plain code-P officer purchase is scored');

for (const [code, reason] of [
  ['A', 'NOT_OPEN_MARKET_AWARD'],
  ['M', 'NOT_OPEN_MARKET_EXERCISE'],
  ['F', 'NOT_OPEN_MARKET_TAX_WITHHOLDING'],
  ['G', 'NOT_OPEN_MARKET_GIFT'],
  ['S', 'NOT_A_PURCHASE'],
  ['C', 'NOT_OPEN_MARKET_OTHER'],
] as const) {
  const d = classifyTransaction({ ...base, transactionCode: code });
  ok(!d.scored && d.reason === reason, `code ${code} → ${reason}`);
}

ok(
  classifyTransaction({ ...base, isDerivative: true }).reason === 'DERIVATIVE_ONLY',
  'derivative-table lines are excluded',
);
ok(
  classifyTransaction({ ...base, plannedBuy: true }).reason === 'RULE_10B5_1_PLAN',
  '10b5-1 plan purchases are excluded',
);
ok(
  classifyTransaction({ ...base, acquiredDisposed: 'D' }).reason === 'NOT_A_PURCHASE',
  'a code-P line marked disposed is not a purchase',
);
ok(
  classifyTransaction({ ...base, financingParticipant: true }).reason === 'FINANCING_PARTICIPANT',
  'financing participants are excluded',
);
ok(
  classifyTransaction({ ...base, priceSuspect: true }).reason === 'IMPLAUSIBLE_FILING',
  'implausible filings are excluded',
);

// 10% owners: excluded only when that is their ONLY relationship.
ok(
  isTenPercentOwnerOnly('10% Owner', 'Other'),
  'a bare 10% owner is excluded',
);
ok(
  !isTenPercentOwnerOnly('Director and 10% Owner', 'Director'),
  'a 10% owner who is also a director still counts',
);
ok(
  !isTenPercentOwnerOnly('10% Owner, Chief Executive Officer', 'CEO'),
  'a 10% owner who is also an officer still counts',
);
ok(
  classifyTransaction({ ...base, rawTitle: '10% Owner', role: 'Other' }).reason ===
    'TEN_PERCENT_OWNER_ONLY',
  'the engine applies the 10%-owner rule',
);

// Nothing is ever silently dropped.
for (const tx of [
  base,
  { ...base, transactionCode: 'X' },
  { ...base, transactionCode: '' },
  { ...base, plannedBuy: true },
  { ...base, isDerivative: true },
]) {
  const d = classifyTransaction(tx);
  ok(d.scored ? d.reason === null : !!d.reason, 'every decision carries scored or a reason code');
  ok(!!d.detail, 'every decision carries an explainer sentence');
}

// Liquidity floor makes a company UNSCORED, not zero.
ok(liquidityGate({ lastPrice: 0.05, medianDollarVolume30d: 1e6 }) === 'BELOW_PRICE_FLOOR', 'sub-$0.10 fails');
ok(
  liquidityGate({ lastPrice: 4, medianDollarVolume30d: 10_000 }) === 'BELOW_LIQUIDITY_FLOOR',
  'thin volume fails',
);
ok(liquidityGate({ lastPrice: 4, medianDollarVolume30d: 1e6 }) === null, 'a liquid name passes');
ok(
  liquidityGate({ lastPrice: 4, medianDollarVolume30d: null }) === null,
  'unknown volume is not treated as illiquid',
);

// Officer/director requirement — the institutional-entity gap the first live
// shadow run exposed (Cascade Investment et al. filed 439 of 2,047 "counted"
// purchases with a blank title and no role).
ok(
  classifyTransaction({ transactionCode: 'P', rawTitle: '', role: 'Other' }).reason ===
    'NOT_OFFICER_OR_DIRECTOR',
  'a blank-title entity filer is excluded',
);
ok(
  classifyTransaction({ transactionCode: 'P', rawTitle: '', role: 'Other', isOfficer: true })
    .scored,
  'an explicit officer flag beats the blank title',
);
ok(
  classifyTransaction({ transactionCode: 'P', rawTitle: '', role: 'Other', isDirector: true })
    .scored,
  'an explicit director flag beats the blank title',
);
ok(
  !classifyTransaction({
    transactionCode: 'P',
    rawTitle: 'Chief Executive Officer',
    role: 'CEO',
    isOfficer: false,
    isDirector: false,
  }).scored,
  'explicit false flags win over a title string',
);
ok(isOfficerOrDirector({ transactionCode: 'P', role: 'Director' }), 'a director role counts');
ok(isOfficerOrDirector({ transactionCode: 'P', rawTitle: 'EVP, COO' }), 'a title counts');
ok(!isOfficerOrDirector({ transactionCode: 'P', rawTitle: '', role: 'Other' }), 'neither does not');

/* ── Workstream B: component behaviour ────────────────────────────────── */

ok(scoreConvictionDollars(1e7) === 20, '$10M earns the full 20 conviction points');
ok(scoreConvictionDollars(3_000) < 1, '~$3K earns almost nothing');
ok(scoreConvictionDollars(0) === 0 && scoreConvictionDollars(null) === 0, 'no dollars → 0');
ok(scoreHoldingsRatio(100, 0) === 15, 'a first-ever holder takes the full 15');
ok(scoreHoldingsRatio(50, 100) === 7.5, 'a 50% stake increase earns half');
ok(scoreHoldingsRatio(500, 100) === 15, 'the holdings ratio caps at doubling');

ok(scoreTrackRecord(20, 5) === 10, 'a strong record earns 10');
ok(scoreTrackRecord(-20, 5) === 2, 'a poor record earns 2');
ok(scoreTrackRecord(50, 1) === 4, 'one prior buy is not a track record — neutral prior');
ok(scoreTrackRecord(null, 9) === 4, 'missing history falls to the neutral prior');

ok(scoreSeniority('CEO', 'Chief Executive Officer') === 15, 'CEO scores 15');
ok(scoreSeniority('CFO', 'Chief Financial Officer') === 15, 'CFO caps at 15 with the finance bonus');
ok(scoreSeniority('Director', 'Director') === 6, 'directors score 6');
ok(scoreSeniority('Other', 'Treasurer') === 12, 'a treasurer is an officer plus the finance bonus');

ok(scoreOpportunistic(0) === 15, 'a rare buyer is fully opportunistic');
ok(scoreOpportunistic(12) === 0, 'a very frequent buyer scores 0');
ok(scoreOpportunistic(0, true) === 0, 'the routine-pattern override beats a low count');

// Contrarian: buying into weakness scores UP.
const zWeak = contrarianZ(-40, 0, 3);
const zStrong = contrarianZ(40, 0, 3);
ok(zWeak !== null && zStrong !== null && zWeak < zStrong, 'z tracks relative strength');
ok(scoreContrarian(zWeak) > scoreContrarian(zStrong), 'weakness outscores strength — the IQS 1.0 defect, fixed');
ok(scoreContrarian(null) === 4, 'no price history → the middle band');

/* ── Workstream C: roll-up ────────────────────────────────────────────── */

ok(Math.abs(decayFactor(30) - 0.5) < 1e-9, 'a 30-day-old trade counts half');
ok(Math.abs(decayFactor(60) - 0.25) < 1e-9, 'a 60-day-old trade counts a quarter — brief §C');
ok(clusterMultiplier(1) === 1, 'a single buyer gets no cluster bonus');
ok(Math.abs(clusterMultiplier(3) - 1.3) < 1e-9, 'three buyers → 1.3×');
ok(clusterMultiplier(99) === 1.6, 'the cluster multiplier caps at 1.6');

ok(dilutionPenalty(0.04) === 0, '4% dilution costs nothing');
ok(dilutionPenalty(0.3) === 30, '30% dilution takes the full penalty');
ok(Math.abs(dilutionPenalty(0.15) - 15) < 1e-9, '15% dilution is half the penalty');

ok(percentileOf(5, [1, 2, 3, 4, 5]) > 0.8, 'the top raw ranks near the top');
ok(
  scoreCompany({ trades: [], shareGrowthTtm: 0, universeRaw: [1, 2, 3] }).score === null,
  'no qualifying buying is UNSCORED, not zero',
);

/* ── Appendix A: the BIVI regression case ─────────────────────────────── */
/*
 * Micro-cap biotech: >25% TTM share growth via ATM, five small buys from ONE
 * senior insider over 24 months, no other buyers, deep negative 6-month
 * momentum. The contrarian component legitimately rewards the weakness; the
 * structure must still cap the name below the 60th percentile.
 */
const biviTrade: TradeInputs = {
  dollars: 25_000,
  sharesBought: 30_000,
  priorHoldings: 900_000,
  medianForwardReturnPct: -12,
  priorBuyCount: 5,
  role: 'CEO',
  rawTitle: 'Chief Executive Officer',
  buysTrailing24m: 5,
  routinePattern: false,
  stockReturn6mPct: -55,
  sectorReturn6mPct: -5,
  dailyVolPct: 6,
  priceToBookPercentile: 0.2,
  negativeBookValue: false,
  marketCap: 60e6,
  ownershipFraction: 0.12,
  netDistinctBuyers: 0,
};

// A healthy comparator: a first-time CFO buyer committing real money at a
// company that is not diluting, alongside other buyers.
const strongTrade: TradeInputs = {
  ...biviTrade,
  dollars: 750_000,
  sharesBought: 60_000,
  priorHoldings: 0,
  medianForwardReturnPct: 14,
  priorBuyCount: 4,
  buysTrailing24m: 1,
  stockReturn6mPct: -20,
  netDistinctBuyers: 3,
};

for (const weights of [WEIGHTS_LAUNCH, WEIGHTS_ALTERNATE]) {
  const bivi = scoreTrade(biviTrade, weights);
  const strong = scoreTrade(strongTrade, weights);
  ok(bivi.score < strong.score, 'the BIVI profile scores below a genuine cluster buy');

  // Build a universe of ordinary names to calibrate against, then place the
  // BIVI company in it and apply its penalties.
  const universeRaw = Array.from({ length: 100 }, (_, i) => 20 + i * 2);
  const biviCompany = scoreCompany({
    trades: [
      { score: bivi.score, ageDays: 5, insiderKey: 'ceo-1' },
      { score: bivi.score, ageDays: 40, insiderKey: 'ceo-1' },
      { score: bivi.score, ageDays: 75, insiderKey: 'ceo-1' },
    ],
    shareGrowthTtm: 0.32,
    universeRaw,
  });
  ok(biviCompany.multiplier === 1, 'a single buyer earns no cluster multiplier');
  ok(biviCompany.penalties.dilution === 30, 'the ATM dilution takes the full 30 points');
  ok(
    biviCompany.score !== null && biviCompany.score < 0.6 * 99,
    `BIVI case stays below the 60th percentile (got ${biviCompany.score})`,
  );
}

console.log(`IQS 2.0: ${checks} checks passed.`);
