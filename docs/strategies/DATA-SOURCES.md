# Brief v8 §7 — dataset source and cost per strategy

> §7 assigns this to Faizan: *"Confirm dataset source per strategy (current API
> provider vs. internal) + any cost."* This is that answer, written against what
> the code actually reads rather than against what was planned.

**Total additional cost: zero.** Every dataset below is already paid for, already
ingested, or free with a key we already hold.

| # | Strategy | Dataset | Where it comes from | Extra cost | Point-in-time? |
|---|---|---|---|---|---|
| 1 | Congress Buys | PTR disclosures | `congressional_transactions`, internal, fed by the market-data provider's congressional feed | none | **Yes** — real `reportedDate` |
| 2 | Congress Top Performers Mirror | PTR + v7 grades | as above + `wt_member_stats` joined via `wt_members.fmp_name` | none | Trades yes; **grades no** (current state) |
| 3 | Lobbying Surge | Senate LDA filings | `lobbying_quarterly`, swept from `lda.gov` with `LDA_API_KEY` | free key, already held | **Yes** — filing's own posted date |
| 4 | Contract Winners | USAspending | `ct_awards` joined to `gov_contractor_map` | free API, no key | **Yes** — `action_date` |
| 5 | Capitol Alignment | CTS (Brief v5) | `ct_flags` | none | **Yes** — `verified_at`/`created_at` |
| 6 | Hedge Fund Consensus | 13F | `investor_holdings`, 66 filers, 238,690 rows | none | **Yes** — real `filing_date` |
| 7 | Insider Buying — S&P 500 | Form 4 | `insider_transactions` + `sp500_membership` | none | **Modelled** — see below |
| 8 | S&P 500 + Insider Buying | Form 4 + index weights | as above + `companies.marketCap` | none | Modelled; membership and cap are current state |
| 9 | CEO Conviction | Form 4 + comp | as above + `exec_compensation` from the provider's governance endpoint | none | Modelled; pay is the latest proxy on file |
| 10 | Insider Clusters — Small & Mid Cap | Form 4 | `insider_transactions` + market cap | none | Modelled |
| 11 | Contrarian Insiders | Form 4 + price | as above + `pit_price_series` | none | Modelled |
| 12 | Conviction Metals | Form 4 + sector | as above + `pit_securities` industries | none | Modelled |

## The one real gap: Form 4 has no filing date

`insider_transactions` stores the transaction date, the accession number and the
filing URL — but **not the date the Form 4 was filed**. Nothing else in the
codebase stores it either.

Section 16 gives an insider two business days, and §5.2 of the brief names
exactly that — *"Form 4 two-day lag"* — so strategies 7 to 12 model entry at
transaction date plus two days. It is the brief's own model and it is close for
most filings, but it is **not the same statement** as strategies 1 to 6, which
read a real filed date out of a document. A late filer is treated here as
punctual, which flatters those six strategies by however long the delay ran.

Closing this properly means capturing `filedAt` during Form 4 ingestion. It is a
schema and backfill job, not a purchase.

## Two datasets that are current state, not history

- **S&P 500 membership** — the provider publishes today's list only. A company
  added last year appears as a member in 2021 here, and companies dropped along
  the way are absent entirely. Survivorship bias, stated on strategies 7 and 8.
- **Brief v7 member grades** — stored as current state. A member who earned an A
  recently is treated as having had it throughout, which flatters strategy 2.

Both are fixable the same way the CQS snapshots are being fixed: by recording
the value daily from now on. Neither can be reconstructed backwards.

## Coverage notes worth knowing before reading a result

- **Capitol Alignment** has three verified flags in the whole table, so it holds
  nothing. Reported as having no result rather than as a flat return.
- **Lobbying Surge** needs at least two quarters of filings per company to
  measure a change. Sweeps are weekly; until enough quarters accumulate it has
  no result.
- **SEDI (Canadian insiders) is not ingested.** Strategies 10 and 12 are
  therefore United States only, which matters most for Conviction Metals: a
  large share of junior miners are Canadian-listed.
