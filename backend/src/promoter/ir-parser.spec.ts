/**
 * Workstream F parser checks.
 *
 * Two modes, matching how this repo already tests (plain compiled scripts, no
 * jest — see package.json "test"):
 *
 *   node dist/promoter/ir-parser.spec.js              unit assertions
 *   node dist/promoter/ir-parser.spec.js <corpusDir>  replay a harvested
 *                                                     corpus, print parse rate
 *
 * The corpus mode answers Brief v2 §5's discovery item, "sample-parse 20
 * recent TSXV IR-agreement disclosures to validate parse rate" — point it at a
 * directory holding `corpus.json` (`[{file,title,url}]`) and a `corpus/`
 * folder of `<file>.txt` release bodies.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseDisclosure, isIrDisclosure, REVIEW_THRESHOLD, narrow } from './ir-parser';

let failures = 0;
function check(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}\n       want ${JSON.stringify(want)}`);
  } else {
    console.log(`  ok   ${name}`);
  }
}

/** The canonical single-provider release. */
const DINERO = `Stewart, British Columbia--(Newsfile Corp. - September 1, 2026) - Dinero Ventures Ltd (TSXV: DNO) ("Dinero") reports that it has engaged German Mining Networks GmbH ("GMN") for investor relations services.
The Company has engaged GMN to provide introductions to European investors and other possible promotional activities. The contract start date is September 1, 2026 for a three-month term for total costs of $20,400 with the option to continue services on a three months basis at a cost of $6,800.00 per month. There are no performance factors contained in the agreement in respect of GMN's engagement, and GMN will not receive common shares or options of the Company as compensation.
GMN is a private company headquartered in Schmalkalden, Germany, and is an arms-length organization to the Company.
Dinero also announces that it has granted 1,300,000 incentive stock options to directors and consultants of the Company. The options are exercisable at $0.30 and will expire in five years.
Neither the TSX Venture Exchange nor its Regulation Services Provider accepts responsibility for the adequacy or accuracy of this release.`;

/** Grey Wolf (TSXV: WOLF) — the IR words come AFTER the agreement noun, and
 *  the wire is CNW rather than Newsfile. */
const GREY_WOLF = `TORONTO , Aug. 1, 2023 /CNW/ - Grey Wolf Animal Health Corp. (TSXV: WOLF ) ("Grey Wolf" or the "Company"), a Canadian diversified animal health company, announced today that it has entered into a consulting agreement with JBouma Consulting Ltd. ("JBouma") to provide investor relations services in accordance with the policies of the TSX Venture Exchange.
JBouma has been retained for a six-month term commencing on August 1, 2023 . In consideration for the services provided by JBouma, JBouma will receive compensation of $7,000 per month. JBouma will not receive shares, options, or other securities of the Company as compensation and does not currently have any interest, directly or indirectly, in Grey Wolf or its securities.`;

/** IC Group (TSXV: ICGH) — brand-new engagement whose body contains the words
 *  "unless terminated in accordance with its terms". */
const IC_GROUP = `Toronto, Ontario--(Newsfile Corp. - August 4, 2026) - IC Group Holdings Inc. (TSXV: ICGH) ("IC Group" or the "Company") is pleased to announce that it has entered into an investor relations agreement (the "Agreement") with Adelaide Capital Markets Inc. ("Adelaide"), a leading investor relations and capital markets advisory firm, to provide investor relations and consulting services to the Company.
The Agreement has an initial six-month term commencing on August 1, 2026, and will automatically continue on a month-to-month basis thereafter unless terminated in accordance with its terms. Under the Agreement, the Company will pay Adelaide a monthly fee of C$12,000, plus applicable taxes. No stock options will be granted to Adelaide.`;

/** Kalo Gold (TSXV: KALO) — three providers, three agreements, one release. */
const KALO = `VANCOUVER, BC / ACCESS Newswire / April 7, 2026 / Kalo Gold Corp . ( TSXV:KALO )(OTCID:KLGDF) ("Kalo" or the "Company") announces that it has entered into investor relations and marketing services agreements with Fairfax Partners Inc., GOLDINVEST Consulting GmbH, and NAI Interactive Ltd., as further described below.
Fairfax Partners Inc. ("Fairfax") Kalo has entered into a Services Agreement effective April 8, 2026 with Fairfax Partners Inc. The Fairfax Agreement has an initial term of 12 months from the effective date. Kalo will pay Fairfax a monthly fee of CAD$5,000.
GOLDINVEST Consulting GmbH ("GOLDINVEST") Kalo has entered into an agreement with GOLDINVEST Consulting GmbH effective April 8, 2026 for a term of six months. Kalo will pay GOLDINVEST a total of EUR 60,000.
NAI Interactive Ltd. ("NAI") Kalo has entered into an agreement with NAI Interactive Ltd. for a period of three months commencing April 8, 2026 at a monthly fee of CAD$3,500.`;

function unit() {
  console.log('\nir-parser unit checks');

  const d = parseDisclosure('Dinero Announces Investor Relations Agreement', DINERO);
  check('dinero ticker', d.ticker, 'DNO');
  check('dinero exchange', d.exchange, 'TSXV');
  check('dinero kind', d.kind, 'new');
  check('dinero agreements', d.agreements.length, 1);
  const dn = d.agreements[0];
  check('dinero provider', dn.providerName, 'German Mining Networks GmbH');
  check('dinero short', dn.providerShort, 'GMN');
  check('dinero term', dn.termMonths, 3);
  check('dinero total', dn.totalValue, 20400);
  check('dinero monthly', dn.monthlyFee, 6800);
  check('dinero start', dn.startDate, '2026-09-01');
  check('dinero arms length', dn.armsLength, true);
  // The 1,300,000 options went to DIRECTORS AND CONSULTANTS and the release
  // says outright that GMN gets none. Counting them against the promoter
  // would invent a dilution figure — the worst error this parser could make.
  check('dinero options to provider', dn.optionsGranted, 0);
  check('dinero denies securities', dn.noSecurityCompensation, true);

  const gw = parseDisclosure('GREY WOLF ANIMAL HEALTH ENGAGES FIRM TO PROVIDE INVESTOR RELATIONS SERVICES', GREY_WOLF);
  check('greywolf ticker (space before bracket)', gw.ticker, 'WOLF');
  // Canonical firm names drop the trailing period so "Ltd." and "Ltd"
  // collapse to one row in the ir_firms table (which is the B2B lead list).
  check('greywolf provider', gw.agreements[0].providerName, 'JBouma Consulting Ltd');
  check('greywolf term', gw.agreements[0].termMonths, 6);
  check('greywolf monthly', gw.agreements[0].monthlyFee, 7000);
  check('greywolf start', gw.agreements[0].startDate, '2023-08-01');

  const ic = parseDisclosure('IC Group Engages Adelaide Capital to Enhance Investor Engagement', IC_GROUP);
  // "unless terminated in accordance with its terms" must not make a new
  // engagement read as a termination.
  check('icgroup kind is new', ic.kind, 'new');
  check('icgroup provider', ic.agreements[0].providerName, 'Adelaide Capital Markets Inc');
  check('icgroup term', ic.agreements[0].termMonths, 6);
  check('icgroup monthly', ic.agreements[0].monthlyFee, 12000);
  check('icgroup currency', ic.agreements[0].currency, 'CAD');

  const k = parseDisclosure('Kalo Gold Enters into Investor Relations and Marketing Services Agreements', KALO);
  check('kalo ticker (padded bracket)', k.ticker, 'KALO');
  check('kalo agreement count', k.agreements.length, 3);
  check('kalo providers', k.agreements.map((a) => a.providerShort), ['Fairfax', 'GOLDINVEST', 'NAI']);
  check('kalo fairfax monthly', k.agreements[0].monthlyFee, 5000);
  check('kalo goldinvest total', k.agreements[1].totalValue, 60000);
  check('kalo fairfax derived total', k.agreements[0].provenance.totalValue, 'derived:monthly*term');
  check('kalo goldinvest currency', k.agreements[1].currency, 'EUR');
  check('kalo nai term', k.agreements[2].termMonths, 3);
  check('kalo nai monthly', k.agreements[2].monthlyFee, 3500);

  // Relevance gate.
  check(
    'contact-footer is not a disclosure',
    isIrDisclosure(
      'Acme Drills 40m of Gold',
      'VANCOUVER -- Acme Corp (TSXV: ACM) today reported drill results. '.repeat(20) +
        'For further information contact investor relations at ir@acme.com.',
    ),
    false,
  );
  check('real disclosure passes the gate', isIrDisclosure('Dinero Announces Investor Relations Agreement', DINERO), true);
  // §2.2: v1 is Canada only.
  check(
    'us issuer is out of scope',
    isIrDisclosure(
      'Delek US Names Rosy Zuklic Vice President of Investor Relations',
      'BRENTWOOD, Tenn. -- Delek US Holdings, Inc. (NYSE: DK) today announced it has appointed Rosy Zuklic as Vice President of Investor Relations under a new agreement.',
    ),
    false,
  );

  const term = parseDisclosure(
    'Telo Genomics Announces Termination of Investor Relations Agreement',
    'TORONTO--(Newsfile Corp. - July 2, 2026) - Telo Genomics Corp. (TSXV: TELO) announces the termination of its investor relations agreement with Acme IR Inc. ("Acme") effective July 1, 2026.',
  );
  check('termination kind', term.kind, 'termination');

  check('narrow drops wire chrome', narrow('Cookie Settings\nLogin\nSearch\n' + DINERO).startsWith('Stewart, British Columbia'), true);

  console.log(failures ? `\n${failures} FAILED\n` : '\nall unit checks passed\n');
}

// ── Corpus replay ────────────────────────────────────────────────────────

function corpus(dir: string) {
  const items = JSON.parse(fs.readFileSync(path.join(dir, 'corpus.json'), 'utf8')) as Array<{
    file?: string;
    title: string;
  }>;
  const rows: Array<{ title: string; d: ReturnType<typeof parseDisclosure> }> = [];
  let skipped = 0;
  const seen = new Set<string>();
  for (const it of items) {
    if (!it.file) continue;
    const f = path.join(dir, 'corpus', `${it.file}.txt`);
    if (!fs.existsSync(f)) continue;
    const body = fs.readFileSync(f, 'utf8');
    if (!isIrDisclosure(it.title, body)) {
      skipped++;
      continue;
    }
    const d = parseDisclosure(it.title, body);
    // The same release goes out on several wires; dedupe the measurement the
    // way the pipeline dedupes rows, or one popular story counts five times.
    const key = `${d.ticker}|${d.agreements[0]?.providerName}|${d.agreements[0]?.startDate}`;
    if (d.ticker && seen.has(key)) continue;
    if (d.ticker) seen.add(key);
    rows.push({ title: it.title, d });
  }

  const all = rows.flatMap((r) => r.d.agreements);
  const have = (f: string) => all.filter((a) => (a as any)[f] != null).length;
  const pct = (n: number, of = all.length) => `${((n / Math.max(1, of)) * 100).toFixed(0)}%`;
  console.log(
    `\ncorpus ${items.length} fetched · ${rows.length} disclosures · ${all.length} agreements · ${skipped} filtered out as not-in-scope\n`,
  );
  console.log('FIELD COVERAGE (per agreement)');
  for (const f of ['providerName', 'termMonths', 'monthlyFee', 'totalValue', 'startDate', 'optionsGranted', 'armsLength']) {
    console.log(`  ${f.padEnd(16)} ${String(have(f)).padStart(3)}  ${pct(have(f))}`);
  }
  const withTicker = rows.filter((r) => r.d.ticker).length;
  console.log(`  ${'ticker'.padEnd(16)} ${String(withTicker).padStart(3)}  ${pct(withTicker, rows.length)} (per disclosure)`);

  const auto = rows.filter((r) => r.d.confidence >= REVIEW_THRESHOLD).length;
  console.log(`\nauto-accepted (confidence >= ${REVIEW_THRESHOLD}): ${auto}/${rows.length} = ${pct(auto, rows.length)}`);
  console.log(`manual review queue: ${rows.length - auto}\n`);

  rows.sort((a, b) => b.d.confidence - a.d.confidence);
  for (const { title, d } of rows) {
    for (const [i, a] of d.agreements.entries()) {
      const money =
        a.monthlyFee != null ? `${a.monthlyFee}/mo` : a.totalValue != null ? `${a.totalValue} tot` : '—';
      console.log(
        `${(i === 0 ? d.confidence.toFixed(2) : '   ')} ${(d.exchange || '?').padEnd(4)} ${(d.ticker || '?').padEnd(6)} ` +
          `${(a.providerName || '—').slice(0, 28).padEnd(29)} ${d.kind.padEnd(11)} ` +
          `${String(a.termMonths ?? '—').padStart(3)}m ${(a.currency || '  ').padEnd(3)} ${money.padEnd(13)} ` +
          `opt=${String(a.optionsGranted ?? '—').padEnd(8)} ${i === 0 ? title.slice(0, 42) : ''}`,
      );
    }
  }
}

const arg = process.argv[2];
if (arg) corpus(arg);
else unit();
if (failures) process.exit(1);
