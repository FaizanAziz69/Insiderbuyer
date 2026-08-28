# Developer Project Brief (Aug 24 2026) — per-phase estimates & delivery status

Prepared 2026-08-28 for George. Estimates are in **developer-days** (one developer, 8h),
grouped by the brief's §9 phases as requested — not per workstream. Because build started
on Aug 25 and all five workstreams are live as of Aug 28, the "effort" column is the
actual effort spent; the "remaining" column is what is still open and why.

## Summary

| Phase | Brief scope | Effort (dev-days) | Status (2026-08-28) | Remaining |
|---|---|---|---|---|
| **Foundations** (§2) | Component library, compliance footer, methodology page, caching/cron conventions | 2.0 | Live | — |
| **Phase 1** — A + E | Data Articles system (4 articles) · IPO Calendar | 7.0 | **Live** | Weekend/holiday price-refresh verification (calendar time only) |
| **Phase 2** — B + D | Top Insiders (71-investor roster, 13F, detail pages) · Subscribe redesign | 9.0 | **Live** | 3 client decisions (gating, category tags, card stat) + final mockup files |
| **Phase 3** — C | Insider Bubbles filters + panel reorder · Congress Bubbles | 5.5 | **Live** | 60 fps check on a mid-range phone |
| **Germany data** (§11 decision, 28 Aug) | BaFin Directors' Dealings ingest, SEC-style cadence | 1.0 | **Live** | — |
| **Total** | | **24.5** | | |

## Phase detail

### Foundations — 2.0 days
* Reusable pieces: IQS badge (green ≥75 / gold 50–74), chart-module frame (title / subtitle /
  toggle / source line / "Scored by IQS"), navy detail-tooltip card, "Key takeaways" and
  "What it means for you" boxes, Premium CTA banner, compliance footer (§2.4) on every data page.
* `/methodology` page with one section per data product; every performance figure links to it.
* Refresh cadence per §2.3, implemented as in-process crons writing to cache tables
  (the stack's equivalent of materialized views).

### Phase 1 — Data Articles (A) + IPO Calendar (E) — 7.0 days
* **A (5.0):** endpoint per article per period (§3.2 contract, documented in
  `docs/data-articles-and-ipo-api.md`); ranked-bar chart, top 10, animated, 30/90 toggle
  without reload, keyboard-focusable rows, detail card with the seven §3.2 fields;
  10b5-1 / exercises / awards excluded; four launch articles in the brief's order; CMS tab in
  the Editorial Desk with editable text around a locked chart; editorial-scoped token.
* **E (2.0):** FMP IPO calendar merged with the exchange calendar, 90-day window with automatic
  roll-off, nightly post-close price cron, return-since-IPO hero stat, Form 4 insider-buy badge
  linking to the filing, Upcoming tab, date/performance sort.
* *Remaining:* §10 asks for verification "across a weekend and a market holiday" — first
  weekend is Aug 29–30, Labor Day is Sep 7. Zero effort, calendar time.

### Phase 2 — Top Insiders (B) + Subscribe redesign (D) — 9.0 days
* **B (6.0):** 71-investor roster with admin-editable tags, six tabs, card spec (§4.2) incl. the
  gold insider-overlap badge, detail pages with holdings / quarter-over-quarter changes /
  performance / "Where this fund and insiders agree", §4.4 methodology with AUM and position
  suppression, nightly performance recompute, 13F ingest on filing windows.
* **D (3.0):** insider performance cards (navy, gold frame, mono stat), 4 retina mockup slots
  with lightbox, firm logos in the trust strip.
* *Remaining (client input, ≤1 day once answered):*
  * Free vs Premium gating for Top Insiders — 0.5 day after the decision.
  * Growth / Value / Short / Long-Term tags for the 71 investors — 0.25 day to load the sheet.
  * Confirm the subscribe-card stat (return on disclosed Form 4 buys, as built) — 0 or 0.5 day.
  * Final mockup compositions from the design team — 0.25 day to drop in.

### Phase 3 — Bubbles (C) — 5.5 days
* Exchange (U.S. / Canada / Germany) and six sector chips combining correctly; §5.2 panel order;
  Congress Bubbles page on House + Senate PTRs with bioguide portraits, range-midpoint sizing,
  chamber / party / period filters, nightly refresh; shared physics engine.
* *Remaining:* §10 "60 fps on mid-range mobile" — a 1-hour device test.

### Germany data — 1.0 day
* George's answer to §11: real German insider disclosures. Built on BaFin's public Art. 19 MAR
  database (free); ingests every two hours on business days plus a weekly full re-read, into the
  same tables as Form 4, so bubbles, data articles, the trades feed and every Exchanges filter
  carry German insiders automatically.

## Open items that are not engineering
| Item | Owner | Note |
|---|---|---|
| `data-article-prototype.html` | George | Never received; chart module built from the spec text and brand tokens. A visual diff is ~0.5 day if it arrives. |
| Editorial review of article body copy | Editorial | Drafted in neutral voice; editable in Editorial Desk → Data articles with the editorial token. |
| Vendor costs | — | See `docs/vendor-costs.md` — no new vendor, nothing above the $200/month flag. |

## Optional follow-ups (not in the brief's acceptance criteria)
| Item | Estimate |
|---|---|
| "How this year's IPOs are performing" as a fifth data article (brief §7 mentions the page as a feeder) | 0.5 day |
| CloudFront in front of nginx — fixes the 1–2 s first-byte seen from Europe/Asia | 1.0 day |
| Dedicated "Data" dropdown in the sticky nav (currently one link inside Stock Data) | 0.25 day |
