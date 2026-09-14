/**
 * Top Ranking Congress Trades — the pipeline, run end to end against real
 * sources and a real database.
 *
 *   docker compose up -d postgres
 *   npm run build
 *   node dist/congress-trades/congress-trades.live.js \
 *     postgres://iqs_user:iqs_password@localhost:5432/iqs_db
 *
 * This is not a mock. It pulls today's awards from USAspending, resolves the
 * vendors through USAspending's parent data, GLEIF and SEC, refreshes the
 * committee map from the unitedstates project, and runs the flag engine —
 * then prints the entity-resolution coverage §7 P1 is accepted on, measured
 * rather than asserted.
 *
 * It creates its own schema and drops it again, so it touches nothing else.
 */
import { Client } from 'pg';
import { AwardsService } from './awards.service';
import { EntityResolutionService } from './entity-resolution.service';
import { InfluenceMapService } from './influence-map.service';
import { FlagEngineService } from './flag-engine.service';
import { VerificationAgentService } from './verification-agent.service';

async function main() {
  const url = process.argv[2] || process.env.CT_TEST_DB;
  if (!url) {
    console.error('usage: node dist/congress-trades/congress-trades.live.js <postgres-url>');
    process.exit(2);
  }
  const schema = `ct_live_${Date.now()}`;
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`CREATE SCHEMA ${schema}`);
  await client.query(`SET search_path TO ${schema}`);

  const repo: any = { query: (sql: string, p?: any[]) => client.query(sql, p).then((r) => r.rows) };
  const awards = new AwardsService(repo);
  const vendors = new EntityResolutionService(repo, awards);
  const influence = new InfluenceMapService(repo);
  const flags = new FlagEngineService(repo, awards, vendors, influence);
  const agent = new VerificationAgentService(repo);

  // The engine joins against the congress trade table and the company
  // universe, which live in the main schema. Minimal stand-ins here.
  await client.query(`CREATE TABLE companies (symbol varchar(16), name text)`);
  await client.query(`CREATE TABLE congressional_transactions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    "politicianName" text, chamber text, party text, ticker text,
    "companyName" text, action text, "amountMin" numeric, "amountMax" numeric,
    "transactionDate" date, "reportedDate" date
  )`);
  await client.query(`CREATE TABLE bubbles_cache (symbol varchar(16), "revenueTtm" numeric)`);

  console.log(`\nTop Ranking Congress Trades — live pipeline (schema ${schema})\n`);

  // Every stage's tables exist up front, so a stage that does not fire in
  // this sample cannot make a later one fail on a missing relation.
  await Promise.all([
    influence.ensureTables(), awards.ensureTables(), vendors.ensureTables(),
    flags.ensureTables(), agent.ensureTables(),
  ]);

  // ── Stage 1 ──────────────────────────────────────────────────────────
  const seeded = await influence.seedIfEmpty();
  const seats = await influence.refreshAssignments();
  const inf = await influence.status();
  console.log(`Stage 1  influence map`);
  console.log(`         ${seats} committee seats · ${inf.members} members · ${inf.subcommittee_seats} on subcommittees`);
  console.log(`         jurisdiction table v${inf.jurisdictionVersion} with ${inf.jurisdiction_rows} mappings (${seeded} seeded)`);

  // A real member on a real committee should reach the agency it oversees.
  const armed: any[] = await client.query(
    `SELECT member FROM ct_assignments WHERE committee ILIKE '%Armed Services%' LIMIT 1`,
  ).then((r) => r.rows);
  if (armed[0]) {
    const hit = await influence.jurisdictionFor(armed[0].member, 'Department of Defense', 'Department of the Navy');
    console.log(`         ${armed[0].member} → Department of Defense: ${hit.length ? `jurisdiction via ${hit[0].committee}` : 'NO MATCH'}`);
  }

  // ── Stage 2 ──────────────────────────────────────────────────────────
  const ing = await awards.ingest(10, 4);
  const aStatus = await awards.status();
  console.log(`\nStage 2  awards feed`);
  console.log(`         ${ing.stored} awards stored from USAspending (floor $${ing.floor.toLocaleString()}), newest ${aStatus.newest}`);

  // ── Stage 3a — entity resolution, the §7 P1 number ───────────────────
  console.log(`\nStage 3  entity resolution (this is the §7 P1 acceptance number)`);
  const res = await vendors.resolvePending(60);
  const cov = await vendors.coverage();
  console.log(`         ${cov.vendors} vendors decided automatically:`);
  console.log(`           ticker resolved   ${cov.with_ticker}  (${cov.tickerPct}%)`);
  console.log(`           not publicly listed ${cov.not_public}`);
  console.log(`           to manual queue   ${cov.unresolved}`);
  console.log(`         AUTOMATIC DECISION RATE: ${cov.decidedPct}%  (target ≥90%)`);
  const sample: any[] = await client.query(
    `SELECT vendor_name, status, ticker, method FROM ct_vendor_map ORDER BY status, vendor_name LIMIT 8`,
  ).then((r) => r.rows);
  for (const s of sample) {
    console.log(`           ${String(s.status).padEnd(12)} ${String(s.ticker || '—').padEnd(6)} ${String(s.method || '').padEnd(20)} ${s.vendor_name.slice(0, 44)}`);
  }

  // ── Stage 3b — the flag engine, on a real award ──────────────────────
  // Pick an award that can actually produce a flag: vendor resolved to a
  // ticker AND an agency the jurisdiction table covers. Picking any
  // ticker-resolved award first and hoping a committee matched it left the
  // engine unexercised on two runs.
  const withTicker: any[] = await client.query(
    `SELECT m.ticker, m.listed_name, a.award_key, a.agency, a.sub_agency,
            a.amount::float8 AS amount, a.action_date
       FROM ct_vendor_map m
       JOIN ct_awards a ON lower(COALESCE(a.recipient_uei, a.recipient_name)) = m.vendor_key
       JOIN ct_jurisdiction j ON lower(j.agency) IN (lower(a.agency), lower(COALESCE(a.sub_agency,'')))
      WHERE m.status = 'ticker' AND j.active
      ORDER BY a.amount DESC
      LIMIT 1`,
  ).then((r) => r.rows);

  console.log(`\nStage 3  flag engine`);
  if (!withTicker[0]) {
    console.log('         no ticker-resolved award in this sample — engine not exercised');
    const diag: any[] = await client.query(
      `SELECT a.agency, count(*)::int n, min(m.ticker) AS example
         FROM ct_vendor_map m
         JOIN ct_awards a ON lower(COALESCE(a.recipient_uei, a.recipient_name)) = m.vendor_key
        WHERE m.status = 'ticker'
        GROUP BY a.agency ORDER BY n DESC LIMIT 8`,
    ).then((r) => r.rows);
    console.log('         agencies behind ticker-resolved awards (none covered by the seed table):');
    for (const d of diag) console.log(`           ${String(d.n).padStart(3)}  ${d.agency}  e.g. ${d.example}`);
  } else {
    const w = withTicker[0];
    // Seed the two legs the engine needs: a member who sits on a committee
    // with jurisdiction over this agency, and a trade in the window.
    const seat: any[] = await client.query(
      `SELECT DISTINCT a.member FROM ct_assignments a
         JOIN ct_jurisdiction j ON lower(j.committee) = lower(a.committee)
        WHERE lower(j.agency) = lower($1) LIMIT 1`,
      [w.sub_agency || w.agency],
    ).then((r) => r.rows);

    if (!seat[0]) {
      console.log(`         no member has jurisdiction over ${w.sub_agency || w.agency} in the seed table`);
    } else {
      await client.query(
        `INSERT INTO congressional_transactions
           ("politicianName", chamber, party, ticker, "companyName", action, "amountMin", "amountMax", "transactionDate", "reportedDate")
         VALUES ($1,'House','Democrat',$2,$3,'Buy',100000,250000,($4::date - 21),($4::date + 20))`,
        [seat[0].member, w.ticker, w.listed_name || w.ticker, w.action_date],
      );
      await client.query(`INSERT INTO bubbles_cache (symbol, "revenueTtm") VALUES ($1, 2000000000)`, [w.ticker]);

      const run = await flags.run(180);
      console.log(`         ${run.awards} awards scanned · ${run.withTicker} with a ticker · ${run.flags} flags`);

      const flag: any[] = await client.query(
        `SELECT member, ticker, agency, award_value::float8 AS v, score, components, headline, evidence, status FROM ct_flags LIMIT 1`,
      ).then((r) => r.rows);
      if (flag[0]) {
        const f = flag[0];
        console.log(`         FLAG  ${f.member} · ${f.ticker} · ${f.agency} · $${Math.round(f.v / 1e6)}M · CTS ${f.score}`);
        console.log(`         "${String(f.headline).slice(0, 150)}…"`);
        const legs = Object.keys(f.evidence || {});
        console.log(`         evidence chain: ${legs.join(', ')}`);
        console.log(`         status before verification: ${f.status}  (§7 P2: nothing renders until verified)`);
        const publicRows = await flags.leaderboard({});
        console.log(`         public leaderboard right now: ${publicRows.length} rows — an unverified flag is invisible`);
      }
    }
  }

  // ── Stage 5 ──────────────────────────────────────────────────────────
  console.log(`\nStage 5  verification agent`);
  await agent.ensureTables();
  const v = await agent.verify(5, 'pending');
  console.log(`         checked ${v.checked} · verified ${v.passed} · corrected ${v.corrected} · retired ${v.retired} · queued ${v.queued}`);
  const after = await flags.leaderboard({});
  console.log(`         public leaderboard after verification: ${after.length} rows`);
  const audit = await agent.audits(undefined, 5);
  console.log(`         audit entries written: ${(audit as any[]).length}`);

  await client.query(`DROP SCHEMA ${schema} CASCADE`);
  await client.end();
  console.log('\ndone — schema dropped\n');
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
