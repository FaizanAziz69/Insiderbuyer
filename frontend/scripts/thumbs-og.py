#!/usr/bin/env python3
"""Regenerate the OG-unfurl copies of every editorial thumb.

WhatsApp rules learned the hard way (2026-08-30):
  * og:image over ~300 KB is silently dropped  -> we cap at 200 KB
  * PROGRESSIVE JPEGs are rejected (favicon fallback) -> force baseline
  * keep it a plain RGB JPEG, no EXIF/ICC, 1200 px wide (aspect kept, no crop)
Run after adding a thumb:  npm run thumbs:og
"""
import os, io, sys
from PIL import Image

ROOT = os.path.join(os.path.dirname(__file__), "..", "public", "editorial-thumbs")
OUT = os.path.join(ROOT, "og")
os.makedirs(OUT, exist_ok=True)
MAX_BYTES, WIDTH = 200_000, 1200

for name in sorted(os.listdir(ROOT)):
    if not name.lower().endswith(".jpg"):
        continue
    im = Image.open(os.path.join(ROOT, name)).convert("RGB")
    if im.width > WIDTH:
        im = im.resize((WIDTH, round(im.height * WIDTH / im.width)), Image.LANCZOS)
    q = 82
    while True:
        buf = io.BytesIO()
        # progressive=False + optimize -> baseline JPEG; no exif/icc is passed
        im.save(buf, "JPEG", quality=q, optimize=True, progressive=False, subsampling=2)
        if buf.tell() <= MAX_BYTES or q <= 30:
            break
        q -= 6
    with open(os.path.join(OUT, name), "wb") as f:
        f.write(buf.getvalue())
    print(f"{name:45s} {buf.tell():7d} bytes  q={q}  {im.width}x{im.height}")
