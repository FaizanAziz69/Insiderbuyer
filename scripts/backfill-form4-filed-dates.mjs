#!/usr/bin/env node
/**
 * Fill insider_transactions.filedAt from the SEC's quarterly Form 345 archives.
 *
 * WHY A SCRIPT. Going forward the ingestion stores the filing date itself — the
 * SEC client has always carried it and only the column was missing. This is the
 * one-time repair of the rows written before that.
 *
 * WHY THE BULK ARCHIVES. 243,457 rows sit under roughly as many accessions.
 * Asking the SEC once per accession at their ten-a-second ceiling is seven
 * hours; each quarterly ZIP holds SUBMISSION.tsv, which maps every accession in
 * that quarter to its filing date, and goes in as one statement per quarter.
 *
 * WHY TWO LANGUAGES. Node has `pg` here and no ZIP reader; python3 has zipfile
 * in its standard library and no psycopg2 on this box. Each does the half it
 * already can, rather than installing a dependency on a production machine for
 * a job that runs once.
 *
 *   node scripts/backfill-form4-filed-dates.mjs 2015q1 2026q2
 */
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import pg from "/opt/insider/app/backend/node_modules/pg/lib/index.js";

const UA = process.env.SEC_USER_AGENT || "InsiderBuying devs@insiderbuying.com";
// 2026q2 was published under a different prefix; both are tried before failing.
const BASES = [
  "https://www.sec.gov/files/structureddata/data/insider-transactions-data-sets/",
  "https://www.sec.gov/files/datastandardsinnovation/",
];

function* quarters(start, end) {
  let [ys, qs] = [Number(start.slice(0, 4)), Number(start[5])];
  const [ye, qe] = [Number(end.slice(0, 4)), Number(end[5])];
  while (ys < ye || (ys === ye && qs <= qe)) {
    yield `${ys}q${qs}`;
    if (++qs > 4) { qs = 1; ys++; }
  }
}

/** Download the quarter and return SUBMISSION.tsv as text, or null. */
async function submissionTsv(quarter, tmp) {
  for (const base of BASES) {
    const res = await fetch(`${base}${quarter}_form345.zip`, { headers: { "User-Agent": UA } })
      .catch(() => null);
    if (!res?.ok) continue;
    const zipPath = path.join(tmp, `${quarter}.zip`);
    fs.writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
    const outPath = path.join(tmp, `${quarter}.tsv`);
    try {
      execFileSync("python3", [
        "-c",
        `import zipfile,sys
z=zipfile.ZipFile(sys.argv[1])
n=next((x for x in z.namelist() if x.upper().endswith("SUBMISSION.TSV")), None)
open(sys.argv[2],"wb").write(z.read(n) if n else b"")`,
        zipPath, outPath,
      ]);
    } finally {
      fs.rmSync(zipPath, { force: true });
    }
    const text = fs.readFileSync(outPath, "utf8");
    fs.rmSync(outPath, { force: true });
    return text || null;
  }
  return null;
}

const MONTHS = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];

/** ACCESSION_NUMBER -> ISO filing date. */
function parse(tsv) {
  const out = new Map();
  const lines = tsv.split("\n");
  const header = (lines[0] || "").replace(/\r$/, "").split("\t");
  const iAcc = header.indexOf("ACCESSION_NUMBER");
  const iDate = header.indexOf("FILING_DATE");
  if (iAcc < 0 || iDate < 0) return out;
  for (let i = 1; i < lines.length; i++) {
    const p = lines[i].replace(/\r$/, "").split("\t");
    if (p.length <= Math.max(iAcc, iDate)) continue;
    const acc = p[iAcc]?.trim();
    let d = p[iDate]?.trim();
    if (!acc || !d) continue;
    // The archives write DD-MON-YYYY; Postgres wants ISO.
    const m = /^(\d{2})-([A-Za-z]{3})-(\d{4})$/.exec(d);
    if (m) {
      const mon = MONTHS.indexOf(m[2].toUpperCase()) + 1;
      if (!mon) continue;
      d = `${m[3]}-${String(mon).padStart(2, "0")}-${m[1]}`;
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) continue;
    out.set(acc, d);
  }
  return out;
}

const [from = "2015q1", to = "2026q2"] = process.argv.slice(2);
const url = fs
  .readFileSync("/opt/insider/app/backend/.env", "utf8")
  .split("\n")
  .find((l) => l.startsWith("DATABASE_URL="))
  .slice("DATABASE_URL=".length)
  .trim()
  .replace(/^"|"$/g, "");

const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await client.connect();
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "form345-"));
let total = 0;
try {
  for (const q of quarters(from, to)) {
    const tsv = await submissionTsv(q, tmp);
    if (!tsv) { console.log(`${q}: not available`); continue; }
    const map = parse(tsv);
    if (!map.size) { console.log(`${q}: no SUBMISSION rows`); continue; }
    // One statement per quarter: the map goes in as arrays and Postgres does
    // the join, rather than a round trip per accession.
    const res = await client.query(
      `UPDATE insider_transactions t
          SET "filedAt" = m.filed::date
         FROM (SELECT unnest($1::text[]) AS acc, unnest($2::text[]) AS filed) m
        WHERE t."accessionNumber" = m.acc AND t."filedAt" IS NULL`,
      [[...map.keys()], [...map.values()]],
    );
    total += res.rowCount || 0;
    console.log(`${q}: ${map.size} accessions, +${res.rowCount} rows (total ${total})`);
  }
  const { rows } = await client.query(
    `SELECT count(*) FILTER (WHERE "filedAt" IS NOT NULL)::text AS got, count(*)::text AS all FROM insider_transactions`,
  );
  console.log(`\ndone: ${rows[0].got}/${rows[0].all} rows carry a filing date`);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
  await client.end();
}
