import PDFDocument from 'pdfkit';
import { Block, CLOSE, COVER, DISCLAIMER, EDITOR_NOTE, PART_ONE, PART_TWO, StockSection } from './free-report.content';

/**
 * Lays out the "GET ON THE INSIDE" report as a PDF. Every word comes from
 * free-report.content.ts; this file owns only typography, the three charts
 * and page flow. pdfkit's built-in Helvetica family is used throughout so the
 * deploy needs no font assets (same choice as the $3 report).
 *
 * Charts are drawn as vector paths straight into the PDF — a one-year daily
 * close line on a dark panel, the document's requested gold arrows and
 * "INSIDERS BOUGHT HERE" labels at the purchase dates, an optional shaded
 * drawdown band and an optional dashed reference line (the 52-week low).
 */

export interface Bar {
  date: string; // YYYY-MM-DD
  close: number;
}

const NAVY = '#0D1F35';
const NAVY_DEEP = '#08152A';
const GOLD = '#C8A24A';
const INK = '#111827';
const BODY = '#1F2937';
const MUTED = '#6B7280';
const RULE = '#E5E7EB';
const PANEL = '#F5F6F8';
const GREEN = '#0A7D33';

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;
const CONTENT_W = PAGE_W - MARGIN * 2;
const FOOTER_Y = PAGE_H - 44;
const BOTTOM = PAGE_H - 72;

type Doc = InstanceType<typeof PDFDocument>;

export function renderFreeReportPdf(bars: Record<string, Bar[]>, asOf: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: 72, left: MARGIN, right: MARGIN },
      bufferPages: true,
      info: {
        Title: 'Get On The Inside — A Guide to Following Insider Buying',
        Author: 'InsiderBuying.com',
        Subject: 'Free investor report, ' + COVER.edition,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    cover(doc);
    editorNote(doc);
    partOne(doc);
    partTwo(doc, bars);
    close(doc);
    disclaimer(doc);
    footers(doc, asOf);
    doc.end();
  });
}

// ── Pages ───────────────────────────────────────────────────────────────

function cover(doc: Doc) {
  doc.rect(0, 0, PAGE_W, PAGE_H).fill(NAVY);
  doc.rect(0, 0, PAGE_W, 8).fill(GOLD);
  // Subtle grid of rules in the lower half, like a ledger.
  doc.save().strokeColor('#16294A').lineWidth(1);
  for (let y = 470; y < PAGE_H - 90; y += 22) doc.moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).stroke();
  doc.restore();

  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(11).text(COVER.kicker, MARGIN, 150, { characterSpacing: 3 });
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(46).text(COVER.title, MARGIN, 178, { width: CONTENT_W, characterSpacing: 1 });
  doc.moveTo(MARGIN, 250).lineTo(MARGIN + 90, 250).lineWidth(3).strokeColor(GOLD).stroke();
  doc.fillColor('#E5E7EB').font('Helvetica').fontSize(20).text(COVER.subtitle, MARGIN, 268, { width: CONTENT_W });
  doc.fillColor(GOLD).font('Helvetica-Oblique').fontSize(15).text(COVER.sub2, MARGIN, 300, { width: CONTENT_W });

  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(12).text(COVER.publisher, MARGIN, 600);
  doc.fillColor('#9CA3AF').font('Helvetica').fontSize(11).text(COVER.edition, MARGIN, 618);
  // Inside the bottom margin pdfkit would start a new page mid-sentence, so
  // the margin is lifted for this one line and restored after.
  withNoBottomMargin(doc, () =>
    doc.fillColor('#9CA3AF').font('Helvetica').fontSize(8.5).text(COVER.legal, MARGIN, PAGE_H - 40, { width: CONTENT_W, lineBreak: false }),
  );
  doc.addPage();
}

function editorNote(doc: Doc) {
  h1(doc, EDITOR_NOTE.heading);
  for (const p of EDITOR_NOTE.paragraphs) para(doc, p);
  ensure(doc, 30);
  doc.font('Helvetica-Oblique').fontSize(11).fillColor(MUTED).text(EDITOR_NOTE.signoff, MARGIN, doc.y + 6, { width: CONTENT_W });
  doc.addPage();
}

function partOne(doc: Doc) {
  h1(doc, PART_ONE.heading);
  blocks(doc, PART_ONE.blocks);
  doc.addPage();
}

function partTwo(doc: Doc, bars: Record<string, Bar[]>) {
  h1(doc, PART_TWO.heading);
  doc.font('Helvetica-Oblique').fontSize(10).fillColor(MUTED).text(PART_TWO.intro, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
  doc.moveDown(0.8);
  PART_TWO.stocks.forEach((s, i) => {
    if (i > 0) doc.addPage();
    stock(doc, s, bars[s.chartSymbol] || []);
  });
  ensure(doc, 110);
  callout(doc, PART_TWO.important.label, PART_TWO.important.text, GOLD);
  doc.addPage();
}

function stock(doc: Doc, s: StockSection, series: Bar[]) {
  h2(doc, `Stock #${s.number} — ${s.name} (${s.exchange}: ${s.ticker})`);
  // Tag pills
  let x = MARGIN;
  const y = doc.y + 2;
  doc.font('Helvetica-Bold').fontSize(8);
  for (const t of s.tags) {
    const w = doc.widthOfString(t) + 16;
    doc.roundedRect(x, y, w, 16, 8).fill(NAVY);
    doc.fillColor(GOLD).text(t, x + 8, y + 4, { lineBreak: false });
    x += w + 6;
  }
  doc.y = y + 26;
  chart(doc, s, series);
  doc.moveDown(0.6);
  for (const { q, a } of s.qa) {
    ensure(doc, 60);
    doc.font('Helvetica-Bold').fontSize(11.5).fillColor(INK).text(q, MARGIN, doc.y, { width: CONTENT_W });
    doc.moveDown(0.15);
    para(doc, a);
  }
}

function close(doc: Doc) {
  h1(doc, CLOSE.heading);
  for (const p of CLOSE.paragraphs) para(doc, p);
  table(doc, CLOSE.tableHead, CLOSE.features);
  ensure(doc, 90);
  doc.moveDown(0.8);
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(CLOSE.tagline, MARGIN, doc.y, { width: CONTENT_W, align: 'center' });
  doc.moveDown(0.6);
  const boxY = doc.y;
  doc.roundedRect(MARGIN, boxY, CONTENT_W, 46, 6).fill(NAVY);
  doc.fillColor(GOLD).font('Helvetica-Bold').fontSize(12).text(CLOSE.cta, MARGIN, boxY + 16, {
    width: CONTENT_W,
    align: 'center',
    link: 'https://insiderbuying.com/premium',
    underline: false,
  });
  doc.y = boxY + 60;
}

function disclaimer(doc: Doc) {
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text(DISCLAIMER.heading, MARGIN, MARGIN);
  doc.moveDown(0.4);
  doc.font('Helvetica').fontSize(9.5).fillColor(MUTED).text(DISCLAIMER.text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2.5 });
}

function footers(doc: Doc, asOf: string) {
  const range = doc.bufferedPageRange();
  for (let i = range.start + 1; i < range.start + range.count; i++) {
    doc.switchToPage(i);
    doc.save();
    withNoBottomMargin(doc, () => {
    doc.moveTo(MARGIN, FOOTER_Y - 10).lineTo(PAGE_W - MARGIN, FOOTER_Y - 10).lineWidth(0.5).strokeColor(RULE).stroke();
    doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF');
    doc.text(`InsiderBuying.com  ·  Get On The Inside  ·  ${COVER.edition}  ·  Data as of ${asOf}  ·  Not investment advice`, MARGIN, FOOTER_Y, {
      width: CONTENT_W - 40,
      lineBreak: false,
    });
    doc.text(String(i - range.start + 1), PAGE_W - MARGIN - 40, FOOTER_Y, { width: 40, align: 'right', lineBreak: false });
    });
    doc.restore();
  }
}

/** pdfkit starts a new page when text lands below the bottom margin; footers
 *  and the cover's legal line live there on purpose. */
function withNoBottomMargin(doc: Doc, fn: () => void) {
  const m = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  try {
    fn();
  } finally {
    doc.page.margins.bottom = m;
  }
}

// ── Blocks ──────────────────────────────────────────────────────────────

function blocks(doc: Doc, list: Block[]) {
  for (const b of list) {
    switch (b.kind) {
      case 'h2':
        h2(doc, b.text);
        break;
      case 'p':
        para(doc, b.text);
        break;
      case 'bullets':
        for (const it of b.items) bullet(doc, it);
        doc.moveDown(0.5);
        break;
      case 'callout':
        callout(doc, b.label, b.text, GOLD);
        break;
      case 'quote':
        quote(doc, b.text, b.by);
        break;
      case 'footnote':
        ensure(doc, 30);
        doc.font('Helvetica-Oblique').fontSize(8.5).fillColor(MUTED).text(b.text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 1.5 });
        doc.moveDown(0.8);
        break;
    }
  }
}

function h1(doc: Doc, text: string) {
  doc.font('Helvetica-Bold').fontSize(22).fillColor(INK).text(text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 2 });
  const y = doc.y + 6;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + 60, y).lineWidth(3).strokeColor(GOLD).stroke();
  doc.y = y + 16;
}

function h2(doc: Doc, text: string) {
  ensure(doc, 70);
  doc.moveDown(0.4);
  doc.font('Helvetica-Bold').fontSize(15).fillColor(NAVY).text(text, MARGIN, doc.y, { width: CONTENT_W, lineGap: 1 });
  doc.moveDown(0.35);
}

/** Body paragraph with **bold** spans. */
function para(doc: Doc, text: string, opts: { size?: number; color?: string; indent?: number; width?: number } = {}) {
  const size = opts.size ?? 10.5;
  const color = opts.color ?? BODY;
  const x = MARGIN + (opts.indent ?? 0);
  const width = opts.width ?? CONTENT_W - (opts.indent ?? 0);
  ensure(doc, 40);
  rich(doc, text, x, doc.y, { width, size, color, lineGap: 2.6 });
  doc.moveDown(0.75);
}

function bullet(doc: Doc, text: string) {
  ensure(doc, 34);
  const y = doc.y;
  doc.circle(MARGIN + 6, y + 5.5, 2).fill(GOLD);
  rich(doc, text, MARGIN + 18, y, { width: CONTENT_W - 18, size: 10.5, color: BODY, lineGap: 2.4 });
  doc.moveDown(0.35);
}

function callout(doc: Doc, label: string, text: string, bar: string) {
  const padX = 16;
  const innerW = CONTENT_W - padX * 2 - 6;
  doc.font('Helvetica').fontSize(10.5);
  const textH = doc.heightOfString(text, { width: innerW, lineGap: 2.6 });
  const h = textH + 46;
  ensure(doc, h + 10);
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_W, h).fill(PANEL);
  doc.rect(MARGIN, y, 5, h).fill(bar);
  doc.font('Helvetica-Bold').fontSize(9).fillColor(MUTED).text(label.toUpperCase(), MARGIN + padX, y + 12, { characterSpacing: 1.2 });
  doc.font('Helvetica').fontSize(10.5).fillColor(BODY).text(text, MARGIN + padX, y + 28, { width: innerW, lineGap: 2.6 });
  doc.y = y + h + 14;
}

function quote(doc: Doc, text: string, by: string) {
  ensure(doc, 100);
  const y = doc.y + 4;
  doc.font('Helvetica-Bold').fontSize(40).fillColor(GOLD).text('“', MARGIN, y - 14, { lineBreak: false });
  doc.font('Helvetica-BoldOblique').fontSize(15).fillColor(NAVY).text(text, MARGIN + 30, y + 4, { width: CONTENT_W - 60, lineGap: 3 });
  doc.moveDown(0.3);
  doc.font('Helvetica').fontSize(10).fillColor(MUTED).text(`— ${by}`, MARGIN + 30, doc.y, { width: CONTENT_W - 60 });
  doc.moveDown(1);
}

function table(doc: Doc, head: string[], rows: Array<[string, string]>) {
  const c1 = 170;
  const c2 = CONTENT_W - c1;
  const headH = 24;
  ensure(doc, headH + 60);
  let y = doc.y + 4;
  const drawHead = () => {
    doc.rect(MARGIN, y, CONTENT_W, headH).fill(NAVY);
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor('#FFFFFF');
    doc.text(head[0].toUpperCase(), MARGIN + 10, y + 8, { width: c1 - 20, characterSpacing: 1 });
    doc.text(head[1].toUpperCase(), MARGIN + c1 + 10, y + 8, { width: c2 - 20, characterSpacing: 1 });
    y += headH;
  };
  drawHead();
  rows.forEach(([f, what], i) => {
    doc.font('Helvetica').fontSize(9.5);
    const hWhat = doc.heightOfString(what, { width: c2 - 20, lineGap: 1.5 });
    doc.font('Helvetica-Bold').fontSize(10);
    const hF = doc.heightOfString(f, { width: c1 - 20, lineGap: 1.5 });
    const rowH = Math.max(hWhat, hF) + 16;
    if (y + rowH > BOTTOM) {
      doc.addPage();
      y = MARGIN;
      drawHead();
    }
    if (i % 2 === 0) doc.rect(MARGIN, y, CONTENT_W, rowH).fill(PANEL);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(INK).text(f, MARGIN + 10, y + 8, { width: c1 - 20, lineGap: 1.5 });
    doc.font('Helvetica').fontSize(9.5).fillColor(BODY).text(what, MARGIN + c1 + 10, y + 8, { width: c2 - 20, lineGap: 1.5 });
    doc.moveTo(MARGIN, y + rowH).lineTo(MARGIN + CONTENT_W, y + rowH).lineWidth(0.5).strokeColor(RULE).stroke();
    y += rowH;
  });
  doc.y = y + 8;
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

function ensure(doc: Doc, needed: number) {
  if (doc.y + needed > BOTTOM) doc.addPage();
}

// ── Chart ───────────────────────────────────────────────────────────────

const CHART_H = 236;

function chart(doc: Doc, s: StockSection, series: Bar[]) {
  ensure(doc, CHART_H + 30);
  const x0 = MARGIN;
  const y0 = doc.y;
  const w = CONTENT_W;
  const h = CHART_H;
  doc.roundedRect(x0, y0, w, h, 6).fill(NAVY_DEEP);

  // Header inside the panel.
  doc.font('Helvetica-Bold').fontSize(10).fillColor('#FFFFFF').text(`${s.ticker}`, x0 + 14, y0 + 12, { lineBreak: false });
  doc.font('Helvetica').fontSize(8.5).fillColor('#9CA3AF').text(`${s.name} · 1-year daily close`, x0 + 14 + doc.widthOfString(s.ticker) + 10, y0 + 13.5, {
    lineBreak: false,
  });

  const plot = { x: x0 + 46, y: y0 + 36, w: w - 46 - 18, h: h - 36 - 34 };
  const data = series.filter((b) => Number.isFinite(b.close) && b.close > 0);
  if (data.length < 5) {
    doc.font('Helvetica-Oblique').fontSize(10).fillColor('#9CA3AF').text('Price history unavailable at time of rendering.', x0, y0 + h / 2 - 6, { width: w, align: 'center' });
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
  hi += pad * 1.6; // room for the marker labels above the line
  const X = (t: number) => plot.x + ((t - t0) / Math.max(1, t1 - t0)) * plot.w;
  const Y = (p: number) => plot.y + (1 - (p - lo) / (hi - lo)) * plot.h;

  // Drawdown band.
  if (s.band) {
    const bx0 = Math.max(plot.x, X(Date.parse(s.band.from)));
    const bx1 = Math.min(plot.x + plot.w, X(Date.parse(s.band.to)));
    if (bx1 > bx0) {
      doc.save().fillOpacity(0.18).rect(bx0, plot.y, bx1 - bx0, plot.h).fill('#EF4444').restore();
      doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#FCA5A5').text(s.band.label.toUpperCase(), bx0 + 6, plot.y + plot.h - 12, { lineBreak: false, characterSpacing: 0.8 });
    }
  }

  // Grid + y labels.
  doc.save();
  const ticks = 4;
  doc.font('Helvetica').fontSize(7.5);
  for (let i = 0; i <= ticks; i++) {
    const p = lo + ((hi - lo) * i) / ticks;
    const y = Y(p);
    doc.moveTo(plot.x, y).lineTo(plot.x + plot.w, y).lineWidth(0.5).strokeColor('#1E3358').stroke();
    doc.fillColor('#9CA3AF').text(fmtPrice(p), x0 + 8, y - 4, { width: 34, align: 'right', lineBreak: false });
  }
  // Month labels.
  const months = new Set<string>();
  for (const b of data) {
    const m = b.date.slice(0, 7);
    if (!months.has(m)) {
      months.add(m);
      const t = Date.parse(b.date);
      if (X(t) > plot.x + 12 && X(t) < plot.x + plot.w - 12) {
        const d = new Date(t);
        const label = d.toLocaleDateString('en-US', { month: 'short', timeZone: 'UTC' }) + (d.getUTCMonth() === 0 ? ` ${d.getUTCFullYear()}` : '');
        doc.fillColor('#9CA3AF').text(label, X(t) - 16, plot.y + plot.h + 8, { width: 40, align: 'center', lineBreak: false });
      }
    }
  }
  doc.restore();

  // Reference line.
  if (s.refLine) {
    const y = Y(s.refLine.price);
    doc.save().dash(3, { space: 3 }).moveTo(plot.x, y).lineTo(plot.x + plot.w, y).lineWidth(1).strokeColor(GOLD).stroke().undash().restore();
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD).text(s.refLine.label.toUpperCase(), plot.x + 6, y + 3, { lineBreak: false, characterSpacing: 0.6 });
  }

  // Area fill under the line, then the line.
  doc.save();
  doc.moveTo(X(t0), plot.y + plot.h);
  for (const b of data) doc.lineTo(X(Date.parse(b.date)), Y(b.close));
  doc.lineTo(X(t1), plot.y + plot.h).closePath().fillOpacity(0.12).fill('#60A5FA');
  doc.restore();
  doc.save();
  data.forEach((b, i) => {
    const x = X(Date.parse(b.date));
    const y = Y(b.close);
    if (i === 0) doc.moveTo(x, y);
    else doc.lineTo(x, y);
  });
  doc.lineWidth(1.6).strokeColor('#93C5FD').stroke();
  doc.restore();

  // Last price dot + label. The label moves below the dot when a purchase
  // marker sits at the end of the series, so the two never overprint.
  const last = data[data.length - 1];
  doc.circle(X(t1), Y(last.close), 2.6).fill('#FFFFFF');
  const markerNearEnd = s.markers.some((m) => Math.abs(X(Date.parse(m.date)) - X(t1)) < 40);
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF').text(fmtPrice(last.close), X(t1) - 48, Y(last.close) + (markerNearEnd ? 7 : -14), {
    width: 46,
    align: 'right',
    lineBreak: false,
  });

  // Gold arrows at purchase dates.
  s.markers.forEach((m, idx) => {
    const t = Date.parse(m.date);
    const bar = nearest(data, t);
    if (!bar) return;
    const x = X(Date.parse(bar.date));
    const y = Y(bar.close);
    // Arrow: label above, shaft down to the point.
    const tipY = y - 5;
    const tailY = y - 34;
    doc.save();
    doc.moveTo(x, tailY).lineTo(x, tipY).lineWidth(2).strokeColor(GOLD).stroke();
    doc.moveTo(x, tipY + 4).lineTo(x - 5, tipY - 5).lineTo(x + 5, tipY - 5).closePath().fill(GOLD);
    doc.circle(x, y, 4).lineWidth(1.5).strokeColor(GOLD).fillAndStroke(NAVY_DEEP, GOLD);
    doc.restore();
    // Label: only once when markers crowd (CoStar has three, spaced out; Enovis one).
    const label = m.label;
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(GOLD);
    const lw = doc.widthOfString(label) + 10;
    let lx = x - lw / 2;
    lx = Math.max(plot.x, Math.min(plot.x + plot.w - lw, lx));
    const ly = tailY - 16;
    doc.roundedRect(lx, ly, lw, 13, 3).fill('#1F2A44');
    doc.fillColor(GOLD).text(label, lx + 5, ly + 3, { lineBreak: false, characterSpacing: 0.6 });
    // Date under the panel header for the first marker only, to avoid clutter.
    if (idx === 0) {
      const dt = new Date(t).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
      doc.font('Helvetica').fontSize(7.5).fillColor('#9CA3AF').text(
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
