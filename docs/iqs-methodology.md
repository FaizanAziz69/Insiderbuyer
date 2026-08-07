# Insider Quality (IQ) Score — Methodology (v2.1 composite)

The site's Insider Score is a 0–99 weighted composite of six components,
each independently normalized to 0–100 before weighting, minus a litigation
deduction:

```
composite = 0.45·Buying + 0.22·Sector + 0.10·MD&A + 0.10·Momentum
          + 0.08·Pedigree + 0.05·Dilution
IQ        = max(0, composite − LitigationDeduction)   // deduction 0–15
```

The result is rounded and capped at 99 (no stock ever gets a perfect score).
All weights and normalization knobs live in
`backend/src/iqs/scoring-config.ts`, with a startup assertion that the
component weights sum to 1.0.

**Missing data → neutral 50, never 0** (exception: Pedigree, whose no-data
baseline is 25 — see §5). A component with no data contributes its neutral
value at its full weight — weights never renormalize across components.
`dataCompleteness` (0–1) reports what share of the model's weight was backed
by real data. Exception: if the Buying component is null (no qualifying
insider buys), the whole score is null and the company's score row is
deleted — the score only exists where insider buying exists.

## 1. Buying — 45%

Open-market purchases (Form 4 code 'P') in the last 90 days drive the
component, after data-quality guards: a round-trip guard that excludes any
insider who sold back ≥50% of what they bought inside the window, a
$1B-per-transaction plausibility cap, and a price-sanity guard that discards
buys reported at more than 25× the live share price (filing artifacts).
Open-market sales (code 'S') in the same window feed the informational
Buy/Sell Balance sub-factor. Sub-factors, each 0–100; sub-weights
renormalize over whichever sub-factors have data:

| # | Sub-factor | Weight | Formula |
|---|---|---|---|
| A | Purchase size vs market cap | 22% | `ln(1 + ratio/0.02) / ln(5) × 100` — ~2% of cap ≈ strong |
| B | Cluster | 18% | `ln(1 + buyers) / ln(7) × 100` — 6 buyers ≈ 100 |
| C | Role-weighted size vs cap | 18% | same log curve, divisor 0.06; role multipliers CEO/CFO/COO 1.0, Director 0.6, Other 0.4 (spec §2C) |
| D | Holding change | 8% | avg % each buyer added to their stake, capped at 100%; a genuine first-time buyer counts as the cap |
| E | Cost basis vs price | 12% | `r = clamp(insiderVWAP ÷ price, 0.5, 2.0)`, min-maxed; r > 1 (stock below insider cost) = bullish |
| F | Stake increase (per insider) | 10% | role-weighted avg of (shares bought ÷ previous holdings) per buyer, capped at doubling |
| G | Aggregate insider ownership | 12% | insiders' total shares ÷ real shares outstanding (SEC XBRL; marketCap ÷ price fallback), through a piecewise curve: <1% → 0–10, 5% → 40, 15% → 75, 40%+ → 100, with a taper above 60% (controlled-company caveat). Insiders are deduplicated by SEC reporting-owner CIK, name fallback. |
| — | Buy/Sell balance | 0% (informational) | `buy$ ÷ (buy$ + sell$) × 100` — displayed for context, unweighted pending the spec's open question #6 on sales |

## 2. Sector Sentiment — 22%

Daily cached sentiment score for the company's sector/industry, derived from
sector ETF behaviour.

## 3. MD&A — 10%

Precomputed `company.mdaSentiment`: AI-scored tone of the company's own
filing language (MD&A sections of 10-K/10-Q).

## 4. Momentum — 10%

Relative **share volume**: 10-day average ÷ 3-month average (from the Yahoo
quote batch). If recent dollar volume is under $50,000 the name is too
illiquid to trust → neutral 50.

```
r = clamp(relVolume, 0.25, 4.0)
score = (ln r − ln 0.25) ÷ (ln 4.0 − ln 0.25) × 100
```

Log-symmetric around flat: 4×+ volume = 100, 2× = 75, flat = 50, ½× = 25,
¼× or less = 0. Note this is direction-agnostic — it measures an
attention/liquidity surge, not price trend.

## 5. Pedigree — 8% (NEW in v2.1)

Track-record quality of the specific insiders buying, from reviewed
`insider_profiles` (keyed by SEC reporting-owner CIK, name fallback). Flag
points per insider (serial entrepreneur 40, prior exec exit 15, fund manager
30, board network 10, prior successful insider buys 20, sector expertise 10,
long tenure 8), capped at 60 per insider, and multiplied by 1.5 when that
insider actually bought in the window. No reviewed profile data → baseline
**25** (not 50): an unknown insider is a mild negative, not neutral.

Profiles only count when human-reviewed (`reviewedBy` set) and not
suppressed (spec §6.3.4).

## 6. Dilution — 5%

TTM share growth through a piecewise curve, linear between knees:
0% → 100, 5% → 75, 15% → 30, 40%+ → 0. Buybacks score top; heavy issuance is
penalized.

## Litigation deduction — 0 to 15 points (NEW in v2.1)

Subtracted from the weighted composite. Reviewed litigation matters against
the buying insiders deduct by tier (fraud/securities > regulatory > civil)
with status modifiers (settled/dismissed reduce the hit), capped at 15
points total. Same review gate as pedigree.

### Dark-mode rollout (spec §12)

Pedigree and litigation are computed and stored on every recalc, but only
**applied** to the published IQ when `IQS_PEOPLE_SIGNALS_LIVE=true`. While
dark, the published score uses the pedigree baseline and zero deduction, so
scores are audit-comparable before the people-signals go live.

---

Higher IQ Score = stronger combined signal. Scores recompute automatically as
new Form 4 filings are ingested. The previous insider-only score
(`log(1 + A+B+C+D)` scaled 0–99) is kept alongside as `iqsV1` for
side-by-side comparison.
