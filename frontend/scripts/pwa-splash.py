#!/usr/bin/env python3
"""
iOS launch images for the installed PWA.

Android draws its own splash from the manifest (name + icon + background_color).
iOS does not: without an apple-touch-startup-image it shows a white flash on
every cold launch, which reads as a broken app. Each device needs its exact
pixel size, hence the table.

  python3 scripts/pwa-splash.py     (from frontend/)
"""
from PIL import Image
import os

SRC = "app/icon.png"
OUT = "public/pwa/splash"
BG = (7, 13, 31)        # #070d1f — the dark brand surface the app opens on

# (width, height) in device pixels, portrait. Covers current iPhones + iPads.
SIZES = [
    (1290, 2796), (1179, 2556), (1284, 2778), (1170, 2532), (1125, 2436),
    (1242, 2688), (828, 1792), (1242, 2208), (750, 1334), (640, 1136),
    (1536, 2048), (1668, 2224), (1668, 2388), (2048, 2732),
]

os.makedirs(OUT, exist_ok=True)
icon = Image.open(SRC).convert("RGBA")

for w, h in SIZES:
    canvas = Image.new("RGB", (w, h), BG)
    # Icon at ~28% of the short edge, optically centred (slightly above middle).
    side = int(min(w, h) * 0.28)
    art = icon.resize((side, side), Image.LANCZOS)
    canvas.paste(art, ((w - side) // 2, int(h * 0.42) - side // 2), art)
    canvas.save(f"{OUT}/splash-{w}x{h}.png", optimize=True)

print(f"{len(SIZES)} launch images written to {OUT}")
