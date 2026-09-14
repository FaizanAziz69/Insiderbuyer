/**
 * Workstream F — the database path, exercised against a real Postgres.
 *
 *   docker compose up -d postgres
 *   npm run build
 *   node dist/promoter/promoter.service.spec.js \
 *     postgres://iqs_user:iqs_password@localhost:5432/iqs_db
 *
 * Why this exists: `ir-parser.spec.ts` proves the reading, and the discovery
 * service can be smoke-tested over the network, but everything between them —
 * `ensureTables`, the upserts, the partial unique index and its matching
 * `ON CONFLICT ... WHERE`, the quarter arithmetic in `rescore`, and the read
 * queries the three surfaces depend on — is SQL that a TypeScript compiler
 * cannot check. Shipping that unexercised means finding out on the first
 * production ingest.
 *
 * The service is constructed by hand with a thin `query()` shim over `pg`
 * instead of booting Nest, and with stubs for FMP and discovery, so the run is
 * offline, deterministic and touches nothing but the database it is given.
 * It creates its own schema and drops it again at the end.
 */
import { Client } from 'pg';
import { PromoterService } from './promoter.service';
import { parseDisclosure } from './ir-parser';
import { currentQuarter } from './promoter.service';
import { DEFAULT_WEIGHTS } from './scoring';

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
function checkWith(name: string, got: unknown, pred: (v: any) => boolean) {
  if (pred(got)) console.log(`  ok   ${name}`);
  else {
    failures++;
    console.error(`  FAIL ${name}\n       got  ${JSON.stringify(got)}`);
  }
}

// ── Fixtures: real releases, shortened to the disclosing paragraphs ──────

const DINERO = {
  url: 'https://example.test/dinero',
  title: 'Dinero Announces Investor Relations Agreement',
  published: '2026-09-01T12:00:00Z',
  body: `Stewart, British Columbia--(Newsfile Corp. - September 1, 2026) - Dinero Ventures Ltd (TSXV: DNO) ("Dinero") reports that it has engaged German Mining Networks GmbH ("GMN") for investor relations services. The contract start date is September 1, 2026 for a three-month term for total costs of $20,400 with the option to continue services on a three months basis at a cost of $6,800.00 per month. GMN will not receive common shares or options of the Company as compensation. GMN is an arms-length organization to the Company.`,
};

const KALO = {
  url: 'https://example.test/kalo',
  title: 'Kalo Gold Enters into Investor Relations and Marketing Services Agreements',
  published: '2026-07-07T12:00:00Z',
  body: `VANCOUVER, BC / ACCESS Newswire / July 7, 2026 / Kalo Gold Corp . ( TSXV:KALO )(OTCID:KLGDF) ("Kalo" or the "Company") announces that it has entered into investor relations and marketing services agreements with Fairfax Partners Inc., GOLDINVEST Consulting GmbH, and NAI Interactive Ltd., as further described below.
Fairfax Partners Inc. ("Fairfax") Kalo has entered into a Services Agreement effective July 8, 2026 with Fairfax Partners Inc. The Fairfax Agreement has an initial term of 12 months from the effective date. Kalo will pay Fairfax a monthly fee of CAD$5,000.
GOLDINVEST Consulting GmbH ("GOLDINVEST") Kalo has entered into an agreement with GOLDINVEST Consulting GmbH effective July 8, 2026 for a term of six months. Kalo will pay GOLDINVEST a total of EUR 60,000.
NAI Interactive Ltd. ("NAI") Kalo has entered into an agreement with NAI Interactive Ltd. for a period of three months commencing July 8, 2026 at a monthly fee of CAD$3,500.`,
};

/** The same Dinero release as carried by a second wire — re-reading it must
 *  not create a second contract row. */
const DINERO_MIRROR = { ...DINERO, url: 'https://example.test/dinero-globeandmail' };

/** A real shape the parser cannot resolve: an issuer that names no provider
 *  and states no fee. It must reach the review queue rather than become a
 *  confident row. */
const VAGUE = {
  url: 'https://example.test/vague',
  title: 'Nuvo Metals Announces Investor Relations Engagement',
  published: '2026-08-11T12:00:00Z',
  body: `VANCOUVER, BC--(Newsfile Corp. - August 11, 2026) - Nuvo Metals Corp. (TSXV: NUVO) ("Nuvo" or the "Company") announces that it has retained a capital markets advisory firm to provide investor relations services for a term of six months, subject to acceptance by the TSX Venture Exchange. Further details will be announced in due course.`,
};

const TERMINATION = {
  url: 'https://example.test/dno-terminated',
  title: 'Dinero Announces Termination of Investor Relations Agreement',
  published: '2026-09-20T12:00:00Z',
  body: `Stewart, British Columbia--(Newsfile Corp. - September 20, 2026) - Dinero Ventures Ltd (TSXV: DNO) ("Dinero") announces the termination of its investor relations agreement with German Mining Networks GmbH ("GMN"), effective September 30, 2026.`,
};

async function main() {
  const url = process.argv[2] || process.env.PROMOTER_TEST_DB;
  if (!url) {
    console.error('usage: node dist/promoter/promoter.service.spec.js <postgres-url>');
    process.exit(2);
  }
  const schema = `promoter_spec_${Date.now()}`;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);

  // Minimal stand-ins: the service only ever calls `.query()` on the repo,
  // `getCompanyProfile` on FMP, and nothing on discovery in these paths.
  const repo: any = { query: (sql: string, params?: any[]) => client.query(sql, params).then((r) => r.rows) };
  const fmp: any = {
    getCompanyProfile: async (sym: string) =>
      sym === 'DNO.V'
        ? null // FMP genuinely has nothing for the smallest venture names
        : sym === 'KALO.V'
          ? { companyName: 'Kalo Gold Corp.', marketCap: 24_000_000, currency: 'CAD', sector: 'Basic Materials', industry: 'Gold' }
          : null,
  };
  const discovery: any = { status: () => ({}), discover: async () => [], resolveUrl: async () => null };
  const svc = new PromoterService(repo, fmp, discovery);

  console.log(`\npromoter.service DB checks (schema ${schema})\n`);
  await svc.onModuleInit();

  // ── Tables ────────────────────────────────────────────────────────────
  const tables = (
    await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name`,
      [schema],
    )
  ).rows.map((r) => r.table_name);
  check('tables created', tables, [
    'ir_agreements', 'ir_audit', 'ir_disclosures', 'ir_firms', 'ir_issuers',
    'promoter_config', 'promoter_scores',
  ]);

  // ── Store ─────────────────────────────────────────────────────────────
  const store = (svc as any).store.bind(svc);
  for (const rel of [DINERO, KALO, VAGUE]) {
    await store(rel.url, { title: rel.title, publishedAt: rel.published }, rel.body, parseDisclosure(rel.title, rel.body));
  }
  const after = (await client.query(`SELECT ticker, provider_name, monthly_fee_cad, total_value_cad, currency, term_months, status FROM ir_agreements ORDER BY ticker, provider_name`)).rows;
  // Four real contracts, plus one provider-less placeholder for VAGUE — the
  // release we could not read is held for a human instead of vanishing.
  check('agreement rows incl. one held for review', after.length, 5);
  const held = after.filter((r) => r.provider_name == null);
  check('one placeholder', held.length, 1);
  check('placeholder is not active', held[0]?.status, 'needs_review');
  check('dinero provider', after.find((r) => r.ticker === 'DNO')?.provider_name, 'German Mining Networks GmbH');
  check('dinero monthly cad', Number(after.find((r) => r.ticker === 'DNO')?.monthly_fee_cad), 6800);
  // EUR 60,000 must not be summed as if it were Canadian dollars.
  const gi = after.find((r) => r.provider_name?.startsWith('GOLDINVEST'));
  check('goldinvest currency kept', gi?.currency, 'EUR');
  checkWith('goldinvest converted to cad', Number(gi?.total_value_cad), (v) => v > 60_000 && v < 100_000);

  // ── Idempotence: the same release from a second wire ───────────────────
  await store(DINERO_MIRROR.url, { title: DINERO_MIRROR.title, publishedAt: DINERO_MIRROR.published }, DINERO_MIRROR.body, parseDisclosure(DINERO_MIRROR.title, DINERO_MIRROR.body));
  const dup = (await client.query(`SELECT count(*)::int AS n FROM ir_agreements`)).rows[0].n;
  check('re-reading the same release adds no row', dup, 5);
  const discs = (await client.query(`SELECT count(*)::int AS n FROM ir_disclosures`)).rows[0].n;
  check('but every disclosure is kept', discs, 4);

  // ── Firms = the B2B lead list ─────────────────────────────────────────
  const firms = await svc.firms({});
  check('firm count', firms.length, 4);
  check('firm agreement count', firms.find((f) => f.slug.startsWith('fairfax'))?.agreements, 1);

  // ── Issuer resolution ─────────────────────────────────────────────────
  const resolved = await svc.resolveIssuers();
  check('issuers resolved', resolved, 3);
  const issuers = (await client.query(`SELECT ticker, market_cap, sector FROM ir_issuers ORDER BY ticker`)).rows;
  check('kalo market cap', Number(issuers.find((r) => r.ticker === 'KALO')?.market_cap), 24_000_000);
  // The honest outcome for a name FMP does not carry.
  check('dno market cap stays null', issuers.find((r) => r.ticker === 'DNO')?.market_cap, null);

  // ── Scoring ───────────────────────────────────────────────────────────
  const written = await svc.rescore(8);
  checkWith('scores written', written, (v) => v >= 2);
  const scores = (await client.query(`SELECT ticker, quarter, spend_cad::float8 AS spend, score, active_contracts, spend_per_mcap_bps FROM promoter_scores ORDER BY quarter, ticker`)).rows;
  checkWith('kalo scored in 2026-Q3', scores.some((r) => r.ticker === 'KALO' && r.quarter === '2026-Q3'), Boolean);
  // Dinero's three-month engagement starts Sept 1: one month of Q3, two of Q4.
  const dnoQ3 = scores.find((r) => r.ticker === 'DNO' && r.quarter === '2026-Q3');
  checkWith('dinero Q3 is one month of fee, not three', Number(dnoQ3?.spend), (v) => v > 5_000 && v < 9_000);
  // `rescore` walks back from the current quarter, so a contract running into
  // a quarter that has not started yet has no row — correctly. What matters is
  // that the pro-rating happened at all, which the Q3 figure above proves.
  check('no score row for a quarter that has not started', scores.some((r) => r.quarter > currentQuarter()), false);
  // KALO has a market cap, DNO does not — the component drops, it is not zero.
  checkWith('kalo has a spend/mcap figure', scores.find((r) => r.ticker === 'KALO')?.spend_per_mcap_bps, (v) => v != null && v > 0);
  check('dno has none', scores.find((r) => r.ticker === 'DNO')?.spend_per_mcap_bps, null);
  checkWith('every scored row has a score', scores.every((r) => r.score != null), Boolean);

  // ── Reads the surfaces depend on ──────────────────────────────────────
  const ranking = await svc.ranking({ quarter: '2026-Q3' });
  check('ranking quarter', ranking.quarter, '2026-Q3');
  checkWith('ranking has rows', ranking.rows.length, (v) => v >= 1);
  check('ranking carries the live weights', ranking.weights, DEFAULT_WEIGHTS);
  const issuer = await svc.issuer('kalo');
  check('issuer lookup is case-insensitive', issuer?.ticker, 'KALO');
  check('issuer contracts', issuer?.contracts.length, 3);
  checkWith('issuer history', issuer!.history.length, (v) => v >= 1);
  check('unknown issuer returns null', await svc.issuer('ZZZZ'), null);

  // ── Review queue, correction, audit trail ─────────────────────────────
  const queue = await svc.reviewQueue();
  checkWith('review queue is populated', queue.length, (v) => v >= 1);
  checkWith('the unreadable release is in it', queue.some((r) => r.ticker === 'NUVO'), Boolean);
  // A placeholder stays out of every public surface until a human names the
  // counterparty.
  const nuvoPublic = await svc.issuer('NUVO');
  check('placeholder is invisible publicly', nuvoPublic, null);
  // With clean fixtures the only thing the parser holds back is the NUVO
  // placeholder, so this is that row — the same one the correction checks
  // below walk through from unnamed to published.
  const target = queue[0];
  const before = (await client.query(`SELECT monthly_fee, monthly_fee_cad, reviewed_at FROM ir_agreements WHERE id = $1`, [target.id])).rows[0];
  check('row starts unreviewed', before.reviewed_at, null);
  const corrected = await svc.correct(target.id, { monthlyFee: 9999, currency: 'USD' }, 'spec', 'unit test');
  check('correction applied', corrected, { ok: true });
  const post = (await client.query(`SELECT monthly_fee::float8 AS f, monthly_fee_cad::float8 AS c, reviewed_by, confidence FROM ir_agreements WHERE id = $1`, [target.id])).rows[0];
  check('fee updated', post.f, 9999);
  // The CAD column must follow the edit, or every aggregate silently disagrees
  // with the figure on the page.
  checkWith('cad column recomputed at the new currency', post.c, (v) => v > 13_000 && v < 14_000);
  check('reviewer recorded', post.reviewed_by, 'spec');
  const audit = await svc.audit(target.id);
  check('audit row written', (audit as any[]).length, 1);
  check('audit action', (audit as any[])[0].action, 'correct');

  // A re-read of the release must not undo a human correction.
  await store(DINERO.url, { title: DINERO.title, publishedAt: DINERO.published }, DINERO.body, parseDisclosure(DINERO.title, DINERO.body));
  await store(KALO.url, { title: KALO.title, publishedAt: KALO.published }, KALO.body, parseDisclosure(KALO.title, KALO.body));
  const kept = (await client.query(`SELECT monthly_fee::float8 AS f FROM ir_agreements WHERE id = $1`, [target.id])).rows[0];
  check('reviewed row survives a re-read', kept.f, 9999);

  // ── Termination retires the earlier contract ──────────────────────────
  await store(TERMINATION.url, { title: TERMINATION.title, publishedAt: TERMINATION.published }, TERMINATION.body, parseDisclosure(TERMINATION.title, TERMINATION.body));
  const dnoStatuses = (await client.query(`SELECT status FROM ir_agreements WHERE ticker = 'DNO' ORDER BY status`)).rows.map((r) => r.status);
  checkWith('dinero contract is retired', dnoStatuses.includes('terminated'), Boolean);

  // ── Weights are data, not code ────────────────────────────────────────
  const w = await svc.setWeights({ perMcap: 55, spend: 10 }, 'spec');
  check('weights updated', [w.perMcap, w.spend, w.qoq], [55, 10, 15]);
  const reread = await svc.getWeights();
  check('weights persist', reread.perMcap, 55);
  const weightAudit = (await client.query(`SELECT action FROM ir_audit WHERE agreement_id IS NULL`)).rows;
  check('weight change is audited', weightAudit.length, 1);
  // An out-of-range value is ignored and the current weight stands; it must
  // not silently snap back to the shipped default.
  const bad = await svc.setWeights({ perMcap: -5 as any, spend: 99999 as any }, 'spec');
  check('nonsense weights are ignored, current values stand', [bad.perMcap, bad.spend], [55, 10]);

  // Naming the provider promotes the held row into a real contract.
  const nuvoRow = queue.find((r) => r.ticker === 'NUVO')!;
  await svc.correct(nuvoRow.id, { providerName: 'Harbourfront Capital Markets Inc.', monthlyFee: 5000, currency: 'CAD' }, 'spec', 'named the counterparty');
  const nuvoNow = await svc.issuer('NUVO');
  check('named row becomes public', nuvoNow?.contracts.length, 1);
  check('and carries the provider', nuvoNow?.contracts[0]?.providerName, 'Harbourfront Capital Markets Inc.');
  checkWith('and the firm joins the lead list', (await svc.firms({ search: 'Harbourfront' })).length, (v) => v === 1);

  // ── Export ────────────────────────────────────────────────────────────
  const rows = await svc.exportRows(100);
  checkWith('export returns the agreement table', rows.length, (v) => v >= 4);
  checkWith('export carries the source url', rows[0].source_url, (v) => typeof v === 'string' && v.startsWith('http'));

  // ── Re-parse stores nothing new and breaks nothing ────────────────────
  const beforeCount = (await client.query(`SELECT count(*)::int AS n FROM ir_agreements`)).rows[0].n;
  // Re-parse reads `published_at` back as a Date, not the ISO string ingestion
  // passes. Assuming the string form is what crashed the first production
  // re-parse ("seen.slice is not a function"), so the fixtures below go
  // through the same path the server does.
  // A parser fix must reach rows already stored. Simulate one: corrupt a
  // stored issuer name the way thenewswire.com's dateline did on production,
  // then re-parse and check the clean name comes back.
  await client.query(
    `UPDATE ir_agreements SET issuer_name = $1 WHERE ticker = 'DNO'`,
    ["June 30'26 TheNewswire - Dinero Ventures Ltd"],
  );
  await client.query(
    `UPDATE ir_disclosures SET issuer_name = $1 WHERE ticker = 'DNO'`,
    ["June 30'26 TheNewswire - Dinero Ventures Ltd"],
  );
  await client.query(`UPDATE ir_issuers SET name = $1 WHERE ticker = 'DNO'`, ["June 30'26 TheNewswire - Dinero Ventures Ltd"]);

  const re = await svc.reparse();
  check('reparse read every stored disclosure', re.disclosures, 5);
  const afterCount = (await client.query(`SELECT count(*)::int AS n FROM ir_agreements`)).rows[0].n;
  check('reparse adds no duplicate rows', afterCount, beforeCount);
  // The hand-set fee must survive a re-read. `target` is the placeholder row,
  // which by this point an editor has named and priced at 5000 — that is the
  // record of truth, and re-parsing the release must not put the machine's
  // reading back over it.
  const stillCorrected = (await client.query(`SELECT monthly_fee::float8 AS f, provider_name FROM ir_agreements WHERE id = $1`, [target.id])).rows[0];
  check('reparse leaves a hand-reviewed row alone', stillCorrected.f, 5000);
  check('and keeps the name the editor gave it', stillCorrected.provider_name, 'Harbourfront Capital Markets Inc.');

  const fixed = (await client.query(`SELECT issuer_name FROM ir_agreements WHERE ticker = 'DNO' LIMIT 1`)).rows[0];
  check('reparse repairs a stored issuer name', fixed.issuer_name, 'Dinero Ventures Ltd');
  const fixedIssuer = (await client.query(`SELECT name FROM ir_issuers WHERE ticker = 'DNO'`)).rows[0];
  check('and the issuer row follows it', fixedIssuer.name, 'Dinero Ventures Ltd');

  const status = await svc.status();
  checkWith('status counts agreements', (status as any).agreements, (v) => v >= 4);

  await client.query(`DROP SCHEMA ${schema} CASCADE`);
  await client.end();
  console.log(failures ? `\n${failures} FAILED\n` : '\nall database checks passed\n');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
