import PDFDocument from 'pdfkit';
import type { TopPick } from './top-picks.service';

const NAVY = '#0D1F35';
const GOLD = '#C8A24A';
const INK = '#111827';
const MUTED = '#6B7280';

/** Render the $3 downsell report as a PDF buffer. pdfkit's built-in
 *  Helvetica is used throughout so the deploy needs no font assets. */
export function renderTopPicksPdf(picks: TopPick[]): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'LETTER', margin: 48 });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const today = new Date().toISOString().slice(0, 10);
    const left = doc.page.margins.left;
    const width = doc.page.width - left - doc.page.margins.right;

    // ── cover band ──────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 132).fill(NAVY);
    doc
      .fillColor('#FFFFFF')
      .font('Helvetica-Bold')
      .fontSize(22)
      .text('INSIDERBUYING.COM', left, 38, { characterSpacing: 1.2 });
    doc
      .fillColor(GOLD)
      .font('Helvetica')
      .fontSize(11)
      .text('Insider Quality Score research — one-time report', left, 68);
    doc.fillColor('#9CA3AF').fontSize(9).text(`Generated ${today}`, left, 92);

    doc.fillColor(INK).font('Helvetica-Bold').fontSize(19);
    doc.text('Stocks You Can Buy Cheaper Than the Insiders Did', left, 164, { width });
    doc.moveDown(0.5);
    doc
      .font('Helvetica')
      .fontSize(11)
      .fillColor(MUTED)
      .text(
        `${picks.length} stocks where today's market price sits below the average price ` +
          'corporate insiders actually paid on the open market over the last 180 days. ' +
          'Every figure is drawn from public SEC Form 4 filings and ranked by our Insider ' +
          'Quality Score (IQS).',
        { width, lineGap: 2 },
      );

    // ── table ───────────────────────────────────────────────────────────
    const cols = [
      { key: 'ticker', label: 'STOCK', w: 118, align: 'left' as const },
      { key: 'price', label: 'PRICE NOW', w: 74, align: 'right' as const },
      { key: 'paid', label: 'INSIDERS PAID', w: 88, align: 'right' as const },
      { key: 'disc', label: 'DISCOUNT', w: 72, align: 'right' as const },
      { key: 'iqs', label: 'IQS', w: 40, align: 'right' as const },
      { key: 'buyers', label: 'BUYERS', w: 52, align: 'right' as const },
      { key: 'value', label: 'BOUGHT', w: 62, align: 'right' as const },
    ];

    let y = doc.y + 22;
    const drawHead = () => {
      doc.rect(left, y - 6, width, 22).fill(NAVY);
      let x = left + 6;
      doc.font('Helvetica-Bold').fontSize(8).fillColor('#FFFFFF');
      for (const c of cols) {
        doc.text(c.label, x, y, { width: c.w - 8, align: c.align });
        x += c.w;
      }
      y += 24;
    };
    drawHead();

    picks.forEach((p, i) => {
      if (y > doc.page.height - 130) {
        doc.addPage();
        y = doc.page.margins.top;
        drawHead();
      }
      if (i % 2 === 1) doc.rect(left, y - 5, width, 30).fill('#F3F4F6');
      let x = left + 6;
      const cell = (text: string, c: (typeof cols)[number], bold = false, color = INK) => {
        doc
          .font(bold ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(9.5)
          .fillColor(color)
          .text(text, x, y, { width: c.w - 8, align: c.align });
        x += c.w;
      };
      cell(p.ticker, cols[0], true);
      cell(`$${p.price.toFixed(2)}`, cols[1]);
      cell(`$${p.insiderAvgPrice.toFixed(2)}`, cols[2]);
      cell(`${p.discountPct.toFixed(1)}%`, cols[3], true, '#0A7D33');
      cell(String(p.iqs), cols[4], true);
      cell(String(p.buyers), cols[5]);
      cell(compactMoney(p.totalValue), cols[6]);
      // Second line: company + the anchor buy.
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `${p.name}${p.topInsider ? ` — largest buy: ${p.topInsider}` : ''}` +
            `${p.topRole ? ` (${p.topRole})` : ''}` +
            `${p.topValue ? `, ${compactMoney(p.topValue)}` : ''}` +
            ` · ${p.filings} filing${p.filings === 1 ? '' : 's'} to ${p.lastBuy}`,
          left + 6,
          y + 12,
          { width: width - 12 },
        );
      y += 32;
    });

    // ── how to read it ─────────────────────────────────────────────────
    if (y > doc.page.height - 240) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    y += 14;
    doc.font('Helvetica-Bold').fontSize(13).fillColor(INK).text('Why this setup matters', left, y);
    y = doc.y + 6;
    doc
      .font('Helvetica')
      .fontSize(10.5)
      .fillColor(MUTED)
      .text(
        'An insider buying on the open market has one reason to do it: they expect the ' +
          'shares to be worth more. When the market later prices the same stock BELOW what ' +
          'they paid, you are entering at a discount to the best-informed buyer on the ' +
          'register. It is not a guarantee — insiders are early, and sometimes wrong — but ' +
          'it is one of the few setups where your cost basis is provably better than theirs.',
        left,
        y,
        { width, lineGap: 2 },
      );
    y = doc.y + 14;
    doc.font('Helvetica-Bold').fontSize(11).fillColor(INK).text('How each column is built', left, y);
    y = doc.y + 4;
    doc
      .font('Helvetica')
      .fontSize(9.5)
      .fillColor(MUTED)
      .text(
        'PRICE NOW — the latest close on our record. INSIDERS PAID — share-weighted average ' +
          'price across every code-P open-market purchase in the last 180 days. DISCOUNT — how ' +
          'far below that average the stock now trades. IQS — our 0–99 Insider Quality Score, ' +
          'which weighs the buyer’s role, size against market cap, clustering and track record. ' +
          'BUYERS — distinct insiders. BOUGHT — total dollars they committed.',
        left,
        y,
        { width, lineGap: 2 },
      );

    // ── footer on every page ──────────────────────────────────────────
    const range = doc.bufferedPageRange();
    for (let i = range.start; i < range.start + range.count; i++) {
      doc.switchToPage(i);
      doc
        .font('Helvetica')
        .fontSize(8)
        .fillColor('#9CA3AF')
        .text(
          'Not investment advice. Compiled from public SEC Form 4 filings. Figures as of ' +
            `${today}. insiderbuying.com`,
          left,
          doc.page.height - 40,
          { width, align: 'center' },
        );
    }

    doc.end();
  });
}

function compactMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '—';
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`;
  return `$${Math.round(n)}`;
}
