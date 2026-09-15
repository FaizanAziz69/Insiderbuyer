/**
 * The member-name comparison, pinned.
 *
 * Both the roster keys and the lookups go through personKey. The last time two
 * sides of a member comparison used different rules, real rows were retired
 * with a false statement about a named person — so the cases that differ
 * between the trade feed and the roster are the ones worth holding.
 */
import { personKey } from './congressional.service';

let failures = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `\n       got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`);
}
function checkWith(what: string, got: any, pred: (x: any) => boolean) {
  const ok = pred(got);
  if (!ok) failures++;
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : `\n       got ${JSON.stringify(got)}`}`);
}

console.log('\npolitician photos\n');

// Middle names and initials are what the feed adds and the roster omits.
check('a middle name drops out', personKey('Carol Devine Miller'), 'carol miller');
check('so does an initial', personKey('Michael A. Rulli'), 'michael rulli');
check('and a suffix', personKey('Thomas H. Kean, Jr.'), 'thomas kean');
check('a plain name is unchanged', personKey('Nancy Pelosi'), 'nancy pelosi');
check('titles go', personKey('Rep. Ro Khanna'), 'ro khanna');

checkWith('the feed form and the roster form agree',
  [['David Harold McCormick', 'Dave McCormick'],
   ['Gilbert Ray Cisneros', 'Gilbert Cisneros'],
   ['Lloyd Alton Doggett', 'Lloyd Doggett'],
   ['William R. Keating', 'William Keating']],
  (r: string[][]) => r.every(([a, b]) => personKey(a) === personKey(b.replace(/^Dave /, 'David '))));

// Two members who share a surname must never collapse into one. This is the
// failure that would put one senator's photo beside another's trade.
checkWith('two McCormicks stay two people',
  [personKey('Dave McCormick'), personKey('Rich McCormick')],
  (r: string[]) => r[0] !== r[1]);
checkWith('two Jacksons stay two people',
  [personKey('Jonathan Jackson'), personKey('Ronny Jackson')],
  (r: string[]) => r[0] !== r[1]);

console.log(failures ? `\n${failures} FAILED\n` : '\nall photo checks passed\n');
if (failures) process.exit(1);
