/**
 * The standard "Insider Quality Score" report — the document a lead receives
 * after opting in on the landing page.
 *
 * Rendered as self-contained, email-safe HTML: table layout, inline styles,
 * no external assets, so the exact same string can be previewed in a browser
 * today and dropped into an email body once a provider (Resend/SES/Twilio)
 * is configured.
 */

export interface InsiderReportData {
  ticker: string;
  companyName: string;
  sector: string | null;
  price: number | null;
  marketCap: number | null;
  /** 0–99 composite Insider Quality Score; null when we have no data. */
  score: number | null;
  pillars: Array<{ label: string; value: number | null; effectiveWeight: number }>;
  /** AI "What Are Insiders Doing?" summary, when available. */
  activity: { summary: string; bullets: string[] } | null;
  analyst: {
    recommendation: string | null;
    targetMean: number | null;
    upsidePct: number | null;
    numAnalysts: number | null;
  } | null;
  /** Trailing-90-day Form 4 aggregates. */
  stats90d: {
    buys: number;
    sells: number;
    buyValue: number;
    sellValue: number;
    distinctBuyers: number;
  };
  transactions: Array<{
    date: string;
    insider: string;
    role: string | null;
    code: string;
    shares: number;
    price: number;
    value: number;
  }>;
  generatedAt: string;
}

const INK = '#0E1F35';
const SOFT = '#5B6B7E';
const RULE = '#DEE4EC';
const BUY = '#3E9B5F';
const BUY_SOFT = '#E9F6EE';
const SELL = '#C0503C';
const SELL_SOFT = '#F8ECE8';

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function money(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs >= 1e12) return `$${(n / 1e12).toFixed(2)}T`;
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
}

function verdictFor(score: number | null): { label: string; color: string } {
  if (score == null) return { label: 'INSUFFICIENT DATA', color: SOFT };
  if (score >= 80) return { label: 'STRONG INSIDER CONVICTION', color: BUY };
  if (score >= 65) return { label: 'POSITIVE INSIDER SIGNAL', color: BUY };
  if (score >= 45) return { label: 'MIXED INSIDER SIGNAL', color: '#B58A2E' };
  return { label: 'WEAK INSIDER SIGNAL', color: SELL };
}

const CODE_LABELS: Record<string, string> = {
  P: 'Purchase',
  S: 'Sale',
  A: 'Award',
  M: 'Option exercise',
  X: 'Option exercise',
  F: 'Tax withholding',
  G: 'Gift',
  C: 'Conversion',
  J: 'Other',
};

export function renderInsiderReportHtml(d: InsiderReportData): string {
  const verdict = verdictFor(d.score);
  const scoreTxt = d.score == null ? '—' : d.score.toFixed(1);

  const pillarRows = d.pillars
    .map((p) => {
      const val = p.value == null ? null : Math.max(0, Math.min(100, p.value));
      const bar =
        val == null
          ? `<span style="color:${SOFT};font-size:12px">no data</span>`
          : `<table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
               <td style="background:#EDF1F6;border-radius:6px;height:10px">
                 <div style="width:${val}%;max-width:100%;background:${val >= 65 ? BUY : val >= 45 ? '#B58A2E' : SELL};height:10px;border-radius:6px"></div>
               </td></tr></table>`;
      return `<tr>
        <td style="padding:8px 0;font-size:13px;color:${INK};width:170px">${esc(p.label)}</td>
        <td style="padding:8px 12px;width:auto">${bar}</td>
        <td style="padding:8px 0;font-size:13px;font-weight:700;color:${INK};width:44px;text-align:right">${val == null ? '—' : Math.round(val)}</td>
      </tr>`;
    })
    .join('');

  const bullets = (d.activity?.bullets || [])
    .map(
      (b) =>
        `<li style="margin:0 0 10px;font-size:14px;line-height:1.55;color:${INK}">${esc(b)}</li>`,
    )
    .join('');

  const txRows = d.transactions
    .slice(0, 12)
    .map((t) => {
      const isBuy = t.code === 'P';
      const isSell = t.code === 'S';
      const chipBg = isBuy ? BUY_SOFT : isSell ? SELL_SOFT : '#EDF1F6';
      const chipColor = isBuy ? BUY : isSell ? SELL : SOFT;
      return `<tr>
        <td style="padding:9px 12px;font-size:12.5px;color:${SOFT};white-space:nowrap;border-top:1px solid #ECF0F5">${esc(t.date)}</td>
        <td style="padding:9px 12px;font-size:13px;color:${INK};border-top:1px solid #ECF0F5">${esc(t.insider)}${t.role ? `<span style="color:${SOFT}"> · ${esc(t.role)}</span>` : ''}</td>
        <td style="padding:9px 12px;border-top:1px solid #ECF0F5;white-space:nowrap"><span style="background:${chipBg};color:${chipColor};font-size:11.5px;font-weight:700;padding:3px 8px;border-radius:6px">${esc(CODE_LABELS[t.code] || t.code)}</span></td>
        <td style="padding:9px 12px;font-size:13px;color:${INK};text-align:right;white-space:nowrap;border-top:1px solid #ECF0F5">${money(t.value)}</td>
      </tr>`;
    })
    .join('');

  const net = d.stats90d.buyValue - d.stats90d.sellValue;
  const analystLine = d.analyst
    ? `${
        d.analyst.recommendation
          ? esc(d.analyst.recommendation.replace(/_/g, ' ').toUpperCase())
          : '—'
      }${d.analyst.targetMean != null ? ` · avg target ${money(d.analyst.targetMean)}` : ''}${
        d.analyst.upsidePct != null
          ? ` · ${d.analyst.upsidePct >= 0 ? '+' : ''}${d.analyst.upsidePct.toFixed(1)}% implied`
          : ''
      }${d.analyst.numAnalysts ? ` · ${d.analyst.numAnalysts} analysts` : ''}`
    : 'No analyst coverage in our feed.';

  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Insider Quality Score — ${esc(d.ticker)}</title></head>
<body style="margin:0;padding:0;background:#F5F7FA;font-family:Arial,Helvetica,sans-serif;color:${INK}">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#F5F7FA;padding:24px 0">
<tr><td align="center">
<table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;width:100%">

  <!-- header -->
  <tr><td style="padding:0 16px 14px">
    <table role="presentation" width="100%"><tr>
      <td style="font-size:17px;font-weight:900;letter-spacing:.06em;text-transform:uppercase;color:${INK}">Insider&nbsp;Buying</td>
      <td align="right" style="font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:${SOFT}">Insider report · ${esc(d.generatedAt)}</td>
    </tr></table>
  </td></tr>

  <!-- score card -->
  <tr><td style="padding:0 16px">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid ${RULE};border-top:4px solid ${verdict.color};border-radius:12px">
      <tr><td style="padding:26px 28px 8px">
        <table role="presentation" width="100%"><tr>
          <td>
            <div style="font-size:26px;font-weight:800;letter-spacing:-.01em">${esc(d.ticker)}</div>
            <div style="font-size:14px;color:${SOFT};margin-top:2px">${esc(d.companyName)}${d.sector ? ` · ${esc(d.sector)}` : ''}</div>
            <div style="font-size:13px;color:${SOFT};margin-top:6px">Price ${money(d.price)} · Market cap ${money(d.marketCap)}</div>
          </td>
          <td align="right" valign="top">
            <div style="font-size:44px;font-weight:800;line-height:1;color:${verdict.color}">${scoreTxt}</div>
            <div style="font-size:10.5px;letter-spacing:.08em;text-transform:uppercase;color:${SOFT};margin-top:4px">Insider Quality Score / 99</div>
          </td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:4px 28px 6px">
        <span style="display:inline-block;font-size:11.5px;font-weight:700;letter-spacing:.08em;color:${verdict.color};border:2px solid ${verdict.color};border-radius:8px;padding:5px 10px">${verdict.label}</span>
      </td></tr>
      <tr><td style="padding:12px 28px 24px">
        <table role="presentation" width="100%">${pillarRows}</table>
      </td></tr>
    </table>
  </td></tr>

  <!-- what are insiders doing -->
  ${
    d.activity
      ? `<tr><td style="padding:16px 16px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid ${RULE};border-radius:12px">
      <tr><td style="padding:22px 28px 6px;font-size:16px;font-weight:800">What Are Insiders Doing?</td></tr>
      <tr><td style="padding:0 28px 8px;font-size:14px;line-height:1.55;color:${SOFT}">${esc(d.activity.summary)}</td></tr>
      <tr><td style="padding:6px 28px 20px"><ul style="margin:0;padding-left:20px">${bullets}</ul></td></tr>
    </table>
  </td></tr>`
      : ''
  }

  <!-- 90 day stats -->
  <tr><td style="padding:16px 16px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid ${RULE};border-radius:12px">
      <tr><td style="padding:22px 28px 12px;font-size:16px;font-weight:800">Last 90 days of insider filings</td></tr>
      <tr><td style="padding:0 28px 22px">
        <table role="presentation" width="100%"><tr>
          <td style="font-size:12px;color:${SOFT}">Open-market buys<br><span style="font-size:19px;font-weight:800;color:${BUY}">${d.stats90d.buys}</span> <span style="font-size:13px;color:${INK}">(${money(d.stats90d.buyValue)})</span></td>
          <td style="font-size:12px;color:${SOFT}">Open-market sells<br><span style="font-size:19px;font-weight:800;color:${SELL}">${d.stats90d.sells}</span> <span style="font-size:13px;color:${INK}">(${money(d.stats90d.sellValue)})</span></td>
          <td style="font-size:12px;color:${SOFT}">Net flow<br><span style="font-size:19px;font-weight:800;color:${net >= 0 ? BUY : SELL}">${net >= 0 ? '+' : '−'}${money(Math.abs(net)).replace('$', '$')}</span></td>
          <td style="font-size:12px;color:${SOFT}">Distinct buyers<br><span style="font-size:19px;font-weight:800;color:${INK}">${d.stats90d.distinctBuyers}</span></td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>

  <!-- transactions -->
  ${
    d.transactions.length
      ? `<tr><td style="padding:16px 16px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid ${RULE};border-radius:12px;overflow:hidden">
      <tr><td style="padding:22px 28px 10px;font-size:16px;font-weight:800">Most recent insider transactions</td></tr>
      <tr><td style="padding:0 16px 20px">
        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td style="padding:6px 12px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:${SOFT}">Date</td>
            <td style="padding:6px 12px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:${SOFT}">Insider</td>
            <td style="padding:6px 12px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:${SOFT}">Type</td>
            <td style="padding:6px 12px;font-size:10.5px;letter-spacing:.07em;text-transform:uppercase;color:${SOFT};text-align:right">Value</td>
          </tr>
          ${txRows}
        </table>
      </td></tr>
    </table>
  </td></tr>`
      : ''
  }

  <!-- analyst view -->
  <tr><td style="padding:16px 16px 0">
    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background:#ffffff;border:1px solid ${RULE};border-radius:12px">
      <tr><td style="padding:20px 28px 4px;font-size:16px;font-weight:800">Wall Street check</td></tr>
      <tr><td style="padding:0 28px 20px;font-size:14px;color:${INK}">${analystLine}</td></tr>
    </table>
  </td></tr>

  <!-- footer -->
  <tr><td style="padding:20px 24px 8px;font-size:11.5px;line-height:1.6;color:${SOFT}">
    Built from SEC EDGAR Form 4 filings. For informational purposes only — not investment advice.
    Past performance does not guarantee future results. You received this report because you requested
    it for ${esc(d.ticker)}; you can unsubscribe from future insider alerts at any time.
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}
