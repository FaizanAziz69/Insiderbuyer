# press.insiderbuying.com — the B2B site's subdomain

**Status: live since 2026-08-26.** DNS, nginx and TLS are all done — this file
is the record of what was set up, not a to-do list. The page lives at `/press`
(a Next.js route with its own layout, which the Round-2 brief allows) and the
subdomain's root is proxied onto it.

What is in place:

| Piece | Where |
|---|---|
| `press` A record → 52.2.135.6 | WordPress.com DNS (that account holds the domain) |
| server block | `/etc/nginx/sites-available/press`, symlinked into `sites-enabled` |
| certificate | Let's Encrypt, `press.insiderbuying.com` only, HTTP→HTTPS redirect, certbot auto-renew |
| chrome-free rendering | the route's layout marks itself `data-bare-page`; the shell's chrome is `data-app-chrome` and hides in CSS. Needed because the host root maps onto `/press`, so the browser path is `/` and a path-based bare-route check cannot see it. |

The original setup steps, kept for reference (and for `ir.insiderbuying.com`
if the client ever wants that name too):

## 1. DNS

Add an A record pointing at the same EC2 instance as the main site:

    press.insiderbuying.com.   A   52.2.135.6

(`ir.insiderbuying.com` is the alternative the brief mentions — the client
chooses; the nginx block below just needs the matching `server_name`.)

## 2. nginx server block

The subdomain serves the same Next.js process, rewritten onto `/press`, so
there is nothing extra to deploy or keep in sync:

```nginx
server {
    listen 443 ssl http2;
    server_name press.insiderbuying.com;

    ssl_certificate     /etc/letsencrypt/live/press.insiderbuying.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/press.insiderbuying.com/privkey.pem;

    # Everything on this host is the B2B page; assets and the API still need
    # to reach the app untouched.
    location = / {
        proxy_pass http://127.0.0.1:3000/press;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}

server {
    listen 80;
    server_name press.insiderbuying.com;
    return 301 https://$host$request_uri;
}
```

Certificate:

    sudo certbot --nginx -d press.insiderbuying.com

## 3. Environment

| Variable | Where | What it does |
|---|---|---|
| `NEXT_PUBLIC_CALENDLY_URL` | frontend | Inline Calendly embed in the Book a Call section (brief 4D: inline, not popup). Without it the section shows the contact form only. |
| `NEXT_PUBLIC_GA_ID_B2B` | frontend | GA4 measurement id for the **separate** B2B data stream. Without it the page sends no analytics of its own rather than mixing into the consumer property. |
| `B2B_LEAD_NOTIFY` | backend | Comma-separated emails that get each discovery-call request (via Resend). Without it leads are still stored and tagged, just not emailed. |

Leads land in `b2b_leads` and on the mailing list tagged **`B2B Lead`**, per the
brief. `GET /api/b2b-leads` lists them (admin token when one is set).
