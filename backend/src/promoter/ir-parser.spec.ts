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
import {
  parseDisclosure,
  isIrDisclosure,
  hasIrParagraph,
  issuerFromHeadline,
  releaseDate,
  REVIEW_THRESHOLD,
  narrow,
} from './ir-parser';

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

/** Elevate Service Group (TSXV: SERV) — the IR agreement is the fifth section
 *  of a corporate-updates release, below an auditor appointment and an
 *  employee option grant. Body condensed; every sentence the parser reads is
 *  verbatim from the September 4, 2026 Newsfile release. */
const ELEVATE = `Toronto, Ontario--(Newsfile Corp. - September 4, 2026) - Elevate Service Group Inc. (TSXV: SERV) (OTCQB: ESVCF) (FSE: Y19) ("Elevate" or the "Company") is pleased to provide a series of corporate updates, including the commencement of trading on the OTCQB Venture Market and DTC eligibility for its common shares in the United States.
OTCQB Listing
The Company announces that its common shares have commenced trading on the OTCQB Venture Market under the symbol ESVCF. The Company's common shares are also eligible for electronic clearing and settlement in the United States through the Depository Trust Company ("DTC").
Stock Option Grant
Elevate has granted 497,000 stock options to officers, employees and consultants in accordance with the Company's omnibus incentive plan and issued 69,444 Restricted Share Units ("RSUs") with a grant value of $150,000 to an employee, all under employment and consulting agreements. A total of 150,000 options were granted to an officer, 100,000 options were granted to a consultant, and 247,000 options were granted to employees.
AGM Results
The Company also announces that all matters submitted to shareholders at its Annual General Meeting held on July 16, 2026, were approved, including the election of Romeo Di Battista Jr., Paul Bissett, Aaron Unger and Sebastien Koechli as directors, the appointment of MNP LLP as auditor, and approval of the Company's long-term incentive plan.
Marketing Services Agreement
The Company also announces that it has entered into a marketing services and investor relations agreement with Capital Gain Media Inc. ("CGM") to provide investor awareness, content development and digital marketing services designed to broaden awareness of the Company among potential investors for a period of six months. In accordance with the terms and conditions of the agreement and as consideration for the services provided by CGM, the Company agreed to pay a fee of US$250,000 to CGM as compensation. CGM has a business address located at 1111 West Hastings Street, 15th Floor, Vancouver, BC, V6E 2J3 and its principal Graham Colmer can be contacted at admin@capitalgainmedia.com. As of the date hereof, to the Company's knowledge, CGM (including its directors and officers) does not own any securities of the Company and has an arm's-length relationship with the Company.
Elevate Service Group Inc.
Elevate is a national facilities management and essential commercial services platform focused on building an integrated platform through disciplined acquisitions and organic growth. Elevate trades on the TSX Venture Exchange under the ticker "SERV".
Neither the TSXV nor its Regulation Services Provider (as that term is defined in the policies of the TSXV) accepts responsibility for the adequacy or accuracy of this release.`;

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

  // thenewswire.com wraps the issuer in dateline furniture, and it went
  // straight onto the ranking page as the company's name on the first
  // production run: "June 30'26 TheNewswire - Nord Precious Metals Corp".
  const wire = parseDisclosure(
    'Nord Precious Metals Announces Investor Relations Agreement',
    `June 30'26 TheNewswire - Nord Precious Metals Corp (TSXV: NTH) announces that it has entered into an investor relations agreement with RedChip Companies, Inc. ("RedChip") for a term of 12 months at a monthly fee of US$15,000.`,
  );
  check('wire furniture stripped from the issuer name', wire.issuerName, 'Nord Precious Metals Corp');
  check('wire release ticker', wire.ticker, 'NTH');
  check('wire release provider', wire.agreements[0].providerName, 'RedChip Companies, Inc');

  // Republishers that serve the body lazily leave the name unreadable next to
  // the ticker; the headline still carries it.
  const headless = parseDisclosure(
    'IC Group Engages Adelaide Capital to Enhance Investor Engagement',
    'Home > Technology > IC Group Engages Adelaide Capital Investing News Network (TSXV: ICGH) entered into an investor relations agreement with Adelaide Capital Markets Inc. ("Adelaide") for an initial six-month term at a monthly fee of C$12,000.',
  );
  check('issuer name falls back to the headline', headless.issuerName, 'IC Group');
  check('headline fallback keeps the ticker', headless.ticker, 'ICGH');
  // It must not fire when the body does carry the name.
  check('body name still wins', parseDisclosure('Dinero Announces Investor Relations Agreement', DINERO).issuerName, 'Dinero Ventures Ltd');

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

  // Elevate Service Group (TSXV: SERV), September 4, 2026 — the release George
  // asked about. A "corporate updates" headline, the IR agreement in the
  // fifth section, an auditor appointment and an option grant above it.
  const ELEVATE_TITLE = 'Elevate Service Group Commences OTCQB Trading and Provides Corporate Updates';
  check('elevate headline alone is not an IR headline', hasIrParagraph(ELEVATE_TITLE, ''), false);
  check('elevate passes the gate', isIrDisclosure(ELEVATE_TITLE, ELEVATE), true);
  const el = parseDisclosure(ELEVATE_TITLE, ELEVATE);
  check('elevate ticker', el.ticker, 'SERV');
  check('elevate issuer', el.issuerName, 'Elevate Service Group Inc');
  check('elevate one agreement (auditor is not a promoter)', el.agreements.map((a) => a.providerName), ['Capital Gain Media Inc']);
  const cgm = el.agreements[0];
  check('elevate short', cgm.providerShort, 'CGM');
  check('elevate term', cgm.termMonths, 6);
  check('elevate total', cgm.totalValue, 250000);
  check('elevate currency', cgm.currency, 'USD');
  check('elevate monthly derived', cgm.monthlyFee, 41667);
  // "100,000 options were granted to a consultant" is the employee plan, not
  // CGM — the release never defines CGM as "the Consultant".
  check('elevate options to provider', cgm.optionsGranted, 0);
  check('elevate arms length', cgm.armsLength, true);
  check('elevate auto-accepted', el.confidence >= REVIEW_THRESHOLD, true);
  check('elevate release date', releaseDate(ELEVATE), '2026-09-04');
  check('aggregator headline → issuer', issuerFromHeadline('Elevate Service Group Begins OTCQB Trading as ESVCF, Grants Stock Options and Signs Investor Relations Agreement'), 'Elevate Service Group');
  check('aggregator headline with ticker → issuer', issuerFromHeadline('Elevate Service Group Inc. (TSXV:SERV) Falls 2.91% as Rising Losses Weigh'), 'Elevate Service Group');

  // A comma before the corporate tail is part of the issuer's name.
  const comma = parseDisclosure(
    'Thiogenesis Engages Brisco Capital for Investor Relations',
    'San Diego, California--(Newsfile Corp. - September 3, 2026) - Thiogenesis Therapeutics, Corp. (TSXV: TTI) (OTCQB: TTIPF) ("Thiogenesis" or the "Company") has engaged Brisco Capital Partners Corp. ("Brisco") to provide investor relations services for a term of six months at a monthly fee of $6,000.',
  );
  check('comma-tail issuer name', comma.issuerName, 'Thiogenesis Therapeutics Corp');
  check('comma-tail ticker', comma.ticker, 'TTI');

  // Prose leading into the issuer name is not the name.
  const sharesOf = parseDisclosure(
    'Kutcho Copper Engages Resource Stock Digest',
    'Vancouver, British Columbia--(Newsfile Corp. - August 28, 2026) - The common shares of Kutcho Copper Corp. (TSXV: KC) ("Kutcho" or the "Company") trade on the TSXV. The Company has engaged Resource Stock Digest ("RSD") to provide investor relations services for a term of six months at a monthly fee of $5,000.',
  );
  check('shares-of prefix stripped from issuer', sharesOf.issuerName, 'Kutcho Copper Corp');

  // Undecoded numeric entities in stored text: "&#160;" (nbsp) and "&#8206;"
  // (left-to-right mark) sat between the name and the ticker bracket.
  const nbsp = parseDisclosure(
    'Tower Engages Simone Capital for Investor Relations Services',
    'Vancouver, British Columbia--(Newsfile Corp. - July 30, 2026) - Tower Resources Ltd.&#160;(TSXV: TWR)&#160;("Tower" or the "Company") has engaged Simone Capital Corp. ("Simone") for investor relations services for a term of six months at a monthly fee of $5,000.',
  );
  check('nbsp entity issuer name', nbsp.issuerName, 'Tower Resources Ltd');
  check('nbsp entity ticker', nbsp.ticker, 'TWR');
  const lrm = parseDisclosure(
    'XXIX Engages Bunt Capital for Investor Relations Services',
    'Toronto, Ontario--(Newsfile Corp. - March 23, 2026) - XXIX Metal Corp&#8206;. (TSXV: XXIX) (OTCQB: QCCUF) ("XXIX" or the "Company") has engaged Bunt Capital Inc. ("Bunt") to provide investor relations services for six months at a monthly fee of $7,500.',
  );
  check('lrm entity issuer name', lrm.issuerName, 'XXIX Metal Corp');
  check('lrm entity ticker', lrm.ticker, 'XXIX');

  // An Investing News Network page for XXIX that served Steadright's release
  // in the body: the headline is the only trustworthy thing on it.
  const swapped = parseDisclosure(
    'XXIX Engages Bunt Capital for Investor Relations Services',
    'TheNewswire - September 11th, 2026 - Steadright Critical Minerals Inc. (CSE:SCM,OTC:SCMNF) ("Steadright" or the "Company") announces it has engaged Adelaide Capital Markets Inc. ("Adelaide") to provide investor relations services for a monthly fee of C$10,000 for six months.',
  );
  check('swapped body drops the ticker', swapped.ticker, null);
  check('swapped body drops the provider', swapped.agreements[0].providerName, null);
  check('swapped body keeps the headline issuer', swapped.issuerName, 'XXIX');
  check('swapped body goes to review', swapped.confidence <= 0.3, true);

  // "pay a fee of $X per month" must stay a monthly rate, not become a total.
  const monthlyOnly = parseDisclosure(
    'Acme Engages IR Firm',
    'TORONTO--(Newsfile Corp. - July 2, 2026) - Acme Metals Corp. (TSXV: ACM) has engaged Bright IR Inc. ("Bright") for investor relations services and will pay a fee of $5,000 per month for a term of six months.',
  );
  check('monthly fee is not a total', monthlyOnly.agreements[0].totalValue, 30000);
  check('monthly fee is monthly', monthlyOnly.agreements[0].monthlyFee, 5000);

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
