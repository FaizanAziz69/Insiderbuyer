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
async function frame(file, w, { chrome = true, radius = 28, pad = 90, trimBottom = 0 } = {}) {
  let img = sharp(path.join(CAPS, file));
  let meta = await img.metadata();
  if (trimBottom) {
    img = img.extract({ left: 0, top: 0, width: meta.width, height: meta.height - trimBottom });
    meta = { ...meta, height: meta.height - trimBottom };
  }
  const h = Math.round((meta.height / meta.width) * w);
  const bar = chrome ? 56 : 0;
  const content = await img.resize(w, h).png().toBuffer();
  const total = h + bar;
  const mask = Buffer.from(`<svg width="${w}" height="${total}"><rect width="${w}" height="${total}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  const chromeSvg = Buffer.from(`<svg width="${w}" height="${total}">
    <rect width="${w}" height="${total}" rx="${radius}" fill="${NAVY2}"/>
    ${chrome ? `<circle cx="34" cy="28" r="9" fill="#FF5F57"/><circle cx="62" cy="28" r="9" fill="#FEBC2E"/><circle cx="90" cy="28" r="9" fill="#28C840"/>
    <rect x="${Math.round(w * 0.3)}" y="14" width="${Math.round(w * 0.4)}" height="28" rx="14" fill="#1a2a44"/>
    <text x="${w / 2}" y="34" font-family="Helvetica, Arial, sans-serif" font-size="17" fill="#9DB0C7" text-anchor="middle">insiderbuying.com</text>` : ""}
  </svg>`);
  const framed = await sharp(chromeSvg)
    .composite([{ input: content, top: bar, left: 0 }])
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

/** Insider Score dial card (real figure: DKS 93.7 on 2026-09-08). */
function scoreCard() {
  const w = 620, h = 560, r = 150, cx = w / 2, cy = 250;
  const pct = 0.937, circ = 2 * Math.PI * r;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 120}" height="${h + 140}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="40" stdDeviation="34" flood-color="#000" flood-opacity="0.6"/></filter>
    <linearGradient id="arc" x1="0" x2="1"><stop offset="0" stop-color="#4CC38A"/><stop offset="1" stop-color="#20d0ff"/></linearGradient></defs>
    <g transform="translate(60,40)" filter="url(#s)">
      <rect width="${w}" height="${h}" rx="34" fill="#F5F7FA"/>
      <text x="40" y="58" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#5D7189" letter-spacing="3">INSIDER SCORE</text>
      <text x="${w - 40}" y="58" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#005882" text-anchor="end">DKS · Dick's Sporting Goods</text>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#E4E9F0" stroke-width="26"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="url(#arc)" stroke-width="26" stroke-linecap="round" stroke-dasharray="${(circ * pct).toFixed(1)} ${circ.toFixed(1)}" transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy + 28}" font-family="Helvetica, Arial, sans-serif" font-size="112" font-weight="800" fill="#0A1220" text-anchor="middle" letter-spacing="-4">94</text>
      <text x="${cx}" y="${cy + 66}" font-family="Helvetica, Arial, sans-serif" font-size="20" font-weight="700" fill="#5D7189" text-anchor="middle" letter-spacing="2">OUT OF 100</text>
      <rect x="${cx - 78}" y="${cy + r + 40}" width="156" height="46" rx="23" fill="#3E9B5F"/>
      <text x="${cx}" y="${cy + r + 71}" font-family="Helvetica, Arial, sans-serif" font-size="21" font-weight="800" fill="#fff" text-anchor="middle" letter-spacing="2">▲ BULLISH</text>
      <text x="40" y="${h - 32}" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="#5D7189">$3.72M bought · 0 sold · open-market Form 4, last 90 days</text>
    </g>
  </svg>`);
}

/** SMS notification card overlapping the buys feed (real filing: ATRA, Sep 4). */
function smsCard() {
  const w = 700, h = 200;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 120}" height="${h + 140}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="36" stdDeviation="30" flood-color="#000" flood-opacity="0.6"/></filter></defs>
    <g transform="translate(60,40)" filter="url(#s)">
      <rect width="${w}" height="${h}" rx="40" fill="#1C1C1E" fill-opacity="0.96"/>
      <rect x="28" y="34" width="66" height="66" rx="16" fill="#3E9B5F"/>
      <text x="61" y="79" font-family="Helvetica, Arial, sans-serif" font-size="30" font-weight="800" fill="#fff" text-anchor="middle">IB</text>
      <text x="118" y="60" font-family="Helvetica, Arial, sans-serif" font-size="22" font-weight="700" fill="#fff">INSIDER BUYING</text>
      <text x="${w - 30}" y="60" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#8E8E93" text-anchor="end">now</text>
      <text x="118" y="100" font-family="Helvetica, Arial, sans-serif" font-size="25" font-weight="700" fill="#fff">Grade A insider buy · ATRA</text>
      <text x="118" y="140" font-family="Helvetica, Arial, sans-serif" font-size="22" fill="#D1D1D6">Director bought $999.99K — 104,166 sh @ $9.60</text>
      <text x="118" y="172" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#8E8E93">First buy · Stake doubler · Form 4 filed Sep 4</text>
    </g>
  </svg>`);
}

const clear = (w, h) => sharp({ create: { width: w, height: h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
async function render(name, accent, layers) {
  void accent; // kept in the call sites; the page supplies the backdrop now
  const comps = (await Promise.all(layers.map((l) => fitLayer(l, W, H)))).filter(Boolean);
  const png = await clear(W, H).composite(comps).png().toBuffer();
  await sharp(png).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-embed@2x.webp`));
  await sharp(png).resize(1200, 750).webp({ quality: 84, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-embed.webp`));
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
  await clear(MW, MH).composite(comps).webp({ quality: 84, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-embed-mobile.webp`));
}

// 1. Insider Scores — dial card in front, scored rankings behind, track record at the tail.
{
  const back = await frame("scores-list.jpg", 1560, { pad: 90 });
  const tail = await frame("track-record.png", 760, { chrome: false, radius: 30 });
  const dial = scoreCard();
  const png = await render("insider-scores", "green", [
    { buf: back.buf, left: 640, top: 40 },
    { buf: tail.buf, left: 1580, top: 560 },
    { buf: dial, left: 120, top: 440 },
  ]);
  void png;
  {
    const list = await frame("scores-list.jpg", 1100, { pad: 70 });
    const dialM = scoreCard();
    await mobile("insider-scores", "green", [
      { buf: list.buf, left: 120, top: 40 },
      { buf: dialM, left: 60, top: 470 },
    ]);
  }
}
// 2. Top Insider Buys — the graded feed with an SMS alert overlapping the frame.
{
  const feed = await frame("top-buys.png", 2080, { pad: 90 });
  const sms = smsCard();
  const png = await render("top-insider-buys", "green", [
    { buf: feed.buf, left: 120, top: 330 },
    { buf: sms, left: 1420, top: 90 },
  ]);
  void png;
  {
    const feedM = await frame("top-buys.png", 1400, { pad: 70 });
    const smsM = smsCard();
    await mobile("top-insider-buys", "green", [
      { buf: feedM.buf, left: -230, top: 420 },
      { buf: smsM, left: 40, top: 60 },
    ]);
  }
}
// 3. Top Analysts / Insiders — analyst leaderboard beside insider track records.
{
  const an = await frame("analysts.png", 1720, { pad: 90, trimBottom: 48 });
  const ins = await frame("track-record.png", 760, { chrome: false, radius: 30 });
  const ranked = await frame("ranked-insiders.png", 1150, { pad: 90, trimBottom: 150 });
  const png = await render("top-analysts-insiders", "gold", [
    { buf: an.buf, left: 40, top: 60 },
    { buf: ranked.buf, left: 260, top: 700 },
    { buf: ins.buf, left: 1540, top: 520 },
  ]);
  void png;
  {
    const anM = await frame("analysts.png", 1300, { pad: 70, trimBottom: 48 });
    const insM = await frame("track-record.png", 700, { chrome: false, radius: 30 });
    await mobile("top-analysts-insiders", "gold", [
      { buf: anM.buf, left: -200, top: 30 },
      { buf: insM.buf, left: 100, top: 400 },
    ]);
  }
}
// 4. Stock Visualizer Suite — bubbles layered with congress bubbles.
{
  const bub = await frame("bubbles.png", 1900, { pad: 90, trimBottom: 75 });
  const con = await frame("congress.png", 1050, { pad: 90, trimBottom: 80 });
  const png = await render("stock-visualizer", "green", [
    { buf: bub.buf, left: 60, top: 40 },
    { buf: con.buf, left: 1290, top: 880 },
  ]);
  void png;
  {
    const bubM = await frame("bubbles.png", 1500, { pad: 70, trimBottom: 75 });
    const conM = await frame("congress.png", 760, { pad: 70, trimBottom: 80 });
    await mobile("stock-visualizer", "green", [
      { buf: bubM.buf, left: -380, top: 40 },
      { buf: conM.buf, left: 130, top: 700 },
    ]);
  }
}
console.log("done", fs.readdirSync(OUT));
