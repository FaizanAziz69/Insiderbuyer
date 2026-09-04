#!/usr/bin/env node
/**
 * Generate the OG-unfurl copy of every editorial thumb that is missing one.
 *
 * Why this runs as `prebuild` and not by hand (George, 2026-09-04:
 * "Thumbnail not showing"): app/insights/[slug]/layout.tsx rewrites the
 * og:image URL into /editorial-thumbs/og/<file>.jpg. Ship a new cover without
 * that copy and the URL 404s — the site looks right while WhatsApp, iMessage
 * and Slack all unfurl the site-wide IB logo. Wiring it into the build makes
 * it impossible to forget.
 *
 * WhatsApp rules, learned the hard way (2026-08-30):
 *   * og:image over ~300 KB is silently dropped      -> cap at 200 KB
 *   * PROGRESSIVE JPEGs are rejected (logo fallback) -> force baseline
 *   * plain RGB JPEG, no EXIF/ICC, 1200 px wide, aspect kept, no crop
 *
 * Only MISSING copies are written. Regenerating everything on each build would
 * rewrite tracked files with different bytes and leave the deploy checkout
 * dirty, which breaks the `git merge --ff-only` the deploy relies on. Pass
 * --force to rebuild the whole folder deliberately (locally, then commit).
 *
 * Replaces scripts/thumbs-og.py: the server has no Pillow, so the Python
 * version could never run as part of a build there.
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public", "editorial-thumbs");
const OUT = join(ROOT, "og");
const MAX_BYTES = 200_000;
const WIDTH = 1200;
const force = process.argv.includes("--force");

mkdirSync(OUT, { recursive: true });

let written = 0;
for (const name of readdirSync(ROOT).sort()) {
  if (!name.toLowerCase().endsWith(".jpg")) continue;
  const dest = join(OUT, name);
  if (existsSync(dest) && !force) continue;

  const base = sharp(join(ROOT, name)).rotate().resize({ width: WIDTH, withoutEnlargement: true });
  let buf;
  let q = 82;
  for (;;) {
    buf = await base
      .clone()
      // progressive:false -> baseline; sharp drops EXIF/ICC unless asked to keep it
      .jpeg({ quality: q, progressive: false, chromaSubsampling: "4:2:0", mozjpeg: false })
      .toBuffer();
    if (buf.length <= MAX_BYTES || q <= 30) break;
    q -= 6;
  }
  writeFileSync(dest, buf);
  const { width, height } = await sharp(buf).metadata();
  written++;
  console.log(`og thumb ${name.padEnd(40)} ${String(buf.length).padStart(7)} bytes  q=${q}  ${width}x${height}`);
}
console.log(written ? `og thumbs: wrote ${written}` : "og thumbs: all present");
