/**
 * Brief v8 — the library's own checks.
 *   node dist/strategies/strategies.spec.js
 *
 * §6's acceptance list is what this tests: every strategy is a config the
 * engine can read, record-type badges exist for every record type, and the
 * no-lookahead rule holds where it can be checked without a database.
 */
import { ALL_STRATEGIES, strategyBySlug } from './registry';
import { RECORD_BADGE } from './strategy-types';
import { CARD_PREMIUM_FIELDS, STRATEGY_PREMIUM_FIELDS, shapeIndex } from './gating';

let failures = 0;
function check(name: string, got: unknown, want: unknown): void {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`}`);
}

console.log('library shape');
// Twelve from Brief v8 §3, plus Top CQS from Brief v9 §7.
check('the library holds thirteen strategies', ALL_STRATEGIES.length, 13);
check('slugs are unique', new Set(ALL_STRATEGIES.map((s) => s.slug)).size, 13);
check('names are unique', new Set(ALL_STRATEGIES.map((s) => s.name)).size, 13);
check('every slug resolves', ALL_STRATEGIES.every((s) => strategyBySlug(s.slug) === s), true);
check('an unknown slug resolves to null', strategyBySlug('no-such-strategy'), null);

console.log('every strategy is publishable');
check(
  'each carries plain-English rules',
  ALL_STRATEGIES.every((s) => s.rulesPlain.length > 40),
  true,
);
check(
  'each carries a version-stamped parameter set (§6)',
  ALL_STRATEGIES.every((s) => /^\d+\.\d+\.\d+$/.test(s.version) && Object.keys(s.params).length > 0),
  true,
);
check(
  'each carries dataset limitations (§5.2)',
  ALL_STRATEGIES.every((s) => s.limitations.length > 0),
  true,
);
check(
  'each declares a rebalance cadence',
  ALL_STRATEGIES.every((s) => s.rebalanceDays > 0),
  true,
);

console.log('disclosure lag (§6)');
// Every dataset here now reads a real filed date: PTRs carry reportedDate,
// awards carry action_date, 13F carries its filing date, and Form 4 carries the
// SEC's file_date since the filedAt backfill. The two-day statutory deadline
// survives only as a FALLBACK for rows the backfill has not reached, which is
// why these strategies still declare it — and still have to say so.
const form4 = ALL_STRATEGIES.filter((s) => /insider|ceo|clusters|contrarian|metals/.test(s.slug));
check('Form 4 strategies keep the two-day fallback', form4.every((s) => s.disclosureLagDays === 2), true);
check(
  'Form 4 strategies disclose when the fallback applies',
  form4.every((s) => s.limitations.some((l) => /actually filed|two-day/i.test(l))),
  true,
);
const realDate = ALL_STRATEGIES.filter((s) => ['Congress', 'Contracts', 'Lobbying', 'Funds'].includes(s.dataset));
check('document-dated strategies declare no modelled lag', realDate.every((s) => s.disclosureLagDays === 0), true);

console.log('record types (§4.1)');
check('all three badges exist', Object.keys(RECORD_BADGE).sort(), ['backtest', 'live', 'paper']);
check('backtest badge says hypothetical', /HYPOTHETICAL/.test(RECORD_BADGE.backtest), true);
check('paper badge says simulated', /SIMULATED/.test(RECORD_BADGE.paper), true);
check('live badge says proprietary', /PROPRIETARY/.test(RECORD_BADGE.live), true);

console.log('§2 — nothing borrowed');
// The brief forbids reusing Quiver's names. Ours must not be theirs.
const BORROWED = [/quiver/i, /congressional trading$/i];
check(
  'no strategy carries another firm’s name',
  ALL_STRATEGIES.every((s) => !BORROWED.some((re) => re.test(s.name))),
  true,
);


console.log('paygate (Faizan 2026-09-29: the figures are Premium, the rules are free)');
{
  const card = {
    slug: 'x', name: 'X', dataset: 'Insiders', version: '1.0.0', rebalanceDays: 30,
    rulesPlain: 'r', recordType: 'backtest', startDate: '2021-01-04', thin: false,
    spark: [{ v: 1, b: 1 }], return1y: 0.1, cagr: 0.2, sortino: 1.5, sharpe: 1.1,
    maxDrawdown: -0.3, totalReturn: 0.9, benchmarkTotalReturn: 0.5, turnover: 0.2, hitRate: 0.55,
  };
  const guest = shapeIndex({ cards: [card] }, false);
  const member = shapeIndex({ cards: [card] }, true);
  check('a guest payload says premium:false', guest.premium, false);
  check(
    'no figure survives for a guest',
    CARD_PREMIUM_FIELDS.filter((k) => k in guest.cards[0]),
    [],
  );
  check(
    'the free fields survive for a guest',
    ['slug', 'name', 'rulesPlain', 'recordType', 'startDate', 'thin'].every((k) => k in guest.cards[0]),
    true,
  );
  check('a subscriber payload is untouched', member.cards[0], card);
  check(
    'the detail strips the curve and metrics as well as holdings',
    ['equity', 'metrics', 'holdings', 'rebalanceLog'].every((k) => (STRATEGY_PREMIUM_FIELDS as readonly string[]).includes(k)),
    true,
  );
}

console.log(failures ? `\nFAIL — ${failures} check(s) failed.` : '\nAll Brief v8 checks passed.');
if (failures) process.exit(1);
