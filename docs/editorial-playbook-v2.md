# Editorial Playbook v2 — what is automated, and what is still a human job

Source document: `InsiderBuying_Editorial_Playbook_v2.docx` (client, Aug 2026).
Scope: the **EDITORIAL** section only — hand-written Top Stories, `kind:
'editorial'`, served at `/insights/[slug]`. Programmatic articles keep their own
format library (`content-formats.ts`) and none of this applies to them.

The manual is a process document, so most of it is a human standard. This is the
map of which parts became code and where they live.

## Where the team works

**`/editorial-desk`** — internal, `noindex`, not linked from the navigation.
Three tabs:

- **Story briefing** — §2 discovery output, newest run first. Take / pass / mark
  published on each pitch.
- **Pre-publish check** — §10 checklist. Paste a draft, get every checkbox
  resolved with the reason.
- **The playbook** — §3–§9 rendered from the same spec the publish route
  enforces, with copy-to-clipboard viz embeds.

The Desk needs `ADMIN_API_TOKEN` for the briefing (see **Blocked** below). The
playbook tab and the checklist tab work without it.

## §2 — Story discovery

`backend/src/content/story-desk.service.ts`, crons at **07:00 and 13:00
America/New_York, weekdays**.

| Manual | Implementation |
| --- | --- |
| EDGAR Form 4 feed, `P` type, last 24h, >$100K, sorted by value | Our own ingest (`insider_transactions`), grouped per company |
| Yahoo/FMP top gainers and losers, >5% | `MarketStatsService.getTopGainers/getTopLosers` |
| NewsAPI / Bing News | `NewsService.getLatest()` — the wire feeds this site already fetches |
| Cross-reference: both feeds → P1, one feed → P2 | Same rule, verbatim. Plus the P3 sector row its sample briefing shows |
| Claude pitch → `{headline, lede, insider_angle, watch_for}` | `ContentGeneratorService.generateStoryPitch` — a tool call, so a malformed pitch retries instead of failing to parse. Adds `suggested_viz` and `category`, which §7 and §9 require of the finished article anyway |
| Daily briefing email at 07:30 ET | The Desk page reads `story_pitches` instead. Nothing is emailed |

**Not n8n / Make.com, as the manual suggests.** Two of the three feeds and the
Insider Score already live in this backend, and the pitches have to be stored
where the site can read them. Routing that out to a third-party workflow tool
and back adds a vendor, a second set of credentials and a second failure mode
for no capability we do not have. The cadence, the cross-reference rule and the
prompt are the manual's.

Caps per run: 6 × P1, 4 × P2, 1 × P3. Anything dropped by a cap is logged —
a silent truncation reads as "that was everything".

Switch: `POST /story-desk/runs?on=0` (an `app_settings` row, not an env var, so
runs stop in seconds without SSH).

## §7 — The data visualization requirement

This is the part the manual asks to prioritise: *"The developer can build a
reusable embeddable widget — a small HTML snippet that auto-pulls IQS data for a
given ticker and renders inline in any article."*

The snippet is one `div`. `ArticleBody` swaps it for a live component at render,
so an article published in August still shows current filings in December, and
an article can never state a figure its own viz contradicts.

```html
<div data-viz="insider-timeline" data-ticker="MRNA" data-months="12"></div>
<div data-viz="iqs-card"         data-ticker="CCJ"></div>
<div data-viz="sector-table"     data-days="30" data-sector="Technology"></div>
<div data-viz="price-markers"    data-ticker="CCJ" data-range="1y"></div>
<div data-viz="tx-compare"       data-ticker="CCJ" data-days="30"></div>
<div data-viz="pull-quote">One striking stat, as text.</div>
```

Components: `frontend/components/article/viz/`. All six share one `VizFrame`
(navy band, gold eyebrow, source caption) so two in one article read as one
system.

Two behaviours worth knowing:

- **`insider-timeline` renders the absence.** The manual's own example is
  Moderna — "shows all option exercises but NO open-market purchases; the visual
  makes the absence visible". The pre-existing `InsiderActivityTable` returns
  `null` on an empty purchase list, which draws nothing at the exact moment the
  story is most interesting. This one states what is missing and shows what *is*
  on file instead.
- **`sector-table` has a company floor.** `Company.sector` mixes GICS names
  ("Technology", "Healthcare") with raw SIC descriptions ("Services-Membership
  Sports & Recreation Clubs"), and the SIC buckets are often one company. The
  endpoint defaults to `minCompanies=5` so a single-company bucket cannot top an
  article's sector table and read as a sector finding.

New endpoint behind it: `GET /metrics/sector-conviction?days=30&minCompanies=5`
→ sector, avg Insider Score, cluster buys, buy value, YoY change. A cluster is
2+ distinct insiders at one company inside the window — the same threshold the
scoring engine uses, so "cluster" means one thing site-wide.

## §10 — The pre-publish checklist

`backend/src/content/editorial-checklist.ts`. `POST /content/editorial` runs it
and **refuses on any error** unless the body carries `force: true` (logged, not
silent). `POST /content/editorial/validate` returns the same report without
publishing.

Errors block: headline ≤12 words, no alarm-bell words, slug shape, an approved
category tag, at least one known viz embed, the Form 4 attribution phrase, no
numeric Insider Score in prose, a `/companies/[TICKER]` link, a CTA, ≥250 words,
no advice voice.

Warnings do not block: meta title >60 chars, meta description >155, no cover
pinned, no alt text, thin tags, >600 words, paragraphs over 4 sentences, empty
calories ("massive", "huge"), passive transaction sentence, a percentage with no
timeframe, a yes/no question headline, a headline figure the opening does not
deliver.

Run against the live Raymond James / NVIDIA article, the checklist returns 3
errors and 5 warnings — all genuine gaps against the new manual (no viz, no
attribution phrase, eyebrow "ANALYST WATCH" is not one of the five categories,
330-char summary, 1,043 words).

## §8 — The 5-slot structure

**No CMS step is needed.** Top Stories reads the newest `editorial` posts in
publish order, so a new article *is* slot 1 and everything below steps down on
its own. The manual's 7-step rotation procedure describes work this site does
not have to do.

One refinement in `frontend/lib/homeFeed.ts`: when editorial output is thin, the
top-up for slots 4–5 now prefers the evergreen kinds the manual names for those
slots (sector roundups, topic roundups, weekly reports, series, cluster buys)
over whatever is merely newest. A daily-summary in slot 4 dates badly; a sector
roundup does not.

## §9 — Category tags

New nullable column `blog_posts.category`, one of the five approved tags. It now
drives the card eyebrow: `articleLabel` returns the writer's category ahead of
the hash-picked framing, because the category is a real editorial decision about
what the story *is*, and the framings exist only because programmatic posts have
nothing but their `kind` to label them with.

Also added: `blog_posts.imageAlt`, used by the article hero and the Top Stories
cards, falling back to the headline.

## Where the manual is deliberately not followed literally

**1. The Insider Score number.** §7 and §10 ask for the IQS "referenced in
article text and/or shown in viz". The number is premium on every other product
surface; the publish route strips it from prose and `sanitizeArticleHtml` masks
stored bodies at render. So: **prose carries the qualitative band** ("a top-tier
Insider Score"), and **the number appears only inside a viz**, through the same
`PremiumValue` gate the stock tables use — subscribers see it, everyone else
sees a `Pro` pill. The manual's intent holds without giving the paywalled number
away.

**2. Routes.** The manual writes `/stocks/[TICKER]` and
`/articles/[ticker]-[desc]-[date]`. This site serves `/companies/[TICKER]` and
`/insights/[slug]`, and 14 editorials are live and indexed at the latter, so
moving the canonical URL would throw away their ranking for a cosmetic
difference. The checklist requires the real routes, and `/articles/[slug]` now
permanently redirects to `/insights/[slug]` so a URL copied out of the manual
still resolves.

**3. Word count.** The manual caps web editorial at 600 words. Every live
editorial is roughly 1,000. It is a warning, not an error — worth a house
decision rather than a gate that would block every article the team writes the
way it currently writes them.

## Blocked

**`ADMIN_API_TOKEN` is not set in production**, and `AdminTokenGuard` fails
closed there, so every admin route — including the whole Story Desk and the
validate endpoint — answers **503** until it is set:

```
ssh … "cd /opt/insider/app/backend && \
  echo \"ADMIN_API_TOKEN=\$(openssl rand -hex 32)\" >> .env && \
  pm2 restart insider-backend --update-env"
```

Then paste the token into the Editorial Desk's token field once per browser.
Until that is done: the playbook tab works, the checklist tab does not, and the
discovery crons still run and store pitches — only the reading of them is
blocked.

## Still a human job

§1 (the standard), §3 (the 20-minute source sweep — rendered as a checklist with
live links, but somebody has to read the WSJ), §4 (voice — the checklist catches
banned words and the advice voice, not whether the piece has a point of view),
§6 (writing the headline), §11 (the two example articles — see the fact-check
notes in the session, both need corrections before publishing).
