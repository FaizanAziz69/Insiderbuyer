/**
 * Seeded article copy, checked against Brief v5 §5.
 *
 *   node dist/data-articles/data-articles.spec.js
 *
 * Formats #19 and #20 publish prose about named sitting politicians, and §5
 * puts the vocabulary rules at the template level "not left to judgment".
 * A seed file is exactly a template, so the check belongs here rather than in
 * a reviewer's memory: if someone later edits a sentence into one that asserts
 * motive, this fails before it ships.
 */
import { LAUNCH_ARTICLES, ArticleSeed } from './seed';
import { checkCopy, STANDING_FRAME } from '../congress-trades/cts';

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

/** Every string a reader can see in one article. */
function proseOf(a: ArticleSeed): string[] {
  const s = a.sections;
  return [
    a.headline,
    a.dek,
    ...s.takeaways,
    ...s.body.flatMap((b) => [b.heading, b.html]),
    s.pullQuote.text,
    s.pullQuote.attribution,
    ...s.whatItMeans.map((w) => w.text),
    s.cta.headline,
    s.cta.body,
  ];
}

console.log('\ndata-articles seeded copy\n');

const congress = LAUNCH_ARTICLES.filter((a) => a.chart === 'congress-proximity' || a.chart === 'congress-flags');
check('both Brief v5 §4 formats are seeded', congress.length, 2);
check('#19 is the weekly rolling screen', congress[0]?.chart, 'congress-proximity');
check('#20 is the per-event format', congress[1]?.chart, 'congress-flags');

for (const a of congress) {
  const violations = proseOf(a)
    .flatMap((line) => checkCopy(line).violations.map((v) => `${v.kind}:${v.term}`));
  check(`${a.slug} passes the §5 vocabulary check`, violations, []);

  // §5: "Standing frame on every surface … Correlation-not-causation stated
  // plainly, not buried." A data article is a surface.
  checkWith(
    `${a.slug} carries the standing frame verbatim`,
    a.sections.body.some((b) => b.html.includes(STANDING_FRAME)),
    Boolean,
  );

  // §5: "every amount is labeled an estimate from the disclosed range".
  checkWith(
    `${a.slug} says disclosed amounts are estimates`,
    proseOf(a).some((l) => /midpoint|estimate/i.test(l)),
    Boolean,
  );

  // §5: "Every date shown distinguishes transaction date vs. disclosure date."
  checkWith(
    `${a.slug} distinguishes the transaction and disclosure dates`,
    proseOf(a).some((l) => /disclosure date|45 days/i.test(l)),
    Boolean,
  );
}

// The rest of the seed predates Brief v5 and is about Form 4 filings, not
// politicians, but the vocabulary rules cost nothing to hold everywhere.
for (const a of LAUNCH_ARTICLES) {
  const banned = proseOf(a).flatMap((l) => checkCopy(l).violations.filter((v) => v.kind === 'banned').map((v) => v.term));
  check(`${a.slug} uses no banned term`, banned, []);
}

console.log(failures ? `\n${failures} FAILED\n` : '\nall seeded copy passes\n');
if (failures) process.exit(1);
