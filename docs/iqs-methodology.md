# Insider Buying Quality Score (IQS) — Methodology

> This document reproduces the scoring methodology from the source proposal
> ("Proposal: Insider Buying Quality Score (IQS) & Ranking Dashboard",
> prepared for George Aizpurua — New World Ventures Inc., by Obi Akubue —
> Founder, Decode Investing) exactly as written. It is the shareable
> methodology. Engineering decisions the proposal does not define live in
> [iqs-implementation-notes.md](iqs-implementation-notes.md).

## What Makes Insider Buying "High Quality"?

Not all insider purchases are equal. Some are routine transactions (like stock
grants or option exercises), while others show strong conviction that the
stock is undervalued.

Key indicators of high-quality insider buying:

- **They are buying in the open market** — we ignore automatic stock grants or
  option exercises since they don't reflect a personal decision to invest.
- **Multiple insiders are buying at the same time** — if several insiders buy
  within days of each other, it's a strong signal.
- **CEOs and CFOs are buying** — purchases from these roles carry more weight
  since they have the most insight into the company's financial health.
- **Insiders are increasing their stake significantly** — if an insider
  already owns a large amount of stock, adding more isn't as meaningful as if
  they are doubling or tripling their holdings.
- **Insiders are spending a large amount relative to the company's size** — a
  $1 million insider buy means a lot more for a small company than for a
  trillion-dollar giant like Apple.

## How We Calculate the IQS

The IQS is a single number that combines multiple factors to measure how
strong insider buying activity is for a company. We calculate four key factors
that capture the size, intensity, and significance of insider purchases. These
are then combined into a final score that ranks companies from strongest to
weakest insider buying signals.

### A. Purchase Volume (Relative to Market Cap)

Shows how much insiders are investing compared to the size of the company. A
$5 million insider buy is a big deal for a company worth $50 million but
barely moves the needle for a company worth $500 billion.

```
Purchase Volume Factor = Σ(Shares Bought × Price) / Market Cap
```

- It ensures that large purchases in smaller companies are weighted more
  heavily than those in giant corporations.
- It helps identify smaller companies where insiders are making big moves,
  which are often the best investment opportunities.

### B. Cluster Purchases Factor (Are Multiple Insiders Buying?)

Checks if several insiders are buying at the same time. A CEO buying alone is
a good sign, but if the CEO, CFO, and multiple directors all buy within a few
weeks, it's a much stronger signal that something big is happening.

```
Cluster Factor = log(1 + Number of Distinct Insider Buyers)
```

- It captures group confidence — the more insiders buying, the stronger the
  signal.
- The log function prevents a single company with a very high number of buyers
  from dominating the score unfairly.

### C. Insider Role Weighting (Who Is Buying Matters)

Not all insiders have the same influence. A CEO or CFO buying stock is much
more meaningful than a director or lower-level executive buying.

```
Role-Weighted Purchase Volume = Σ(Shares Bought × Price × Role Multiplier) / Market Cap
```

Role multipliers:

| Role | Multiplier |
|---|---|
| CEO | 3.0 |
| CFO | 3.0 |
| COO | 3.0 |
| Director | 2.0 |
| Other Insiders | 1.0 |

- It prioritizes the most important purchases over those from lower-level
  executives.
- Helps filter out transactions that might not have much impact on future
  stock performance.

### D. Holding Change Factor (How Much Are Insiders Increasing Their Stake?)

Shows how much bigger an insider's total holdings became after the purchase.

```
Holding Change (%) = (Shares Bought / Previous Holdings) × 100

Holding Change Factor = Σ(Holding Change %) / Number of Insiders Who Bought
```

- If a CEO already owns 1 million shares and buys 10,000 more, that's not a
  big deal.
- If a CFO owns 10,000 shares and buys 10,000 more, they just doubled their
  stake — a much stronger signal.
- This factor captures whether insiders are making a real financial commitment
  or just adding a small amount.

## Final Calculation of IQS

```
IQS = log(1 + (Purchase Volume Factor + Cluster Factor
              + Role-Weighted Purchase Volume + Holding Change Factor))
```

- Log transformation prevents extreme values from distorting the rankings.
- **Higher IQS = stronger insider confidence in the stock.**

Rankings are updated as new insider buying data is processed.
