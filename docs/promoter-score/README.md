# Promoter Score — operating runbook

Workstream F of *Developer Project Brief v2* (Sept 1 2026): IR Budget /
Promoter Score. Canadian venture issuers only, per §2.2.

## What it is

TSX Venture Policy 3.4 (and CSE policy) require a listed issuer to disclose
every investor-relations, promotional and market-making agreement by news
release — provider, compensation, term, options granted — and to announce any
amendment, extension or termination the same way. We read those releases,
store one row per issuer↔provider contract, and score each issuer per quarter.

## Where the data comes from, and what was ruled out

| Source | Verdict |
|---|---|
| **Issuer news releases** | **In use.** The Policy 3.4 disclosure itself. Public the moment it crosses the wire. |
| SEDAR+ | Out. `www.sedarplus.ca` answers a plain HTTPS request with 403 from every path — bot protection that expects a real browser. Nothing is lost: the IR filing is **Form 3C**, which goes to the Exchange, not to SEDAR+. |
| TSXV daily bulletins | Out. Free and beautifully structured (CNW distributes them), but they carry listings, halts, financings and delistings. An IR agreement gets no bulletin type. Checked a full bulletin day: zero mentions of investor relations. |

Discovery indexes the wires through Google News RSS — the same index
`news.service.ts` already relies on — with 15 phrase variants rather than one
catch-all query, because each query is capped at 50 items and a wide query
returns the same 50 popular ones while losing the small issuers that are the
whole point. Items are resolved to their publisher URL and the release is read
from the wire.

Only wires that serve full release text to a plain GET are read
(`FULL_TEXT_HOSTS` in `ir-discovery.service.ts`). Aggregators that paraphrase —
Stock Titan, kalkine, Yahoo — are skipped on purpose: a paraphrase must never
become a parsed contract row.

**Newsfile sits behind an AWS WAF that challenges bursts.** The per-host pacing
in `fetchRelease` is a correctness requirement, not politeness. A challenge is
detected (`awsWafCookie` in a 200 response), logged, and backed off ten
minutes.

## The parser

`ir-parser.ts` is pure — text in, fields and a confidence out, no I/O. Run it
against a corpus without touching the database:

```bash
npm run build
node dist/promoter/ir-parser.spec.js                 # unit assertions
node dist/promoter/ir-parser.spec.js <corpusDir>     # corpus replay + parse rate
```

The corpus directory needs `corpus.json` (`[{file,title,url}]`) and a
`corpus/` folder of `<file>.txt` release bodies.

## The database path

SQL is the part a TypeScript compiler cannot check, so it has its own run
against a real Postgres — it builds its own schema, exercises every write and
read the three surfaces depend on, and drops the schema again:

```bash
docker compose up -d postgres
npm run build
node dist/promoter/promoter.service.spec.js \
  postgres://iqs_user:iqs_password@localhost:5432/iqs_db
```

51 checks. Four real bugs came out of writing it, all of which would have
surfaced first on a production ingest:

- an unused `$1` in the `rescore` query — Postgres refuses the statement
  outright with *could not determine data type of parameter $1*;
- an in-scope release whose provider could not be read produced **no row at
  all**, so it never reached the review queue and was lost in silence. It now
  writes a provider-less placeholder: held for a human, invisible to every
  public surface and to the scores until someone names the counterparty, at
  which point it becomes a normal contract and the firm joins the lead list;
- an out-of-range weight silently snapped that weight back to the shipped
  default instead of being ignored — one typo would have moved a published
  score for no reason anyone asked for;
- `/promoter/issuer/:ticker` answered 200 with an empty shell for a ticker
  whose only disclosure was still in review, so the company panel would have
  claimed zero agreements when the truth was "not read yet".

**Measured on 39 harvested releases (2026-09-14):** 29 in-scope disclosures,
41 agreements, 9 filtered out as not-in-scope. Ticker 100%, provider 90%,
term 78%, a fee figure on ~50%, auto-accepted at 59% with the rest queued for
review. Most of the review queue is pages where a republisher served the body
lazily and the release text never arrived — a fetch limitation, flagged as
`Could not isolate the release body`, not a parse failure.

### Things the parser refuses to get wrong

- **Option grants to directors are not promoter compensation.** These releases
  routinely bundle an unrelated company-wide grant into the same announcement.
  Dinero Ventures granted 1,300,000 options to "directors and consultants" in
  the same breath as saying its IR firm would receive none. Options are only
  counted from a sentence that names *this provider*.
- **US issuers never enter the dataset.** A Canadian listing is part of
  relevance, not just a field (§2.2).
- **The issuer is not its own provider.** Source Rock Royalties writes
  `Source Rock Royalties Ltd. ("Source Rock")(TSXV: SRR )`; the issuer's own
  short form sits between its name and the ticker, and missing it made the
  issuer its own IR firm.
- **One release can disclose many agreements.** AXCAP Ventures disclosed seven
  providers at once, Kalo Gold three. Each gets its own row and its own slice
  of the text.

## The score (§2.4)

Per issuer per quarter, five metrics, each percentile-ranked against sector
peers (against the whole quarter's cohort where a sector has fewer than five
issuers), then blended:

| Component | Default weight |
|---|---|
| Spend / market cap | 40 |
| Total disclosed spend | 20 |
| Change vs prior quarter | 15 |
| Options notional to promoters | 15 |
| Concurrent providers | 10 |

§2.4 says the exact weights come from George. They are **data, not code** —
`PUT /promoter/admin/weights` changes them without a deploy, and
`/promoter/methodology` reads the live values so the published explanation
cannot drift from the arithmetic. Components with no data are dropped and the
remaining weights rescaled, so an issuer FMP has no market cap for is ranked on
what it does disclose.

Contracts are pro-rated over the months they actually overlap the quarter. A
contract with neither an end date nor a term counts for one month, never
forever.

FX to CAD is a static table, deliberately: these are contract values, and a
live rate would silently change last quarter's number every night.

## Editorial firewall (§2.6)

Nothing in `promoter.service.ts` reads agency-client status — no join to the
press or B2B tables, no client flag in any query. The requirement is that
client status has "zero effect on scores, rankings, or inclusion", and the way
to make that provable is for the data not to be reachable from the scoring
path at all.

## Framing (§2.6, open)

George owns the house position on whether promotion spend reads as visibility
or as a caution index. Until he settles it the copy is descriptive only — what
was disclosed, by whom, for how much — and the score badge uses a single
neutral accent ramp rather than a red-to-green one, which would answer the
question in the UI before he answers it in copy. When the position arrives it
is a copy change in `app/promoter-score/PageClient.tsx` and the methodology
section, not a rebuild.

## Endpoints

Public:

```
GET /api/promoter/ranking?quarter=&sector=&sort=score|spend|perMcap|contracts&limit=
GET /api/promoter/issuer/:ticker
GET /api/promoter/methodology
GET /api/promoter/status
```

B2B feed — `x-feed-token: $PROMOTER_B2B_TOKEN` (the admin token also opens it):

```
GET /api/promoter/firms?search=&limit=
GET /api/promoter/export.csv?limit=
```

§2.5 wants this behind "a separate B2B account tier, not the retail
subscription". There is no such tier yet, so the gate is a data-feed key —
real, not notional. Swap it for the tier when there is one.

Admin — `x-admin-token`:

```
GET  /api/promoter/admin/review?limit=
POST /api/promoter/admin/review/:id      { providerName, monthlyFee, …, actor, reason }
GET  /api/promoter/admin/audit?agreementId=&limit=
PUT  /api/promoter/admin/weights         { perMcap, spend, qoq, options, contracts, actor }
POST /api/promoter/admin/ingest?limit=
POST /api/promoter/admin/reparse?limit=
POST /api/promoter/admin/rescore?quarters=
POST /api/promoter/admin/resolve-issuers?max=
```

`admin/reparse` re-reads every stored release with the current parser. §2.3
keeps the raw disclosure text for exactly this: without it a parser
improvement only ever reaches releases published after it shipped, and
everything already stored stays wrong for good. No wire is touched, and a
hand-reviewed row still wins over a re-read.

The review queue is in the Editorial Desk under **IR review queue**. Saving a
row writes the previous version to `ir_audit` and rescores — §2.5 wants an
audit trail because IR firms will dispute the numbers.

## Cadence

`@Cron('20 5 * * *')` — discovery, parse, issuer resolution and rescore, once a
day. §6 wants a parsed row within 24 hours of a disclosure; the release must be
issued "promptly", so a daily pass with the discovery look-back clears it.

## Tables

`ir_disclosures` (raw text kept, per §2.3) · `ir_agreements` (one per contract;
unique on issuer + provider + start date, so re-reading the same release from a
second wire is idempotent) · `ir_firms` (canonical provider table — this *is*
the B2B lead list) · `ir_issuers` (our own, because TSXV/CSE names are not in
the US `companies` table) · `promoter_scores` · `ir_audit` · `promoter_config`.

A hand-reviewed row is the record of truth: a later re-read of the same release
never overwrites a correction. A row with no `provider_slug` is a disclosure
held for review — it is excluded from scoring, the issuer page, the firm list
and the export until an editor names the provider.

## Still open

- **Score weights** — George owes the real numbers (§5). Defaults are live and
  changeable without a deploy.
- **Retail framing** — George owes the house position (§2.6). Copy is neutral
  until then.
- **B2B account tier** — the feed is gated by a shared key, not per-account.
- **Coverage** — discovery is a very good index of the wires, not a filing
  feed. `/promoter/status` exposes the query list so a miss can be traced to a
  phrasing no query covers.
- **FMP has no market cap for the smallest venture names** (DNO.V returned
  nothing on the first release we parsed). Those issuers score without the
  spend/market-cap leg rather than being pushed down for the gap.
