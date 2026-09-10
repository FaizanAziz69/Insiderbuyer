// Composes the four Subscribe-page product visuals (Brief v4 §4) from real UI
// captures: brand-navy canvas, subtle green/gold glow, floating rounded frames
// with depth shadows, layered cards. Outputs per visual:
//   public/sales/showcase/<name>.jpg        1200x750  (1x fallback)
//   public/sales/showcase/<name>@2x.webp    2400x1500 (retina)
//   public/sales/showcase/<name>-mobile.webp 960x1200 (dedicated portrait crop)
// Usage: node scripts/showcase-compose.mjs <captures-dir>
// Captures are screenshots of the live site (see the 2026-09-08 session notes);
// nothing in them is invented — every row is a real filing or rating.
import sharp from "sharp";
import path from "node:path";
import fs from "node:fs";

const CAPS = process.argv[2];
if (!CAPS) throw new Error("captures dir required");
// Second arg picks the theme. The layout is identical in both; only the
// captures and the generated dial card change, so the page can swap whole
// sets by suffix (Faizan, 2026-09-10: white screenshots on the dark page).
//   node scripts/showcase-compose.mjs <caps-dir>            -> <name>-e4*.webp
//   node scripts/showcase-compose.mjs <caps-dark-dir> dark  -> <name>-e4-dark*.webp
const THEME = (process.argv[3] || "light") === "dark" ? "dark" : "light";
const SUF = THEME === "dark" ? "-dark" : "";
const OUT = path.resolve("public/sales/showcase");
fs.mkdirSync(OUT, { recursive: true });

const W = 2400, H = 1500;
const NAVY = "#0A1220", NAVY2 = "#0E1A2E";

const bg = (accent = "green") => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <radialGradient id="g1" cx="78%" cy="8%" r="55%"><stop offset="0" stop-color="${accent === "gold" ? "#C9A227" : "#3E9B5F"}" stop-opacity="0.34"/><stop offset="1" stop-color="${NAVY}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="12%" cy="92%" r="60%"><stop offset="0" stop-color="#20d0ff" stop-opacity="0.16"/><stop offset="1" stop-color="${NAVY}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g3" cx="50%" cy="55%" r="70%"><stop offset="0" stop-color="${NAVY2}"/><stop offset="1" stop-color="${NAVY}"/></radialGradient>
    <pattern id="grid" width="80" height="80" patternUnits="userSpaceOnUse"><path d="M80 0H0V80" fill="none" stroke="#9DB0C7" stroke-opacity="0.05" stroke-width="2"/></pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#g3)"/>
  <rect width="100%" height="100%" fill="url(#grid)"/>
  <rect width="100%" height="100%" fill="url(#g1)"/>
  <rect width="100%" height="100%" fill="url(#g2)"/>
</svg>`);

/** Rounded frame with a browser chrome bar and a soft shadow, around a capture
 *  resized to `w` wide. Returns a sharp buffer (PNG, transparent margins). */
async function frame(file, w, { radius = 28, pad = 90, trimBottom = 0, padBottom = 0, padTop = 0 } = {}) {
  // No browser chrome (client 2026-09-09: "dont want these in all four
  // sections") — each capture becomes a clean rounded card. `trimBottom`
  // removes a partially captured last row; `padBottom`/`padTop` add white so
  // the card ends on whitespace instead of a cut line.
  let img = sharp(path.join(CAPS, file));
  let meta = await img.metadata();
  // Pad and card fill are SAMPLED from the capture's own top-left pixel rather
  // than hardcoded white: the dark captures would otherwise get a white border
  // and white filler rows around them.
  const { data: px } = await sharp(path.join(CAPS, file))
    .extract({ left: 2, top: 2, width: 1, height: 1 })
    .raw()
    .toBuffer({ resolveWithObject: true });
  const fill = `rgb(${px[0]},${px[1]},${px[2]})`;
  if (trimBottom) {
    img = img.extract({ left: 0, top: 0, width: meta.width, height: meta.height - trimBottom });
    meta = { ...meta, height: meta.height - trimBottom };
  }
  if (padBottom || padTop) {
    // Materialise: sharp runs resize before extend inside one pipeline, so the
    // padding must be baked into a buffer before the resize below.
    img = sharp(
      await sharp(await img.png().toBuffer())
        .extend({ top: padTop, bottom: padBottom, left: 0, right: 0, background: fill })
        .png()
        .toBuffer(),
    );
    meta = { ...meta, height: meta.height + padBottom + padTop };
  }
  const h = Math.round((meta.height / meta.width) * w);
  const content = await img.resize(w, h).png().toBuffer();
  const total = h;
  const mask = Buffer.from(`<svg width="${w}" height="${total}"><rect width="${w}" height="${total}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  const framed = await sharp({ create: { width: w, height: total, channels: 4, background: fill } })
    .composite([{ input: content, top: 0, left: 0 }])
    .png()
    .toBuffer();
  const rounded = await sharp(framed).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  // Shadow: blurred dark copy of the rounded silhouette, offset downward.
  const shadowSvg = Buffer.from(`<svg width="${w + pad * 2}" height="${total + pad * 2}"><rect x="${pad}" y="${pad + 30}" width="${w}" height="${total}" rx="${radius}" fill="#000" fill-opacity="0.55"/></svg>`);
  const shadow = await sharp(shadowSvg).blur(38).png().toBuffer();
  const out = await sharp({ create: { width: w + pad * 2, height: total + pad * 2, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: shadow, top: 0, left: 0 }, { input: rounded, top: pad, left: pad }, { input: Buffer.from(`<svg width="${w}" height="${total}"><rect x="1" y="1" width="${w - 2}" height="${total - 2}" rx="${radius}" fill="none" stroke="#9DB0C7" stroke-opacity="0.28" stroke-width="2"/></svg>`), top: pad, left: pad }])
    .png()
    .toBuffer();
  return { buf: out, w: w + pad * 2, h: total + pad * 2 };
}

/** Insider Score dial card (real figure: DKS 93.7 on 2026-09-08). Generated
 *  rather than captured, so its palette has to follow THEME by hand — a light
 *  card on the dark composition was the most obvious mismatch of the set. */
const CARD = THEME === "dark"
  ? { bg: "#131F33", ink: "#F5F7FA", dim: "#9DB0C7", accent: "#20d0ff", track: "#1E2A3D" }
  : { bg: "#F5F7FA", ink: "#0A1220", dim: "#5D7189", accent: "#005882", track: "#E4E9F0" };
function scoreCard() {
  const w = 620, h = 560, r = 150, cx = w / 2, cy = 250;
  const pct = 0.937, circ = 2 * Math.PI * r;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 120}" height="${h + 140}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="40" stdDeviation="34" flood-color="#000" flood-opacity="0.6"/></filter>
    <linearGradient id="arc" x1="0" x2="1"><stop offset="0" stop-color="#4CC38A"/><stop offset="1" stop-color="#20d0ff"/></linearGradient></defs>
    <g transform="translate(60,40)" filter="url(#s)">
      <rect width="${w}" height="${h}" rx="34" fill="${CARD.bg}"/>
      <text x="40" y="58" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="${CARD.dim}" letter-spacing="3">INSIDER SCORE</text>
      <text x="${w - 40}" y="58" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="${CARD.accent}" text-anchor="end">DKS · Dick's Sporting Goods</text>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${CARD.track}" stroke-width="26"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#arc)" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(circ * pct).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy + 28}" font-family="Helvetica, Arial, sans-serif" font-size="112" font-weight="800" fill="${CARD.ink}" text-anchor="middle" letter-spacing="-4">94</text>
      <text x="${cx}" y="${cy + 66}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="${CARD.dim}" text-anchor="middle" letter-spacing="2">OUT OF 100</text>
      <rect x="${cx - 78}" y="${cy + r + 40}" width="156" height="46" rx="23" fill="#3E9B5F"/>
      <text x="${cx}" y="${cy + r + 71}" font-family="Helvetica, Arial, sans-serif" font-size="21" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="2">▲ BULLISH</text>
      <text x="40" y="${h - 32}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${CARD.dim}">$3.72M bought · 0 sold · open-market Form 4, last 90 days</text>
    </g>
  </svg>`);
}

// The phone-style push notification card ("Grade A insider buy · ATRA") that
// used to overlap the buys feed is GONE — George (call, 2026-09-10) on the
// text-message mock: "we don't do that, don't put anything we don't do", and
// Faizan confirmed the same for this notification on 2026-09-10. The product
// sends EMAIL alerts, so a mock of a push notification advertised something
// that does not exist. Do not reintroduce it.

const clear = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
async function render(name, accent, layers) {
  void accent; // kept in the call sites; the page supplies the backdrop now
  const comps = (await Promise.all(layers.map((l) => fitLayer(l, W, H)))).filter(Boolean);
  // Trim the transparent margins so the content fills its slot, then re-fit to
  // the fixed 16:10 canvas (the page reserves that aspect — no layout shift).
  const raw = await clear(W, H).composite(comps).png().toBuffer();
  const trimmed = await sharp(raw).trim().png().toBuffer();
  const png = await sharp(trimmed)
    .resize(W - 80, H - 80, { fit: 'inside', withoutEnlargement: false })
    .extend({ top: 40, bottom: 40, left: 40, right: 40, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .resize(W, H, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer();
  await sharp(png).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-e4${SUF}@2x.webp`));
  await sharp(png).resize(1200, 750).webp({ quality: 84, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-e4${SUF}.webp`));
  return png;
}
/** Dedicated PORTRAIT composition for phones (brief §6: "dedicated mobile
 *  crops rather than shrunken desktop renders") — same layers, re-laid on a
 *  960x1200 canvas so the focal card fills the width. */
const MW = 960, MH = 1200;
const bgM = (accent = "green") => Buffer.from(bg(accent).toString().replace(`width="${W}" height="${H}"`, `width="${MW}" height="${MH}"`));
/** sharp refuses negative offsets and layers that overhang the canvas, so a
 *  layer placed partly off-canvas is cropped to the canvas first. */
async function fitLayer(l, cw, ch) {
  const meta = await sharp(l.buf).metadata();
  let { left, top } = l;
  let x0 = 0, y0 = 0, w = meta.width, h = meta.height;
  if (left < 0) { x0 = -left; w += left; left = 0; }
  if (top < 0) { y0 = -top; h += top; top = 0; }
  if (left + w > cw) w = cw - left;
  if (top + h > ch) h = ch - top;
  if (w <= 0 || h <= 0) return null;
  const buf = x0 || y0 || w !== meta.width || h !== meta.height
    ? await sharp(l.buf).extract({ left: x0, top: y0, width: w, height: h }).png().toBuffer()
    : l.buf;
  return { input: buf, left, top };
}
async function mobile(name, accent, layers) {
  void accent;
  const comps = (await Promise.all(layers.map((l) => fitLayer(l, MW, MH)))).filter(Boolean);
  const raw = await clear(MW, MH).composite(comps).png().toBuffer();
  const trimmed = await sharp(raw).trim().png().toBuffer();
  // Content-height output: the page box takes its aspect from the real file, so no
  // dead space above or below the composition on phones.
  const fitted = await sharp(trimmed).resize(MW - 40, null, { fit: 'inside' }).png().toBuffer();
  const info = await sharp(fitted)
    .extend({ top: 20, bottom: 20, left: 20, right: 20, background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .webp({ quality: 84, alphaQuality: 90 })
    .toFile(path.join(OUT, `${name}-e4${SUF}-mobile.webp`));
  MOBILE_DIMS[name] = { w: info.width, h: info.height, aspect: +(info.width / info.height).toFixed(4) };
}
const MOBILE_DIMS = {};
process.on('beforeExit', () => { if (Object.keys(MOBILE_DIMS).length) console.log('MOBILE_DIMS ' + JSON.stringify(MOBILE_DIMS)); });

// 1. Insider Scores — dial card in front, scored rankings behind, track record at the tail.
//
// LAYOUT RULE for every visual below (Faizan, 2026-09-10: "size image ka same
// lakin andar jo ha bahra takay nazar aaye"): the layers' combined bounding box
// must come out close to 16:10, because render() trims the transparent margin
// and then fits that box into the canvas — a box that is much taller or wider
// than 16:10 gets scaled down to fit, which is what made the type unreadable.
// Corners are filled by overlapping cards rather than left empty.
{
  const back = await frame("scores-list.png", 1700, { pad: 70, padBottom: 24 });
  const tail = await frame("track-record.png", 700, { radius: 30, pad: 70 });
  const dial = scoreCard();
  const png = await render("insider-scores", "green", [
    { buf: back.buf, left: 560, top: 0 },
    { buf: tail.buf, left: 1560, top: 345 },
    { buf: dial, left: 0, top: THEME === "dark" ? 800 : 700 },
  ]);
  void png;
  {
    const list = await frame("scores-list.png", 860, { pad: 50, padBottom: 24 });
    const dialM = scoreCard();
    await mobile("insider-scores", "green", [
      { buf: list.buf, left: 0, top: 20 },
      { buf: dialM, left: 100, top: 470 },
    ]);
  }
}
// 2. Top Insider Buys — the graded feed, alone in the frame now that the push
// notification mock is gone. It is the only layer, so it is placed at the
// origin and left to fill the canvas: the trim step crops the transparent
// margin and the re-fit scales the feed up to the slot, which is what makes
// the rows legible.
{
  const feed = await frame("top-buys.png", 2080, { pad: 90, padBottom: 18, padTop: 6 });
  const png = await render("top-insider-buys", "green", [
    { buf: feed.buf, left: 0, top: 0 },
  ]);
  void png;
  {
    const feedM = await frame("top-buys-m.png", 860, { pad: 50, padBottom: 18, padTop: 6 });
    await mobile("top-insider-buys", "green", [
      { buf: feedM.buf, left: 0, top: 0 },
    ]);
  }
}
// 3. Top Analysts / Insiders — analyst leaderboard beside insider track records.
{
  const an = await frame("analysts.png", 1800, { pad: 70, padBottom: 18, padTop: 6 });
  const ins = await frame("track-record.png", 700, { radius: 30, pad: 70 });
  // Wider than the other secondary cards on purpose: at 1000 its rows rendered
  // visibly smaller than the analyst table behind it, which is the exact
  // complaint this pass exists to fix.
  const ranked = await frame("ranked-insiders.png", 1150, { pad: 70, trimBottom: 30, padBottom: 20 });
  const png = await render("top-analysts-insiders", "gold", [
    { buf: an.buf, left: 0, top: THEME === "dark" ? 0 : 40 },
    { buf: ranked.buf, left: 60, top: THEME === "dark" ? 748 : 545 },
    { buf: ins.buf, left: 1520, top: THEME === "dark" ? 300 : 250 },
  ]);
  void png;
  {
    const anM = await frame("analysts-m.png", 860, { pad: 50, padBottom: 18, padTop: 6 });
    const insM = await frame("track-record.png", 680, { radius: 30, pad: 50 });
    await mobile("top-analysts-insiders", "gold", [
      { buf: anM.buf, left: 0, top: 30 },
      { buf: insM.buf, left: 90, top: 380 },
    ]);
  }
}
// The fourth visual (Stock Visualizer Suite — bubbles over congress bubbles)
// is gone: George had the stock-visualizer item removed from the section on
// 2026-09-10, so SHOWCASE in components/premium/ProductShowcase.tsx carries
// three entries and the layout is documented to "tolerate two or four". The
// stock-visualizer files were deleted from public/sales/showcase in the same
// pass, since nothing rendered them. Re-add a block here if it comes back —
// it needs bubbles.png and congress.png captures, which no longer exist.
console.log("done", fs.readdirSync(OUT));
