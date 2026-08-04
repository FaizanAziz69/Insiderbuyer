# IQ Score — Implementation Notes

The scoring model is defined in [iqs-methodology.md](iqs-methodology.md).
Operational details live here.

## Where things live

- `backend/src/iqs/scoring-config.ts` — every weight, window, clamp, role
  multiplier and normalization knob. Product can tune the model here without
  touching the engine. A startup assertion fails the boot if the component
  weights stop summing to 1.0.
- `backend/src/iqs/iq-score-v2.ts` — the pure scoring functions (one per
  component / sub-factor) plus the composite assembler.
- `backend/src/iqs/iqs.service.ts` (`recalculateAll`) — the per-company loop:
  fetches the 90-day Form 4 'P' window, applies the round-trip guard and the
  $1B parse-artifact guard, prefers live Yahoo quotes for price/market cap
  (SEC-derived fallback), computes all components and upserts one row per
  company per day.
- `backend/src/iqs/sector-sentiment.service.ts` — daily-cached sector
  sentiment from 11 sector ETFs (warmed once per recalc run).

## Data-quality guards

- **Round-trip guard**: an insider who sold back ≥50% of their in-window buys
  has all their buys excluded (market-maker / wash-style flipping).
- **Parse-artifact guard**: any single transaction above $1B is treated as a
  bad SEC filing parse and skipped.
- **Market-cap sanity**: a cap smaller than the observed insider buying is
  impossible → treated as unknown rather than producing absurd factors.

## Storage mapping (`iqs_scores`, one row per company per day)

| Column | Meaning |
|---|---|
| `iqs` | the 0–99 v2 composite |
| `iqsV1` | previous insider-only score (log(1+A+B+C+D) scaled 0–99), for comparison |
| `buyingScore`, `sectorSentiment`, `mdaSentiment`, `momentumScore`, `dilutionScore` | the five components (0–100, null = no data) |
| `subVolumeVsMcap` … `subOwnershipPct` | the six Buying sub-factors (explainability) |
| `dataCompleteness` | share of model weight backed by real data (0–1) |
| `historicalSuccessWeight`, `marketTimingWeight` | display-only extras (% of past buys in profit; position vs 52-week range) |

## Operations

- Scores recompute after each ingestion run (`INGEST_CRON`, default every
  6 hours) and via `POST /api/recalculate`.
- Vercel's daily cron hits `/api/ingest/cron`; the serverless function is
  capped at 60s, so full-universe recalcs are best triggered from a
  longer-lived environment when needed.
