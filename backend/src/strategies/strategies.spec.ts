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
// Congress, lobbying and 13F read a real filed date out of the record, so they
// declare no modelled lag. Form 4 has no filing date stored anywhere, so the
// brief's own two-day model applies — and must be declared, not assumed.
const form4 = ALL_STRATEGIES.filter((s) => /insider|ceo|clusters|contrarian|metals/.test(s.slug));
check('Form 4 strategies model the two-day lag', form4.every((s) => s.disclosureLagDays === 2), true);
check(
  'Form 4 strategies say the lag is modelled',
  form4.every((s) => s.limitations.some((l) => /two-day|modelled/i.test(l))),
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

console.log(failures ? `\nFAIL — ${failures} check(s) failed.` : '\nAll Brief v8 checks passed.');
if (failures) process.exit(1);
