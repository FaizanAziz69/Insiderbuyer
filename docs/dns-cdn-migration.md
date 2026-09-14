# Putting the site behind a CDN — the DNS side

## Where DNS lives today

`insiderbuying.com` is served by **WordPress.com nameservers**
(`ns1/ns2/ns3.wordpress.com`) and the apex points straight at the EC2. There
is no CDN in front of the site; `img.insiderbuying.com` is the only thing
already on CloudFront.

## Why a nameserver change is needed at all

CloudFront and Cloudflare are both reached by hostname, not by a fixed IP,
and **plain DNS cannot put a CNAME on the apex** (`insiderbuying.com` itself).
Getting the apex onto a CDN needs one of:

- **Route 53** — an `ALIAS` record, which resolves a CloudFront distribution
  at the apex. Stays inside the AWS account we already use.
- **Cloudflare** — CNAME flattening does the same thing, and Cloudflare has
  edge locations *inside Pakistan* (Karachi, Lahore, Islamabad) where
  CloudFront's nearest is Mumbai or Dubai.

Either way the nameservers move off WordPress.com, and **that is the risky
step, because email runs on this domain.** Everything below exists so the move
cannot lose anything.

## The complete current record set

Captured 2026-09-14. Recreate ALL of it at the new provider **before**
changing the nameservers at the registrar.

| Type | Name | Value | Note |
|---|---|---|---|
| A | `@` | `52.2.135.6` | becomes ALIAS/CNAME → CDN |
| CNAME | `www` | `insiderbuying.com` | becomes ALIAS/CNAME → CDN |
| CNAME | `img` | `dxefznebon2cd.cloudfront.net` | existing asset CDN, unchanged |
| A | `press` | `52.2.135.6` | serves 200, leave on the origin |
| A | `api` | `52.2.135.6` | 404s — unused, safe to drop |
| MX | `@` | `1 aspmx.l.google.com` | **email — must not be lost** |
| MX | `@` | `5 alt1.aspmx.l.google.com` | |
| MX | `@` | `5 alt2.aspmx.l.google.com` | |
| MX | `@` | `10 alt3.aspmx.l.google.com` | |
| MX | `@` | `10 alt4.aspmx.l.google.com` | |
| TXT | `@` | `v=spf1 include:_spf.google.com include:_spf.wpcloud.com ~all` | **email** |
| TXT | `@` | `google-site-verification=IBbf0Sx7keYy__Hn52V0-0qLO0hObwU40JFGR_3fnfQ` | Search Console |
| TXT | `@` | `google-site-verification=rXOxyZounnZasA8Z7oaD3c14JdjS9aKSWvsR1EbUSIQ` | Search Console |
| TXT | `_dmarc` | `v=DMARC1;p=none;` | **email** |
| TXT | `_domainconnect` | `public-api.wordpress.com/…` | WordPress plumbing, drop it |

Notes:
- **There is no DKIM record** (`google._domainkey` is empty). Email is
  SPF-only today. Worth adding in Google Workspace afterwards, but it is not
  part of this move.
- The `_spf.wpcloud.com` include is a WordPress leftover. Harmless; leave it
  until someone confirms nothing sends through WordPress.

## Status as of 2026-09-14 — the zone is BUILT and VERIFIED

A Route 53 hosted zone for this domain **already existed** (`Z02585321O5CFNAA6P2Y6`,
prepared by an earlier session) and was **missing its `_dmarc` record** — moving
nameservers in that state would have silently dropped DMARC. It has been added.

Every record has been queried against Route 53's own nameserver
(`ns-1986.awsdns-56.co.uk`) while it is NOT yet authoritative, and all of them
answer correctly: apex A, `www`, `img`, `press`, `origin`, all five MX, the SPF
and both Google verification TXT values, and `_dmarc`. A sweep of eighteen
other likely subdomain names found nothing else on the live zone to carry over.

The zone also already contains `origin.insiderbuying.com` → 52.2.135.6 (the
hostname CloudFront will use as its origin — it must differ from the alias, or
the distribution would resolve its own origin back to itself) and both ACM
validation CNAMEs, so the `insiderbuying.com` + `www` certificate validates by
itself once the nameservers move.

**Delegation set — the four nameservers to set at the registrar:**

```
ns-1986.awsdns-56.co.uk
(+ the three others: aws route53 get-hosted-zone --profile insider \
     --id Z02585321O5CFNAA6P2Y6 --query DelegationSet.NameServers)
```

### Measured, on the real pages, before any of this

`/insiders/hot`, same connection, `curl --compressed`:

| | connect | TLS | TTFB | total |
|---|---|---|---|---|
| origin, direct | 0.25s | 0.51s | 0.75s | **1.29s** |
| through CloudFront | 0.06s | 0.12s | 0.31s | **0.29s** |

**4.4x.** The CloudFront column was measured by requesting the same page
through the existing `img.insiderbuying.com` distribution, whose origin is
already this site — so it is the real path, not an estimate.

## Order of operations — nothing user-facing changes until step 5

1. Apply `nginx-cdn-html.conf` at the origin (see `cloudfront-cdn.md`). Safe
   on its own: `s-maxage` is read only by shared caches, and there is no
   shared cache yet.
2. Create the CDN distribution with the origin set to the EC2, and the
   behaviours in `cloudfront-cdn.md`.
3. Recreate every record above at the new DNS provider, **apex still pointing
   at `52.2.135.6`**. Verify by querying the new nameservers directly before
   they are authoritative.
4. Test the site on the distribution's own hostname. Compare TTFB against the
   origin from a distant connection. Nothing public has moved yet.
5. Change the nameservers at the registrar, then flip the apex and `www` to
   the CDN.
6. Watch email. Send one message in and one out.

**Rollback** is the apex record pointed back at `52.2.135.6`. Keep the TTL low
(300s) through the switch so that rollback is minutes, not hours.
