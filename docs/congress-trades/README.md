# Top Ranking Congress Trades — operating runbook

*Developer Project Brief v5* (Sept 14 2026): congressional trades cross-referenced
against committee influence and federal contract awards, scored by the Congress
Trade Score and gated by an AI verification agent.

## What it is

Three public datasets that nobody joins: what members of Congress trade, which
agencies their committees oversee, and which companies those agencies pay. The
product is the join. A row only exists when all three legs hold at once (§2
Stage 3):

1. a member **holds or traded** ticker T inside the window, **and**
2. agency A **awarded a contract** to T or a subsidiary, **and**
3. the member's committee **has jurisdiction** over A.

§7 P1 accepts only when there are "zero flags without all three legs", so the
legs are checked in one place and the evidence chain is assembled in the same
breath as the flag. Reconstructing it later means reconstructing it from
sources that may already have moved.

## Where the data comes from

| Need | Source | Why this one |
|---|---|---|
| Contract awards | USAspending.gov `/api/v2/search/spending_by_award/` | Free, no key, and it is the authoritative award record. FPDS-NG sits behind it. |
| Committee and subcommittee seats, with titles | `unitedstates/congress-legislators` (`committee-membership-current`, `committees-current`, `legislators-current`) | Free, versioned, and it carries the member's title on each seat. |
| Vendor → ticker | USAspending parent recipient, then a name roll-up, then SEC `company_tickers.json`, then GLEIF | The order is cheapest-first; see below. |
| Committee → agency jurisdiction | Built in-house, versioned in the database | §6 calls this "the proprietary layer". It is the judgement we add. |

**Stage 1 reads the committee files itself rather than reusing the existing
congress roster.** That roster keeps a flat list of committee *names*: it
collapses each subcommittee into its parent and drops the member's title. §3
scores both — committee role is 30% of the CTS and a subcommittee seat ranks
above full-committee-only membership — so weakening the roster four other
surfaces depend on would have been the wrong trade. First live run: **3,895
committee seats across 531 members, 2,552 of them on subcommittees.**

## The jurisdiction table

Seeded at **version 1 with 75 mappings**, then edited in the Editorial Desk.
Every edit publishes a *new* version rather than mutating the current one, and
**every flag records the version that judged it** (§2 Stage 3). A mapping that
changes next Congress must not silently rewrite last year's published rows.

Appropriations are mapped at **subcommittee** level on purpose. Giving the full
Committee on Appropriations blanket jurisdiction over every agency in the
budget is one line that would flag every appropriator against every contract in
the country, and drown the leaderboard in noise that means nothing. The seed
maps each appropriations subcommittee to the agencies in its own bill.

The seed is deliberately conservative: each rule is a committee's own published
jurisdiction, not an inference. A committee that merely holds hearings about an
industry is not given jurisdiction over that industry's regulator, because that
manufactures flags.

## Entity resolution, and the §7 P1 number

The path is §2 Stage 3's, in cheapest-first order: our own covered universe →
USAspending's parent recipient → SEC registrant file → subsidiary name roll-up
→ GLEIF → legal-form decision. Each hop that decides stops the chain, and the
evidence chain is stored per mapping so the public surface can show how a
vendor reached a ticker.

**Measured on a live run (60 vendors decided):**

| Outcome | Count | Share |
|---|---|---|
| Ticker resolved | 21 | 35% |
| Not publicly listed | 16 | — |
| To the manual queue | 23 | — |
| **Automatic decision rate** | **37** | **61.7%** |

§7 P1 asks for **≥90%**, and 61.7% is the honest number today. The gap is not
mostly a resolver problem: **most federal contractors are not listed companies
at all.** Caddell Construction, Greenberry Industrial, HDR-OBG A Joint Venture
and Integrated Laboratory Systems were all decided "not publicly listed", and
all four decisions are correct. A joint venture cannot have a ticker by
construction.

Which is why **"resolved" has to be defined with George before the acceptance
test means anything** (§8 open item). If it means "a ticker was found", 90% is
a target set against the structure of the federal contracting market rather
than against the quality of the code. If it means "a decision was reached —
ticker, or a durable *not publicly listed*", it is a real engineering target
and the remaining 23 are the tail §2 already expects to send to a human.

## The score (§3)

| Factor | Default weight |
|---|---|
| Committee role | 30 |
| Timing, trade date against award date | 30 |
| Position size against the member's typical trade | 20 |
| Award materiality against company revenue | 20 |

Weights are **data, not code**: `PUT /api/congress-trades/admin/weights`
changes them with no deploy, and stored components are re-blended without
re-reading a single source. §3 leaves the final numbers with George.

Components with no data are **dropped and the remaining weights rescaled**, not
scored zero. A member whose typical trade size cannot be computed should be
ranked on what is known about them, not pushed down the leaderboard for a gap
in someone else's dataset.

§3 is explicit about what the number is not: "The CTS measures documented
proximity between disclosed facts. It is explicitly NOT a corruption
probability, and no surface may describe it as one." That is why the badge uses
one neutral hue rather than a red-to-green ramp, which would make the claim
without a word of copy.

## §5, enforced in code

§5 says the editorial rules are "enforced at the template level, not left to
judgment". A rule enforced by judgement is a rule that fails on the day
somebody is in a hurry, so:

- **`BANNED_TERMS`** covers the five words §5 names and their synonyms, because
  "and any synonym" is the part that matters.
- **`INTENT_TERMS`** is separate and covers the failure a careful writer
  actually makes: not calling someone corrupt, but writing that they "knew", or
  "positioned themselves ahead of" an award. §5: "No inference about motive,
  knowledge, or intent — ever."
- **`flagHeadline()`** is the only function that writes a headline, so there is
  exactly one sentence shape for counsel to review.
- **A headline that trips `checkCopy()` is dropped, not published.** The engine
  logs the row and moves on rather than letting it through.
- **`STANDING_FRAME` is returned with every public payload**, so a surface
  cannot forget it. The leaderboard renders it above the table: §5 wants
  correlation-not-causation "stated plainly, not buried".

## Stage 5 — the verification agent

Nothing renders publicly without a passing verification timestamp (§7 P2).

**What is deterministic.** Re-fetching the award from USAspending and comparing
the amount, the agency and the date is arithmetic. A model is not needed for
it, must not be trusted with it, and would do it worse for money. The same goes
for checking the trade still exists as disclosed and the member still sits on
the committee that gave jurisdiction.

**What the model does.** One short call per row, on prose only: it is shown the
row's verified fields and its published sentence and asked whether the sentence
claims more than the facts support. It is given no ability to rewrite anything
— §2's guardrail is that the agent "can never introduce a claim no source
supports", and the safest way to honour that is not to let it write. If the
model is unavailable it **abstains**, which leaves the row where it was: an
outage must not publish an unchecked row, and must not retire a good one
either. Model: `claude-opus-5`.

**Severity, exactly as §2 defines it:**

| Class | Case | Action |
|---|---|---|
| (a) | Data drift — amended amount, corrected award value, fixed date | Auto-corrected to the primary source, logged |
| (b) | A leg breaks — position sold, award gone, member left the committee | Row retired automatically, reason logged |
| (c) | Anything that materially changes a ranking, characterization, or adds a claim | Drafted into the human queue. Never self-published |

An award value that moves by more than 25% is treated as class (c), not (a): a
large correction is a ranking change wearing drift's clothes. A row waiting on
a human is pulled back to `pending`, so it leaves the public page while it
waits.

**The audit table is append-only by construction** — nothing in the service
updates or deletes `ct_audit`. Every action writes before/after values, the
evidence, and whether it was automatic or human-approved.

**User reports** (§5's corrections channel) route through the same agent: it
re-verifies the row the report points at, auto-applies clear-cut mismatches,
and queues everything else with its evidence attached. The reporter gets an
automatic status response.

## Cadence

```
@Cron('40 5 * * *')    influence map → awards → vendor resolution → flag engine
                       → board flags → verify pending → triage reports
@Cron('20 */6 * * *')  re-verify live rows
```

§7 P3 sets a 24-hour re-verification target for rows on the public leaderboard.
Four passes a day is enough headroom that one slow pass does not put the oldest
row past the target, and live rows are re-checked **oldest-verification-first**
so the row closest to breaching is always next.

## Endpoints

Public:

```
GET  /api/congress-trades/leaderboard?limit=&chamber=&party=&agency=&committee=&minScore=
GET  /api/congress-trades/member/:name
GET  /api/congress-trades/ticker/:ticker
POST /api/congress-trades/report          { flagId, message, email }
GET  /api/congress-trades/status
```

`report` is public on purpose. A corrections channel a subject of the page
cannot reach is not a corrections channel, and §5 calls fast documented
corrections "the defamation defense that matters".

Admin — `x-admin-token`:

```
POST /api/congress-trades/admin/refresh-influence
POST /api/congress-trades/admin/ingest-awards?days=&pages=
POST /api/congress-trades/admin/resolve-vendors?limit=
POST /api/congress-trades/admin/run-engine?days=
POST /api/congress-trades/admin/run-board?days=
POST /api/congress-trades/admin/verify?limit=&mode=pending|live
POST /api/congress-trades/admin/triage-reports?limit=
PUT  /api/congress-trades/admin/weights          { committeeRole, timing, positionSize, awardMateriality, actor }
PUT  /api/congress-trades/admin/config           { minAwardValue, windowDays, actor }
GET  /api/congress-trades/admin/jurisdiction?version=
PUT  /api/congress-trades/admin/jurisdiction     { changes: [{ committee, agency, kind, source, remove }], actor }
GET  /api/congress-trades/admin/vendor-queue?limit=
POST /api/congress-trades/admin/vendor-queue/:key { ticker, status, actor }
GET  /api/congress-trades/admin/review-queue?limit=
POST /api/congress-trades/admin/review-queue/:id  { decision, actor, note }
GET  /api/congress-trades/admin/audit?flagId=&limit=
GET  /api/congress-trades/admin/officials?limit=
PUT  /api/congress-trades/admin/officials         { name, stillServing, serviceHistory, source, actor }
PUT  /api/congress-trades/admin/board-seats       { name, ticker, company, role, since, until, sourceUrl, sourceForm, actor }
```

All three queues are in the Editorial Desk under **Congress trades**.

## Running it

```bash
npm run build
node dist/congress-trades/congress-trades.spec.js          # pure logic

docker compose up -d postgres
node dist/congress-trades/congress-trades.live.js \
  postgres://iqs_user:iqs_password@localhost:5432/iqs_db   # real sources, real DB
```

The live run is not a mock. It pulls today's awards from USAspending, resolves
vendors through USAspending, SEC and GLEIF, refreshes the committee map, runs
the engine, and prints the entity-resolution coverage §7 P1 is accepted on. It
creates its own schema and drops it again.

## Bugs found by running it

The live run is the reason this section exists. Every one of these would have
shipped silently.

1. **`vendor_key` is stored lower-cased, UEI included, but the SQL joins
   compared against the raw upper-case UEI.** Nothing ever matched. The manual
   queue read as empty and `resolvePending` re-resolved the same vendors every
   night without ever making progress — a pipeline that looked like it was
   working and was standing still.
2. **"Start Date" is the period-of-performance start, not the award date.** The
   Sandia management contract carries 2017, and one stored row came back dated
   **1984**. Trade windows measured against that are meaningless.
3. **Filtering by `action_date` returns every award *modified* in the window**,
   which is mostly decade-old contracts receiving paperwork: 400 awards stored
   and only **9** had a base obligation date inside six months. Switched to
   `new_awards_only`, which is also exactly what §2's materiality rule asks for
   ("de-dup of modifications so a $50K paperwork change doesn't fire the
   engine"). Modifications to an award we already hold still update it through
   the upsert.
4. **Sorting by award amount makes USAspending order the whole result set** and
   time out at 45s. Ingest wants every row anyway, so the sort is gone, the
   timeout is 90s, and there is one retry: a single slow response should not
   cost the night.
5. **The subsidiary roll-up failed because `llc` was missing from the
   legal-suffix list.** Accenture Federal Services LLC and Comcast Government
   Services LLC were marked "not publicly listed" on their legal form alone,
   silently dropping every flag against ACN and CMCSA — the roll-up §2 asks for,
   failing quietly.
6. **GLEIF is the slowest hop by a wide margin** — two calls per vendor, often
   more than a second each. A probe over 80 vendors spent minutes there. It now
   runs **last**, only on names nothing cheaper could decide, on 8s timeouts. A
   slow registry must never hold up a nightly pipeline.

## Tables

`ct_assignments` · `ct_jurisdiction` (versioned) · `ct_awards` · `ct_config` ·
`ct_vendor_map` · `ct_flags` · `ct_officials` · `ct_board_seats` · `ct_audit`
(append-only) · `ct_review_queue` · `ct_reports`.

A hand-decided vendor mapping is the record of truth: a later automatic pass
never replaces it. A flag re-run re-opens verification rather than keeping a
stale pass, because §2 Stage 5 forbids publishing anything whose verification
no longer reflects the sources.

## Still open

**George owns:**

- CTS final weights (§3, §8). Defaults are live and changeable without a deploy.
- Minimum CTS threshold and the tie-break rule for public leaderboard display
  (§8) — blocks P2 surfaces.
- Materiality threshold and timing window defaults (§8) — currently $1M and 180
  days, both configurable.
- Stage 5 escalation thresholds: which corrections auto-apply and which require
  a human (§8, severity classes a/b/c).
- **Counsel review of the surface templates and methodology page before public
  launch** (§5). The engine and the internal feed can run before it.

**Faizan owns:**

- Stage 5 per-check cost estimate at full leaderboard volume (§8).
- Entity-resolution manual-queue volume estimate after a sample run (§8), which
  is the staffing decision.

**Unmet requirement, needs a decision:**

§4 requires a public `/methodology/top-congress-trades` page and says plainly
that it "ships at launch, not after". The client removed **all** methodology
pages from the site on 2026-09-15. That requirement is currently unmet. For a
product that publishes a ranked leaderboard of named sitting politicians, the
methodology page is not decoration: it is where the limitations §5 demands be
stated — PTR ranges, disclosure lag, correlation not causation — and counsel
will look for it. This needs resolving before public launch, not after.
