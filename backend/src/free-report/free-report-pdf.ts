import PDFDocument from 'pdfkit';
import { existsSync } from 'fs';
import { join, resolve } from 'path';
import { Block, CLOSE, COVER, DISCLAIMER, EDITOR_NOTE, PART_ONE, PART_TWO, StockSection } from './free-report.content';

/**
 * "GET ON THE INSIDE" laid out as a branded e-book (George 2026-09-16:
 * "turn this into a nice e-book / report with our logo branding and just
 * make it look nice. Use all the copy here.").
 *
 * Every word comes from free-report.content.ts; this file owns typography,
 * the brand (the site's #005882 blue and its deeper #003f5d, gold for
 * emphasis, the Insider Buying wordmark on the cover and every running
 * header), the three price charts and page flow. pdfkit's Helvetica family
 * is used so the deploy needs no font files; the two wordmark PNGs live in
 * ./assets next to this file.
 *
 * Structure: cover · contents · editor's note · Part One opener + body ·
 * Part Two opener + three stock chapters + "Important" · closing chapter
 * with the feature table and CTA · disclaimer. Section start pages are
 * recorded while rendering and written into the contents page afterwards
 * (bufferPages lets us go back).
 */

export interface Bar {
  date: string; // YYYY-MM-DD
  close: number;
}

// ── Brand ────────────────────────────────────────────────────────────────
const BLUE = '#005882'; // site accent / navbar
const BLUE_DEEP = '#003F5D';
const NAVY = '#04223A'; // cover + chart panel ground
const GOLD = '#C8A24A';
const GOLD_SOFT = '#F3E9CF';
const INK = '#0F172A';
const BODY = '#1F2937';
const MUTED = '#64748B';
const RULE = '#E2E8F0';
const PANEL = '#F1F5F9';
const BLUE_TINT = '#EAF3F8';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 60;
const TOP = 78; // below the running header
const CONTENT_W = PAGE_W - MARGIN * 2;
const BOTTOM = PAGE_H - 78;
const FOOTER_Y = PAGE_H - 46;

type Doc = InstanceType<typeof PDFDocument>;

interface Ctx {
  doc: Doc;
  /** Running-header label for the current section. */
  section: string;
  /** Section → page index (0-based) for the contents page. */
  toc: Array<{ label: string; sub?: string; page: number }>;
  /** Page index → section label, for running headers. */
  sectionByPage: Map<number, string>;
  assets: { light: string | null; dark: string | null };
}

export function renderFreeReportPdf(bars: Record<string, Bar[]>, asOf: string): Promise<Buffer> {
  return new Promise((resolvePdf, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: TOP, bottom: 78, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: 'Get On The Inside — A Guide to Following Insider Buying',
        Author: 'InsiderBuying.com',
        Subject: 'Free investor report, ' + COVER.edition,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolvePdf(Buffer.concat(chunks)));
    doc.on('error', reject);

    const ctx: Ctx = { doc, section: '', toc: [], sectionByPage: new Map(), assets: findAssets() };

    cover(ctx);
    const tocPage = contentsPlaceholder(ctx);
    editorNote(ctx);
    partOne(ctx);
    partTwo(ctx, bars);
    closing(ctx);
    disclaimer(ctx);
    contents(ctx, tocPage);
    chrome(ctx, asOf);
    doc.end();
  });
}

function findAssets(): Ctx['assets'] {
  const candidates = [join(__dirname, 'assets'), resolve(process.cwd(), 'src/free-report/assets'), resolve(process.cwd(), 'backend/src/free-report/assets')];
  for (const dir of candidates) {
    const light = join(dir, 'wordmark-light.png');
    const dark = join(dir, 'wordmark-dark.png');
    if (existsSync(light) && existsSync(dark)) return { light, dark };
  }
  return { light: null, dark: null };
}

// ── Page helpers ─────────────────────────────────────────────────────────

function page(ctx: Ctx) {
  ctx.doc.addPage();
  ctx.sectionByPage.set(currentPage(ctx.doc), ctx.section);
  ctx.doc.y = TOP;
}

function currentPage(doc: Doc): number {
  return doc.bufferedPageRange().count - 1;
}

function startSection(ctx: Ctx, label: string, sub?: string) {
  ctx.section = label;
  page(ctx);
  ctx.toc.push({ label, sub, page: currentPage(ctx.doc) });
}

function ensure(ctx: Ctx, needed: number) {
  if (ctx.doc.y + needed > BOTTOM) page(ctx);
}

/** pdfkit starts a new page when text lands below the bottom margin; the
 *  running footer and the cover's legal line live there on purpose. */
function withNoBottomMargin(doc: Doc, fn: () => void) {
  const m = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    fn();
  } finally {
    doc.page.margins.bottom = m;
  }
}

function wordmark(ctx: Ctx, variant: 'light' | 'dark', x: number, y: number, width: number) {
  const file = ctx.assets[variant];
  if (file) {
    ctx.doc.image(file, x, y, { width });
  } else {
    ctx.doc
      .font('Helvetica-Bold')
      .fontSize(width / 9)
      .fillColor(variant === 'light' ? '#FFFFFF' : INK)
      .text('INSIDER BUYING', x, y, { lineBreak: false });
  }
}

// ── Cover ────────────────────────────────────────────────────────────────

function cover(ctx: Ctx) {
  const { doc } = ctx;
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
  // Brand-blue block across the upper two thirds, angled at the bottom.
  doc.save();
  doc.moveTo(0, 0).lineTo(PAGE_W, 0).lineTo(PAGE_W, 470).lineTo(0, 540).closePath().fill(BLUE_DEEP);
  doc.moveTo(0, 0).lineTo(PAGE_W, 0).lineTo(PAGE_W, 300).lineTo(0, 380).closePath().fill(BLUE);
  doc.restore();
  // A price line drawn across the lower field — the subject of the book.
  doc.save().lineWidth(2).strokeColor('#1E6F97').opacity(0.9);
  const pts = coverSeries();
  pts.forEach(([x, y], i) => (i ? doc.lineTo(x, y) : doc.moveTo(x, y)));
  doc.stroke();
  doc.restore();
  // Gold arrow marker on the line, echoing the charts inside.
  const [mx, my] = pts[Math.floor(pts.length * 0.72)];
  doc.save();
  doc.moveTo(mx, my - 36).lineTo(mx, my - 9).lineWidth(2.5).strokeColor(GOLD).stroke();
  doc.moveTo(mx, my - 4).lineTo(mx - 6, my - 13).lineTo(mx + 6, my - 13).closePath().fill(GOLD);
  doc.circle(mx, my, 4.5).lineWidth(2).strokeColor(GOLD).fillAndStroke(NAVY, GOLD);
  doc.font('Helvetica-Bold').fontSize(8).fillColor(GOLD).text('INSIDERS BOUGHT HERE', mx - 60, my - 52, { width: 120, align: 'center', lineBreak: false, characterSpacing: 0.8 });
  doc.restore();

  wordmark(ctx, 'light', MARGIN, 52, 150);
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(10.5).text(COVER.kicker, MARGIN, 176, { characterSpacing: 3.2 });
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(46).text(COVER.title, MARGIN, 198, { width: CONTENT_W, characterSpacing: 0.5, lineGap: -4 });
  let cy = doc.y + 10;
  doc.rect(MARGIN, cy, 78, 4).fill(GOLD);
  cy += 20;
  doc.fillColor('#FFFFFF').font('Helvetica').fontSize(19).text(COVER.subtitle, MARGIN, cy, { width: CONTENT_W });
  doc.fillColor(GOLD_SOFT).font('Helvetica-Oblique').fontSize(14).text(COVER.sub2, MARGIN, doc.y + 6, { width: CONTENT_W });

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text(COVER.publisher, MARGIN, 662);
  doc.fillColor('#A9C4D6').font('Helvetica').fontSize(11).text(COVER.edition, MARGIN, 680);
  withNoBottomMargin(doc, () =>
    doc.fillColor('#8FB0C6').font('Helvetica').fontSize(8.5).text(COVER.legal, MARGIN, PAGE_H - 42, { width: CONTENT_W, lineBreak: false }),
  );
  ctx.sectionByPage.set(0, '');
}

/** A deterministic, gently falling-then-recovering line for the cover art. */
function coverSeries(): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let s = 17;
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280 - 0.5);
  let y = 560;
  for (let i = 0; i <= 60; i++) {
    const x = (PAGE_W / 60) * i;
    const trend = i < 40 ? 1.2 : -2.6;
    y = Math.max(480, Math.min(650, y + trend + rnd() * 18));
    out.push([x, y]);
  }
  return out;
}

// ── Contents ─────────────────────────────────────────────────────────────

function contentsPlaceholder(ctx: Ctx): number {
  ctx.section = 'Contents';
  page(ctx);
  return currentPage(ctx.doc);
}

function contents(ctx: Ctx, pageIdx: number) {
  const { doc } = ctx;
  doc.switchToPage(pageIdx);
  doc.y = TOP + 10;
  doc.font('Helvetica-Bold').fontSize(10).fillColor(BLUE).text('INSIDE THIS REPORT', MARGIN, doc.y, { characterSpacing: 2.5 });
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(28).fillColor(INK).text('Contents', MARGIN, doc.y);
  doc.rect(MARGIN, doc.y + 8, 60, 4).fill(GOLD);
  let y = doc.y + 36;
  ctx.toc.forEach((t, i) => {
    const num = String(i + 1).padStart(2, '0');
    const pageNo = String(t.page + 1);
    doc.font('Helvetica-Bold').fontSize(11).fillColor(GOLD).text(num, MARGIN, y + 2, { lineBreak: false });
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(t.label, MARGIN + 34, y, { width: CONTENT_W - 34 - 40, lineGap: 1 });
    const labelBottom = doc.y;
    if (t.sub) {
      doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(t.sub, MARGIN + 34, labelBottom + 1, { width: CONTENT_W - 34 - 40 });
    }
    doc.font('Helvetica-Bold').fontSize(12).fillColor(BLUE).text(pageNo, PAGE_W - MARGIN - 40, y + 1, { width: 40, align: 'right', lineBreak: false });
    const rowBottom = Math.max(doc.y, labelBottom) + 10;
    doc.moveTo(MARGIN + 34, rowBottom).lineTo(PAGE_W - MARGIN, rowBottom).lineWidth(0.5).strokeColor(RULE).stroke();
    y = rowBottom + 12;
  });
  // A short note under the list.
  y += 10;
  doc.rect(MARGIN, y, CONTENT_W, 64).fill(BLUE_TINT);
  doc.rect(MARGIN, y, 4, 64).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(BLUE).text('HOW TO READ THIS REPORT', MARGIN + 16, y + 12, { characterSpacing: 1.5 });
  doc
    .font('Helvetica')
    .fontSize(10)
    .fillColor(BODY)
    .text(
      'Part One explains the signal and the research behind it. Part Two applies it to three live situations. Every figure in Part Two comes from public filings you can open yourself.',
      MARGIN + 16,
      y + 27,
      { width: CONTENT_W - 32, lineGap: 2 },
    );
}

// ── Chapters ─────────────────────────────────────────────────────────────

function editorNote(ctx: Ctx) {
  const { doc } = ctx;
  startSection(ctx, EDITOR_NOTE.heading, 'Why insiders are the smartest money in the market');
  chapterTitle(ctx, EDITOR_NOTE.heading);
  EDITOR_NOTE.paragraphs.forEach((p, i) => {
    if (i === 0) {
      // Opening line set large, like a magazine standfirst.
      ensure(ctx, 40);
      doc.font('Helvetica-Bold').fontSize(17).fillColor(BLUE).text(p, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
      doc.moveDown(0.6);
      return;
    }
    para(ctx, p);
  });
  ensure(ctx, 30);
  doc.font('Helvetica-Oblique').fontSize(11).fillColor(MUTED).text(EDITOR_NOTE.signoff, MARGIN, doc.y + 4, { width: CONTENT_W });
}

function partOne(ctx: Ctx) {
  const [label, rest] = splitHeading(PART_ONE.heading);
  startSection(ctx, label, rest);
  opener(ctx, '01', label, rest);
  blocks(ctx, PART_ONE.blocks);
}

function partTwo(ctx: Ctx, bars: Record<string, Bar[]>) {
  const { doc } = ctx;
  const [label, rest] = splitHeading(PART_TWO.heading);
  startSection(ctx, label, rest);
  opener(ctx, '02', label, rest);
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text(PART_TWO.intro, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
  doc.moveDown(0.6);
  PART_TWO.stocks.forEach((s, i) => {
    if (i > 0) page(ctx);
    ctx.toc.push({ label: `Stock #${s.number} — ${s.name}`, sub: `${s.exchange}: ${s.ticker} · ${s.tags.join(' · ')}`, page: currentPage(doc) });
    stock(ctx, s, bars[s.chartSymbol] || []);
  });
  ensure(ctx, 120);
  callout(ctx, PART_TWO.important.label, PART_TWO.important.text, GOLD, GOLD_SOFT);
}

function closing(ctx: Ctx) {
  const { doc } = ctx;
  startSection(ctx, CLOSE.heading, 'What Insider Access gives you');
  opener(ctx, '03', CLOSE.heading);
  for (const p of CLOSE.paragraphs) para(ctx, p);
  table(ctx, CLOSE.tableHead, CLOSE.features, 120);
  doc.moveDown(0.3);
  doc.font('Helvetica-Bold').fontSize(14).fillColor(INK).text(CLOSE.tagline, MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.moveDown(0.6);
  const boxY = doc.y;
  doc.roundedRect(MARGIN, boxY, CONTENT_W, 54, 8).fill(BLUE);
  doc.roundedRect(MARGIN, boxY, CONTENT_W, 6, 3).fill(GOLD);
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12.5).text(CLOSE.cta, MARGIN, boxY + 21, {
    width: CONTENT_W,
    align: 'center',
    link: 'https://insiderbuying.com/premium',
    underline: false,
  });
  doc.y = boxY + 70;
}

function disclaimer(ctx: Ctx) {
  const { doc } = ctx;
  ctx.section = DISCLAIMER.heading;
  page(ctx);
  doc.y = TOP + 10;
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(DISCLAIMER.heading, MARGIN, doc.y);
  doc.rect(MARGIN, doc.y + 6, 40, 3).fill(GOLD);
  doc.y += 22;
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(DISCLAIMER.text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 3 });
  doc.moveDown(2);
  wordmark(ctx, 'dark', MARGIN, doc.y, 120);
  doc.font('Helvetica').fontSize(9).fillColor(MUTED).text('insiderbuying.com', MARGIN, doc.y + 62);
}

// ── Chapter furniture ────────────────────────────────────────────────────

/** "Part One: Why…" → ["Part One", "Why…"]; headings without a colon come back whole. */
function splitHeading(h: string): [string, string | undefined] {
  const i = h.indexOf(':');
  return i > 0 ? [h.slice(0, i).trim(), h.slice(i + 1).trim()] : [h, undefined];
}

/** Section opener: a blue band with the chapter numeral and title. */
function opener(ctx: Ctx, numeral: string, label: string, rest?: string) {
  const { doc } = ctx;
  const bandY = TOP - 6;
  const bandH = rest ? 148 : 112;
  doc.rect(MARGIN - 60, bandY, PAGE_W, bandH).fill(BLUE);
  doc.rect(MARGIN - 60, bandY + bandH - 5, PAGE_W, 5).fill(GOLD);
  doc.font('Helvetica-Bold').fontSize(54).fillColor('#1D6E95').text(numeral, PAGE_W - MARGIN - 90, bandY + 22, { width: 90, align: 'right', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(10.5).fillColor(GOLD).text(label.toUpperCase(), MARGIN, bandY + 30, { characterSpacing: 2.5, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(rest ? 22 : 24).fillColor('#FFFFFF').text(rest ?? label, MARGIN, bandY + 52, { width: CONTENT_W - 100, lineGap: 1 });
  doc.y = bandY + bandH + 22;
}

function chapterTitle(ctx: Ctx, text: string) {
  const { doc } = ctx;
  doc.font('Helvetica-Bold').fontSize(26).fillColor(INK).text(text, MARGIN, doc.y, { width: CONTENT_W });
  doc.rect(MARGIN, doc.y + 8, 60, 4).fill(GOLD);
  doc.y += 30;
}

function blocks(ctx: Ctx, list: Block[]) {
  for (const b of list) {
    switch (b.kind) {
      case 'h2':
        h2(ctx, b.text);
        break;
      case 'p':
        para(ctx, b.text);
        break;
      case 'bullets':
        for (const it of b.items) bullet(ctx, it);
        ctx.doc.moveDown(0.5);
        break;
      case 'callout':
        callout(ctx, b.label, b.text, BLUE, BLUE_TINT);
        break;
      case 'quote':
        quote(ctx, b.text, b.by);
        break;
      case 'footnote':
        ensure(ctx, 30);
        ctx.doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(b.text, MARGIN, ctx.doc.y, { width: CONTENT_W, lineGap: 1.5 });
        ctx.doc.moveDown(0.8);
        break;
    }
  }
}

function h2(ctx: Ctx, text: string) {
  const { doc } = ctx;
  ensure(ctx, 80);
  doc.moveDown(0.5);
  const y = doc.y;
  doc.rect(MARGIN, y + 4, 4, 14).fill(GOLD);
  doc.font('Helvetica-Bold').fontSize(15.5).fillColor(BLUE).text(text, MARGIN + 14, y, { width: CONTENT_W - 14, lineGap: 1 });
  doc.moveDown(0.4);
}

/** Body paragraph with **bold** spans. */
function para(ctx: Ctx, text: string) {
  ensure(ctx, 42);
  rich(ctx.doc, text, MARGIN, ctx.doc.y, { width: CONTENT_W, size: 10.5, color: BODY, lineGap: 3.2 });
  ctx.doc.moveDown(0.8);
}

function bullet(ctx: Ctx, text: string) {
  const { doc } = ctx;
  ensure(ctx, 36);
  const y = doc.y;
  doc.rect(MARGIN + 4, y + 4.5, 5, 5).fill(GOLD);
  rich(doc, text, MARGIN + 20, y, { width: CONTENT_W - 20, size: 10.5, color: BODY, lineGap: 2.8 });
  doc.moveDown(0.4);
}

function callout(ctx: Ctx, label: string, text: string, bar: string, bg: string) {
  const { doc } = ctx;
  const padX = 18;
  const innerW = CONTENT_W - padX * 2 - 6;
  doc.font('Helvetica').fontSize(10.5);
  const textH = doc.heightOfString(text, { width: innerW, lineGap: 3 });
  const h = textH + 50;
  ensure(ctx, h + 12);
  const y = doc.y;
  doc.roundedRect(MARGIN, y, CONTENT_W, h, 4).fill(bg);
  doc.rect(MARGIN, y, 5, h).fill(bar);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(bar === GOLD ? '#8A6A1F' : BLUE).text(label.toUpperCase(), MARGIN + padX, y + 14, { characterSpacing: 1.6 });
  doc.font('Helvetica').fontSize(10.5).fillColor(BODY).text(text, MARGIN + padX, y + 30, { width: innerW, lineGap: 3 });
  doc.y = y + h + 16;
}

/** Pull quote on a navy card with a gold quotation mark. */
function quote(ctx: Ctx, text: string, by: string) {
  const { doc } = ctx;
  doc.font('Helvetica-BoldOblique').fontSize(16);
  const th = doc.heightOfString(text, { width: CONTENT_W - 96, lineGap: 3 });
  const h = th + 74;
  ensure(ctx, h + 12);
  const y = doc.y + 2;
  doc.roundedRect(MARGIN, y, CONTENT_W, h, 6).fill(NAVY);
  doc.rect(MARGIN, y + 16, 5, h - 32).fill(GOLD);
  doc.font('Helvetica-Bold').fontSize(56).fillColor(GOLD).text('“', MARGIN + 22, y + 2, { lineBreak: false });
  doc.font('Helvetica-BoldOblique').fontSize(16).fillColor('#FFFFFF').text(text, MARGIN + 64, y + 26, { width: CONTENT_W - 96, lineGap: 3 });
  doc.font('Helvetica-Bold').fontSize(9.5).fillColor(GOLD).text(`— ${by.toUpperCase()}`, MARGIN + 64, y + 26 + th + 12, { characterSpacing: 1.5 });
  doc.y = y + h + 18;
}

/** `tail` = height that must follow the last two rows on the same page (the
 *  tagline and CTA), so a page never ends on the table and opens on a lone button. */
function table(ctx: Ctx, head: string[], rows: Array<[string, string]>, tail = 0) {
  const { doc } = ctx;
  const c1 = 178;
  const c2 = CONTENT_W - c1;
  const headH = 28;
  ensure(ctx, headH + 70);
  let y = doc.y + 4;
  const drawHead = () => {
    doc.rect(MARGIN, y, CONTENT_W, headH).fill(BLUE);
    doc.rect(MARGIN, y, CONTENT_W, 3).fill(GOLD);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
    doc.text(head[0].toUpperCase(), MARGIN + 12, y + 11, { width: c1 - 20, characterSpacing: 1.2 });
    doc.text(head[1].toUpperCase(), MARGIN + c1 + 12, y + 11, { width: c2 - 20, characterSpacing: 1.2 });
    y += headH;
  };
  drawHead();
  rows.forEach(([f, what], i) => {
    doc.font('Helvetica').fontSize(9.5);
    const hWhat = doc.heightOfString(what, { width: c2 - 24, lineGap: 2 });
    doc.font('Helvetica-Bold').fontSize(10);
    const hF = doc.heightOfString(f, { width: c1 - 24, lineGap: 2 });
    const rowH = Math.max(hWhat, hF) + 14;
    const reserve = i >= rows.length - 2 ? tail : 0;
    if (y + rowH + reserve > BOTTOM) {
      page(ctx);
      y = TOP;
      drawHead();
    }
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(PANEL);
    doc.rect(MARGIN, y, 3, rowH).fill(i % 2 === 0 ? BLUE : GOLD);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(BLUE_DEEP).text(f, MARGIN + 12, y + 7, { width: c1 - 24, lineGap: 2 });
    doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(what, MARGIN + c1 + 12, y + 7, { width: c2 - 24, lineGap: 2 });
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });
  doc.y = y + 10;
}

/** Write text with **bold** runs, honouring width and lineGap. */
function rich(doc: Doc, text: string, x: number, y: number, o: { width: number; size: number; color: string; lineGap: number }) {
  const parts = text.split('**');
  doc.fillColor(o.color).fontSize(o.size);
  parts.forEach((part, i) => {
    if (!part) return;
    const last = i === parts.length - 1 || parts.slice(i + 1).every((p) => !p);
    doc.font(i % 2 === 1 ? 'Helvetica-Bold' : 'Helvetica');
    if (i === 0 || (i === 1 && !parts[0])) doc.text(part, x, y, { width: o.width, lineGap: o.lineGap, continued: !last });
    else doc.text(part, { width: o.width, lineGap: o.lineGap, continued: !last });
  });
}

// ── Stock chapter ────────────────────────────────────────────────────────

function stock(ctx: Ctx, s: StockSection, series: Bar[]) {
  const { doc } = ctx;
  ensure(ctx, 120);
  // Header card: ticker badge, name, exchange, tag pills.
  const y = doc.y;
  const cardH = 72;
  doc.roundedRect(MARGIN, y, CONTENT_W, cardH, 6).fill(PANEL);
  doc.roundedRect(MARGIN + 14, y + 14, 92, 44, 5).fill(BLUE);
  doc.font('Helvetica-Bold').fontSize(20).fillColor('#FFFFFF').text(s.ticker, MARGIN + 14, y + 20, { width: 92, align: 'center', lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD).text(s.exchange, MARGIN + 14, y + 43, { width: 92, align: 'center', lineBreak: false, characterSpacing: 1.5 });
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(`STOCK #${s.number}`, MARGIN + 122, y + 14, { characterSpacing: 2, lineBreak: false });
  doc.font('Helvetica-Bold').fontSize(16).fillColor(INK).text(s.name, MARGIN + 122, y + 27, { width: CONTENT_W - 136, lineBreak: false });
  let px = MARGIN + 122;
  const py = y + 50;
  doc.font('Helvetica-Bold').fontSize(7.5);
  for (const t of s.tags) {
    const w = doc.widthOfString(t) + 14;
    doc.roundedRect(px, py, w, 15, 7.5).lineWidth(1).strokeColor(GOLD).fillAndStroke(GOLD_SOFT, GOLD);
    doc.fillColor('#7A5C14').text(t, px + 7, py + 4, { lineBreak: false, characterSpacing: 0.6 });
    px += w + 6;
  }
  doc.y = y + cardH + 14;

  chart(ctx, s, series);
  doc.moveDown(0.5);

  s.qa.forEach(({ q, a }, i) => {
    ensure(ctx, 64);
    const qy = doc.y;
    doc.circle(MARGIN + 8, qy + 7, 8).fill(BLUE);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(String(i + 1), MARGIN, qy + 3, { width: 16, align: 'center', lineBreak: false });
    const label = q.replace(/^\d+\.\s*/, '');
    doc.font('Helvetica-Bold').fontSize(12).fillColor(INK).text(label, MARGIN + 24, qy, { width: CONTENT_W - 24 });
    doc.moveDown(0.2);
    rich(doc, a, MARGIN + 24, doc.y, { width: CONTENT_W - 24, size: 10.5, color: BODY, lineGap: 3.2 });
    doc.moveDown(0.9);
  });
}

// ── Chart ────────────────────────────────────────────────────────────────

const CHART_H = 240;

function chart(ctx: Ctx, s: StockSection, series: Bar[]) {
  const { doc } = ctx;
  ensure(ctx, CHART_H + 34);
  const x0 = MARGIN;
  const y0 = doc.y;
  const w = CONTENT_W;
  const h = CHART_H;
  doc.roundedRect(x0, y0, w, h, 6).fill(NAVY);

  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text(s.ticker, x0 + 14, y0 + 12, { lineBreak: false });
  doc
    .font('Helvetica')
    .fontSize(8.5)
    .fillColor('#93B4C9')
    .text(`${s.name} · 1-year daily close`, x0 + 14 + doc.widthOfString(s.ticker) + 10, y0 + 13.5, { lineBreak: false });

  const plot = { x: x0 + 48, y: y0 + 36, w: w - 48 - 18, h: h - 36 - 36 };
  const data = series.filter((b) => Number.isFinite(b.close) && b.close > 0);
  if (data.length < 5) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#93B4C9').text('Price history unavailable at time of rendering.', x0, y0 + h / 2 - 6, { width: w, align: 'center' });
    doc.y = y0 + h + 6;
    return;
  }
  const t0 = Date.parse(data[0].date);
  const t1 = Date.parse(data[data.length - 1].date);
  let lo = Math.min(...data.map((b) => b.close));
  let hi = Math.max(...data.map((b) => b.close));
  if (s.refLine) {
    lo = Math.min(lo, s.refLine.price);
    hi = Math.max(hi, s.refLine.price);
  }
  const pad = (hi - lo) * 0.12 || 1;
  lo -= pad;
  hi += pad * 1.6;
  const X = (t: number) => plot.x + ((t - t0) / Math.max(1, t1 - t0)) * plot.w;
  const Y = (p: number) => plot.y + (1 - (p - lo) / (hi - lo)) * plot.h;

  if (s.band) {
    const bx0 = Math.max(plot.x, X(Date.parse(s.band.from)));
    const bx1 = Math.min(plot.x + plot.w, X(Date.parse(s.band.to)));
    if (bx1 > bx0) {
      doc.save().fillOpacity(0.16).rect(bx0, plot.y, bx1 - bx0, plot.h).fill('#EF4444').restore();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FCA5A5').text(s.band.label.toUpperCase(), bx0 + 6, plot.y + plot.h - 12, { lineBreak: false, characterSpacing: 0.8 });
    }
  }

  doc.save();
  const ticks = 4;
  doc.font('Helvetica').fontSize(7.5);
  for (let i = 0; i <= ticks; i++) {
    const p = lo + ((hi - lo) * i) / ticks;
    const y = Y(p);
    doc.moveTo(plot.x, y).lineTo(plot.x + plot.w, y).lineWidth(0.5).strokeColor('#164A66').stroke();
    doc.fillColor('#93B4C9').text(fmtPrice(p), x0 + 8, y - 4, { width: 36, align: 'right', lineBreak: false });
  }
  const months = new Set<string>();
  for (const b of data) {
    const m = b.date.slice(0, 7);
    if (!months.has(m)) {
      months.add(m);
      const t = Date.parse(b.date);
      if (X(t) > plot.x + 12 && X(t) < plot.x + plot.w - 12) {
        const d = new Date(t);
        const label = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : '');
        doc.fillColor('#93B4C9').text(label, X(t) - 16, plot.y + plot.h + 8, { width: 40, align: 'center', lineBreak: false });
      }
    }
  }
  doc.restore();

  if (s.refLine) {
    const y = Y(s.refLine.price);
    doc.save().dash(3, { space: 3 }).moveTo(plot.x, y).lineTo(plot.x + plot.w, y).lineWidth(1).strokeColor(GOLD).stroke().undash().restore();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD).text(s.refLine.label.toUpperCase(), plot.x + 6, y + 3, { lineBreak: false, characterSpacing: 0.6 });
  }

  doc.save();
  doc.moveTo(X(t0), plot.y + plot.h);
  for (const b of data) doc.lineTo(X(Date.parse(b.date)), Y(b.close));
  doc.lineTo(X(t1), plot.y + plot.h).closePath().fillOpacity(0.14).fill('#38BDF8');
  doc.restore();
  doc.save();
  data.forEach((b, i) => {
    const x = X(Date.parse(b.date));
    const y = Y(b.close);
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  });
  doc.lineWidth(1.6).strokeColor('#7DD3FC').stroke();
  doc.restore();

  const last = data[data.length - 1];
  doc.circle(X(t1), Y(last.close), 2.6).fill('#FFFFFF');
  const markerNearEnd = s.markers.some((m) => Math.abs(X(Date.parse(m.date)) - X(t1)) < 40);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(fmtPrice(last.close), X(t1) - 48, Y(last.close) + (markerNearEnd ? 7 : -14), {
    width: 46,
    align: 'right',
    lineBreak: false,
  });

  s.markers.forEach((m, idx) => {
    const t = Date.parse(m.date);
    const bar = nearest(data, t);
    if (!bar) return;
    const x = X(Date.parse(bar.date));
    const y = Y(bar.close);
    const tipY = y - 5;
    const tailY = y - 34;
    doc.save();
    doc.moveTo(x, tailY).lineTo(x, tipY).lineWidth(2).strokeColor(GOLD).stroke();
    doc.moveTo(x, tipY + 4).lineTo(x - 5, tipY - 5).lineTo(x + 5, tipY - 5).closePath().fill(GOLD);
    doc.circle(x, y, 4).lineWidth(1.5).strokeColor(GOLD).fillAndStroke(NAVY, GOLD);
    doc.restore();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD);
    const lw = doc.widthOfString(m.label) + 10;
    let lx = x - lw / 2;
    lx = Math.max(plot.x, Math.min(plot.x + plot.w - lw, lx));
    const ly = tailY - 16;
    doc.roundedRect(lx, ly, lw, 13, 3).fill('#0F3A55');
    doc.fillColor(GOLD).text(m.label, lx + 5, ly + 3, { lineBreak: false, characterSpacing: 0.6 });
    if (idx === 0) {
      const dt = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      doc.font('Helvetica').fontSize(7.5).fillColor('#93B4C9').text(
        s.markers.length > 1 ? `Insider purchases: ${s.markers.map((k) => shortDate(k.date)).join(' · ')}` : `Insider purchases: ${dt}`,
        x0 + 14,
        y0 + h - 14,
        { lineBreak: false },
      );
    }
  });

  doc.y = y0 + h + 6;
  doc.font('Helvetica-Oblique').fontSize(8).fillColor(MUTED).text(`Chart: ${s.chartSpec} Source: daily closing prices, ${s.exchange}.`, x0, doc.y, { width: w, lineGap: 1 });
  doc.moveDown(0.3);
}

// ── Running header + footer on every page after the cover ───────────────

function chrome(ctx: Ctx, asOf: string) {
  const { doc } = ctx;
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    // Header: wordmark left, section label right, rule beneath.
    wordmark(ctx, 'dark', MARGIN, 28, 82);
    const label = ctx.sectionByPage.get(i) || '';
    if (label) {
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(MUTED).text(label.toUpperCase(), MARGIN + 100, 40, { width: CONTENT_W - 100, align: 'right', characterSpacing: 1.5, lineBreak: false });
    }
    doc.moveTo(MARGIN, 60).lineTo(PAGE_W - MARGIN, 60).lineWidth(0.6).strokeColor(RULE).stroke();
    // Footer: page number in a blue square, then the running line.
    withNoBottomMargin(doc, () => {
      doc.rect(MARGIN, FOOTER_Y - 6, 22, 18).fill(BLUE);
      doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF').text(String(i - range.start + 1), MARGIN, FOOTER_Y - 1, { width: 22, align: 'center', lineBreak: false });
      doc.font('Helvetica').fontSize(7.5).fillColor(MUTED).text(`${COVER.edition}  ·  Prices as of ${asOf}  ·  Not investment advice`, MARGIN + 30, FOOTER_Y + 1, {
        width: CONTENT_W - 150,
        lineBreak: false,
        characterSpacing: 0.4,
      });
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLUE).text('insiderbuying.com', PAGE_W - MARGIN - 110, FOOTER_Y + 1, { width: 110, align: 'right', lineBreak: false });
    });
    doc.restore();
  }
}

// ── Utilities ────────────────────────────────────────────────────────────

function nearest(data: Bar[], t: number): Bar | null {
  let best: Bar | null = null;
  let bd = Infinity;
  for (const b of data) {
    const d = Math.abs(Date.parse(b.date) - t);
    if (d < bd) {
      bd = d;
      best = b;
    }
  }
  return bd <= 6 * 86_400_000 ? best : null;
}

function fmtPrice(p: number): string {
  return p >= 100 ? `$${p.toFixed(0)}` : `$${p.toFixed(2)}`;
}

function shortDate(iso: string): string {
  return new Date(Date.parse(iso)).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}
