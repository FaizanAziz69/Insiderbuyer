#!/usr/bin/env python3
"""
Generate the PWA icon set from app/icon.png.

Two families, because Android and iOS mask differently:

  · purpose "any"      — the artwork as drawn, transparent corners intact.
  · purpose "maskable" — Android crops to a circle/squircle and will slice the
    corners off an edge-to-edge icon, so the artwork is scaled into the central
    safe zone (66%) on a solid brand ground. Without this the monogram loses
    its edges on most Android launchers.

iOS ignores the manifest icons for the home screen and uses apple-touch-icon,
which must be opaque — a transparent PNG renders on black there.

  python3 scripts/pwa-icons.py     (from frontend/)
"""
from PIL import Image
import os

SRC = "app/icon.png"
OUT = "public/pwa"
BRAND = (0, 88, 130, 255)          # #005882 — the icon's own ground
SAFE = 0.66                        # maskable safe-zone fraction

os.makedirs(OUT, exist_ok=True)
src = Image.open(SRC).convert("RGBA")

def flatten(im, bg=BRAND):
    base = Image.new("RGBA", im.size, bg)
    base.alpha_composite(im)
    return base

# purpose: any — keep the shaped artwork
for size in (96, 128, 192, 256, 384, 512):
    src.resize((size, size), Image.LANCZOS).save(f"{OUT}/icon-{size}.png", optimize=True)

# purpose: maskable — safe-zone inset on a solid ground
for size in (192, 512):
    canvas = Image.new("RGBA", (size, size), BRAND)
    inner = int(size * SAFE)
    art = src.resize((inner, inner), Image.LANCZOS)
    off = (size - inner) // 2
    canvas.alpha_composite(art, (off, off))
    canvas.save(f"{OUT}/icon-{size}-maskable.png", optimize=True)

# Apple touch icon — opaque, 180
flatten(src.resize((180, 180), Image.LANCZOS)).convert("RGB").save(
    f"{OUT}/apple-touch-icon.png", quality=95, optimize=True
)

print("icons written to", OUT)
for f in sorted(os.listdir(OUT)):
    print("  ", f, os.path.getsize(os.path.join(OUT, f)), "bytes")
