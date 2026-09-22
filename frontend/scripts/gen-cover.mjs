#!/usr/bin/env node
/**
 * Generate an editorial cover with Google's image model and write it at house
 * size, ready to pin in lib/editorial-thumbs.ts.
 *
 * WHY A SCRIPT AND NOT A BACKEND ROUTE. Covers do not live in the database
 * (blog_posts.imageUrl is empty on every live editorial); they are files in
 * public/editorial-thumbs matched to a slug by SLUG_OVERRIDES. So a cover has
 * to end up as a committed file, which means the generator belongs next to
 * thumbs-og.mjs, not in a request handler.
 *
 *   node scripts/gen-cover.mjs --name copper-wire-burry \
 *     --prompt "coiled industrial copper wire and cathode sheets" \
 *     [--slug editorial-... ] [--model gemini-3-pro-image] [--no-house]
 *
 * The key comes from GEMINI_API_KEY in frontend/.env.local, which is
 * gitignored. NEVER put it in a tracked file: this repo is mirrored to a
 * PUBLIC GitHub repo, so a key in code is a published key.
 *
 * Output: public/editorial-thumbs/<name>.jpg at exactly 1606x1000 (the house
 * size the README fixes), plus the 1200-wide OG copy that the WhatsApp unfurl
 * needs. It prints the SLUG_OVERRIDES line to paste.
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const THUMBS = join(HERE, "..", "public", "editorial-thumbs");
const W = 1606;
const H = 1000;
const OG_WIDTH = 1200;
const OG_MAX_BYTES = 200_000;

/** Load GEMINI_API_KEY from the environment or frontend/.env.local. */
function apiKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  const envFile = join(HERE, "..", ".env.local");
  if (existsSync(envFile)) {
    const m = readFileSync(envFile, "utf8").match(/^GEMINI_API_KEY\s*=\s*(.+)$/m);
    if (m) return m[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error("GEMINI_API_KEY not set (put it in frontend/.env.local, which is gitignored)");
}

const arg = (flag, fallback = null) => {
  const i = process.argv.indexOf(flag);
  return i > -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};

/**
 * The house look, in words. Derived from the 31 covers already in the folder:
 * a single subject on a deep slate blue-grey gradient, one hard directional
 * key light, no clutter, and NEVER any lettering — headlines sit over the
 * image in the layout, and every model still garbles text in a raster.
 */
const HOUSE_STYLE =
  "Editorial cover image for a financial news publication. Deep slate blue-grey " +
  "gradient studio background, one dramatic directional key light, shallow depth " +
  "of field, photorealistic, premium business-magazine quality, clean uncluttered " +
  "composition with the subject slightly right of centre and quiet negative space " +
  "on the left. Absolutely no text, no words, no letters, no numbers, no logos, no " +
  "watermarks and no signage anywhere in the image.";

async function main() {
  const name = arg("--name");
  const subject = arg("--prompt");
  if (!name || !subject) {
    console.error("usage: gen-cover.mjs --name <file-stem> --prompt <subject> [--slug <slug>] [--model <id>] [--no-house]");
    process.exit(1);
  }
  const model = arg("--model", "gemini-3-pro-image");
  const prompt = process.argv.includes("--no-house") ? subject : `${subject}. ${HOUSE_STYLE}`;

  // 16:9 is the closest supported ratio to the house 1.606, so the centre crop
  // below only takes ~10% off the sides. Asking for a ratio the API does not
  // support silently returns 1:1, which then crops badly.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9" },
        },
      }),
    },
  );
  if (!res.ok) throw new Error(`image API ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const body = await res.json();
  const parts = body?.candidates?.[0]?.content?.parts || [];
  const inline = parts.find((p) => p.inlineData)?.inlineData;
  if (!inline) {
    const said = parts.find((p) => p.text)?.text;
    throw new Error(
      `no image returned (finishReason: ${body?.candidates?.[0]?.finishReason})` +
        (said ? ` — model said: ${said.slice(0, 200)}` : ""),
    );
  }

  const raw = Buffer.from(inline.data, "base64");
  const dest = join(THUMBS, `${name}.jpg`);
  await sharp(raw)
    .resize(W, H, { fit: "cover", position: "attention" })
    .jpeg({ quality: 88, progressive: false, mozjpeg: true })
    .toFile(dest);

  // The OG copy the unfurl needs: 1200 wide, baseline, under 200 KB. Same
  // rules as thumbs-og.mjs; generating it here means a brand-new cover is
  // shareable the moment it is pinned, without waiting for the next build.
  let q = 82;
  let og;
  for (; q >= 40; q -= 6) {
    og = await sharp(dest)
      .resize({ width: OG_WIDTH, withoutEnlargement: true })
      .jpeg({ quality: q, progressive: false, mozjpeg: true })
      .toBuffer();
    if (og.length <= OG_MAX_BYTES) break;
  }
  writeFileSync(join(THUMBS, "og", `${name}.jpg`), og);

  const meta = await sharp(dest).metadata();
  console.log(`wrote public/editorial-thumbs/${name}.jpg  ${meta.width}x${meta.height}`);
  console.log(`wrote public/editorial-thumbs/og/${name}.jpg  ${(og.length / 1024).toFixed(0)} KB`);
  const slug = arg("--slug");
  if (slug) console.log(`\nPaste into SLUG_OVERRIDES:\n  "${slug}": "${name}",`);
}

main().catch((e) => {
  console.error(String(e.message || e));
  process.exit(1);
});
