#!/usr/bin/env bash
# Regenerate the OG-unfurl copies of every editorial thumb.
# WhatsApp/iMessage drop og:image files over ~300 KB, so /editorial-thumbs/og/
# holds a 1200px-wide, <=270 KB JPEG of each cover. Run after adding a thumb:
#   npm run thumbs:og   (macOS only — uses sips)
set -euo pipefail
cd "$(dirname "$0")/../public/editorial-thumbs"
mkdir -p og
for f in *.jpg; do
  out="og/$f"; q=78
  while :; do
    sips -Z 1200 -s format jpeg -s formatOptions $q "$f" --out "$out" >/dev/null 2>&1
    sz=$(stat -f%z "$out")
    [ "$sz" -le 270000 ] && break
    q=$((q-8)); [ $q -lt 30 ] && break
  done
  printf "%-45s %7d bytes q=%d\n" "$f" "$sz" "$q"
done
