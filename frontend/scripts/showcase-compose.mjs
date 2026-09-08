// Composes the four Subscribe-page product visuals (Brief v4 §4) from real UI
// captures: brand-navy canvas, subtle green/gold glow, floating rounded frames
// with depth shadows, layered cards. Outputs per visual:
//   public/sales/showcase/<name>-<REV>.webp        1200x750  (1x, transparent)
//   public/sales/showcase/<name>-<REV>@2x.webp     2400x1500 (retina)
//   public/sales/showcase/<name>-<REV>-mobile.webp 960 x content-height (portrait)
// Usage: node scripts/showcase-compose.mjs <captures-dir>
// The captures dir also needs analysts.json = GET /analysts/top?limit=6 (real
// leaderboard rows for the §4.3 analyst cards) and insider-cards.png (the live
// /premium marquee's four insider cards, staged on white at 1276 CSS px).
// After a run, copy the printed MOBILE_DIMS aspects into ProductShowcase.tsx and
// bump REV in BOTH files.
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
// Output revision — bump on every re-render: /sales is cached for 30 days, so a
// replaced file under the old name never reaches returning browsers.
const REV = "e4";
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
  let img = sharp(Buffer.isBuffer(file) ? file : path.join(CAPS, file));
  let meta = await img.metadata();
  if (trimBottom) {
    img = img.extract({ left: 0, top: 0, width: meta.width, height: meta.height - trimBottom });
    meta = { ...meta, height: meta.height - trimBottom };
  }
  if (padBottom || padTop) {
    // Materialise: sharp runs resize before extend inside one pipeline, so the
    // padding must be baked into a buffer before the resize below.
    img = sharp(
      await sharp(await img.png().toBuffer())
        .extend({ top: padTop, bottom: padBottom, left: 0, right: 0, background: '#ffffff' })
        .png()
        .toBuffer(),
    );
    meta = { ...meta, height: meta.height + padBottom + padTop };
  }
  const h = Math.round((meta.height / meta.width) * w);
  const content = await img.resize(w, h).png().toBuffer();
  const total = h;
  const mask = Buffer.from(`<svg width="${w}" height="${total}"><rect width="${w}" height="${total}" rx="${radius}" ry="${radius}" fill="#fff"/></svg>`);
  const framed = await sharp({ create: { width: w, height: total, channels: 4, background: '#ffffff' } })
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


/** Blur the bottom `frac` of a framed card (brief §4.1: "win rates blurred at
 *  the tail") — a blurred copy of the tail, faded in with a vertical gradient. */
async function blurTail(layer, frac = 0.42) {
  const { buf, w, h } = layer;
  const top = Math.round(h * (1 - frac));
  const tail = await sharp(buf).extract({ left: 0, top, width: w, height: h - top }).blur(9).png().toBuffer();
  const mask = Buffer.from(`<svg width="${w}" height="${h - top}"><defs><linearGradient id="f" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.45" stop-color="#fff" stop-opacity="1"/></linearGradient></defs><rect width="${w}" height="${h - top}" fill="url(#f)"/></svg>`);
  const faded = await sharp(tail).composite([{ input: mask, blend: "dest-in" }]).png().toBuffer();
  const out = await sharp(buf).composite([{ input: faded, left: 0, top }]).png().toBuffer();
  return { buf: out, w, h };
}

/** Analyst leaderboard card (brief §4.3) from a real /analysts/top row. */
function analystCard(a, rank) {
  const w = 760, h = 330;
  const esc = (t) => String(t).replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const initials = a.analyst.split(/\s+/).map((x) => x[0]).slice(0, 2).join("").toUpperCase();
  const chips = (a.topSymbols || []).slice(0, 3).map((sym, i) => `<rect x="${40 + i * 92}" y="${h - 74}" width="82" height="38" rx="19" fill="#EEF3F8"/><text x="${81 + i * 92}" y="${h - 48}" font-family="Helvetica, Arial, sans-serif" font-size="19" font-weight="700" fill="#005882" text-anchor="middle">${esc(sym)}</text>`).join("");
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w + 120}" height="${h + 140}">
    <defs><filter id="s" x="-20%" y="-20%" width="140%" height="160%"><feDropShadow dx="0" dy="36" stdDeviation="30" flood-color="#000" flood-opacity="0.55"/></filter></defs>
    <g transform="translate(60,40)" filter="url(#s)">
      <rect width="${w}" height="${h}" rx="30" fill="#FFFFFF"/>
      <rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="30" fill="none" stroke="#C9A227" stroke-opacity="0.55" stroke-width="2"/>
      <rect x="${w - 96}" y="28" width="60" height="38" rx="19" fill="#C9A227"/>
      <text x="${w - 66}" y="55" font-family="Helvetica, Arial, sans-serif" font-size="21" font-weight="800" fill="#0A1220" text-anchor="middle">#${rank}</text>
      <circle cx="82" cy="78" r="42" fill="#0E1F35"/>
      <text x="82" y="90" font-family="Helvetica, Arial, sans-serif" font-size="32" font-weight="800" fill="#fff" text-anchor="middle">${esc(initials)}</text>
      <text x="144" y="70" font-family="Helvetica, Arial, sans-serif" font-size="31" font-weight="800" fill="#0A1220">${esc(a.analyst)}</text>
      <text x="144" y="104" font-family="Helvetica, Arial, sans-serif" font-size="20" fill="#5D7189">${esc(a.firm)} · ${esc(a.mainSector)}</text>
      <line x1="40" y1="138" x2="${w - 40}" y2="138" stroke="#E4E9F0" stroke-width="2"/>
      <text x="40" y="170" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#5D7189" letter-spacing="2.5">SUCCESS RATE</text>
      <text x="40" y="226" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="#2C7A51" letter-spacing="-2">${a.successRate.toFixed(1)}%</text>
      <text x="300" y="170" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#5D7189" letter-spacing="2.5">AVG RETURN</text>
      <text x="300" y="226" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="#2C7A51" letter-spacing="-2">+${a.avgReturn.toFixed(1)}%</text>
      <text x="560" y="170" font-family="Helvetica, Arial, sans-serif" font-size="17" font-weight="700" fill="#5D7189" letter-spacing="2.5">RATINGS</text>
      <text x="560" y="226" font-family="Helvetica, Arial, sans-serif" font-size="54" font-weight="800" fill="#0A1220" letter-spacing="-2">${a.ratings}</text>
      ${chips}
    </g>
  </svg>`);
}

/** The famous-insider performance cards (Brief v1 §6.1), cut from a capture of
 *  the live /premium marquee (insider-cards.png — 4 cards on white). */
async function insiderCards(w, n = 3, start = 0) {
  const src = path.join(CAPS, "insider-cards.png");
  const meta = await sharp(src).metadata();
  const S = meta.width / 1276; // capture px per CSS px (zoom capture of a 1276px region)
  const xs = [26, 339, 651, 964];
  const out = [];
  for (const x of xs.slice(start, start + n)) {
    const buf = await sharp(src).extract({ left: Math.round(x * S), top: Math.round(26 * S), width: Math.round(286 * S), height: Math.round(514 * S) }).png().toBuffer();
    out.push(await frame(buf, w, { radius: Math.round(w * 0.06), pad: 70 }));
  }
  return out;
}

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
  await sharp(png).webp({ quality: 86, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-${REV}@2x.webp`));
  await sharp(png).resize(1200, 750).webp({ quality: 84, alphaQuality: 90 }).toFile(path.join(OUT, `${name}-${REV}.webp`));
  return png;
}
/** Dedicated PORTRAIT composition for phones (brief §6: "dedicated mobile
 *  crops rather than shrunken desktop renders") — same layers, re-laid on a
 *  960x1200 canvas so the focal card fills the width. */
const MW = 960, MH = 1800;
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
    .toFile(path.join(OUT, `${name}-${REV}-mobile.webp`));
  MOBILE_DIMS[name] = { w: info.width, h: info.height, aspect: +(info.width / info.height).toFixed(4) };
}
const MOBILE_DIMS = {};
process.on('beforeExit', () => { if (Object.keys(MOBILE_DIMS).length) console.log('MOBILE_DIMS ' + JSON.stringify(MOBILE_DIMS)); });

const ANALYSTS = JSON.parse(fs.readFileSync(path.join(CAPS, "analysts.json"), "utf8")).rows;

// 1. Insider Scores — §4.1: score dial front and centre, behind it the ranked
//    list of scored insiders with roles, win rates blurred at the tail.
{
  const ranked = await frame("ranked-insiders.png", 1560, { pad: 90, trimBottom: 165, padBottom: 20 });
  const tail = await blurTail(await frame("track-record.png", 760, { radius: 30, trimBottom: 40, padBottom: 30 }));
  const dial = scoreCard();
  await render("insider-scores", "green", [
    { buf: ranked.buf, left: 640, top: 40 },
    { buf: tail.buf, left: 1580, top: 520 },
    { buf: dial, left: 120, top: 440 },
  ]);
  {
    const rankedM = await frame("ranked-insiders.png", 860, { pad: 50, trimBottom: 165, padBottom: 20 });
    const tailM = await blurTail(await frame("track-record.png", 700, { radius: 30, trimBottom: 40, padBottom: 30 }));
    await mobile("insider-scores", "green", [
      { buf: rankedM.buf, left: 0, top: 20 },
      { buf: tailM.buf, left: 110, top: 400 },
      { buf: scoreCard(), left: 60, top: 980 },
    ]);
  }
}
// 2. Top Insider Buys — §4.2: the graded feed with one alert notification
//    OVERLAPPING the frame.
{
  const feed = await frame("top-buys.png", 2080, { pad: 90, padBottom: 18, padTop: 6 });
  await render("top-insider-buys", "green", [
    { buf: feed.buf, left: 120, top: 330 },
    { buf: smsCard(), left: 1480, top: 240 },
  ]);
  {
    const feedM = await frame("top-buys-m.png", 860, { pad: 50, padBottom: 18, padTop: 6 });
    await mobile("top-insider-buys", "green", [
      { buf: feedM.buf, left: 0, top: 300 },
      { buf: smsCard(), left: 100, top: 210 },
    ]);
  }
}
// 3. Top Analysts / Insiders — §4.3: analyst leaderboard cards (success rate,
//    avg return) beside the insider performance cards.
{
  const cards = await insiderCards(400, 3);
  await render("top-analysts-insiders", "gold", [
    { buf: analystCard(ANALYSTS[0], 1), left: 60, top: 120 },
    { buf: analystCard(ANALYSTS[1], 2), left: 60, top: 540 },
    { buf: analystCard(ANALYSTS[2], 3), left: 60, top: 960 },
    { buf: cards[0].buf, left: 960, top: 300 },
    { buf: cards[1].buf, left: 1420, top: 300 },
    { buf: cards[2].buf, left: 1880, top: 300 },
  ]);
  {
    const cardsM = await insiderCards(380, 2);
    await mobile("top-analysts-insiders", "gold", [
      { buf: analystCard(ANALYSTS[0], 1), left: 20, top: 20 },
      { buf: analystCard(ANALYSTS[1], 2), left: 20, top: 400 },
      { buf: cardsM[0].buf, left: 0, top: 820 },
      { buf: cardsM[1].buf, left: 440, top: 820 },
    ]);
  }
}
// 4. Stock Visualizer Suite — §4.4: bubbles with one bubble expanded into its
//    detail panel, layered with the Congress Bubbles map. Also the hero visual.
{
  const bub = await frame("bubbles.png", 1900, { pad: 90, trimBottom: 75 });
  const con = await frame("congress.png", 1100, { pad: 90, trimBottom: 40 });
  await render("stock-visualizer", "green", [
    { buf: bub.buf, left: 60, top: 40 },
    { buf: con.buf, left: 1250, top: 860 },
  ]);
  {
    const bubM = await frame("bubbles.png", 860, { pad: 50, trimBottom: 75 });
    const conM = await frame("congress.png", 620, { pad: 50, trimBottom: 40 });
    await mobile("stock-visualizer", "green", [
      { buf: bubM.buf, left: 0, top: 60 },
      { buf: conM.buf, left: 240, top: 540 },
    ]);
  }
}
console.log("done", fs.readdirSync(OUT));
