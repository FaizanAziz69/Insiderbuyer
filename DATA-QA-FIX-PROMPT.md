# Data Integrity Remediation — InsiderBuying

You are fixing data coverage and data correctness across this repo (NestJS backend + Next.js frontend).
A black-box QA pass against production (`https://insiderbuyer-hwrc.vercel.app`) produced the verified
findings below. **Every number here was measured, not guessed — re-verify before you change anything,
and re-verify after.**

We have just upgraded to a **paid FMP plan** (`FMP_API_KEY` in backend env, base `https://financialmodelingprep.com/stable`).
Most of the missing data can now come from FMP instead of the slow/failing SEC-XBRL and cron-backfill paths.

## Goal

Three outcomes, in priority order:

1. **No missing data** — every column the UI renders has a value, or the column is explicitly hidden.
2. **No wrong data** — no implausible values reach any user-facing surface.
3. **Identical data everywhere** — the same ticker shows the same price, market cap, insider score and
   7-day chart on every page that displays it.

---

## Part 1 — Verified findings (re-verify each one first)

### 1.1 Insider Score is absent from every stock-list table

`/stock-lists/*` row objects **do not contain an `iqs` key at all** for most rows:

| List | Rows | Rows with no score |
|---|---|---|
| `penny-stocks` | 1000 | **945** |
| `large-cap` | 62 | **62** |
| `faang` | 8 | **8** |
| `warren-buffett` | 26 | **24** |

Root cause: `backend/src/stock-lists/stock-lists.service.ts:750-770` back-fills `row.iqs` by looking up
`iqs.getRankings({ limit: 500 })` — but **the scored universe is only 459 companies** while these lists
top up from a much larger curated universe. Anything outside those 459 can never resolve.

Second root cause: the scored universe is small because scoring requires qualifying Form 4 open-market
buys in the last 90 days from our own SEC ingest subset.

### 1.2 The 7-day chart is never joined into list tables

`GET /market-stats/spark?symbols=…` **works correctly** and returns 7 points per symbol. It is only
consumed by 4 frontend components (`Sparkline.tsx`, `IndexPulse.tsx`, `ArticleStockCard.tsx`,
`market-data/top-gainers/page.tsx`). No stock-list or ranking table payload carries spark data.

### 1.3 Score components are overwhelmingly null

Measured across all 459 scored rows:

| Component | Weight | Null on |
|---|---|---|
| Dilution | 5% | **458 / 459 (100%)** |
| MD&A sentiment | 10% | **454 / 459 (99%)** |
| Sector sentiment | 22% | **216 / 459 (47%)** |
| Momentum | 10% | 75 / 459 (16%) |

Median `dataCompleteness` = **0.67**. No stock exceeds **0.87** — not one company has all six components.
The composite math itself is correct (459/459 recompute exactly to the spec formula), so this is purely
an input-coverage problem.

Root causes:
- **Dilution**: `backend/src/ingestion/quote.client.ts:45-88` derives `sharesOutstandingYearAgo` from SEC
  XBRL `dei` tags and requires a datapoint ≥180 days older. That rarely exists. Backfill runs at
  `limit: 40` per 6-hour cron (`ingestion.service.ts:279`).
- **MD&A**: backfill runs at `limit: 12` per 6-hour cron (`ingestion.service.ts:274`) and calls Claude
  per company — ~48/day for 459 companies.
- **Sector sentiment**: `sector-sentiment.service.ts:27-40` maps a company's sector *string* to a sector
  ETF. Unmapped strings (e.g. `"Deep Sea Foreign Transportation of  Freight"`, note the double space)
  yield null.

### 1.4 Implausible values reach the UI because the guard is applied inconsistently

SEC filings genuinely contain filer errors. Two confirmed against raw EDGAR XML:
- NMM `0001193125-26-318541`, 2026-07-23: filed `transactionPricePerShare = 748119` (should be ~74.81)
- APCX `0001683168-26-005941`: filed `2900` / `2895` on a ~$2 stock

The scoring loop guards correctly (`iqs.service.ts:335-345`: `MAX_PLAUSIBLE_TX_VALUE` + 25× price sanity),
so `totalPurchaseValue` excludes them. **Three other paths have no guard:**

| Path | File | Symptom |
|---|---|---|
| `avgCost` aggregate | `iqs.service.ts:1720-1730` | raw `SUM(shares×price)/SUM(shares)` → NMM shows **$51,152.54** vs $78.99 price; **15 companies >3× off** |
| Public trades feed | `iqs.service.ts:1629` `getAllTrades` | renders a single **$846,122,589** Navios buy |
| Article generator | `backend/src/content/*` | published *"$847.3 million in insider accumulation"* and *"a $58 million director purchase"* |

### 1.5 `avgCost` uses the wrong time window

`iqs.service.ts:1720-1730` sums **all** `transactionCode = 'P'` rows ever — there is no date filter,
while every other metric uses a 90-day window. This is why TSM shows `avgCost` $73.97 against a $419.99
price. The column sits in a 90-day table, so it must use the 90-day window.

### 1.6 Individual bad values

- **CHWY market cap = `1949`**, which is exactly `lastPrice (19.49) × 100`. Real cap is billions. This
  maxes out buying sub-factor A for any CHWY buy.
- Company name contains a literal escape artifact: `"Protagenic Therapeutics, Inc.\new"`.
- A raw ISIN is used as a ticker: `DE000A460Q50.SG` (its `avgCost` $1000 vs price $99.50 — exactly 10×).
- **7 companies count a fund filer** in the "insiders now hold ~X%" reasoning string, which the IQ Score
  v2.1 spec §2G explicitly excludes. **COE reads "insiders now hold ~100.0% of the company."**
  The fund filter is `IqsService.FUND_NAME` (`iqs.service.ts:401`) — it is not catching all fund filers.
- **PYPL is duplicated** in `/market-stats/analyst-ratings` (byte-identical row twice).
- **25 analyst rows have negative upside** rendered as `(−8.2% Upside)` — should read "Downside".

### 1.7 Congressional data

- `party` is **null on 216/216 rows** → the party chip renders permanently blank.
- `reportedDate` clusters on ingest dates (77 rows `2026-08-06`, 75 on `08-05`, 39 on `08-04`) — it is
  being set to the **scrape date, not the STOCK Act disclosure date**. This makes 174/216 (81%) look like
  late filings against the page's own "within 45 days" copy.
- Only **8 distinct people** across 216 rows.
- Verify **"Alan Armstrong"** (23 rows) is actually a member of Congress — that is the name of the
  Williams Companies CEO and may be feed contamination.
- Trades date back to `2024-03-08` despite a "90 days" default filter on the page.

### 1.8 Score description copy is inconsistent (3 versions on one page)

`frontend/app/insiders/hot/page.tsx`:
- `:279` — "IQ Score — a 0–99", six components ✅ correct
- `:37` (FAQ) — "0–99 composite of **five** weighted parts… buying **50%**, sector **25%**" ❌ **publishes
  the superseded v2.0 weights**
- `:426` — "Insider Score, a **0–100** composite", four factors ❌

Site-wide the range is split: `/about`, `/business`, `/learn/insider-buying`, `/insider-report` all say
0–100; `/score-explainer` says 0–99. The engine caps at 99 (`scoring-config.ts:23 SCORE_CEILING = 99`).
`docs/iqs-methodology.md:3-7` still documents the v2.0 five-component formula and is likely the source
of the stale strings.

---

## Part 2 — Required work

### Task A — One shared plausibility guard (do this first; highest user-visible impact)

Extract the guard currently inline at `iqs.service.ts:335-345` into a single exported helper, e.g.
`backend/src/iqs/tx-sanity.ts`:

```ts
export function isPlausibleTx(sharesBought, pricePerShare, lastPrice): boolean
export function plausibleTxSql(alias: string): string  // reusable SQL predicate
```

Apply it at **every** site that reads transactions:
- `iqs.service.ts:1720-1730` (`avgCost`) — and add the 90-day window here (Task B)
- `iqs.service.ts:1629` (`getAllTrades`) — the public feed
- the article/content generator in `backend/src/content/`
- anywhere else `sharesBought * pricePerShare` appears

**Do not silently drop the row from the trades feed.** A filing that exists should still be listed —
flag it (`priceSuspect: true`) and have the UI render the value as "—" with a tooltip pointing at the
SEC filing, so we neither publish a false $846M nor hide a real filing. Excluding it from *aggregates*
is correct; deleting it from the *feed* is not.

Add unit tests using the two real EDGAR cases (NMM `748119`, APCX `2900`) as fixtures.

### Task B — `avgCost` correctness

In `iqs.service.ts:1720-1730`: add `t."transactionDate" >= :since` (90 days, from `WINDOWS.buys`) and
the Task A guard. Confirm `avgCost` afterwards is within a sane band of `lastPrice` for all 459 rows.

### Task C — Fill the missing components via FMP

Before writing code, probe which endpoints our plan actually allows and record the result:

```bash
for p in profile key-metrics-ttm ratios-ttm income-statement shares-float \
         sector-performance-snapshot price-target-consensus grades-consensus \
         insider-trading/search senate-trades house-trades historical-price-eod/light; do
  echo -n "$p -> "
  curl -s -o /dev/null -w "%{http_code}\n" \
    "https://financialmodelingprep.com/stable/$p?symbol=AAPL&apikey=$FMP_API_KEY"
done
```

Then wire up, keeping SEC as the source of record for Form 4s and FMP as the fundamentals/market source:

- **Dilution (100% null → target <5% null)**: replace the fragile SEC-XBRL `sharesOutstandingYearAgo`
  derivation with FMP. Use diluted weighted-average shares from `income-statement` (annual, last 2
  periods) or `key-metrics`. Keep the SEC path as fallback.
- **Sector sentiment (47% null → 0%)**: stop mapping free-text SIC descriptions to ETFs. Either use
  FMP's sector performance directly, or normalise the SIC string to a canonical sector first (and fix the
  double-space bug in `"Deep Sea Foreign Transportation of  Freight"`). Every scored company must resolve
  to a sector.
- **MD&A (99% null)**: the bottleneck is `limit: 12` per 6h. Raise the batch, add a proper work queue,
  and cache by accession number so we never re-analyse the same filing. If full coverage is not
  achievable, see Task E.
- **Market cap / price**: source from FMP `profile` and fix the CHWY-class bug (Task D).

### Task D — Market cap / price single source of truth

Find why CHWY's market cap is `lastPrice × 100` and fix the root cause, not the row. Then add a
validation step at ingest: reject or quarantine a market cap when
`abs(marketCap - lastPrice * sharesOutstanding) / marketCap > 0.25`, and log it. Backfill-correct all
existing rows. Also fix the `"…, Inc.\new"` name-escaping bug and drop or map ISIN-style tickers
(`DE000A460Q50.SG`).

### Task E — Score coverage and honesty

The scored universe is 459 while lists render 1000+. Two things:

1. **Expand the universe** — use FMP `insider-trading/search` to score every ticker with qualifying
   open-market buys, not just our SEC ingest subset.
2. **Be honest where a score genuinely cannot exist.** A company with no insider buys in 90 days has no
   Insider Score by definition — that is correct, not a bug. Render an explicit "No recent insider
   buying" state rather than an empty cell. **Never fabricate a score to fill a column.**

Also surface `dataCompleteness` in the UI (it is already computed correctly). A score built on 45% real
data should not look identical to one built on 87%.

### Task F — Join spark into every table that shows a chart column

Add spark data to the stock-list and ranking payloads (batch through the existing
`/market-stats/spark` path — do not N+1). Cache it; it is the same 7 points for every table on the page.

### Task G — Congressional data

Fix `party` (null on 100% of rows). Use the real disclosure date rather than the scrape date for
`reportedDate` — or, if the source genuinely lacks it, rename the column so it does not imply a filing
date, and drop the "within 45 days" claim from the page copy. Verify the politician roster.

### Task H — Copy consistency

Single source of truth for the score description. Delete the stale v2.0 strings at
`frontend/app/insiders/hot/page.tsx:37` and `:426`. Pick **0–99** everywhere (that is what the engine
does) and update `/about`, `/business`, `/learn/insider-buying`, `/insider-report`. Regenerate
`docs/iqs-methodology.md` from `scoring-config.ts` so weights can never drift from code again.

Related: `iqs.service.ts:1394-1432` hardcodes sub-factor weight literals instead of reading
`BUYING_SUBWEIGHTS` — the explainer can drift from the actual math. Fix that too.

### Task I — Dead config

`WINDOWS` (`scoring-config.ts:123-129`) and `PLANNED_BUY_MULTIPLIER` (`:164`) are exported and never
referenced. The 90/45/20/14-day windows are re-hardcoded at `iqs.service.ts:210-212`. Either wire them
up (the 10b5-1 planned-buy discount is required by the spec) or delete them. Do not leave config that
lies about what the code does.

---

## Part 3 — Acceptance criteria

Write a script `scripts/data-qa.ts` (or `.py`) that runs against a deployed URL and **exits non-zero**
on any regression. It must assert:

1. IQ composite recomputes to `0.45B + 0.22S + 0.10M + 0.10Mo + 0.08P + 0.05D − litigation` for 100% of
   rows (this passes today at 459/459 — do not break it).
2. `dataCompleteness` matches the components present, for 100% of rows.
3. Every score is within `0..SCORE_CEILING`.
4. `shares × price == totalValue` for 100% of trades (passes today at 2000/2000).
5. Analyst `upsidePct == (targetMean/price − 1) × 100` (passes today at 284/284).
6. `targetLow ≤ targetMean ≤ targetHigh` (passes today).
7. **New**: no `avgCost` more than 3× from `lastPrice` (fails today on 15 companies).
8. **New**: no user-facing transaction value exceeding its company's market cap (fails today on APCX, CHWY).
9. **New**: dilution null rate < 5%, MD&A null rate < 20%, sector null rate == 0%.
10. **New**: no list table row renders a blank Insider Score cell without the explicit
    "no recent insider buying" state.
11. **New**: for a sample of 20 tickers, price and market cap are byte-identical across
    `/rankings`, `/companies/:ticker`, `/market-stats/quotes`, `/market-stats/analyst-ratings`,
    and every stock-list that contains them.
12. **New**: no duplicate symbols in any list payload (fails today on PYPL).
13. **New**: `party` non-null on 100% of congressional rows.

Wire it into CI.

## Constraints

- **Do not change the scoring formula, weights, curves, or the litigation/pedigree design.** They are a
  faithful implementation of `~/Downloads/iq-score-v2.1-spec.md` and were verified correct. This task is
  about inputs and presentation, not the model.
- Keep `PEOPLE_SIGNALS_LIVE` dark by default (spec §12 requires the 4-week audit first).
- Weights and thresholds stay in `scoring-config.ts`, never inlined.
- Every FMP call must degrade gracefully — if the plan does not cover an endpoint, fall back to the
  existing source and log it, never crash the ingest.
- There are currently **zero tests in this repo**. Add them for every guard and every fix you make.

## Start here

Re-verify findings 1.1, 1.3 and 1.4 against production before touching code, then do Task A first —
it stops false dollar figures being published in articles, which is the highest-severity issue.
Report what you verified, what you fixed, and what you deliberately left alone.
