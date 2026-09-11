#!/usr/bin/env node
/**
 * Editorial-thumb responsive variants.
 *
 * The client-supplied covers in public/editorial-thumbs are full-bleed JPEGs
 * (1606x1000, ~400 KB each) and every card on the site was loading them at
 * full size into a 236-380 px slot — measured 2026-09-11: the homepage pulled
 * 112 images / 5.7 MB, which is what made clicking feel "slow and delayed"
 * (George, 2026-09-11) on any normal connection: the navigation's RSC fetch
 * queues behind megabytes of pictures.
 *
 * This writes two webp variants per cover:
 *   public/editorial-thumbs/w480/<name>.webp   card / thumb slots
 *   public/editorial-thumbs/w960/<name>.webp   retina cards + wide heroes
 *
 * The full-size JPEG stays as-is — it is still the og:image (social unfurls
 * want the big one) and the last srcset candidate.
 *
 * Variants are committed, and lib/thumb-variants.json records which covers
 * have them, so a newly dropped cover that nobody ran this script for simply
 * keeps serving the original instead of 404-ing a missing webp.
 *
 * Run after adding a cover:  node scripts/make-image-variants.mjs
 */
import { readdir, mkdir, writeFile, stat } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.join(process.cwd(), "public", "editorial-thumbs");
const MANIFEST = path.join(process.cwd(), "lib", "thumb-variants.json");
const WIDTHS = [480, 960];

const files = (await readdir(ROOT)).filter((f) => /\.(jpe?g|png)$/i.test(f));
const done = [];
let before = 0;
let after = 0;

for (const w of WIDTHS) await mkdir(path.join(ROOT, `w${w}`), { recursive: true });

for (const file of files.sort()) {
  const base = file.replace(/\.(jpe?g|png)$/i, "");
  const src = path.join(ROOT, file);
  before += (await stat(src)).size;
  for (const w of WIDTHS) {
    const out = path.join(ROOT, `w${w}`, `${base}.webp`);
    await sharp(src)
      .resize({ width: w, withoutEnlargement: true })
      // q72 is indistinguishable at card size; q80 costs ~35% more bytes.
      .webp({ quality: w === 480 ? 72 : 78 })
      .toFile(out);
    if (w === 480) after += (await stat(out)).size;
  }
  done.push(base);
}

await writeFile(MANIFEST, `${JSON.stringify(done, null, 2)}\n`);

const mb = (n) => `${(n / 1024 / 1024).toFixed(1)} MB`;
console.log(
  `${done.length} covers → w480 + w960 webp\n` +
    `originals ${mb(before)}  →  w480 set ${mb(after)} ` +
    `(${Math.round((1 - after / before) * 100)}% smaller)\n` +
    `manifest: lib/thumb-variants.json`,
);
