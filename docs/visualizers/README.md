# Bubble Visualizer Suite — operating notes

Four products on one platform (Developer Brief v2). Everything lives under
`/visualizers`; the backend is `backend/src/visualizers`, the shared frontend
platform is `frontend/lib/visualizers` + `frontend/components/visualizers`.

| Product | Route | Data | State |
|---|---|---|---|
| Prediction Market Bubbles | `/visualizers/prediction-markets` | Polymarket Gamma + CLOB + data API, polled every 15s, deltas over SSE | live |
| Government Contracts | `/visualizers/government-contracts` | USAspending.gov + open.canada.ca, rebuilt nightly | live |
| Goldminer AI | `/visualizers/goldminer` | curated project seed from operator reserve statements | live, 40 projects |
| Biotech Catalysts | `/visualizers/biotech` | FMP roster + ClinicalTrials.gov + OSM geocoding; catalysts curated | live, catalysts pending |

## Admin operations

All admin routes take the `x-admin-token` header. Read the token on the box:
`grep -m1 '^ADMIN_API_TOKEN=' /opt/insider/app/backend/.env` — never print it.

```
POST /api/visualizers/admin/markets/refresh                     # re-curate + poll the prediction board
GET  /api/visualizers/admin/curated                             # the market allowlist
POST /api/visualizers/admin/curated  {rows:[…]}                 # pin a market by hand (curatedBy=editor, never auto-retired)
DELETE /api/visualizers/admin/curated/:id

POST /api/visualizers/admin/contracts/refresh?region=us&window=1y
GET  /api/visualizers/admin/contracts/recipients
POST /api/visualizers/admin/contracts/recipients/:id {ticker,isPublic}   # manual entity resolution, wins over every automated pass

POST /api/visualizers/admin/mining/validate {csv:"…"}           # dry run, returns per-row issues
POST /api/visualizers/admin/mining/import   {csv:"…",replace:true}

POST /api/visualizers/admin/biotech/refresh?step=roster|geocode|trials|financials|build
POST /api/visualizers/admin/biotech/catalysts {rows:[…]}
```

## Embeds

Every visualizer has an iframe version at `/visualizers/embed/<product>` —
`prediction-markets`, `government-contracts`, `goldminer`, `biotech`. It renders
the identical component tree with the site chrome removed and an attribution bar
added, so an embed can never drift from the page it came from, and every panel
keeps its source line and disclaimer. Embeds are `noindex` so they cannot
compete with the canonical page. The snippet is on the hub.

## Loading the Goldminer dataset

`goldminer-seed-template.csv` in this folder is the exact shape the importer
takes. Validate before importing — the validator rejects rather than guesses:

* `id`, `name`, `company`, `country`, `sourceName`, `sourceDate` are required.
* `lat`/`lng` must be real coordinates; `stage` must be one of Exploration,
  Resource, PEA, PFS, FS, Construction, Production.
* An `npvAfterTaxUsd` is refused unless it carries both the `studyType` it came
  from and the `goldPriceAssumption` it was run at. An NPV with neither is a
  number with no meaning.
* `sourceDate` is `YYYY-MM-DD`.

Sizing then follows the §4.2 hierarchy automatically: study NPV if present,
else in-situ ounces × spot × a stage discount, else a multiple of annual
production — and the panel prints which one it used.

## Where the Goldminer data came from, and how to extend it

The seed is `goldminer-seed-2025.csv`: 40 projects from four operators' own
reserve statements, all effective 31 December 2025 —

| Operator | Document | Properties |
|---|---|---|
| Newmont | 2025 Mineral Reserves news release | 23 rows → 20 projects |
| Barrick | Mineral Reserves and Resources page | 14 |
| Agnico Eagle | Form 6-K reserve exhibit `aem-20251231xex99d5.htm` | 23 rows |
| Gold Fields | MRMR Supplement 2025 PDF, "Headline" table | 8 |

**The recipe for the next operator**, in order of what actually worked:

1. `data.sec.gov/submissions/CIK##########.json` → find the annual reserves
   exhibit, then download it from `sec.gov/Archives/...`. Most reliable route;
   sec.gov never blocks and never rate-limits a polite User-Agent.
2. The company's own MRMR/reserves PDF, downloaded with `curl` and parsed with
   `pypdf` locally. WebFetch chokes above 10 MB and on PDFs generally.
3. The reserves page as HTML. Corporate SPA sites mostly render nothing useful.

**Blocked or fruitless:** AngloGold Ashanti's report host sits behind Incapsula
and refuses curl; goldfields.com serves an incomplete TLS chain (fetch the PDF
from a Mac, not the box); Kinross's site is a client-rendered shell.

**Coordinates are the trap.** Free-text geocoding lies about mine names —
Nominatim put Carlin in Colorado, Yanacocha in Cusco and "AK Deposit" on a mulch
yard in Hamilton; Wikipedia's title lookup put Phoenix in British Columbia. Only
accept a Nominatim hit that is country-scoped AND whose `display_name` names a
mine, or a verified Wikipedia article. Drop anything else — nine rows were
dropped for this reason, including South Deep, which is simply not in OSM.

Reaching the brief's 300–500 projects is a data-acquisition job, not an
engineering one: roughly twenty more operators at the rate above, or a paid feed
(Mining Data Online, S&P). The importer, the validator and the sizing hierarchy
are done and proven against 40 rows.

## Things that will bite

* **Gamma pages at 20 by default.** A batch query naming 50 ids returns 20
  unless `limit` is explicit — this capped the board at 60 markets once.
* **nginx caches `/api/backend/` for 120s and ignores upstream Cache-Control.**
  The market snapshot and the SSE stream have their own `location` blocks in
  `/etc/nginx/sites-available/insider` that bypass that; a new low-latency
  endpoint needs the same treatment or it will serve two-minute-old data.
* **An event stream that is buffered never errors.** The client starts polling
  immediately and only stops when the stream says `hello`, so a proxy that
  swallows events degrades to slow rather than to frozen.
* **USAspending has two different "amounts".** `spending_by_category/recipient`
  gives obligations inside the window (what the bubbles use);
  `spending_by_award` gives lifetime award value, which would show a 1993
  contract as this year's money.
* **Nominatim allows one request per second.** The geocoder sleeps 1.1s between
  calls and sends a real User-Agent; both are conditions of use.
