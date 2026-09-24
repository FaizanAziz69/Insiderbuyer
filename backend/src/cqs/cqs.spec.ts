/**
 * The Congress Quality Score — the pure logic, checked.
 *   node dist/cqs/cqs.spec.js
 */
import {
  assembleCqsScore,
  bandFloorToPoints,
  computeCqsMultipliers,
  cqsToGrade,
  gradeToPoints,
  isExcludedSecurity,
  roleToMultiplier,
  scoreC1ClusterBreadth,
  scoreC2PositionSize,
  scoreC3CommitteeInfluence,
  scoreC4ContractAlignment,
  scoreC5BuyerTrackRecord,
  scoreC6RelativeConviction,
  scoreC7Freshness,
  scoreC8NetDirection,
} from './cqs-math';

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  } else console.log(`  ok   ${name}`);
}
function close(name: string, got: number, want: number, tol = 1e-6) {
  const ok = Math.abs(got - want) <= tol;
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${got}\n       want ${want} (±${tol})`);
  } else console.log(`  ok   ${name}`);
}

console.log('C1 cluster breadth');
check('one member is no cluster', scoreC1ClusterBreadth(1), 0);
check('two members', scoreC1ClusterBreadth(2), 55);
check('three members', scoreC1ClusterBreadth(3), 80);
check('four or more', scoreC1ClusterBreadth(7), 100);
check('bipartisan bonus', scoreC1ClusterBreadth(2, true), 65);
check('bonus cannot pass 100', scoreC1ClusterBreadth(5, true), 100);
check('a lone member gets no bipartisan bonus', scoreC1ClusterBreadth(1, true), 0);

console.log('C2 position size');
check('band floors', [15_001, 50_001, 100_001, 250_001, 500_001, 1_000_001].map(bandFloorToPoints), [10, 25, 50, 70, 85, 100]);
check('below the reporting floor', bandFloorToPoints(1_000), 5);
check('one member at $100k', scoreC2PositionSize([[100_001]]), 50);
// The artifact this replaced: summing per TRANSACTION let one member's six
// minimum-band buys score 60. Aggregating their $90,006 first scores it 25 —
// a size question, not a count one (counting is C1's job).
check('repeated small buys are aggregated, not added up as points', scoreC2PositionSize([[15_001, 15_001, 15_001, 15_001, 15_001, 15_001]]), 25);
check('three minimum buys stay in the lowest band', scoreC2PositionSize([[15_001, 15_001, 15_001]]), 10);
check('three members at $250k', scoreC2PositionSize([[250_001], [250_001], [250_001]]), 100);
check('no buyers', scoreC2PositionSize([]), 0);

console.log('C3 committee influence');
check('roles', ['chair', 'ranking', 'subcommittee chair', 'member'].map(roleToMultiplier), [1, 0.85, 0.8, 0.5]);
check('no seat is no influence', scoreC3CommitteeInfluence([]), 0);
check('best seat wins', scoreC3CommitteeInfluence([{ role: 'member' }, { role: 'chair' }]), 100);
check('relevance scales the seat', scoreC3CommitteeInfluence([{ role: 'chair', relevance: 0.6 }]), 60);

console.log('C4 contract alignment');
// The neutral floor this replaced handed 4.5 points of the total to every
// stock in the index, including ones with no federal business at all.
check('no intersection scores zero, not a floor', scoreC4ContractAlignment(null), 0);
check('cts with unknown materiality', scoreC4ContractAlignment(80), 80);
check('immaterial award is discounted', scoreC4ContractAlignment(80, 0), 56);
check('material award counts in full', scoreC4ContractAlignment(80, 0.08), 80);

console.log('C5 buyer track record');
check('ungraded is neutral', scoreC5BuyerTrackRecord([]), 40);
check('grade scale ends', [gradeToPoints('A+'), gradeToPoints('C')], [100, 20]);
check('unknown grade is neutral', gradeToPoints('Z'), 40);
// Volume weighting is the point: a big A+ buyer outweighs a small C one.
close('volume weighted', scoreC5BuyerTrackRecord([{ grade: 'A+', weight: 900_000 }, { grade: 'C', weight: 100_000 }]), 92);
close('equal weights when no dollars', scoreC5BuyerTrackRecord([{ grade: 'A+' }, { grade: 'C' }]), 60);

console.log('C6 relative conviction');
check('no history is neutral, not a ratio', scoreC6RelativeConviction(100_001, null), 50);
check('routine for this member', scoreC6RelativeConviction(100_001, 100_001), 50);
check('four times their habit, capped', scoreC6RelativeConviction(500_001, 50_001), 90);
check('first ever purchase bonus', scoreC6RelativeConviction(100_001, 100_001, true), 70);

console.log('C7 freshness');
check('fresh', scoreC7Freshness(0), 100);
check('still fresh at the edge', scoreC7Freshness(14), 100);
check('half at sixty days', scoreC7Freshness(60), 50);
check('gone at 120', scoreC7Freshness(120), 0);
check('past 120', scoreC7Freshness(400), 0);
close('midpoint of the first leg', scoreC7Freshness(37), 75, 0.6);

console.log('C8 net direction');
check('no sells', scoreC8NetDirection(1_000_000, 0), 100);
check('nothing at all', scoreC8NetDirection(0, 0), 100);
// A bought dollar carries ~3x the information of a sold one, so an equal
// dollar of selling does not halve the component.
check('equal dollars, asymmetric', scoreC8NetDirection(1_000, 1_000), 75);
check('sells dominate', scoreC8NetDirection(1_000, 30_000), 9.090909090909092);

console.log('multipliers');
const all = computeCqsMultipliers({
  iqsScore: 75,
  hasLegislativeCatalyst: true,
  priceVs52wHighPct: -25,
  clusterVsAdvPct: 0.00001,
  marketCap: 3_000_000_000_000,
  maxFilingLagDays: 40,
});
close('every adjustment applied', all.combined, 1.2 * 1.1 * 1.1 * 0.8 * 0.85, 1e-9);
check('nothing reported unavailable', all.unavailable, []);
const none = computeCqsMultipliers({ marketCap: 5_000_000_000 });
check('unevaluated inputs are named, not passed as 1.0', none.unavailable, ['insiderOverlap', 'legislativeCatalyst', 'contrarianEntry', 'filingLag']);
check('and the multiplier itself is neutral', none.combined, 1);
// Liquidity normalisation only ever applied to mega-caps, so for anyone else
// a missing ADV is not a gap in the evidence.
check('small caps do not report a missing ADV', computeCqsMultipliers({ iqsScore: 10, hasLegislativeCatalyst: false, priceVs52wHighPct: -1, maxFilingLagDays: 2, marketCap: 1e9 }).unavailable, []);

console.log('grades');
check('bands', [95, 85, 75, 65, 30].map((s) => cqsToGrade(s).grade), ['A+', 'A', 'B+', 'B', 'C']);
check('gold ring starts at A', [cqsToGrade(80).isGoldRing, cqsToGrade(79).isGoldRing], [true, false]);

console.log('composite');
const full = assembleCqsScore(
  { c1ClusterBreadth: 100, c2PositionSize: 100, c3CommitteeInfluence: 100, c4ContractAlignment: 100, c5BuyerTrackRecord: 100, c6RelativeConviction: 100, c7Freshness: 100, c8NetDirection: 100 },
  {},
);
check('weights sum to one', full.baseScore, 100);
check('a perfect card is A+', full.grade, 'A+');
const capped = assembleCqsScore(
  { c1ClusterBreadth: 100, c2PositionSize: 100, c3CommitteeInfluence: 100, c4ContractAlignment: 100, c5BuyerTrackRecord: 100, c6RelativeConviction: 100, c7Freshness: 100, c8NetDirection: 100 },
  { iqsScore: 90, hasLegislativeCatalyst: true, priceVs52wHighPct: -30, maxFilingLagDays: 1 },
);
check('multipliers cannot push past 100', capped.cqs, 100);

console.log('universe exclusions');
check('index funds are out', [isExcludedSecurity('SPY', 'SPDR S&P 500 ETF Trust'), isExcludedSecurity('AGG', 'iShares Core US Aggregate Bond ETF')], [true, true]);
check('treasuries and munis are out', [isExcludedSecurity('TBILL', 'US Treasury Bill'), isExcludedSecurity('XYZ', 'California Municipal Bond')], [true, true]);
check('real companies stay in', [isExcludedSecurity('MSFT', 'MICROSOFT CORP'), isExcludedSecurity('GS', 'GOLDMAN SACHS GROUP INC')], [false, false]);
// "Trust" alone is in plenty of real REIT and bank names, so it must not match.
check('a REIT is not a fund', isExcludedSecurity('PLD', 'Prologis Trust'), false);
check('empty or malformed tickers are out', [isExcludedSecurity('', 'x'), isExcludedSecurity('US TREASURY N/A', 'x')], [true, true]);

if (failures) {
  console.error(`\n${failures} CQS check(s) failed.`);
  process.exit(1);
}
console.log('\nAll CQS checks passed.');
