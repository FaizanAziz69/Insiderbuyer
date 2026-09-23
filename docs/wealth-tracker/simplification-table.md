# How the Wealth Tracker treats each asset type

**Brief v7 §2.1 open item — Faizan drafts, George approves.**

The reconstruction turns disclosed trades into a portfolio. Some assets can be
rebuilt faithfully, some can only be approximated, and some cannot be priced at
all without inventing a number. This table says which is which, and what the
site does in each case. Nothing here is a guess dressed as a figure: where we
cannot price something, it counts toward activity and never toward value.

## The table

| Asset type as filed | Counts toward value? | Counts toward activity? | How it is handled | Why |
|---|---|---|---|---|
| Stock (common shares) | Yes | Yes | Buy opens a lot at the range midpoint on the trade date; sales reduce lots first-in first-out; held at the adjusted close | The only case where a disclosure maps cleanly onto a position |
| ETF | Yes | Yes | Same as stock | Priced continuously, fungible, no per-share ambiguity |
| REIT | Yes | Yes | Same as stock | Trades like a listed equity |
| ADR / foreign listing | Yes | Yes | Same as stock, priced in the listing we hold | Matching a local line to an ADR would change the share count silently |
| Blank asset type with a ticker | Yes | Yes | Treated as stock | The House feed frequently omits the type on plain equity rows; dropping them would hollow out the record |
| **Stock option** | **No** | Yes | Recorded, priced at nothing, labelled "option" on the trade strip | A filing gives no strike and no expiry. Pricing it would require inventing both |
| **Corporate / municipal / government bond** | **No** | Yes | Recorded, labelled "bond" | Priced over the counter, not from any equity feed we hold |
| **Mutual fund / fund without a ticker** | **No** | Yes | Recorded, labelled "fund" | No tradable symbol to mark against |
| **Crypto** | **No** | Yes | Recorded, labelled "crypto" | Outside the price history this engine runs on |
| **Non-public / private stock** | **No** | Yes | Recorded, labelled "other asset" | No market price exists by definition |
| **Exchange** (neither purchase nor sale) | No | Yes | Recorded; no lot opened or closed | An exchange is a change of holding, not a decision to buy or sell |

## The estimates that remain, even on the assets we do price

1. **Amounts are ranges.** A filing says "$15,001 to $50,000", so every figure
   uses the midpoint and is labelled `est.` wherever it appears.
2. **Share counts are derived, never disclosed.** Shares are the midpoint
   divided by the closing price on the trade date, which means a position size
   is an inference from two published numbers, not a reported one.
3. **A weekend or holiday trade date prices at the previous close.**
4. **Disclosure lags up to 45 days.** The portfolio is built on trade dates,
   so a member's holdings are known to us later than they occurred.
5. **Dividends are excluded in v1.** Returns are price returns. This
   understates income-heavy portfolios and is the largest known gap.
6. **A full sale closes the position regardless of its range.** "Sale (Full)"
   is treated as exactly that; a partial sale sells midpoint-derived shares.
7. **A sale of something we never saw bought is counted but cannot move
   value** — it usually means the position predates the record we hold.

## Two decisions worth George's attention

**Options are the biggest omission, and they are not rare.** Roughly a third of
some members' filings are options. Excluding them from value keeps every
published figure defensible, but it means a member who trades mostly options
shows a smaller disclosed portfolio than they have. The profile says how many
trades were not priced, so the gap is visible rather than hidden.

**Dividends.** Adding them would raise most estimated returns and would need a
dividend history per holding. It is a v2 item unless you want it sooner.

## What changes if you disagree

Each row above is a rule in one file, `backend/src/wealth-tracker/
reconstruction.ts`, in a single list of what counts as a priceable asset.
Moving an asset type from "activity only" to "priced" is a one-line change plus
a source of prices for it. Nothing else in the engine needs to move.
