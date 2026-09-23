/**
 * Brief v6 — the rules that would be worst to get quietly wrong, checked.
 *   node dist/quant/quant.spec.js
 *
 * The asymmetry in Gate 2, the sleeve minimums, the liquidity redistribution,
 * the drawdown protocol and the §7.2 selection rule are all places where a
 * plausible-looking implementation can silently contradict the brief.
 */
import { DEFAULT_CONFIG, mergeConfig } from './config';
import { ConvictionTrade, gate1, gate2, fundRank } from './ranking';
import { Candidate, buildTargetPortfolio, drawdownProtocol, riskAdjustedWeight, scaleToBook } from './portfolio';
import { acceptsChange, captureRatios, chooseParameters, downsideDeviation, maxDrawdown, riskMetrics } from './risk';
import { driftOrders, entrantSwaps, forcedExits, trancheDecision, turnoverGuard } from './rebalance';
import { PitFacts } from './pit.service';

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  } else console.log(`  ok   ${name}`);
}
function truthy(name: string, cond: boolean, detail?: unknown) {
  if (cond) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}${detail !== undefined ? `\n       ${JSON.stringify(detail)}` : ''}`);
  }
}
function close(name: string, got: number | null | undefined, want: number, tol = 1e-6) {
  if (got != null && Math.abs(got - want) <= tol) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${got}\n       want ${want}`);
  }
}

console.log('\nquant (Brief v6) checks\n');
const CFG = DEFAULT_CONFIG;

// ── Config ───────────────────────────────────────────────────────────────
check('brief defaults: current ratio', CFG.gate1.currentRatioMin, 1.5);
check('brief defaults: coverage', CFG.gate1.interestCoverageMin, 3);
check('brief defaults: sells at 0.3x', CFG.conviction.sellWeight, 0.3);
check('brief defaults: recent 6m at 3x', [CFG.conviction.recentMonths, CFG.conviction.recentWeightMultiple], [6, 3]);
check('brief defaults: contrarian minimum 5%', CFG.portfolio.contrarianMinWeight, 0.05);
check('brief defaults: small-cap 10% in an 8-12% band', [CFG.portfolio.smallCapWeight, CFG.portfolio.smallCapBandLow, CFG.portfolio.smallCapBandHigh], [0.1, 0.08, 0.12]);
check('brief defaults: two books, $50M and $1M', CFG.books.map((b) => b.capital), [50_000_000, 1_000_000]);
check('brief defaults: drawdown 10/15/7', [CFG.risk.drawdownPause, CFG.risk.drawdownHalt, CFG.risk.drawdownRecovery], [0.1, 0.15, 0.07]);
const patched = mergeConfig(CFG, { gate1: { currentRatioMin: 2 } });
check('config merge is deep, not a replace', [patched.gate1.currentRatioMin, patched.gate1.interestCoverageMin], [2, 3]);

// ── Gate 1 ───────────────────────────────────────────────────────────────
const mkFacts = (over: Partial<PitFacts> = {}): PitFacts => ({
  symbol: 'TEST', periodEnd: '2026-06-30', fiscalYear: '2026', period: 'Q2', knowableFrom: '2026-07-31T00:00:00Z',
  revenue: 1000, grossProfit: 400, operatingIncome: 200, ebit: 200, netIncome: 150, interestExpense: 20,
  totalAssets: 5000, totalDebt: 1000, totalLiabilities: 2000, cash: 1500, netDebt: -500,
  totalCurrentAssets: 3000, totalCurrentLiabilities: 1000, totalEquity: 3000,
  operatingCashFlow: 300, capex: -50, freeCashFlow: 250,
  currentRatio: 3, interestCoverage: 10, grossMargin: 0.4, ...over,
});
const history = (n: number, rev: number, fcf: number) =>
  Array.from({ length: n }, (_, i) => mkFacts({ revenue: rev - i * 10, freeCashFlow: fcf - i * 5, periodEnd: `2026-0${(6 - (i % 6)) || 1}-30` }));

const healthy = gate1({ symbol: 'GOOD', facts: mkFacts(), history: history(12, 1000, 250), marketCap: 5e9, advDollars: 5e6, sectorGrossMargin: 0.3, goingConcern: false }, CFG);
truthy('a healthy name passes every gate', healthy.pass, healthy.failed);
truthy('quality score is scored, not binary', healthy.qualityScore > 0 && healthy.qualityScore <= 100, healthy.qualityScore);

const levered = gate1({ symbol: 'BAD', facts: mkFacts({ totalDebt: 9000, currentRatio: 0.9, interestCoverage: 1 }), history: history(12, 1000, 250), marketCap: 5e9, advDollars: 5e6, sectorGrossMargin: 0.3, goingConcern: false }, CFG);
truthy('assets below debt fails', levered.failed.includes('assets-not-above-debt'), levered.failed);
truthy('current ratio below 1.5 fails', levered.failed.includes('current-ratio<1.5'), levered.failed);
truthy('coverage below 3x fails', levered.failed.includes('coverage<3x'), levered.failed);
truthy('gates are absolute: one failure blocks', !levered.pass);

const debtFree = gate1({ symbol: 'NODEBT', facts: mkFacts({ totalDebt: 0, interestExpense: 0, interestCoverage: null }), history: history(12, 1000, 250), marketCap: 5e9, advDollars: 5e6, sectorGrossMargin: 0.3, goingConcern: false }, CFG);
truthy('a debt-free company is not failed for a missing coverage ratio', debtFree.pass, debtFree.failed);

const illiquid = gate1({ symbol: 'THIN', facts: mkFacts(), history: history(12, 1000, 250), marketCap: 5e6, advDollars: 1000, sectorGrossMargin: 0.3, goingConcern: false }, CFG);
truthy('tradability gate blocks what execution cannot buy', illiquid.failed.includes('market-cap-below-floor') && illiquid.failed.includes('adv-below-floor'), illiquid.failed);

const shrinking = gate1({ symbol: 'SHRINK', facts: mkFacts(), history: [...history(4, 800, 250), ...history(8, 1200, 250)], marketCap: 5e9, advDollars: 5e6, sectorGrossMargin: 0.3, goingConcern: false }, CFG);
truthy('shrinking revenue fails the growth gate', shrinking.failed.includes('revenue-not-growing'), shrinking.failed);
truthy('going-concern flag fails', gate1({ symbol: 'GC', facts: mkFacts(), history: history(12, 1000, 250), marketCap: 5e9, advDollars: 5e6, sectorGrossMargin: 0.3, goingConcern: true }, CFG).failed.includes('going-concern-flag'));

// ── Gate 2: the asymmetry is the whole point ─────────────────────────────
const now = Date.UTC(2026, 8, 1);
const day = 86_400_000;
const T = (o: Partial<ConvictionTrade>): ConvictionTrade => ({
  insider: 'A', role: 'Director', code: 'P', planned: false, dateMs: now - 30 * day, dollars: 100_000,
  insiderIqs: null, convictionRatio: null, firstBuy: false, ...o,
});

const buysOnly = gate2('X', [T({ dollars: 1_000_000 })], now, CFG);
const withPlannedSales = gate2('X', [T({ dollars: 1_000_000 }), T({ code: 'S', planned: true, dollars: 50_000_000 })], now, CFG);
check('planned sales are excluded from negative scoring entirely', withPlannedSales.score, buysOnly.score);
truthy('and they are counted so the exclusion is visible', withPlannedSales.attribution.plannedSellsExcluded === 1);

const withDiscretionarySale = gate2('X', [T({ dollars: 1_000_000 }), T({ code: 'S', planned: false, dollars: 1_000_000 })], now, CFG);
truthy('a discretionary sale does count against', withDiscretionarySale.score < buysOnly.score, [withDiscretionarySale.score, buysOnly.score]);
truthy('but at a fraction of buy weight, so net stays positive', withDiscretionarySale.score > 0, withDiscretionarySale.score);

const recent = gate2('X', [T({ dateMs: now - 30 * day, dollars: 1_000_000 })], now, CFG);
const old = gate2('X', [T({ dateMs: now - 400 * day, dollars: 1_000_000 })], now, CFG);
truthy('recent buying outweighs old buying', recent.score > old.score, [recent.score, old.score]);
check('a buy outside the 24-month window is ignored', gate2('X', [T({ dateMs: now - 900 * day, dollars: 5_000_000 })], now, CFG).score, 0);

const cluster = gate2('X', [
  T({ insider: 'A', dateMs: now - 10 * day }),
  T({ insider: 'B', dateMs: now - 8 * day }),
  T({ insider: 'C', dateMs: now - 5 * day }),
], now, CFG);
truthy('three insiders inside 14 days is a cluster', cluster.drivers.includes('cluster:3+ insiders/14d'), cluster.drivers);
const spread = gate2('X', [
  T({ insider: 'A', dateMs: now - 200 * day }),
  T({ insider: 'B', dateMs: now - 100 * day }),
  T({ insider: 'C', dateMs: now - 5 * day }),
], now, CFG);
truthy('the same three spread over months is not', !spread.drivers.some((d) => d.startsWith('cluster')), spread.drivers);

truthy('a CEO buy is a multiplier', gate2('X', [T({ role: 'CEO' })], now, CFG).drivers.includes('ceo-or-cfo-buy'));
truthy('a first-time buy is a multiplier', gate2('X', [T({ firstBuy: true })], now, CFG).drivers.includes('first-time-buy'));
truthy('a buy above annual comp is a multiplier', gate2('X', [T({ convictionRatio: 1.4 })], now, CFG).drivers.includes('buy-exceeds-annual-comp'));
truthy('a high-IQS buyer is a multiplier', gate2('X', [T({ insiderIqs: 85 })], now, CFG).drivers.includes('high-iqs-buyer'));
check('no insider activity scores zero', gate2('X', [], now, CFG).score, 0);
truthy('conviction is capped at 100', gate2('X', Array.from({ length: 12 }, (_, i) => T({ insider: `I${i}`, dollars: 50_000_000, role: 'CEO', firstBuy: true, convictionRatio: 3, insiderIqs: 95, dateMs: now - (i + 1) * day })), now, CFG).score <= 100);
check('fund rank is quality x conviction', fundRank(80, 50), 40);

// ── Portfolio construction ───────────────────────────────────────────────
const C = (o: Partial<Candidate>): Candidate => ({
  symbol: 'S', sector: 'Tech', fundRank: 50, convictionScore: 60, qualityScore: 80,
  marketCap: 10e9, price: 100, advDollars: 20e6, downsideDeviation: 0.2,
  sectorInflow: true, sectorContrarian: false, excluded: false, ...o,
});
const many = Array.from({ length: 60 }, (_, i) =>
  C({ symbol: `S${i}`, fundRank: 80 - i, sector: `Sector${i % 6}`, marketCap: i < 10 ? 1e9 : 20e9, sectorContrarian: i % 11 === 0, downsideDeviation: 0.15 + (i % 5) * 0.05 }),
);
const target = buildTargetPortfolio(many, CFG, '2026-09-01');
truthy('position count respects the 20-35 target', target.positions.length >= CFG.portfolio.targetNamesMin && target.positions.length <= CFG.portfolio.targetNamesMax, target.positions.length);
truthy('no position exceeds the 6% initiation cap', target.positions.every((p) => p.weight <= CFG.portfolio.maxPositionInitial + 1e-9));
truthy('no position sits below the 1.5% minimum', target.positions.every((p) => p.weight >= CFG.portfolio.minPosition - 1e-9));
const sectorMax = Math.max(...Object.values(target.sectorWeights));
truthy('no sector exceeds 25%', sectorMax <= CFG.portfolio.maxSectorWeight + 1e-6, sectorMax);
truthy('the contrarian sleeve is represented', target.sleeveWeights.contrarian > 0, target.sleeveWeights);
truthy('the small-cap sleeve is represented', target.sleeveWeights.smallcap > 0, target.sleeveWeights);
close('cash is the 5% buffer', target.cashWeight, CFG.portfolio.cashBuffer, 0.02);

const excludedTarget = buildTargetPortfolio(many.map((c, i) => (i === 0 ? { ...c, excluded: true } : c)), CFG, '2026-09-01');
truthy('a client-excluded name cannot appear, however high it ranks', !excludedTarget.positions.find((p) => p.symbol === 'S0'));

const volatile = C({ symbol: 'VOL', downsideDeviation: 0.6 });
const stable = C({ symbol: 'STABLE', downsideDeviation: 0.1 });
truthy('risk adjustment sizes the volatile name smaller at equal rank', riskAdjustedWeight(volatile) < riskAdjustedWeight(stable));
truthy('an unknown downside history is treated as median risk, not risk-free', riskAdjustedWeight(C({ downsideDeviation: null })) < riskAdjustedWeight(stable));

// ── Two books, one portfolio ─────────────────────────────────────────────
const priceOf = (s: string) => ({ price: 100, advDollars: s === 'S0' ? 200_000 : 50_000_000 });
const bookA = scaleToBook(target, CFG.books[0], CFG, priceOf);
const bookB = scaleToBook(target, CFG.books[1], CFG, priceOf);
const s0A = bookA.positions.find((p) => p.symbol === 'S0');
const s0B = bookB.positions.find((p) => p.symbol === 'S0');
if (s0A && s0B) {
  truthy('the flagship is liquidity-capped on a thin name', s0A.capped, s0A);
  truthy('the mirror is not, at $1M', !s0B.capped, s0B);
  truthy('the cap is 5 days of ADV', Math.abs((s0A.liquidityCapDollars || 0) - 200_000 * 5) < 1, s0A.liquidityCapDollars);
}
truthy('redistribution is pro-rata, never into one name', bookA.positions.filter((p) => p.bookWeight > CFG.portfolio.maxPositionDrift + 1e-9).length === 0);
truthy('both books hold the same names', bookA.positions.length === bookB.positions.length);

// ── Drawdown protocol ────────────────────────────────────────────────────
check('normal below the pause threshold', drawdownProtocol(96, 100, 'normal', CFG).state, 'normal');
const paused = drawdownProtocol(89, 100, 'normal', CFG);
check('pauses at 10%', paused.state, 'paused');
truthy('a pause stops new entrants', !paused.allowNewEntrants);
truthy('a pause raises the cash cap to 10%', paused.cashBufferCap === CFG.risk.cashBufferAtPause);
const halted = drawdownProtocol(84, 100, 'paused', CFG);
check('halts at 15%', halted.state, 'halted');
truthy('contrarian adds continue even when halted, which is what the sleeve is for', halted.allowContrarianAdds);
check('does not recover at 8%, between halt and recovery', drawdownProtocol(92, 100, 'halted', CFG).state, 'halted');
check('recovers below 7%', drawdownProtocol(94, 100, 'halted', CFG).state, 'normal');
truthy('every activation carries a trigger for the log', !!paused.trigger && !!halted.trigger);

// ── Rebalancing ──────────────────────────────────────────────────────────
const holding = { symbol: 'A', weight: 0.02, targetWeight: 0.05, fundRank: 50, tranchesFilled: 0, openedAt: '2026-01-01', sleeves: ['core'] };
const normal = drawdownProtocol(100, 100, 'normal', CFG);
check('tranche 1 is 40% of target', trancheDecision(holding, { freshInsiderBuying: false, priceWeakness: false, convictionDecayed: false }, normal, CFG).weightDelta, 0.05 * 0.4);
check('decayed conviction pauses the tranche', trancheDecision(holding, { freshInsiderBuying: false, priceWeakness: false, convictionDecayed: true }, normal, CFG).action, 'hold');
check('acceleration is blocked while paused', trancheDecision(holding, { freshInsiderBuying: true, priceWeakness: false, convictionDecayed: false }, paused, CFG).action, 'hold');
check('unless the name is contrarian', trancheDecision({ ...holding, sleeves: ['contrarian'] }, { freshInsiderBuying: true, priceWeakness: false, convictionDecayed: false }, paused, CFG).action, 'fill');
check('a fully built position stops', trancheDecision({ ...holding, tranchesFilled: 3 }, { freshInsiderBuying: true, priceWeakness: false, convictionDecayed: false }, normal, CFG).action, 'hold');

const drifted = driftOrders([
  { symbol: 'UP', weight: 0.07, targetWeight: 0.05, fundRank: 50, tranchesFilled: 3, openedAt: null, sleeves: ['core'] },
  { symbol: 'FLAT', weight: 0.052, targetWeight: 0.05, fundRank: 50, tranchesFilled: 3, openedAt: null, sleeves: ['core'] },
  { symbol: 'DOWN', weight: 0.03, targetWeight: 0.05, fundRank: 50, tranchesFilled: 3, openedAt: null, sleeves: ['core'] },
], CFG, normal);
check('only band breaches trade', drifted.map((o) => o.symbol).sort(), ['DOWN', 'UP']);
check('within the band nothing happens', drifted.find((o) => o.symbol === 'FLAT'), undefined);

const snaps = [
  { asOf: '2026-08-25', ranks: { NEW: 100, LOW: 50 } },
  { asOf: '2026-09-01', ranks: { NEW: 100, LOW: 50 } },
];
const holdings = [{ symbol: 'LOW', weight: 0.03, targetWeight: 0.03, fundRank: 50, tranchesFilled: 3, openedAt: null, sleeves: ['core'] }];
check('a sustained 20%+ margin swaps', entrantSwaps(holdings, { NEW: 100 }, snaps, CFG, normal).length, 1);
check('a single week does not', entrantSwaps(holdings, { NEW: 100 }, snaps.slice(0, 1), CFG, normal).length, 0);
check('a margin under the hysteresis does not', entrantSwaps(holdings, { NEW: 55 }, [{ asOf: 'a', ranks: { NEW: 55, LOW: 50 } }, { asOf: 'b', ranks: { NEW: 55, LOW: 50 } }], CFG, normal).length, 0);
check('no new entrants while paused', entrantSwaps(holdings, { NEW: 100 }, snaps, CFG, paused).length, 0);

const exits = forcedExits(holdings, { LOW: { gate1Pass: false, heavyDiscretionarySelling: false, delistedOrAcquired: false, clientExcluded: false } });
check('a Gate 1 failure forces an exit', exits.length, 1);
truthy('and says why', /Gate 1 failure/.test(exits[0].reason), exits[0].reason);

const guard = turnoverGuard(
  [{ symbol: 'A', side: 'buy', weightDelta: 0.3, reason: 'add' }, { symbol: 'B', side: 'sell', weightDelta: 0.3, reason: 'trim' }],
  0.55, CFG,
);
truthy('the turnover cap blocks discretionary buys', guard.blocked.length === 1 && guard.blocked[0].symbol === 'A', guard);
truthy('but never blocks a sell', guard.allowed.some((o) => o.side === 'sell'));

// ── §7 risk metrics ──────────────────────────────────────────────────────
check('max drawdown', maxDrawdown([100, 120, 60, 90]), 0.5);
close('downside deviation divides by all periods, not only losses', downsideDeviation([0.1, -0.1, 0.1, -0.1]), Math.sqrt((0.01 + 0.01) / 4));
const cap = captureRatios([0.05, -0.04], [0.1, -0.1]);
close('upside capture', cap.upside!, 0.5);
close('downside capture', cap.downside!, 0.4);

const m = riskMetrics([100, 110, 105, 120], { periodsPerYear: 4, benchmarkEquity: [100, 112, 104, 118] });
truthy('sortino is reported', m.sortino != null);
truthy('sharpe is reported for comparability', m.sharpe != null);
truthy('calmar is reported', m.calmar != null);

const better = { metrics: riskMetrics([100, 105, 110, 116], { periodsPerYear: 4 }) };
const riskier = { metrics: riskMetrics([100, 130, 70, 140], { periodsPerYear: 4 }) };
const winner = chooseParameters([riskier, better]);
truthy('a curve with no losing period is downside-free, not unrated', better.metrics.downsideFree && better.metrics.sortino === null, better.metrics);
truthy('selection prefers it over the higher-return, higher-drawdown set', winner === better, { chosen: winner === better ? 'better' : 'riskier', betterCagr: better.metrics.cagr, riskierCagr: riskier.metrics.cagr });
const mild = { metrics: riskMetrics([100, 104, 103, 112], { periodsPerYear: 4 }) };
truthy('and between two rated sets the higher Sortino wins', chooseParameters([riskier, mild]) === (riskier.metrics.sortino! > mild.metrics.sortino! ? riskier : mild));
truthy('a change that worsens drawdown is rejected by rule', !acceptsChange(better.metrics, riskier.metrics).accept);

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
if (failures) process.exit(1);
