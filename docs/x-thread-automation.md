# Repurposing every article into an X thread — process and build plan

Prepared for George, 2026-09-02. Answers three questions: what the best
mechanism is, what the automated process looks like, and what is needed to
switch it on.

---

## 1. The short version

Every article on the site is published through **one** function —
`POST /content/editorial` → `ContentService.publishEditorial()`. The daily
generator, the stock-idea inserts and every manual publish all pass through
it. That single choke point is what makes "the thread goes out at the same
time as the article" achievable rather than approximate: we hook the publish
itself, not a feed that something polls afterwards.

**Recommended shape:**

```
publishEditorial()
      │  (same transaction — the article is live)
      ├─► compose thread   (Claude, our existing Anthropic client)
      ├─► render 3–5 visuals (templated cards + the article cover)
      └─► emit webhook ──► n8n ──► X API  ──► reply-chain posted
                             │
                             └─► (optional) hold for approval in Slack/email
```

**Why split it that way.** Composition belongs in our backend: that is where
the article body, the ticker, the filing links and the editorial checklist
already live, and where the Anthropic client is already wired. Posting belongs
in n8n: retries, rate limits, media upload order, credential storage and a
human approval step are exactly what it is good at, and editorial can change
the flow without a deploy. Putting composition in n8n would mean duplicating
the compliance rules in a second place, which is how the two drift apart.

**If you want fewer moving parts,** everything can live in the backend and skip
n8n entirely — the trade is that changing the prompt or adding an approver
becomes a deploy instead of a drag-and-drop.

---

## 2. What a thread looks like

3–5 posts, first one carries the hook, last one carries the link. Every claim
traceable to the filing, same as the articles.

```
1/  Post 1 — the finding, with the ticker and the number that matters.
    Visual: branded stat card (ticker, dollar amount, role).

2/  Post 2 — who bought and what it cost them.
    Visual: the insider card (name, title, size of the buy).

3/  Post 3 — the context that makes it a story (cluster, first buy,
    bought into weakness).
    Visual: the article's own data-viz, rendered to PNG.

4/  Post 4 — what it does not mean. The honest caveat.
    Visual: none, or the grade/band card.

5/  Post 5 — link to the article + "filed with the SEC on <date>".
    Visual: the article's OG cover (already 1200×747 on disk).
```

**Rules the composer must enforce** (these are already in
`backend/src/content/editorial-checklist.ts` and the playbook — the thread
inherits them, it does not get its own looser set):

- **Never print a numeric Insider Score.** The publish path strips it from
  articles; the same rule applies here. Band, never number.
- Every factual claim references a Form 4 / the filing date.
- No projections, no "buy this", no implied recommendation.
- Ticker in the first post, `$TICKER` cashtag form.
- ≤280 characters per post, counted after the link is shortened.

---

## 3. Visuals — what exists and what has to be built

| Asset | Status |
|---|---|
| Article cover, 1200×747, ≤200 KB baseline JPEG | **Exists.** 35 of them in `frontend/public/editorial-thumbs/og/`, already generated for social unfurls by `npm run thumbs:og`. |
| Branded stat card (ticker, $ amount, role, badge) | **To build.** Server-rendered SVG → PNG. Deterministic, on-brand, no headless browser, ~50 ms each. This is the workhorse — one per post. |
| The article's data-viz embed as an image | **To build.** The charts are live HTML/SVG in the page; turning one into a PNG needs a headless-Chrome screenshot step. Slower and more fragile than the cards, so treat it as a nice-to-have for post 3 rather than a dependency. |

Recommendation: build the stat-card renderer first and ship threads with
cards + the cover. Add chart screenshots later if the engagement justifies the
extra moving part.

---

## 4. Cost — and this is the part that changed recently

X moved to **pay-per-use in February 2026**. The old free tier is closed to new
developers and the $200/month Basic tier has been retired, with its subscribers
migrated to pay-per-use from 1 June 2026.

Reported rates: **$0.015 per post, rising to $0.20 for a post containing a
link**, and reads at $0.005 each.

What that means for us, assuming a 5-post thread where only the last post
carries the link:

| Articles per day | Threads / month | Cost / month |
|---|---|---|
| 1 | 30 | **~$8** |
| 2 | 60 | **~$16** |
| 5 | 150 | **~$39** |
| 10 | 300 | **~$78** |

Comfortably under the $200/month vendor threshold in the main brief, even at ten
articles a day. **Confirm the exact rates in the X developer portal when the
account is created** — pay-per-use pricing is new and these are the published
figures, not something we have been billed for yet.

A cheaper structural option if the link rate bites: put the link in a **reply
posted by the same account a minute later**, or in the profile, rather than in
the thread. Worth testing once, not worth designing around up front.

---

## 5. The build, in order

**Phase 1 — composer (backend, ~1 day).**
`ContentService.publishEditorial()` gains a post-commit hook that calls a new
`XThreadService.composeFromArticle(post)`. It sends the article body, ticker,
insider details and filing URL to Claude with the checklist rules, gets back a
structured `{posts: [{text, visual}]}`, validates it (character counts, no
score leak, link present exactly once) and stores it as a **draft thread** row.
A composition that fails validation is stored with its errors, never posted.

**Phase 2 — visuals (backend, ~half a day).**
Stat-card renderer: SVG template + the brand tokens (Archivo/Nunito/Plex Mono,
navy `#0A1E3C`, green `#0E9F6E`, gold `#C9A227`), rasterised to PNG, written
beside the article's assets.

**Phase 3 — delivery (n8n, ~half a day).**
Webhook receives `{threadId, posts[], mediaPaths[]}`. For each post: upload
media → create post → chain the next as a reply to the previous. On failure,
retry twice then alert. Posts the thread only after the article URL returns
200, so a thread can never point at a page that has not deployed yet.

**Phase 4 — approval (toggle).**
Ship with **approval ON**: the thread lands in the Editorial Desk (or Slack)
and goes out on a click. Flip to fully automatic once the copy has proven
itself over a couple of weeks. This is a public company account — the first
version of anything that posts to it unattended should have a person in the
loop, and it costs one click.

---

## 6. What is needed to start

**From George:**

1. **An X developer account on the InsiderBuying handle** — with pay-per-use
   billing enabled and a credit balance. Everything else waits on this.
2. **API credentials** for it: API key + secret, and an **OAuth 2.0 access
   token with `tweet.write`, `users.read` and `media.write` scopes** for the
   posting account. Read-only keys will not post.
3. **A decision on the approval gate** — start with a human click (recommended)
   or go straight to fully automatic.
4. **Where approvals should land** if we use them: Editorial Desk, Slack, or
   email.
5. **Confirmation on the paywall question**: how much of a gated article's
   substance the thread may give away. A thread that answers the question
   removes the reason to click.

**From us, once those exist:** an n8n instance (a small container on the
existing box is enough — it does not need its own server), and the three build
phases above, ~2 days of work in total.

**Not needed:** any new AI vendor. The composition runs on the Anthropic client
the article generator already uses.

---

## 7. One thing worth deciding early

Article generation is currently **paused** (`content_generation_off`), and the
site is under an article freeze. Nothing will publish, and therefore nothing
will tweet, until that is lifted. Whichever way this is built, it should be
tested end to end against a **draft** article first — `publishEditorial`
already supports `draft: true`, which makes a post live at its URL but absent
from every feed. That gives a real article and a real thread to review without
either appearing on the site or the timeline.
