# IQS — Implementation Notes (engineering, not methodology)

The scoring methodology is defined verbatim in
[iqs-methodology.md](iqs-methodology.md). The proposal leaves a handful of
things undefined that running code must decide. Those decisions — and only
those — are recorded here. None of them alter the formula.

## Decisions the proposal leaves open

1. **Lookback window.** The proposal says the score is calculated daily but
   never fixes a window. We use `IQS_WINDOW_DAYS = 90` (exported from
   `backend/src/iqs/scoring-config.ts`). All four factors use this one window;
   the Cluster factor counts distinct buyers across the full window.

2. **Log base.** The proposal writes `log` without a base. We use the natural
   log, defined once as the exported `ln` helper in `scoring-config.ts` so the
   base can be changed in exactly one place (used in factor B and the final
   wrapper — never mixed).

3. **Missing previous holdings (factor D).** When a purchase has previous
   holdings of 0 or null, that purchase adds nothing to D's numerator and its
   insider is not counted in D's denominator. The insider still counts fully
   in A, B and C. This can never produce Infinity or NaN.

4. **Missing market cap.** A company whose market cap is missing, zero, or
   negative is excluded from the ranking entirely (A and C have no
   denominator). No fallback value is substituted.

5. **Role classification.** Read from the Form 4 reportingOwner data — the
   uppercased officerTitle plus the isDirector relationship flag — matched in
   order, first match wins: CHIEF EXECUTIVE / standalone CEO → 3.0; CHIEF
   FINANCIAL / CFO → 3.0; CHIEF OPERATING / COO → 3.0; director flag → 2.0;
   anything else → 1.0. One insider gets one multiplier, never summed across
   roles. Titles that fall through to 1.0 are logged each scoring run for
   review. (The raw isDirector boolean is not persisted; ingestion encodes it
   as `role = 'Director'`, which the scorer uses as the flag.)

6. **Data source & filter.** Form 4 non-derivative transactions with code 'P'
   only. Grants, option exercises, and all sells are excluded upstream of the
   calculation, matching the proposal's "open market purchases only" rule.

## Storage mapping

Scores land in the `iqs_scores` table, one row per company per day. The
existing columns carry the proposal's factors:

| Column | Factor |
|---|---|
| `transactionWeight` | A — Purchase Volume |
| `clusterWeight` | B — Cluster |
| `insiderWeight` | C — Role-Weighted Volume |
| `convictionWeight` | D — Holding Change |
| `iqs` | log(1 + (A + B + C + D)) |

`historicalSuccessWeight` and `marketTimingWeight` are legacy columns that are
no longer computed or written.

## Operations

- Scores recompute automatically after each ingestion run (cron, every 6 hours
  by default via `INGEST_CRON`) — this satisfies the proposal's "daily
  updates" and can be tightened or relaxed without touching the formula.
- Rankings, company detail, and CSV export read the latest `asOfDate` per
  company.
