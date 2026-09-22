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
 * PORTRAITS — the main case, because most of this folder is named investors.
 * Do NOT prompt a person by name and hope: pass a photograph you already hold
 * with --ref and the model keeps that face, so what you get is our own picture
 * recomposed into the house treatment rather than an invented likeness.
 *
 *   node scripts/gen-cover.mjs --name burry-copper --portrait \
 *     --ref public/editorial-thumbs/burry-portrait-clean.jpg \
 *     --prompt "a coil of burnished industrial copper wire and stacked copper
 *               cathode sheets fill the left of the frame"
 *
 *
 * Flags: --grade "<colour>" names the one colour the background is graded in
 * (teal, orange, magenta, purple, gold, red — chosen per story, the way the
 * folder does it). --halo <colour> adds the tabloid cutout outline that about a
 * third of the folder carries. --cinematic switches to the cleaner full-colour
 * variant (Thiel, Rinehart, the Uber CEO).
 * --ref may be repeated (a person plus an object, two people). Only use a
 * reference you have the rights to: everything in editorial-thumbs is
 * client-supplied, which is why it is the right place to draw from.
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
import { basename, extname } from "node:path";
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
/**
 * THE HOUSE LOOK, read off all 47 files in public/editorial-thumbs.
 *
 * The dominant template, roughly two thirds of the folder (Icahn, Buffett x3,
 * Burry, Musk, Trump, Cathie Wood, Ackman x2, Englander, Kash Patel, Gates,
 * Ryan Cohen, Jamie Dimon, Lutnick, Zefiro, Durant, Pelosi, Vimeo, White Gold):
 *
 *   SUBJECT   one real person, cut out of a press photo, BIG — head near the
 *             top edge, torso cropped off by the bottom edge, head about a
 *             third of the frame wide, centred or a little off-centre.
 *   TREATMENT the subject is usually DESATURATED: high-contrast black and
 *             white, or tinted in one flat colour, with visible grain. That
 *             contrast against a colour background is what separates them.
 *   BACKGROUND never a studio backdrop. A collage of the story itself —
 *             the refinery, the Capitol and the NYSE, the skyline, the chips
 *             and logos, cash stacks, a ticker board, newspaper pages — layered
 *             at different scales and often repeated left and right of the head.
 *   GRADE     ONE strong colour over the whole background: teal, orange,
 *             magenta, purple, gold or red. This is the single strongest
 *             signal that these images belong to one publication.
 *   EDGE      about a third carry a thin cutout halo, and it is a deliberate
 *             tabloid clash: yellow, white, hot pink, green.
 *   TEXTURE   grunge, scratches, halftone dots, torn-paper edges are common.
 *   TEXT      background lettering is NORMAL and wanted: brand logos, ticker
 *             numbers, newspaper type, even big numeric callouts. Only the
 *             article's own headline stays out, because the page draws that
 *             over the image.
 *
 * The second variant (Thiel, Uber's CEO, Rinehart, Trump and Frederiksen,
 * Eisman) keeps the subject in natural colour against a graded real scene with
 * no halo. Cleaner and more premium. Pass --cinematic for that one.
 *
 * `burry-portrait-clean` (a clean cut-out on a plain slate gradient) is the ONE
 * exception in the folder and is NOT the template. An earlier version of this
 * file copied it and produced stock-photo portraits that did not belong.
 */
const HOUSE_STYLE =
  "Editorial cover art for a financial news publication, built as a photo " +
  "composite rather than a single photograph. The background is a collage of " +
  "real scenes and objects from the story, layered at different scales and " +
  "filling the frame edge to edge with no plain studio backdrop. Grade the " +
  "whole background in ONE strong unifying colour. Add subtle grunge texture: " +
  "scratches, grain, halftone dots. Background signage, brand marks, ticker " +
  "numbers and newsprint are welcome. Do not write the article's headline, a " +
  "caption or a watermark into the image.";

/** Shared opening for any cover built from a reference photo of a real person. */
const KEEP_LIKENESS =
  "Keep the face, hair, build and clothing of the person in the reference " +
  "photograph exactly as they are: this is a real named individual and the " +
  "likeness must not change. ";

/** The dominant folder template: desaturated cutout hero over a graded collage. */
/** Same composition as PORTRAIT_STYLE, but with no reference to preserve. */
const PORTRAIT_FROM_NAME_STYLE =
  "Cut the person out and make them the hero of the cover: large in the frame, " +
  "head near the top edge, body cropped by the bottom edge, their head about a " +
  "third of the picture wide. Render the person in high-contrast desaturated " +
  "black and white with visible film grain, so they stand out sharply against " +
  "the colour-graded background behind them. " +
  HOUSE_STYLE;

const PORTRAIT_STYLE =
  KEEP_LIKENESS +
  "Cut them out and make them the hero of the cover: large in the frame, head " +
  "near the top edge, body cropped by the bottom edge, their head about a third " +
  "of the picture wide. Render the person in high-contrast desaturated black " +
  "and white with visible film grain, so they stand out sharply against the " +
  "colour-graded background behind them. " +
  HOUSE_STYLE;

/** The cleaner variant: natural colour, no halo, cinematic light. */
const CINEMATIC_PORTRAIT_STYLE =
  KEEP_LIKENESS +
  "Place them large in the frame in natural colour, head near the top edge and " +
  "body cropped by the bottom edge, lit cinematically so they read clearly " +
  "against the scene behind them. No cutout outline or sticker border. " +
  HOUSE_STYLE;

/** Optional tabloid cutout halo, the way a third of the folder does it. */
const HALO = (colour) =>
  ` Trace a thin ${colour} halo outline around the cut-out person, like a printed tabloid cutout.`;

async function main() {
  const name = arg("--name");
  const subject = arg("--prompt");
  if (!name || !subject) {
    console.error("usage: gen-cover.mjs --name <file-stem> --prompt <subject> [--slug <slug>] [--model <id>] [--no-house]");
    process.exit(1);
  }
  const model = arg("--model", "gemini-3-pro-image");
  const portrait = process.argv.includes("--portrait");
  const refs = process.argv.reduce((acc, a, i) => {
    if (a === "--ref" && process.argv[i + 1]) acc.push(process.argv[i + 1]);
    return acc;
  }, []);
  // A portrait normally REQUIRES a reference, because prompting a real person
  // by name invents a face rather than keeping theirs. --from-name is the
  // deliberate override for when no usable photograph exists: the composition
  // and grade still come out on-house, but the likeness is the model's guess
  // and must be treated as an illustration, not a portrait of that person.
  const fromName = process.argv.includes("--from-name");
  if (portrait && !refs.length && !fromName) {
    throw new Error("--portrait needs at least one --ref photo (or --from-name to accept an invented likeness)");
  }
  const cinematic = process.argv.includes("--cinematic");
  let style = portrait
    ? refs.length
      ? cinematic
        ? CINEMATIC_PORTRAIT_STYLE
        : PORTRAIT_STYLE
      : PORTRAIT_FROM_NAME_STYLE
    : HOUSE_STYLE;
  const grade = arg("--grade");
  if (grade) style += ` Grade the whole background in ${grade}.`;
  const halo = arg("--halo");
  if (halo) style += HALO(halo);
  const prompt = process.argv.includes("--no-house") ? subject : `${subject}. ${style}`;

  // Reference images go FIRST in the parts array: the model reads them as what
  // to preserve, and the instruction after them as what to change.
  const MIME = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp" };
  const refParts = refs.map((r) => {
    const file = existsSync(r) ? r : join(HERE, "..", r);
    if (!existsSync(file)) throw new Error(`--ref not found: ${r}`);
    const mime = MIME[extname(file).toLowerCase()];
    if (!mime) throw new Error(`--ref must be jpg, png or webp: ${basename(file)}`);
    return { inlineData: { mimeType: mime, data: readFileSync(file).toString("base64") } };
  });

  // 16:9 is the closest supported ratio to the house 1.606, so the centre crop
  // below only takes ~10% off the sides. Asking for a ratio the API does not
  // support silently returns 1:1, which then crops badly.
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey()}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [...refParts, { text: prompt }] }],
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
    // 16:9 comes back wider than the house 1.606, so ~10% comes off the sides.
    // "attention" keeps the busiest region, which on a portrait is the face;
    // a plain centre crop has clipped a shoulder before now.
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
