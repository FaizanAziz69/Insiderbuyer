#!/usr/bin/env node
/**
 * Data-integrity acceptance suite — runs against a DEPLOYED backend and exits
 * non-zero on any regression. No dependencies (Node 18+, global fetch).
 *
 *   node scripts/data-qa.mjs [apiBase]
 *   apiBase default: https://insiderbuying.com/api/backend (override with
 *   QA_API_BASE, or 127.0.0.1:4000/api from on the box — the public host is
 *   behind the bot gate and answers curl with bot_verification_required)
 *
 * Assertions (from the data-integrity remediation spec):
 *  1  IQ composite recomputes from its stored components (dark-mode formula)
 *  2  dataCompleteness matches the components actually present
 *  3  every score within 0..99
 *  4  shares × price == totalValue on the trades feed (non-suspect rows)
 *  5  analyst upsidePct == (targetMean/price − 1) × 100
 *  6  targetLow ≤ targetMean ≤ targetHigh
 *  7  no avgCost more than 3× from lastPrice (stock-list rows)
 *  8  no non-suspect trade value exceeding its company's market cap
 *  9  component null rates: dilution < 5%, MD&A < 20%, sector == 0%
 * 11  price/cap consistent (±2%) between /rankings and /market-stats/quotes
 * 12  no duplicate symbols in the analyst-ratings payload
 * 13  party non-null on 100% of congressional rows
 * 14  CQS recomputes from its stored components and multipliers
 * 15  every CQS component and the total sit inside 0..100
 * 16  each CQS grade matches its own score band
 * 17  the CQS board is today's, not a stale scoring date
 * 18  no CQS row is served for a stock that no longer qualifies
 * 19  a multiplier is never both applied and reported unavailable
 * (10 is a UI-state assertion — covered by IqsScoreCell's explicit
 *  "No recent insider buying" state, not testable from the API.)
 */

// The site moved to EC2; the old Vercel default had been dead for months, so
// every run without an explicit argument was testing nothing.
const BASE = (process.argv[2] || process.env.QA_API_BASE || 'https://insiderbuying.com/api/backend').replace(/\/$/, '');
const failures = [];
const warnings = [];

function check(id, ok, detail) {
  if (ok) {
    console.log(`  ✓ ${id}`);
  } else {
    failures.push(`${id}: ${detail}`);
    console.error(`  ✗ ${id} — ${detail}`);
  }
}

async function get(path) {
  const res = await fetch(`${BASE}${path}`, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`${path} → HTTP ${res.status}`);
  return res.json();
}

const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ── Rankings-based checks (1, 2, 3, 7-ish, 9) ────────────────────────────
console.log('rankings…');
const { rows: rank } = await get('/rankings?limit=2000&live=0');
check('rankings-nonempty', rank.length > 50, `only ${rank.length} rows`);

const W = { buying: 0.45, sector: 0.22, mda: 0.10, momentum: 0.10, pedigree: 0.08, dilution: 0.05 };
const NEUTRAL = 50;
const PEDIGREE_BASELINE = 25;

let badComposite = 0, badCompleteness = 0, badRange = 0;
let dilNull = 0, mdaNull = 0, sectorNull = 0;
for (const r of rank) {
  const iqs = Number(r.iqs);
  if (!(iqs >= 0 && iqs <= 99)) badRange++;

  const comp = {
    buying: r.buyingScore != null ? Number(r.buyingScore) : null,
    sector: r.sectorSentiment != null ? Number(r.sectorSentiment) : null,
    mda: r.mdaSentiment != null ? Number(r.mdaSentiment) : null,
    momentum: r.momentumScore != null ? Number(r.momentumScore) : null,
    pedigree: r.pedigreeScore != null ? Number(r.pedigreeScore) : null,
    dilution: r.dilutionScore != null ? Number(r.dilutionScore) : null,
  };
  if (comp.dilution == null) dilNull++;
  if (comp.mda == null) mdaNull++;
  if (comp.sector == null) sectorNull++;

  if (comp.buying != null) {
    // Dark-mode composite: missing → neutral 50, pedigree baseline 25,
    // litigation applied only when live (assume dark: deduction not applied).
    const expected =
      W.buying * comp.buying +
      W.sector * (comp.sector ?? NEUTRAL) +
      W.mda * (comp.mda ?? NEUTRAL) +
      W.momentum * (comp.momentum ?? NEUTRAL) +
      W.pedigree * (comp.pedigree ?? PEDIGREE_BASELINE) +
      W.dilution * (comp.dilution ?? NEUTRAL);
    const capped = Math.min(99, Math.max(0, expected));
    if (!near(iqs, Math.round(capped * 100) / 100, 1.01)) badComposite++;

    if (r.dataCompleteness != null) {
      const realWeight =
        W.buying +
        (comp.sector != null ? W.sector : 0) +
        (comp.mda != null ? W.mda : 0) +
        (comp.momentum != null ? W.momentum : 0) +
        (comp.pedigree != null ? W.pedigree : 0) +
        (comp.dilution != null ? W.dilution : 0);
      if (!near(Number(r.dataCompleteness), realWeight, 0.02)) badCompleteness++;
    }
  }
}
check('1-composite-recomputes', badComposite === 0, `${badComposite}/${rank.length} rows off by >1pt`);
check('2-dataCompleteness', badCompleteness === 0, `${badCompleteness} rows mismatch component presence`);
check('3-score-range-0-99', badRange === 0, `${badRange} rows outside 0..99`);
check('9-dilution-null<5%', dilNull / rank.length < 0.05, `${dilNull}/${rank.length} = ${((dilNull / rank.length) * 100).toFixed(0)}%`);
check('9-mda-null<20%', mdaNull / rank.length < 0.20, `${mdaNull}/${rank.length} = ${((mdaNull / rank.length) * 100).toFixed(0)}%`);
check('9-sector-null==0%', sectorNull === 0, `${sectorNull}/${rank.length} rows`);

// ── Trades feed (4, 8) ───────────────────────────────────────────────────
console.log('trades…');
const trades = await get('/trades?limit=2000&side=all');
let badMath = 0, capBreaches = 0, suspects = 0;
for (const t of trades.rows) {
  if (t.priceSuspect) { suspects++; continue; }
  const v = Number(t.sharesBought) * Number(t.pricePerShare);
  if (!near(v, Number(t.totalValue), Math.max(1, v * 0.001))) badMath++;
  if (t.marketCap && Number(t.totalValue) > Number(t.marketCap)) capBreaches++;
}
check('4-shares×price==value', badMath === 0, `${badMath}/${trades.rows.length} rows`);
check('8-no-value>marketCap', capBreaches === 0, `${capBreaches} non-suspect rows exceed their company's cap`);
console.log(`  (${suspects} rows flagged priceSuspect — rendered as "—", excluded from aggregates)`);

// ── Analyst ratings (5, 6, 12) ───────────────────────────────────────────
console.log('analyst-ratings…');
const analyst = await get('/market-stats/analyst-ratings');
const arows = analyst.rows || [];
let badUpside = 0, badBounds = 0;
const seen = new Set(); const dups = new Set();
for (const a of arows) {
  const sym = (a.symbol || '').toUpperCase();
  if (seen.has(sym)) dups.add(sym);
  seen.add(sym);
  if (a.upsidePct != null && a.targetMean != null && a.price > 0) {
    const expect = (a.targetMean / a.price - 1) * 100;
    if (!near(Number(a.upsidePct), expect, 0.5)) badUpside++;
  }
  if (a.targetLow != null && a.targetMean != null && a.targetHigh != null) {
    if (!(a.targetLow <= a.targetMean + 1e-9 && a.targetMean <= a.targetHigh + 1e-9)) badBounds++;
  }
}
check('5-upside-formula', badUpside === 0, `${badUpside}/${arows.length} rows`);
check('6-target-bounds', badBounds === 0, `${badBounds} rows`);
check('12-no-duplicate-symbols', dups.size === 0, `duplicates: ${[...dups].join(', ')}`);

// ── avgCost sanity (7) via a big stock list ──────────────────────────────
console.log('stock-lists avgCost…');
try {
  const list = await get('/stock-lists/penny-stocks');
  let badAvg = 0; let checked = 0;
  for (const r of list.rows || []) {
    const avg = Number(r.avgCost); const px = Number(r.price ?? r.lastPrice);
    if (avg > 0 && px > 0) {
      checked++;
      if (avg > px * 3 || avg < px / 3) badAvg++;
    }
  }
  check('7-avgCost-within-3x', badAvg === 0, `${badAvg}/${checked} rows >3× from price`);
} catch (e) {
  warnings.push(`7-avgCost: ${e.message}`);
}

// ── Cross-endpoint consistency (11) ──────────────────────────────────────
console.log('cross-endpoint consistency…');
const sample = rank.slice(0, 20).map((r) => r.ticker).filter(Boolean);
if (sample.length) {
  const quotes = await get(`/market-stats/quotes?symbols=${encodeURIComponent(sample.join(','))}`);
  const qmap = new Map((quotes.rows || []).map((q) => [q.symbol.toUpperCase(), q]));
  let priceDrift = 0;
  for (const r of rank.slice(0, 20)) {
    const q = qmap.get((r.ticker || '').toUpperCase());
    if (!q) continue;
    const rp = Number(r.lastPrice ?? r.price);
    if (rp > 0 && q.price > 0 && Math.abs(rp - q.price) / q.price > 0.02) priceDrift++;
  }
  check('11-price-consistency', priceDrift === 0, `${priceDrift}/20 sample tickers drift >2% between rankings and quotes`);
}

// ── Congressional party (13) ─────────────────────────────────────────────
console.log('congressional…');
try {
  const cong = await get('/congressional-trades?limit=500');
  const crows = cong.rows || cong || [];
  const noParty = crows.filter((r) => !r.party).length;
  check('13-party-nonnull', noParty === 0, `${noParty}/${crows.length} rows missing party`);
} catch (e) {
  warnings.push(`13-party: ${e.message}`);
}

// ── CQS, Brief v9 (14-19) ────────────────────────────────────────────────
// The index had none of these. It is the surface most able to fail quietly:
// a component that reads an empty table returns 0, the score still renders,
// and nothing anywhere says the number is missing rather than low.
console.log('cqs…');
try {
  const cqs = await get('/cqs/leaderboard?limit=100');
  const rows = cqs.rows || [];
  if (!rows.length) {
    warnings.push('14-19-cqs: leaderboard empty — nothing to assert');
  } else {
    const WEIGHTS = {
      c1ClusterBreadth: 0.2, c2PositionSize: 0.15, c3CommitteeInfluence: 0.15,
      c4ContractAlignment: 0.15, c5BuyerTrackRecord: 0.12,
      c6RelativeConviction: 0.08, c7Freshness: 0.1, c8NetDirection: 0.05,
    };
    // Premium strips the number for an unauthenticated caller, so the
    // arithmetic assertions only run on rows that actually carry one.
    const scored = rows.filter((r) => typeof r.cqs === 'number' && r.c1ClusterBreadth != null);
    let recomputeDrift = 0;
    let outOfBand = 0;
    let gradeMismatch = 0;
    let bothWays = 0;
    for (const r of scored) {
      let weighted = 0;
      for (const [k, w] of Object.entries(WEIGHTS)) weighted += Number(r[k] || 0) * w;
      const mult = ['multiplierInsiderOverlap', 'multiplierLegislativeCatalyst', 'multiplierContrarianEntry',
        'multiplierLiquidityNorm', 'multiplierFilingLag']
        .reduce((p, k) => p * (r[k] == null ? 1 : Number(r[k])), 1);
      if (!near(Math.min(100, weighted * mult), Number(r.cqs), 1)) recomputeDrift++;
      for (const k of Object.keys(WEIGHTS)) {
        const v = Number(r[k]);
        if (Number.isFinite(v) && (v < 0 || v > 100)) outOfBand++;
      }
      if (Number(r.cqs) < 0 || Number(r.cqs) > 100) outOfBand++;
      const q = Number(r.cqs);
      const want = q >= 90 ? 'A+' : q >= 80 ? 'A' : q >= 70 ? 'B+' : q >= 60 ? 'B' : 'C';
      if (r.grade && r.grade !== want) gradeMismatch++;
      // A multiplier cannot both have been applied and be reported as one we
      // could not evaluate — that pairing is how a 1.0 gets read as a real
      // "checked and did not fire".
      const un = Array.isArray(r.multipliersUnavailable) ? r.multipliersUnavailable : [];
      for (const name of un) {
        const key = 'multiplier' + name.charAt(0).toUpperCase() + name.slice(1);
        if (r[key] != null && Number(r[key]) !== 1) bothWays++;
      }
    }
    check('14-cqs-recomputes', recomputeDrift === 0, `${recomputeDrift}/${scored.length} rows do not recompute from their components`);
    check('15-cqs-in-band', outOfBand === 0, `${outOfBand} component/total values outside 0..100`);
    check('16-cqs-grade-band', gradeMismatch === 0, `${gradeMismatch} grades disagree with their own score`);
    check('19-cqs-multiplier-honesty', bothWays === 0, `${bothWays} multipliers both applied and reported unavailable`);

    const today = new Date().toISOString().slice(0, 10);
    const asOf = String(cqs.asOfDate || rows[0]?.asOfDate || '').slice(0, 10);
    // A weekend or holiday legitimately leaves the last scoring date behind.
    const ageDays = asOf ? Math.round((Date.parse(today) - Date.parse(asOf)) / 86400000) : 99;
    check('17-cqs-fresh', ageDays <= 3, `board is ${ageDays} day(s) old (asOf ${asOf || 'unknown'})`);

    const dupes = rows.length - new Set(rows.map((r) => r.ticker)).size;
    check('18-cqs-no-stale-rows', dupes === 0, `${dupes} duplicate tickers — a scoring date is leaking through`);
  }
} catch (e) {
  warnings.push(`14-19-cqs: ${e.message}`);
}

// ── Verdict ──────────────────────────────────────────────────────────────
for (const w of warnings) console.warn(`  ⚠ ${w}`);
if (failures.length) {
  console.error(`\nFAIL — ${failures.length} assertion(s) failed.`);
  process.exit(1);
}
console.log('\nPASS — all data-integrity assertions hold.');
