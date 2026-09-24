/**
 * Unit tests for the Congress Quality Score (CQS) Brief v9 math engine.
 * Plain node:assert suite running via: node dist/cqs/cqs.spec.js
 */
import * as assert from 'assert';
import {
  scoreC1ClusterBreadth,
  scoreC2PositionSize,
  scoreC3CommitteeInfluence,
  scoreC4ContractAlignment,
  scoreC5BuyerTrackRecord,
  scoreC6RelativeConviction,
  scoreC7Freshness,
  scoreC8NetDirection,
  cqsToGrade,
  assembleCqsScore,
  bandFloorToPoints,
} from './cqs-math';

// ── C1: Cluster Breadth ──────────────────────────────────────────────────
assert.strictEqual(scoreC1ClusterBreadth(1), 0, '1 member = 0');
assert.strictEqual(scoreC1ClusterBreadth(2), 55, '2 members = 55');
assert.strictEqual(scoreC1ClusterBreadth(3), 80, '3 members = 80');
assert.strictEqual(scoreC1ClusterBreadth(4), 100, '4+ members = 100');
assert.strictEqual(scoreC1ClusterBreadth(2, true), 65, '2 members bipartisan = 55 + 10 = 65');
assert.strictEqual(scoreC1ClusterBreadth(4, true), 100, '4 members bipartisan capped at 100');

// ── C2: Position Size ────────────────────────────────────────────────────
assert.strictEqual(bandFloorToPoints(15_001), 10);
assert.strictEqual(bandFloorToPoints(50_001), 25);
assert.strictEqual(bandFloorToPoints(100_001), 50);
assert.strictEqual(bandFloorToPoints(250_001), 70);
assert.strictEqual(bandFloorToPoints(500_001), 85);
assert.strictEqual(bandFloorToPoints(1_000_001), 100);

assert.strictEqual(scoreC2PositionSize([15_001, 50_001]), 35);
assert.strictEqual(scoreC2PositionSize([100_001, 250_001]), 100);

// ── C3: Committee Influence ──────────────────────────────────────────────
assert.strictEqual(scoreC3CommitteeInfluence(['Member', 'Chair']), 100);
assert.strictEqual(scoreC3CommitteeInfluence(['Subcommittee Chair']), 80);
assert.strictEqual(scoreC3CommitteeInfluence(['Ranking Member']), 85);
assert.strictEqual(scoreC3CommitteeInfluence([], false), 0);

// ── C4: Contract Alignment ──────────────────────────────────────────────
assert.strictEqual(scoreC4ContractAlignment(null), 30);
assert.strictEqual(scoreC4ContractAlignment(60, 0.1), 75);

// ── C5: Buyer Track Record ──────────────────────────────────────────────
assert.strictEqual(scoreC5BuyerTrackRecord(['A+', 'B']), 80);
assert.strictEqual(scoreC5BuyerTrackRecord([]), 40);

// ── C7: Freshness Decay ──────────────────────────────────────────────────
assert.strictEqual(scoreC7Freshness(7), 100);
assert.strictEqual(scoreC7Freshness(14), 100);
assert.strictEqual(scoreC7Freshness(60), 50);
assert.strictEqual(scoreC7Freshness(120), 0);
assert.strictEqual(scoreC7Freshness(150), 0);

// ── C8: Net Direction ────────────────────────────────────────────────────
assert.strictEqual(scoreC8NetDirection(100000, 0), 100);
assert.strictEqual(scoreC8NetDirection(100000, 100000), 50);
assert.strictEqual(scoreC8NetDirection(0, 50000), 0);

// ── Grade Mapping & Gold Ring Tier ───────────────────────────────────────
assert.deepStrictEqual(cqsToGrade(92), { grade: 'A+', isGoldRing: true });
assert.deepStrictEqual(cqsToGrade(84), { grade: 'A', isGoldRing: true });
assert.deepStrictEqual(cqsToGrade(75), { grade: 'B+', isGoldRing: false });
assert.deepStrictEqual(cqsToGrade(62), { grade: 'B', isGoldRing: false });
assert.deepStrictEqual(cqsToGrade(45), { grade: 'C', isGoldRing: false });

// ── Full Assembly ────────────────────────────────────────────────────────
const sampleComponents = {
  c1ClusterBreadth: 80,
  c2PositionSize: 70,
  c3CommitteeInfluence: 100,
  c4ContractAlignment: 60,
  c5BuyerTrackRecord: 85,
  c6RelativeConviction: 70,
  c7Freshness: 100,
  c8NetDirection: 100,
};
const res = assembleCqsScore(sampleComponents, { iqsScore: 75 });
assert.ok(res.cqs >= 80, 'High conviction sample scores A grade');
assert.strictEqual(res.isGoldRing, true, 'Gold ring tier awarded');

console.log('✓ All CQS math engine unit tests passed cleanly!');
