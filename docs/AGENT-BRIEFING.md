# Briefing for a coding agent on InsiderBuying.com

Paste this whole file as your first message to a fresh agent (Antigravity, or
anything else with shell access to this repo). It is written to be read once
and acted on, so it states the non-obvious things and skips what the code
already shows.

---

You are working on **InsiderBuying.com**, a live financial-data site with paying
subscribers. Read this before touching anything.

## What it is

A NestJS backend and a Next.js 15 App Router frontend in one repo, on one
Postgres database, deployed to a single EC2 box.

```
backend/    NestJS. Global route prefix /api. ~50 feature modules under src/.
frontend/   Next.js App Router. Calls the backend through /api/backend/* which
            proxies to the backend's /api/*.
docs/       Runbooks. Read the one for the area you are touching.
```

The data is real: SEC Form 4 filings, congressional disclosures, 13F holdings,
analyst data. People pay for it. A wrong number on a page is worse than a
missing one, and that judgement drives most of the rules below.

## The one thing to get right first: how deploying works

There is no CI. `git push` does not deploy. The path is deliberate because the
client's repo credentials live only on the server.

```bash
# 1. push to the PUBLIC mirror (origin)
git push origin HEAD:main

# 2. the SERVER pulls from the mirror and pushes to the client repo
ssh -i ~/.ssh/insider-web.pem ubuntu@52.2.135.6 \
  "cd /opt/insider/app && \
   git fetch -q https://github.com/FaizanAziz69/Insiderbuyer.git main:deploy-tmp && \
   git push -q origin deploy-tmp:main && git branch -D deploy-tmp"

# 3. run the deploy DETACHED (it rebuilds both apps then restarts pm2)
ssh -i ~/.ssh/insider-web.pem ubuntu@52.2.135.6 \
  "setsid bash /home/ubuntu/deploy.sh > /tmp/deploy.log 2>&1 < /dev/null & disown"

# 4. wait for it, in a SEPARATE ssh call
until ! ssh -i ~/.ssh/insider-web.pem ubuntu@52.2.135.6 \
  'pgrep -f "bash /home/ubuntu/deploy[.]sh" >/dev/null'; do sleep 20; done
```

Rules that come from real incidents:

- **Detached, always.** A foreground deploy was once interrupted after both
  builds finished but before `pm2 restart`, so the server ran old code while
  the commit looked deployed.
- **Poll in a separate ssh call.** A `pgrep` in the same command as the literal
  `deploy.sh` string matches its own shell and reports RUNNING forever.
- **Someone else may be pushing.** More than one agent works this repo. If your
  push is rejected as non-fast-forward, `git fetch && git rebase origin/main`,
  re-run the tests, then push. Never force.
- **Never `scp` or write files on the server.** Ship everything through git.

Production: `52.2.135.6`, app at `/opt/insider/app`, pm2 processes
`insider-backend` (:4000) and `insider-frontend` (:3000). Postgres connection
string is `DATABASE_URL` in `/opt/insider/app/backend/.env`; the admin token for
guarded routes is `ADMIN_API_TOKEN` in the same file.

## Verification: prod code is not prod data

The most expensive mistake made on this project was reporting a feature done
because it was deployed. The code was live and its database tables were empty,
so the feature did nothing and looked fine.

**Before you say something works, query the thing it produces.** Row counts,
a real API response, the rendered page. If a feature needs a backfill or an
admin run to become real, run it.

Checking a live page needs a crawler user-agent, because a bot gate rewrites
plain `curl` to a challenge page:

```bash
curl -s -A "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" \
  http://127.0.0.1:3000/some-page      # run this ON the server
```

## Traps that have cost real time

**Build errors are invisible to a naive grep.** `nest build` colours its output,
so `grep "error TS"` never matches and a broken build looks clean. Always:

```bash
npm run build 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | grep -E "error TS"
```

**Editing a published article's body needs a rebuild, not a restart.** The page
is statically regenerated; `pm2 restart` will not clear it.

**A replaced image must get a NEW filename.** nginx serves `/editorial-thumbs`
and friends with a 30-day expiry, so overwriting a file in place is invisible
for a month.

**Postgres rejects a batch that touches one key twice** with "ON CONFLICT DO
UPDATE command cannot affect row a second time". Any upsert built from vendor
data must be de-duplicated by its conflict key first. This has bitten three
separate features.

**Vendor quirks (Financial Modeling Prep) that are not in their docs:**
- `historical-market-capitalization` returns ~65 sessions unless you pass an
  explicit `from`, whatever `limit` says.
- The congressional `*-trades-by-name` endpoints ignore `page`; one call is the
  whole record. `house-latest` caps at page 100.
- `historical-price-eod/*` is hard-capped at 5,000 rows, silently.
- Its in-process cache will exhaust the heap on a bulk walk over thousands of
  symbols. Bulk callers pass `noCache: true`.

**On a developer Mac, Python's urllib has no CA bundle.** Every https call fails
`CERTIFICATE_VERIFY_FAILED`. Shell out to `curl` instead.

## House rules you cannot infer from the code

- **Never print a numeric Insider Score in an article body.** It is the
  paywalled product.
- **Paygating is presentation-level.** The API returns full values to anyone who
  asks. This is known and accepted; do not "discover" it as a bug, and do not
  make it worse by seeding paid data into the SSR cache. Keys for paid datasets
  belong in the `SKIP` list in `frontend/lib/ssr/prefetch.ts`.
- **Estimates are labelled everywhere they appear.** Congressional dollar
  figures are range midpoints and 13F figures are quarter-end approximations;
  both carry an `est.` marker in the UI. Do not drop it to tidy a layout.
- **No em dashes in generated prose.** The client asked for this explicitly.
- **Comments say why, not what.** Where a line exists because something broke,
  the comment names the incident. Keep that habit; it is why this file is short.

## How to work

1. **Read the whole brief or request first.** The briefs (`*.docx` in the repo
   root and `~/Downloads`) are specific, and their section numbers are worth
   quoting in commit messages.
2. **Put pure logic in its own file and write a spec for it.** `npm test` in
   `backend/` runs them. The scoring engines, the portfolio construction and the
   reconstruction maths are all pure functions with specs, because a quiet
   arithmetic error there mis-ranks named public figures.
3. **Prefer a small honest output to a padded one.** When a portfolio cannot
   fill its minimum, it says so and holds cash. When a filing is a scan we
   cannot read, it is counted, not guessed. Follow that.
4. **Deploy in phases and verify each one live.** There is no staging.
5. **Ask Faizan, never George.** George is the client; questions go through
   Faizan.

## Where the bodies are buried

| Area | Start here |
|---|---|
| Insider scoring | `backend/src/iqs/`, `backend/src/iqs2/` |
| Congress trades + verification agent | `backend/src/congress-trades/`, `docs/congress-trades/README.md` |
| Politician portfolios (Brief v7) | `backend/src/wealth-tracker/` |
| Quant fund + index (Brief v6) | `backend/src/quant/` |
| Editorial + auto articles | `backend/src/content/`, `docs/editorial-playbook-v2.md` |
| Admin screens | `frontend/app/editorial-desk/`, `frontend/components/admin/` |

Two modules carry rules that are easy to break without noticing: the point-in-time
database in `backend/src/quant/pit.service.ts`, where every read must go through
`factsAsOf` so nothing can see a figure before it was published, and the
verification agent, whose corrections table is append-only by construction.
