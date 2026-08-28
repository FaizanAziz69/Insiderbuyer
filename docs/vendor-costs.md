# Data vendors — coverage & cost (brief §2.2 / §8 / §11)

Prepared 2026-08-28. The brief asked for a single-FMP-contract vs multi-vendor comparison
and for any data cost above **USD 200 / month** to be flagged before contracting.

**Result: no new vendor and no new recurring cost.** Everything the five workstreams need is
covered by the FMP plan the site already pays for, plus free public sources. Nothing to flag.

## What each workstream uses

| Need (brief §8) | Source in production | Cost | Notes |
|---|---|---|---|
| Form 4 insider data | SEC EDGAR → existing pipeline | Free | Already live |
| 13F holdings, filer summaries, filing dates (B, article #4) | **FMP** `institutional-ownership/*` | Existing plan | Coverage gap: a few small filers (e.g. Greenlight) lag on FMP; noted on the page |
| Daily & intraday prices (B, C, E, A) | **FMP** quotes / EOD bars, 15-min cache | Existing plan | |
| Analyst ratings & targets (article #3) | **FMP** price-target + grades | Existing plan | Junk-target guard applied |
| Congress trades — PTRs (C) | **FMP** `senate-trades` / `house-trades` | Existing plan | Data is thin (~120 PTR rows / 14 members per 90 days); latency ~1–3 days after disclosure |
| Politician portraits (C) | `unitedstates/images` (GitHub, public domain) keyed by bioguide ID | Free | |
| Company logos (B, E) | Existing logo component (FMP image URL with fallback) | Existing plan | Parqet not needed |
| IPO calendar (E) | **FMP** `ipos-calendar` merged with Nasdaq's public calendar | Existing plan + free | Nasdaq supplies exact priced amounts and the upcoming table |
| Insider portraits (D, B) | Wikipedia lead images, licence-checked | Free | Most Form 4 filers have no article — initials fallback |
| **German insider disclosures** (C Germany filter, §11) | **BaFin Directors' Dealings database** (Art. 19 MAR), public CSV export | Free | Refreshed every 2 h on business days; ISIN → symbol via FMP |
| Canadian insider data (§11) | Not sourced — SEDI has no API; FMP has no SEDI feed | — | Canada tab shows "Coming soon"; SEDI is free but requires scraping (~2–3 days if wanted) |
| Treasury / rates (mentioned via stockcircle) | Not required by any workstream | — | FRED is free if ever needed |

## Single vendor vs multi-vendor

* **FMP alone** covers 13F, prices, analysts, congressional trades and the IPO calendar — the
  brief's assumption held. The only things FMP cannot supply are German (BaFin) and Canadian
  (SEDI) insider disclosures and people photos; the first is solved with BaFin's free database,
  the last with Wikipedia.
* **Watch item:** FMP request volume. The new crons add roughly: 13F refresh nightly (~70 filers ×
  ≤6 quarters), IPO reprice nightly (~100 quotes), data-article rebuilds weekly (~60 quotes),
  BaFin ISIN lookups (one-off per new issuer). This is well inside the current plan's daily
  limit; if the plan is ever downgraded, the 13F refresh is the first thing to throttle.

## If George wants more later

| Option | Approx. cost | When it would matter |
|---|---|---|
| Higher FMP tier | ~$50–150 / month step-ups | Only if request limits are hit — not currently |
| Quiver Quantitative (congress, contracts, lobbying) | ~$10–100 / month | If FMP's PTR coverage proves too thin for Congress Bubbles |
| Capitol Trades / Unusual Whales congress API | $200+ / month → **would need flagging** | Same reason; not recommended until FMP coverage is measured over a full quarter |
| Parqet logo API | Free tier / small | Only if the current logo fallback rate is judged too high |
