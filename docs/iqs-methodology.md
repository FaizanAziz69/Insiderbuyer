# Insider Quality (IQ) Score — Methodology (v2 composite)

The site's Insider Score is a 0–99 weighted composite of five components,
each independently normalized to 0–100 before weighting:

```
IQ = 0.50·Buying + 0.25·Sector + 0.10·MD&A + 0.10·Momentum + 0.05·Dilution
```

The result is rounded and capped at 99 (no stock ever gets a perfect score).
All weights and normalization knobs live in
`backend/src/iqs/scoring-config.ts`, with a startup assertion that the
component weights sum to 1.0.

**Missing data → neutral 50, never 0.** A component with no data contributes
a neutral 50 at its full weight — weights never renormalize across
components. `dataCompleteness` (0–1) reports what share of the model's weight
was backed by real data. Exception: if the Buying component is null (no
qualifying insider buys), the whole score is null and the company's score row
is deleted — the score only exists where insider buying exists.

## 1. Buying — 50%

Only open-market purchases (Form 4 code 'P') in the last 90 days, after a
round-trip guard that excludes any insider who sold back ≥50% of what they
bought inside the window. Six sub-factors, each 0–100; sub-weights
renormalize over whichever sub-factors have data:

| # | Sub-factor | Weight | Formula |
|---|---|---|---|
| A | Purchase size vs market cap | 25% | `ln(1 + ratio/0.02) / ln(5) × 100` — ~2% of cap ≈ strong |
| B | Cluster | 20% | `ln(1 + buyers) / ln(7) × 100` — 6 buyers ≈ 100 |
| C | Role-weighted size vs cap | 20% | same log curve, divisor 0.06; role multipliers CEO/CFO/COO 1.0, Director 0.6, Other 0.4 |
| D | Holding change | 10% | avg per-buyer % added, capped at 100% |
| E | Cost basis vs price | 15% | `r = clamp(insiderVWAP ÷ price, 0.5, 2.0)`, min-maxed; r > 1 (stock below insider cost) = bullish |
| F | Ownership % increase | 10% | role-weighted relative stake growth, capped at doubling; first-time buyers get the cap |

## 2. Sector Sentiment — 25%

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

## 5. Dilution — 5%

TTM share growth through a piecewise curve, linear between knees:
0% → 100, 5% → 75, 15% → 30, 40%+ → 0. Buybacks score top; heavy issuance is
penalized.

---

Higher IQ Score = stronger combined signal. Scores recompute automatically as
new Form 4 filings are ingested. The previous insider-only score
(`log(1 + A+B+C+D)` scaled 0–99) is kept alongside as `iqsV1` for
side-by-side comparison.
