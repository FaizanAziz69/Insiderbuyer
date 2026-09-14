# Putting CloudFront in front of the whole site

## Why — the measurement, not a hunch

Every page on this site renders on the server in **4–150 ms**:

```
/                        0.006s      /news                0.149s
/insiders                0.004s      /lists               0.071s
/insiders/hot            0.012s      /market-data/top-gainers 0.072s
/trades                  0.012s      /screener            0.037s
```

The same pages take **1.0–1.5 s** from Pakistan. The gap is geography, and
the breakdown says so precisely (`/insiders/hot`, `curl --compressed`):

```
dns 0.003s → connect 0.340s → TLS 0.556s → TTFB 0.762s → done 1.219s
```

A TCP handshake to us-east-1 is one full round trip (**~337 ms**), TLS 1.3
adds another (**~216 ms**), and the request itself a third (**~206 ms**).
Roughly **750 ms of every 1.2 s is spent on the wire before the origin has
been asked for anything.** nginx is already doing its part — HTTP/2 and TLS
1.3 are on, gzip is on, static assets carry `immutable`.

There is nothing left to tune at the origin. The only remaining lever is to
stop making distant users talk to Virginia. `img.insiderbuying.com` already
proves it: TLS on that CloudFront host completes in **48 ms** against 216 ms
for the origin, because the handshake terminates at a nearby edge.

## What changes

| | today | with CloudFront |
|---|---|---|
| TCP + TLS | ~550 ms to Virginia | ~80 ms to the nearest edge |
| Static asset (`immutable`) | full round trip each | edge hit, ~50 ms |
| HTML | full round trip each | edge hit while fresh |
| Origin load | every request | only cache misses |

## The one origin change it needs

`sites-available/insider` currently ends the `location /` block with:

```nginx
proxy_hide_header Cache-Control;
add_header Cache-Control "public, max-age=0, must-revalidate" always;
```

That was right when **this box was the CDN** (see the comment above it,
2026-09-11: without it a browser cached prerendered HTML heuristically and
kept showing a build we had already replaced). Once CloudFront is in front,
the box is no longer the edge, and this header tells CloudFront not to cache
HTML at all — every page view would still cross the ocean.

Replace it with `nginx-cdn-html.conf` in this directory:

```nginx
add_header Cache-Control "public, max-age=0, must-revalidate, s-maxage=60, stale-while-revalidate=600" always;
```

`max-age=0, must-revalidate` is unchanged, so the browser still revalidates
on every view and the 2026-09-11 stale-markup fix still holds. `s-maxage=60`
applies **only to shared caches**, so CloudFront serves the page from the
edge for a minute and refreshes it in the background.

## Distribution settings

- **Origin**: `insiderbuying.com` (the EC2), HTTPS only, origin protocol
  policy `https-only`, keep-alive on.
- **Behaviours**, in order:
  1. `/_next/static/*` → cache by URL only, forward no cookies, no query.
     Assets are content-hashed and `immutable`.
  2. `/editorial-thumbs/*`, `/sales/*`, `/sounds/*`, `/investors/*` → same.
  3. `/api/backend/visualizers/markets/stream` → **cache disabled**, and it
     must not be buffered: it is Server-Sent Events.
  4. `/api/backend/*` → honour origin `Cache-Control`, forward the
     `Authorization` header, cache on querystring.
  5. `/*` (default) → honour origin `Cache-Control`, forward
     `Authorization` + `Cookie`, cache on querystring.
- **Compress objects automatically**: on.
- **HTTP/3**: on.
- Forward `Authorization` wherever it is used, or a signed-in visitor gets
  another visitor's cached answer. The paygates read `/billing/status` from
  the browser and the SSR renders the logged-out view, so the HTML itself is
  the same for everyone — but the API responses are not.

## Order of operations

1. Apply `nginx-cdn-html.conf` (safe on its own — nothing caches `s-maxage`
   today except a CDN that does not exist yet).
2. Create the distribution and **test it on its `*.cloudfront.net` name**
   while DNS still points at the origin. Nothing user-facing has changed yet.
3. Compare TTFB on the CloudFront name against the origin from a distant
   connection.
4. Only then move the DNS record. Rollback is the same record pointed back.
