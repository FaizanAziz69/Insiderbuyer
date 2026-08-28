# Data Articles (Workstream A) & IPO Calendar (Workstream E) — API contract

Developer Project Brief (Aug 24 2026). Both modules follow the stack's cache
convention: raw-SQL tables created on demand, refreshed by in-process crons,
served from Postgres with `Cache-Control: public, max-age=300`.

## Data Articles

| Endpoint | Purpose |
|---|---|
| `GET /api/data-articles` | Index: `{ count, articles: [{ slug, headline, dek, category, refresh, chart, periods, refreshedAt, href }] }` |
| `GET /api/data-articles/:slug` | Article shell. `sections` are the CMS text with `{{placeholders}}` already filled from the primary period's payload; `rawSections` is the unfilled template. `refreshedAt` / `asOf` come from the data, never from an editor's save. |
| `GET /api/data-articles/:slug/chart?period=30d` | **§3.2 data contract** — one endpoint per article per period (below). |
| `GET /api/data-articles/status` | Per (slug, period) refresh timestamps + cron expressions. |
| `GET /api/data-articles/cron` | Scheduler hook: rebuilds anything stale. |
| `GET /api/data-articles/admin/list` · `PUT /api/data-articles/admin/:slug` · `POST /api/data-articles/admin/refresh?kind=weekly\|monthly\|quarterly` | Editorial Desk (x-admin-token). PUT accepts `{ headline?, dek?, category?, sections?, published? }`. |

### Chart payload

```jsonc
{
  "slug": "what-stocks-have-insiders-bought-the-most",
  "period": "30d",                 // 30d | 90d | 12m | ttm — from the article's `periods`
  "periodLabel": "Last 30 days",
  "asOf": "2026-08-28",            // the data runs to this date
  "refreshedAt": "2026-08-28T22:30:05.000Z",
  "valueKind": "usd",              // usd | pct — what the bar length measures
  "valueLabel": "Open-market purchases",
  "variants": {                    // most articles: { all }. Sells: { all, discretionary, planned }
    "all": [
      {
        "rank": 1,
        "key": "XYZ",              // ticker / analyst slug / investor slug
        "label": "XYZ",
        "sublabel": "XYZ Corp",
        "href": "/companies/XYZ",
        "value": 12345678,
        "valueKind": "usd",
        "iqs": 81,                 // Insider Score for the badge (null = no score yet)
        "detail": {                // §3.2 detail card
          "total": 12345678, "shares": 250000, "insiders": 4, "trades": 6,
          "avgPrice": 49.38, "price": 52.10,
          "pctSince": 5.5, "pctAbove52wLow": 31.2, "pctBelow52wHigh": 8.1,
          "cluster": true,         // ≥3 distinct insiders in the window
          "largest": { "name": "Jane Doe", "role": "CEO", "value": 8000000 },
          "firstDate": "2026-08-03", "lastDate": "2026-08-26", "sector": "Technology"
        }
      }
    ]
  },
  "totals": { "total": 1.2e9, "companies": 640, "insiders": 1120, "trades": 1900, "clusters": 3, "top10Share": 22.4 },
  "source": "SEC Form 4 filings (InsiderBuying pipeline); live prices via FMP"
}
```

Analyst rows carry `detail: { successRate, avgReturn, avgImpliedUpside, ratings, scoredRatings, mainSector, topSymbols, stars, latest, firm }`;
hedge-fund rows carry `detail: { performance, portfolioValue, positions, asOf, topHoldings[], overlap[], photo, person, firm }`.

### Aggregation rules (brief §3.2)

* Buys = Form 4 `transactionCode = 'P'` **and** `plannedBuy = false`. 10b5-1 plan purchases, option exercises (M), awards (A), tax withholding (F) and gifts (G) never count.
* Sells = `transactionCode = 'S'`; the `planned` flag is the filer's own 10b5-1 footnote. Missing footnote ⇒ discretionary.
* Ranked by total dollar value; avg price is volume-weighted; `pctSince` = live price vs that average; 52-week range from the FMP quote.
* Analyst leaderboard: directional hit rate on calls ≥30 days old, ≥3 graded calls, avg return breaks ties (same grading as `/analysts/top`).
* Hedge-fund leaderboard: `/investors?tab=performance`, i.e. the Top Insiders TTM figure with its AUM/position suppression.

### Refresh cadence (brief §2.3)

| Article | Cron (UTC) | Stale after |
|---|---|---|
| most bought / most sold | `30 22 * * 5` (Friday close) | 8 days |
| top analysts | `0 6 1 * *` | 32 days |
| top hedge funds | `0 7 16 2,5,8,11 *` (day after the 45-day 13F window) | 95 days |

A read with no payload builds synchronously (page never renders empty); a read with a stale payload serves it and rebuilds in the background.

### Placeholders available to editorial copy

`{{total}} {{companies}} {{insiders}} {{trades}} {{clusters}} {{top10Share}} {{asOf}} {{refreshed}} {{period}}`
`{{topN.ticker|name|value|insiders|avgPrice|pctSince|largest|iqs|avgReturn|ratings|positions|aum}}` for N = 1..3
`{{analysts}} {{ratings}} {{avgReturnTop10}} {{tracked}} {{withPerformance}} {{latestQuarter}}`

## IPO Calendar

| Endpoint | Purpose |
|---|---|
| `GET /api/ipo/recent?sort=date\|return&dir=desc\|asc` | Trailing-90-day table (§7.1). `{ window, asOf, count, rows: IpoListing[], methodologyUrl }` |
| `GET /api/ipo/upcoming` | Secondary tab. `{ count, rows: [{ symbol, name, exchange, expectedDate, priceRange, sharesOffered, source }] }` |
| `GET /api/ipo/status` | Counts, price date, cron, last feed error. |
| `GET /api/ipo/cron` · `POST /api/ipo/admin/refresh` | Scheduler hook / manual rebuild (admin token). |
| `GET /api/ipo/calendar` | Legacy shape, kept for old consumers. |

`IpoListing = { symbol, name, exchange, listingDate, daysSinceListing, ipoPrice, ipoPriceSource: 'priced'|'range-midpoint'|'first-open', currentPrice, priceAsOf, returnPct, marketCap, sharesOffered, insider: null | { buys, insiders, totalBought, lastBuyDate, filingUrl, ticker } }`

* Sources: FMP `stable/ipos-calendar` (primary, §8) merged with Nasdaq's public calendar (exact priced amounts + upcoming table). Nasdaq's priced amount wins over an FMP range midpoint.
* Prices: nightly `30 22 * * *` UTC (18:30 ET) via FMP batch quotes; runs every day so a weekend/holiday run re-stamps `price_asof` without changing values (§10 acceptance).
* Roll-off is the read filter (`listing_date >= CURRENT_DATE - 90`); rows older than 120 days are physically deleted.
* Insider flag: `transactionCode='P' AND plannedBuy=false AND transactionDate >= listing_date`, joined on ticker; links to the newest filing's `filingUrl`.
