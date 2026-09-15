#!/bin/bash
# Applies the nginx half of the bot gate on the production box. Self-contained:
# run it FROM YOUR MAC as
#
#   ssh -i ~/.ssh/insider-web.pem ubuntu@52.2.135.6 'sudo bash -s' < docs/bot-gate/apply-bot-gate.sh
#
# or on the box as `sudo bash apply-bot-gate.sh`. Idempotent: re-running only
# refreshes the Tencent prefix list. Backs up the site config first.
#
# What it does:
#   1. /etc/nginx/blocked-prefixes.txt  — every IPv4 prefix Tencent
#      Cloud (AS132203) announces, fetched live from RIPEstat.
#   2. /etc/nginx/conf.d/bot-gate.conf          — geo deny map, scraper-UA map,
#      per-IP rate-limit zones, cookie map.
#   3. Patches /etc/nginx/sites-enabled/insider — 403 for blocked networks/UAs,
#      limit_req on pages and /api/backend/, cache bypass for visitors without
#      the ib_verified cookie, uncached /verify + /api/verify locations.
#   4. nginx -t, then reload.
set -euo pipefail

SITE=/etc/nginx/sites-enabled/insider
CONFD=/etc/nginx/conf.d
STAMP=$(date +%s)

echo "== 1/4 Tencent AS132203 prefixes"
TMP=$(mktemp)
curl -fsS --max-time 30 "https://stat.ripe.net/data/announced-prefixes/data.json?resource=AS132203" \
  | python3 -c '
import sys, json
d = json.load(sys.stdin)["data"]["prefixes"]
v4 = sorted({p["prefix"] for p in d if ":" not in p["prefix"]})
assert len(v4) > 500, ("suspiciously short prefix list", len(v4))
print("# Tencent Cloud AS132203 announced IPv4 prefixes (RIPEstat). Headless-Chrome")
print("# scraper fleet: 3,156 rotating IPs / 73k requests in the two weeks to 2026-09-15.")
for p in v4:
    print(f"{p} 1;")
print(len(v4), "prefixes", file=sys.stderr)
' > "$TMP"
install -m 644 "$TMP" /etc/nginx/blocked-prefixes.txt; rm -f "$CONFD/blocked-prefixes.conf"
rm -f "$TMP"

echo "== 2/4 conf.d/bot-gate.conf"
cat > "$CONFD/bot-gate.conf" <<'BG'
# Bot gate — 2026-09-15. Pairs with the Turnstile middleware in the Next app.
# Source of truth: docs/bot-gate/nginx/bot-gate.conf in the repo.

geo $block_asn {
    default 0;
    include /etc/nginx/blocked-prefixes.txt;
}

map $http_user_agent $block_ua {
    default 0;
    ~*(Bytespider|Sogou\ web\ spider|MJ12bot|PetalBot|python-requests|Go-http-client|scrapy|Java/|libwww-perl|okhttp) 1;
}

map $remote_addr $rl_key {
    127.0.0.1   "";
    52.2.135.6  "";
    default     $binary_remote_addr;
}
limit_req_zone $rl_key zone=rl_pages:20m rate=10r/s;
limit_req_zone $rl_key zone=rl_api:20m   rate=30r/s;
limit_conn_zone $rl_key zone=rl_conn:20m;
limit_req_status 429;
limit_conn_status 429;

map $cookie_ib_verified $no_verified {
    ""      1;
    default 0;
}
BG

echo "== 3/4 patch site config"
cp "$SITE" "/home/ubuntu/nginx-insider-before-botgate-$STAMP.bak"
python3 - <<'PY'
import sys
p = '/etc/nginx/sites-enabled/insider'
s = open(p).read()
if 'Bot gate (2026-09-15)' in s:
    print('site config already patched'); sys.exit(0)

def once(old, new):
    global s
    assert s.count(old) == 1, ('anchor count', s.count(old), old[:60])
    s = s.replace(old, new)

H = '''    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
'''

once('  resolver 127.0.0.53 valid=300s ipv6=off;\n',
'''  resolver 127.0.0.53 valid=300s ipv6=off;

  # Bot gate (2026-09-15): whole scraper networks and scraper UAs are refused
  # here, before any upstream work. Maps live in conf.d/bot-gate.conf.
  if ($block_asn) { return 403; }
  if ($block_ua)  { return 403; }
  limit_conn rl_conn 40;
''')

once('''  location /api/backend/ {
    proxy_pass http://next_up;
''', '''  location /api/backend/ {
    limit_req zone=rl_api burst=60 nodelay;
    proxy_pass http://next_up;
''')
once('    proxy_cache_bypass $http_authorization;\n    proxy_no_cache $http_authorization;\n',
     '    proxy_cache_bypass $http_authorization $no_verified;\n    proxy_no_cache $http_authorization $no_verified;\n')

once('  location / {\n    proxy_pass http://next_up;\n',
'''  # Bot gate: the interstitial and its verify endpoint are never cached and
  # must be allowed to set the ib_verified cookie (location / hides Set-Cookie).
  location = /api/verify {
    limit_req zone=rl_api burst=20 nodelay;
    proxy_pass http://next_up;
''' + H + '''    proxy_cache off;
  }
  location = /verify {
    limit_req zone=rl_pages burst=30 nodelay;
    proxy_pass http://next_up;
''' + H + '''    proxy_cache off;
  }

  location / {
    limit_req zone=rl_pages burst=30 nodelay;
    proxy_pass http://next_up;
''')

# api.insiderbuying.com exposes Nest directly: same network/UA refusal + API rate limit
once('''  server_name api.insiderbuying.com;
  client_max_body_size 20m;
  location / {
    proxy_pass http://api_up;
''', '''  server_name api.insiderbuying.com;
  client_max_body_size 20m;
  # Bot gate (2026-09-15): same refusals as the main host.
  if ($block_asn) { return 403; }
  if ($block_ua)  { return 403; }
  limit_conn rl_conn 40;
  location / {
    limit_req zone=rl_api burst=60 nodelay;
    proxy_pass http://api_up;
''')
once('    proxy_cache_bypass $http_authorization $bypass_bot;\n    proxy_no_cache $http_authorization $bypass_bot;\n',
     '    proxy_cache_bypass $http_authorization $bypass_bot $no_verified;\n    proxy_no_cache $http_authorization $bypass_bot $no_verified;\n')

open(p, 'w').write(s)
print('site config patched')
PY

echo "== 4/4 test + reload"
nginx -t
systemctl reload nginx
echo "RELOADED — backup at /home/ubuntu/nginx-insider-before-botgate-$STAMP.bak"
