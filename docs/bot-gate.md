# Bot gate (Cloudflare Turnstile)

Added 2026-09-15 after a headless-Chrome scraper (Tencent Cloud, thousands of
rotating IPs, spoofed desktop Chrome UAs) started crawling `/companies/<TICKER>`
and calling `/api/backend/*` from the browser.

## What it does

`frontend/middleware.ts` runs on every request except `/_next/*`.

1. **Kill switch / fail-open.** If `BOT_GATE_ENABLED !== "1"` or any of
   `BOT_GATE_SECRET`, `TURNSTILE_SECRET_KEY`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
   is empty, every request passes untouched. A build or box without the keys
   can never lock the site out.
2. **Exempt** (never challenged): static files (any path with a file
   extension), `/verify`, `/api/verify`, `/robots.txt`, `/sitemap*`, `/rss*`,
   `/feed*`, `/offline.html`, `/sw.js`, `/manifest*`, `/.well-known/*`,
   `/api/backend/billing/webhook` (Stripe), any request carrying an
   `Authorization` header, and any `/api/*` route other than `/api/backend/*`.
   Server-side rendering fetches (`lib/ssr/prefetch.ts`) go straight to
   `BACKEND_URL` and never pass through the middleware, so nothing
   server-side needs an exemption.
3. **Good bots** bypass on User-Agent: Googlebot, bingbot, Applebot,
   DuckDuckBot, the link-preview bots (facebookexternalhit, Twitterbot,
   LinkedInBot, Slackbot, Discordbot, TelegramBot, WhatsApp, Pinterest, …) and
   the AI crawlers (GPTBot, ClaudeBot, PerplexityBot, OAI-SearchBot,
   meta-externalagent). The regex is `GOOD_BOT_RE` in `frontend/lib/bot-gate.ts`.
   *v1 is UA-only* — no IP/reverse-DNS check for Googlebot yet (TODO in the file).
4. **Cookie check.** A valid `ib_verified` cookie passes. It is
   `<exp>.<sig>` where `exp` is a unix-seconds expiry 30 days out and
   `sig = base64url(HMAC-SHA256(BOT_GATE_SECRET, String(exp)))`. HttpOnly,
   SameSite=Lax, Secure in production, Path=/. Verified with Web Crypto so it
   works in the edge runtime.
5. **No cookie:**
   - `/api/backend/*` → `403 {"error":"bot_verification_required"}`.
   - a page → **rewrite** (not redirect, status 200) to `/verify?return=<original path>`
     with `Cache-Control: private, no-store`, `Vary: Cookie`, `X-Robots-Tag: noindex`
     and `x-bot-gate: challenge`. The page also sets `<meta name="robots" content="noindex">`.
   - In `BOT_GATE_MODE=datacenter` the challenge only fires when the UA looks
     automated (HeadlessChrome, python-requests, curl, …) or nginx sent
     `x-bot-suspect: 1`; everyone else passes without a cookie.

`frontend/app/verify/page.tsx` renders a site-styled card (light + dark via the
existing `data-theme` tokens), loads Turnstile in managed mode with the public
site key, and POSTs the token to `frontend/app/api/verify/route.ts`. That route
calls `https://challenges.cloudflare.com/turnstile/v0/siteverify` with
`TURNSTILE_SECRET_KEY` + the client IP (`x-forwarded-for` / `x-real-ip` from
nginx), signs the cookie on success, and the page does
`window.location.replace(return)` — same-origin paths only (`safeReturnPath`).

## Env vars (`frontend/.env.example`)

| Name | Where | Purpose |
| --- | --- | --- |
| `BOT_GATE_ENABLED` | server | Exactly `"1"` turns the gate on. Anything else = off. |
| `BOT_GATE_MODE` | server | `all` (default) or `datacenter`. |
| `BOT_GATE_SECRET` | server | HMAC key for the cookie. `openssl rand -hex 32`. |
| `TURNSTILE_SECRET_KEY` | server | Cloudflare siteverify secret. |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | build-time public | Widget site key; inlined into the bundle, so **changing it needs a rebuild**. |

Set them in the frontend's `.env.local` / pm2 environment on the EC2 box and
restart Next. The server-side ones are read per request; only the
`NEXT_PUBLIC_*` key is baked at build.

## How to disable (rollback)

Set `BOT_GATE_ENABLED=0` (or unset it) and restart Next. No rebuild, no code
change. Existing cookies are simply ignored.

## How to allowlist a bot

Add its UA fragment to `GOOD_BOT_RE` in `frontend/lib/bot-gate.ts`, rebuild,
deploy. For a path rather than a bot, add it to `EXEMPT_PREFIXES` in the same
file.

## Caching caveat (nginx / CloudFront)

The interstitial is served under the *original* page URL with status 200. It
carries `Cache-Control: private, no-store` and `x-bot-gate: challenge`, but the
`location /` block in `sites-available/insider` currently does
`proxy_hide_header Cache-Control` + `add_header Cache-Control "public, …
s-maxage=60 …" always`, which would let a shared cache store the challenge
page under `/companies/AAPL` for 60 s. Before enabling the gate on prod:

- nginx: add `proxy_no_cache $upstream_http_x_bot_gate;` and
  `proxy_cache_bypass $upstream_http_x_bot_gate;` to that block, and make the
  `add_header` conditional on `$upstream_http_x_bot_gate` being empty (or use
  `map`). Optionally also set `proxy_set_header x-bot-suspect 1` for
  datacenter ASNs if using `BOT_GATE_MODE=datacenter`.
- CloudFront: the default behaviour already forwards `Cookie` into the cache
  key (docs/cloudfront-cdn.md), so verified and unverified visitors never share
  an entry. Keep it that way.

## Known limits / TODO

- Googlebot/Bingbot are trusted on UA alone. A spoofed Googlebot UA gets
  through. Add the published IP-range check when there is time.
- The `/api/backend/*` 403 only protects browser (cookieless) traffic; a
  scraper that solves one Turnstile gets a 30-day cookie. Rotate
  `BOT_GATE_SECRET` to invalidate every cookie at once.
- `/api/og` and other first-party route handlers are not gated.
