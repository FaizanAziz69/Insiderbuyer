# Bot gate — rollout runbook (2026-09-15)

Why: nginx logs Sep 1–15 showed 73k requests from a headless-Chrome scraper on
Tencent Cloud (AS132203, Singapore), 3,156 rotating IPs, spoofed desktop Chrome
UAs, walking every /companies/<TICKER> tab and the browser API. GA4 counted it
as human "direct" traffic. The site had no rate limiting anywhere.

Two halves:

* **App** (`frontend/middleware.ts`, `/verify`, `/api/verify`) — Cloudflare
  Turnstile challenge once per 30 days, signed `ib_verified` cookie, good-bot
  allowlist. Fail-open when env is missing. Details in `../bot-gate.md`.
* **nginx** (`apply-bot-gate.sh`) — 403 for the whole Tencent ASN and known
  scraper UAs, per-IP rate limits (pages 10 r/s burst 30, API 30 r/s burst 60,
  40 concurrent connections), cache bypass for uncookied visitors so the
  interstitial is never cached under a real page URL, uncached `/verify` and
  `/api/verify` locations that may set cookies.

## Order of operations

1. **nginx first** (safe before the app ships — `/verify` just 404s until then):

       ssh -i ~/.ssh/insider-web.pem ubuntu@52.2.135.6 'sudo bash -s' < docs/bot-gate/apply-bot-gate.sh

2. **Env** on the box — append to `/opt/insider/app/frontend/.env.production`
   (Next reads it at build AND runtime; `NEXT_PUBLIC_*` is baked in at build):

       BOT_GATE_ENABLED=1
       BOT_GATE_MODE=all
       BOT_GATE_SECRET=<openssl rand -hex 32>
       TURNSTILE_SECRET_KEY=<Cloudflare → Turnstile → insiderbuying-bot-gate → Secret key>
       NEXT_PUBLIC_TURNSTILE_SITE_KEY=<… → Site key>

   Widget: Cloudflare account Devs@insiderbuying.com → Turnstile →
   `insiderbuying-bot-gate` (hostname insiderbuying.com, Managed mode).

3. **Deploy** the app: `bash ~/deploy-insider.sh`.

4. **Verify** (from any machine):

       curl -sI -A Bytespider https://insiderbuying.com/ | head -1          # 403
       curl -sI https://insiderbuying.com/companies/UBER | grep -i x-bot-gate  # challenge
       curl -s -o /dev/null -w '%{http_code}\n' https://insiderbuying.com/api/backend/trades?limit=1  # 403
       curl -sI -A Googlebot https://insiderbuying.com/ | head -1           # 200
       for i in $(seq 1 60); do curl -s -o /dev/null -w '%{http_code} ' https://insiderbuying.com/api/backend/trades?limit=1; done  # some 429

   In a real browser: open the site, a brief "Checking your browser" card,
   then the page. `document.cookie` will NOT show `ib_verified` (HttpOnly).

## Rollback

* App: set `BOT_GATE_ENABLED=0` in `.env.production`, `pm2 restart insider-frontend --update-env`.
* nginx: `sudo cp /home/ubuntu/nginx-insider-before-botgate-<stamp>.bak /etc/nginx/sites-enabled/insider && sudo rm /etc/nginx/conf.d/bot-gate.conf /etc/nginx/conf.d/blocked-prefixes.conf && sudo nginx -t && sudo systemctl reload nginx`.

## Tuning

* Another scraper network: append its prefixes to
  `/etc/nginx/conf.d/blocked-prefixes.conf` (`x.x.x.x/nn 1;`), reload.
  Look them up with `whois -h whois.cymru.com " -v <ip>"`.
* Only challenge datacenter/suspect traffic: `BOT_GATE_MODE=datacenter`.
* Allowlist a bot: `GOOD_BOT_RE` in `frontend/lib/bot-gate.ts`.
