/**
 * Unit tests for the shared transaction-plausibility guard, using the two
 * REAL filer errors confirmed against raw EDGAR XML as fixtures.
 *
 * No test runner is installed in this repo, so this is a plain node:assert
 * suite: it compiles with the app (`nest build`) and runs standalone:
 *
 *   npm run build && node dist/iqs/tx-sanity.spec.js
 */
import * as assert from 'assert';
import {
  isPlausibleTx,
  plausibleTxSql,
  MAX_PLAUSIBLE_TX_VALUE,
  MAX_PRICE_VS_LIVE,
} from './tx-sanity';

// ── Fixture 1: NMM 0001193125-26-318541 (2026-07-23) ─────────────────────
// Filed transactionPricePerShare = 748119 (should be ~74.81); live ~$78.99.
// 1,131 shares × $748,119 = $846,122,589 — the false "$846M buy".
assert.strictEqual(
  isPlausibleTx(1131, 748119, 78.99),
  false,
  'NMM filer error must be rejected (25x-live-price leg)',
);
// The corrected economics pass.
assert.strictEqual(isPlausibleTx(1131, 74.81, 78.99), true);

// ── Fixture 2: APCX 0001683168-26-005941 ─────────────────────────────────
// Filed $2,900/share (and $2,895) on a ~$0.40 stock.
assert.strictEqual(
  isPlausibleTx(1000, 2900, 0.3975),
  false,
  'APCX filer error must be rejected',
);
assert.strictEqual(isPlausibleTx(1000, 0.42, 0.3975), true);

// ── Absolute-value bound ──────────────────────────────────────────────────
assert.strictEqual(
  isPlausibleTx(2_000_000_000, 1, 1),
  false,
  `Σ value above ${MAX_PLAUSIBLE_TX_VALUE} must be rejected`,
);
assert.strictEqual(isPlausibleTx(1_000, 100, 100), true);

// ── Degenerate inputs ─────────────────────────────────────────────────────
assert.strictEqual(isPlausibleTx(0, 100, 100), false, 'zero shares');
assert.strictEqual(isPlausibleTx(100, 0, 100), false, 'zero price');
assert.strictEqual(isPlausibleTx(-5, 100, 100), false, 'negative shares');
assert.strictEqual(isPlausibleTx(NaN, 100, 100), false, 'NaN shares');

// ── No live price: only the absolute bound applies ────────────────────────
assert.strictEqual(isPlausibleTx(1131, 748119, null), true, 'no live price → $846M < $1B passes value bound');
assert.strictEqual(isPlausibleTx(10_000, 748119, null), false, '$7.5B fails the value bound regardless');

// ── Boundary: exactly 25× live price passes, above fails ─────────────────
assert.strictEqual(isPlausibleTx(10, 100 * MAX_PRICE_VS_LIVE, 100), true);
assert.strictEqual(isPlausibleTx(10, 100 * MAX_PRICE_VS_LIVE + 0.01, 100), false);

// ── SQL predicate mirrors the same constants ─────────────────────────────
const sqlNoCompany = plausibleTxSql('t');
assert.ok(sqlNoCompany.includes(String(MAX_PLAUSIBLE_TX_VALUE)));
assert.ok(!sqlNoCompany.includes('lastPrice'), 'no price leg without a company alias');
const sqlWithCompany = plausibleTxSql('t', 'c');
assert.ok(sqlWithCompany.includes(`* ${MAX_PRICE_VS_LIVE}`));
assert.ok(sqlWithCompany.includes('c."lastPrice"'));

// eslint-disable-next-line no-console
console.log('tx-sanity.spec: all assertions passed');
