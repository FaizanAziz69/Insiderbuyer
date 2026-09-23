/**
 * The Wealth Tracker — the pure logic, checked.
 *   node dist/wealth-tracker/wealth-tracker.spec.js
 */
import {
  alignSeries, assetClassOf, calendarIndex, disclosureLagDays, indexDaysBefore, midpoint, reconstruct, sideOf, thinCurve, trailingReturn, PtrTrade,
} from './reconstruction';
import { awardBadges, gradeCongress, gradeForPercentile, percentileRanks } from './badges';
import { assignIds, normaliseRow, normaliseTicker } from './ptr.service';
import { ageBracket, ageOn, toMemberRow } from './roster.service';

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  } else console.log(`  ok   ${name}`);
}
function close(name: string, got: number | null | undefined, want: number, tol = 1e-6) {
  if (got != null && Math.abs(got - want) <= tol) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${got}\n       want ${want}`);
  }
}

console.log('\nwealth-tracker checks\n');

// ── vocabulary ───────────────────────────────────────────────────────────
check('midpoint of a range', midpoint(15001, 50000), 32500.5);
check('midpoint single value', midpoint(1000, null), 1000);
check('midpoint nothing', midpoint(null, null), null);
check('Sale (Full)', sideOf('Sale (Full)'), { side: 'sell', full: true });
check('Sale (Partial)', sideOf('Sale (Partial)'), { side: 'sell', full: false });
check('Purchase', sideOf('Purchase'), { side: 'buy', full: false });
check('Exchange', sideOf('Exchange'), { side: 'exchange', full: false });
check('asset Stock', assetClassOf('Stock', 'AAPL'), 'stock');
check('asset Stock Option', assetClassOf('Stock Option', 'AAPL'), 'option');
check('asset Corporate Bond', assetClassOf('Corporate Bond', null), 'bond');
check('asset blank with ticker', assetClassOf('', 'MSFT'), 'stock');
check('asset blank no ticker', assetClassOf('', null), 'other');
check('asset ETF', assetClassOf('ETF', 'SPY'), 'stock');
check('ticker BRK/B kept', normaliseTicker('brk/b'), 'BRK/B');
check('ticker -- is null', normaliseTicker('--'), null);
check('lag days', disclosureLagDays('2026-08-10', '2026-09-07'), 28);
check('lag impossible', disclosureLagDays('2026-09-10', '2026-09-07'), null);

// ── calendar + alignment ─────────────────────────────────────────────────
const D = 86_400_000;
const day0 = Date.UTC(2024, 0, 1);
const calendar = Array.from({ length: 12 }, (_, i) => day0 + i * D);
check('calendarIndex exact', calendarIndex(calendar, day0 + 3 * D), 3);
check('calendarIndex weekend → prior', calendarIndex(calendar, day0 + 3 * D + 3600_000), 3);
check('calendarIndex before start', calendarIndex(calendar, day0 - D), -1);
check('indexDaysBefore', indexDaysBefore(calendar, 11, 7), 4);

const spike = alignSeries({ t: calendar.slice(0, 6), c: [10, 10, 40, 10, 10, 10] }, calendar)!;
check('spike repaired', Array.from(spike.c.slice(0, 6)), [10, 10, 10, 10, 10, 10]);
check('forward fill after last bar', spike.c[11], 10);
check('lastReal', spike.lastReal, 5);
const late = alignSeries({ t: calendar.slice(4), c: [5, 5, 5, 5, 5, 5, 5, 5] }, calendar)!;
check('NaN before listing', Number.isNaN(late.c[2]), true);

// ── reconstruction ───────────────────────────────────────────────────────
const bench = alignSeries({ t: calendar, c: calendar.map((_, i) => 100 + i) }, calendar)!;
const A = alignSeries({ t: calendar, c: [10, 10, 12, 12, 15, 15, 15, 20, 20, 20, 20, 20] }, calendar)!;
const B = alignSeries({ t: calendar, c: [50, 50, 50, 50, 50, 40, 40, 40, 40, 40, 40, 40] }, calendar)!;
const price = (t: string) => (t === 'A' ? A : t === 'B' ? B : null);
const iso = (i: number) => new Date(calendar[i]).toISOString().slice(0, 10);
const trade = (p: Partial<PtrTrade> & { id: string; date: string }): PtrTrade => ({
  ticker: 'A', assetClass: 'stock', side: 'buy', full: false, amountMin: 1000, amountMax: 1000, disclosed: null, ...p,
});

// Buy $1000 of A at 10 (100 sh) on day 0; buy $1200 of A at 12 (100 sh) day 2;
// sell $750 at 15 (50 sh, FIFO from lot 1) day 4; A ends at 20.
const out = reconstruct({
  trades: [
    trade({ id: 'b1', date: iso(0) }),
    trade({ id: 'b2', date: iso(2), amountMin: 1200, amountMax: 1200 }),
    trade({ id: 's1', date: iso(4), side: 'sell', amountMin: 750, amountMax: 750 }),
  ],
  calendar, price, benchmark: bench, todayIdx: 11,
});
close('shares left 150', out.positions[0].shares, 150);
close('FIFO cost basis: 50 @10 + 100 @12 = 1700', out.positions[0].costBasis, 1700);
close('realized 50 × (15 − 10)', out.realized, 250);
close('value 150 × 20', out.value, 3000);
close('unrealized 3000 − 1700', out.unrealized, 1300);
check('hits: both lots profitable', [out.hits, out.hitSample], [2, 2]);
check('counts', [out.buysPriced, out.sellsPriced, out.sellsUnmatched], [2, 1, 0]);
// TWR: day1 flat, day2 +20% (10→12) before the buy lands, day3 flat, day4 +25% (12→15), day7 +33% (15→20).
close('TWR index = 1.2 × 1.25 × 4/3 × 100', out.curve[out.curve.length - 1].idx, 200, 1e-6);
close('benchmark index at end', out.curve[out.curve.length - 1].b, 111, 1e-6);
close('trailing return from day 4', trailingReturn(out.curve, 4)!, 4 / 3 - 1, 1e-9);

// A deposit must not move the index: same trades plus a huge buy of B on day 5.
const withDeposit = reconstruct({
  trades: [
    trade({ id: 'b1', date: iso(0) }),
    trade({ id: 'b2', date: iso(2), amountMin: 1200, amountMax: 1200 }),
    trade({ id: 's1', date: iso(4), side: 'sell', amountMin: 750, amountMax: 750 }),
    trade({ id: 'b3', date: iso(5), ticker: 'B', amountMin: 1_000_000, amountMax: 1_000_000 }),
  ],
  calendar, price, benchmark: bench, todayIdx: 11,
});
// The $1M lands on day 5 at B=40 (flat after), so day 7's A move (15→20 on
// 150 shares = +750) is a +0.075% day for the whole book, not a +33% one, and
// the deposit itself adds nothing.
close('deposit-invariant TWR', withDeposit.curve[withDeposit.curve.length - 1].idx, 150 * (1 + 750 / (150 * 15 + 1_000_000)), 1e-6);
check('two positions', withDeposit.positions.map((p) => p.ticker).sort(), ['A', 'B']);
check('B lot is a loss (bought 40, still 40 → 0 pnl = not a hit)', [withDeposit.hits, withDeposit.hitSample], [2, 3]);

// Full sale closes everything regardless of the range; a sale with nothing held is unmatched.
const fullSale = reconstruct({
  trades: [
    trade({ id: 'b1', date: iso(0) }),
    trade({ id: 's1', date: iso(7), side: 'sell', full: true, amountMin: 1, amountMax: 1 }),
    trade({ id: 's2', date: iso(8), side: 'sell', amountMin: 500, amountMax: 500 }),
  ],
  calendar, price, benchmark: bench, todayIdx: 11,
});
check('full sale leaves no position', fullSale.positions.length, 0);
close('full sale realized 100 × (20 − 10)', fullSale.realized, 1000);
check('sale of nothing is unmatched', fullSale.sellsUnmatched, 1);
check('hit on a closed lot', [fullSale.hits, fullSale.hitSample], [1, 1]);

// Options and bonds never reach the book; an unknown ticker is unpriced.
const ignored = reconstruct({
  trades: [
    trade({ id: 'o1', date: iso(0), assetClass: 'option' }),
    trade({ id: 'x1', date: iso(0), ticker: 'ZZZ' }),
  ],
  calendar, price, benchmark: bench, todayIdx: 11,
});
check('option ignored, unknown ticker unpriced', [ignored.positions.length, ignored.buysUnpriced], [0, 1]);

// Stale price: a series that ends early is held at its last close and flagged.
const staleSeries = alignSeries({ t: calendar.slice(0, 3), c: [10, 10, 10] }, calendar)!;
const longCal = Array.from({ length: 80 }, (_, i) => day0 + i * D);
const staleLong = alignSeries({ t: longCal.slice(0, 3), c: [10, 10, 10] }, longCal)!;
const benchLong = alignSeries({ t: longCal, c: longCal.map(() => 100) }, longCal)!;
const stale = reconstruct({ trades: [trade({ id: 'b1', date: new Date(longCal[0]).toISOString().slice(0, 10) })], calendar: longCal, price: () => staleLong, benchmark: benchLong, todayIdx: 79 });
check('stale position flagged', stale.positions[0].status, 'stale');
close('stale value held at last close', stale.value, 1000);
void staleSeries;

check('thinCurve keeps last', thinCurve([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 4), [1, 4, 7, 10]);

// ── grades + badges ──────────────────────────────────────────────────────
check('percentile ranks', percentileRanks([10, 30, 20, null]), [0, 1, 0.5, null]);
check('ties share', percentileRanks([1, 1, 2]), [0.25, 0.25, 1]);
check('grade top', gradeForPercentile(0.99), 'A+');
check('grade A', gradeForPercentile(0.9), 'A');
check('grade bottom', gradeForPercentile(0.1), 'C');
const field = Array.from({ length: 40 }, (_, i) => ({
  key: `m${i}`, qualifies: i < 30, retAll: i * 2, hitRate: 40 + i, hitSample: 25, trades12m: i, tradesTotal: 30, avgLagDays: 50 - i, grade: null as any,
}));
const g = gradeCongress(field);
check('only qualifying members graded', g.size, 30);
check('best composite is A+', g.get('m29')!.grade, 'A+');
check('worst composite is C', g.get('m0')!.grade, 'C');
for (const r of field) r.grade = g.get(r.key)?.grade || null;
const badges = awardBadges(field.map((r) => ({ ...r, ret90d: r.retAll })));
check('top performer is m29', badges.get('m29')!.includes('TOP_PERFORMER'), true);
check('sharpshooter needs 70%+', badges.get('m30')!.includes('SHARPSHOOTER'), true);
check('m20 (60%) is not a sharpshooter', (badges.get('m20') || []).includes('SHARPSHOOTER'), false);
check('fast filer under 15 days', badges.get('m39')!.includes('FAST_FILER'), true);
check('gold grade rides on A/A+', badges.get('m29')!.includes('GOLD_GRADE'), true);
check('m0 has no badges', badges.get('m0') || [], []);

// §4.3 roster governance: nothing is earned before the add-date.
const fresh = field.map((r) => ({ ...r, trackedLongEnough: false }));
check('a member inside their tracking window gets no grade', gradeCongress(fresh).size, 0);
check('and no badges', awardBadges(fresh.map((r) => ({ ...r, ret90d: r.retAll }))).size, 0);
const mixed = field.map((r, i) => ({ ...r, trackedLongEnough: i !== 29 }));
const mixedGrades = gradeCongress(mixed);
check('a newly added member does not take a graded slot', mixedGrades.has('m29'), false);
check('while the rest are still graded', mixedGrades.size, 29);
const mixedBadges = awardBadges(mixed.map((r) => ({ ...r, ret90d: r.retAll })));
check('nor a top-ten badge slot', (mixedBadges.get('m29') || []).length, 0);
check('and the slot goes to the next eligible member', (mixedBadges.get('m28') || []).includes('TOP_PERFORMER'), true);

// ── ingestion shape ──────────────────────────────────────────────────────
const raw = { symbol: 'INTC', senateID: 'P000197', disclosureDate: '2026-08-24', transactionDate: '2026-07-24', firstName: 'Nancy', lastName: 'Pelosi', owner: 'Spouse', assetDescription: 'Intel Corporation - Common Stock', assetType: 'Stock', type: 'Purchase', amount: '$500,001 - $1,000,000', link: 'https://x' };
const row = normaliseRow(raw, 'P000197')!;
check('normalised row', [row.ticker, row.side, row.amountMin, row.amountMax, row.owner, row.assetClass, row.disclosed], ['INTC', 'buy', 500001, 1000000, 'spouse', 'stock', '2026-08-24']);
const dup = assignIds([normaliseRow(raw, 'P000197')!, normaliseRow(raw, 'P000197')!, normaliseRow({ ...raw, amount: '$1,001 - $15,000' }, 'P000197')!]);
check('identical rows get distinct ids', new Set(dup.map((d) => d.id)).size, 3);
check('ids are stable', assignIds([normaliseRow(raw, 'P000197')!])[0].id, dup[0].id);
check('bad date dropped', normaliseRow({ ...raw, transactionDate: '' }, 'P000197'), null);

const member = toMemberRow({ id: { bioguide: 'C000127' }, name: { first: 'Maria', last: 'Cantwell', official_full: 'Maria Cantwell' }, bio: { birthday: '1958-10-13' }, terms: [{ type: 'sen', start: '2025-01-03', end: '2031-01-03', state: 'WA', party: 'Democrat' }] }, true)!;
check('member row', [member.chamber, member.party, member.state, member.birthday], ['Senate', 'D', 'WA', '1958-10-13']);
check('age on a date', ageOn('1958-10-13', new Date(Date.UTC(2026, 8, 23))), 67);
check('age bracket', ageBracket(67), '65-74');

console.log(failures ? `\n${failures} FAILED\n` : '\nall passed\n');
if (failures) process.exit(1);
