/**
 * Top Ranking Congress Trades — the pure logic, checked.
 *
 *   node dist/congress-trades/congress-trades.spec.js
 *
 * Scoring, the §5 vocabulary rules, name matching and the jurisdiction keys
 * are all pure functions, and they are the parts where a quiet mistake would
 * be worst: a scoring bug mis-ranks named politicians, and a hole in the
 * vocabulary check publishes a sentence counsel has not seen.
 */
import {
  BANNED_TERMS, CTS_DEFAULT_WEIGHTS, checkCopy, flagHeadline,
  normalizeCtsWeights, scoreCts,
} from './cts';
import { agencyKey, committeeKey, JURISDICTION_SEED } from './jurisdiction';
import { nameKey, normaliseRole } from './influence-map.service';
import { normName } from './entity-resolution.service';

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  } else console.log(`  ok   ${name}`);
}
function checkWith(name: string, got: unknown, pred: (v: any) => boolean) {
  if (pred(got)) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}`);
  }
}

console.log('\ncongress-trades checks\n');

// ── §3 scoring ───────────────────────────────────────────────────────────

const base = {
  role: 'member' as const,
  viaSubcommittee: false,
  daysTradeToAward: -10,
  positionValue: 50_000,
  memberMedianTrade: 25_000,
  awardValue: 100_000_000,
  companyRevenue: 1_000_000_000,
};

const chair = scoreCts({ ...base, role: 'chair' });
const member = scoreCts(base);
checkWith('a chair outscores a rank-and-file member', [chair.score, member.score], ([c, m]: any) => c > m);

const sub = scoreCts({ ...base, viaSubcommittee: true });
checkWith('the subcommittee seat outscores full-committee only', [sub.score, member.score], ([s, m]: any) => s > m);

// §3: "buys shortly before an award score highest; long-held positions lower"
const justBefore = scoreCts({ ...base, daysTradeToAward: -5 });
const longBefore = scoreCts({ ...base, daysTradeToAward: -300 });
const holdingOnly = scoreCts({ ...base, daysTradeToAward: null });
checkWith('a buy days before the award beats one a year before',
  [justBefore.score, longBefore.score], ([a, b]: any) => a > b);
checkWith('a bare holding scores below any trade in the window',
  [holdingOnly.score, longBefore.score], ([h, l]: any) => h < l);

// §3: "a $2B award to a small cap ≫ $5M to a mega cap"
const bigToSmall = scoreCts({ ...base, awardValue: 2e9, companyRevenue: 5e8 });
const smallToBig = scoreCts({ ...base, awardValue: 5e6, companyRevenue: 5e10 });
checkWith('materiality is relative, not absolute',
  [bigToSmall.components.awardMateriality, smallToBig.components.awardMateriality],
  ([a, b]: any) => a > b);

// A missing input must not be scored as zero.
const noRevenue = scoreCts({ ...base, companyRevenue: null });
checkWith('a missing input drops out instead of scoring zero', noRevenue.score, (v: any) => v != null && v > 0);
check('and the component reports itself as absent',
  scoreCts({ ...base, positionValue: null }).components.positionSize, null);

check('weights normalise', normalizeCtsWeights({ timing: 45 }).timing, 45);
check('nonsense weights fall back', normalizeCtsWeights({ timing: -5 as any }).timing, CTS_DEFAULT_WEIGHTS.timing);

// ── §5 editorial rules ───────────────────────────────────────────────────

check('a neutral sentence passes', checkCopy(
  'Rep. Example sits on the House Committee on Armed Services, which has jurisdiction over the Department of Defense.',
).ok, true);

for (const word of ['corruption', 'bribe', 'kickback', 'profiteering', 'insider trading']) {
  check(`§5 bans "${word}"`, checkCopy(`This is ${word} plain and simple.`).ok, false);
}
// "and any synonym" — the list has to reach past the five words named.
check('and reaches their synonyms', checkCopy('A shady scheme by a crony.').ok, false);

// §5: "No inference about motive, knowledge, or intent — ever."
check('intent language is rejected', checkCopy('The member knew the award was coming.').ok, false);
check('so is "positioned themselves"', checkCopy('They positioned themselves ahead of the announcement.').ok, false);
check('and "profited from"', checkCopy('The family profited from the contract.').ok, false);

const headline = flagHeadline({
  member: 'Rep. Example', committee: 'House Committee on Armed Services',
  agency: 'Department of Defense', awardValue: 2.4e9, company: 'Example Corp', ticker: 'EXC',
});
check('the generated headline is publishable', checkCopy(headline).ok, true);
checkWith('and carries the verifiable number', headline, (h: string) => h.includes('$2.40B'));
checkWith('and names the committee and the agency', headline,
  (h: string) => h.includes('Armed Services') && h.includes('Department of Defense'));
checkWith('and says "reports holding" rather than asserting a motive', headline,
  (h: string) => /reports holding/.test(h));

checkWith('the ban list is not trivially short', BANNED_TERMS.length, (n: number) => n >= 20);

// ── Matching keys ────────────────────────────────────────────────────────

check('committee keys ignore House/Senate and filler',
  committeeKey('House Committee on Armed Services'), committeeKey('Senate Committee on Armed Services'));
check('agency keys normalise Dept.', agencyKey('Dept. of Defense'), agencyKey('Department of Defense'));

check('names match across formats', nameKey('Pelosi, Nancy'), nameKey('Hon. Nancy Pelosi'));
check('and ignore middle names', nameKey('Nancy P. Pelosi'), 'nancy pelosi');

check('titles normalise to roles', [normaliseRole('Chairman'), normaliseRole('Ranking Member'), normaliseRole('Vice Chair'), normaliseRole(undefined)],
  ['chair', 'ranking', 'viceChair', 'member']);

// ── Vendor names ─────────────────────────────────────────────────────────

check('legal suffixes drop out of a vendor comparison',
  normName('WSP USA Solutions, Inc.'), normName('WSP USA Solutions Incorporated'));
check('and punctuation', normName('Booz Allen Hamilton Inc.'), normName('Booz Allen Hamilton'));

// ── The seed table ───────────────────────────────────────────────────────

checkWith('the jurisdiction seed covers both chambers', JURISDICTION_SEED,
  (r: any[]) => r.some((x) => /^House/.test(x.committee)) && r.some((x) => /^Senate/.test(x.committee)));
checkWith('and names appropriations subcommittees, not the full committee', JURISDICTION_SEED,
  (r: any[]) =>
    r.some((x) => x.kind === 'appropriations' && /^Subcommittee/.test(x.committee)) &&
    !r.some((x) => x.kind === 'appropriations' && /Committee on Appropriations$/.test(x.committee)));
checkWith('every seed rule cites a source', JURISDICTION_SEED,
  (r: any[]) => r.every((x) => typeof x.source === 'string' && x.source.length > 10));

console.log(failures ? `\n${failures} FAILED\n` : '\nall congress-trades checks passed\n');
if (failures) process.exit(1);
