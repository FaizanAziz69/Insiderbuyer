# Bubble Visualizer Suite — operating notes

Four products on one platform (Developer Brief v2). Everything lives under
`/visualizers`; the backend is `backend/src/visualizers`, the shared frontend
platform is `frontend/lib/visualizers` + `frontend/components/visualizers`.

| Product | Route | Data | State |
|---|---|---|---|
| Prediction Market Bubbles | `/visualizers/prediction-markets` | Polymarket Gamma + CLOB + data API, polled every 15s, deltas over SSE | live |
| Government Contracts | `/visualizers/government-contracts` | USAspending.gov + open.canada.ca, rebuilt nightly | live |
| Goldminer AI | `/visualizers/goldminer` | curated project seed — **not yet loaded** | machinery live, dataset pending |
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

## Why Goldminer ships empty

§4.4 assigns curation of the top 300–500 projects to editorial (~2–3 weeks) and
§12 Q2 (buy vs scrape vs curate) is unanswered. Every free source we tested
fails §8's rule that each figure carries a source and an as-of date: USGS MRDS
holds occurrences with no economics, and Wikipedia's mine infoboxes yielded
fourteen usable rows and no resource figures. Rather than put unsourced numbers
on the map, the product ships complete and says what it is waiting for.

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
