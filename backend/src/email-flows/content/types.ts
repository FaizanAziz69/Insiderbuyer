/** One email in a flow, transcribed VERBATIM from the approved copy doc
 *  ("Insider Buying/Trump Insider Project"). Placeholders:
 *    {{FIRSTNAME}} — recipient first name (falls back to "friend")
 *    {{URL}}       — the sales / subscribe page (all sales-flow CTAs)
 *    {{SITE}}      — site root
 *  Body entries starting with "<" are used as raw blocks (quotes, lists);
 *  everything else is wrapped in a <p>. */
export interface FlowEmail {
  /** Stable id, e.g. "w1", "u3", "a2", "p6b" — used for send-dedupe. */
  id: string;
  /** Minutes after the flow's start time this email becomes due. */
  offsetMinutes: number;
  /** Subject-line variants (rotated per recipient) + optional preview text. */
  subjects: Array<{ subject: string; preview?: string }>;
  /** Masthead: welcome/urgency/abandoned use INSIDER BUYING; post-purchase INSIDER ALERTS. */
  brand: 'INSIDER BUYING' | 'INSIDER ALERTS';
  /** Body blocks, in order. */
  body: string[];
  /** Signature block title line. */
  signoffTitle: string;
}

export const SIGNOFF_BUYING = 'CEO and Publisher, Insider Buying';
export const SIGNOFF_ALERTS = 'CEO and Publisher, Insider Alerts';

/** Red CTA link — every sales-flow CTA points at the subscribe page. */
export const cta = (text: string): string =>
  `<a href="{{URL}}" style="color:#e02b2b;font-weight:600;text-decoration:underline;">${text}</a>`;

/** Indented italic pull-quote (the doc's quoted thoughts / Buffett lines). */
export const quote = (html: string): string =>
  `<blockquote style="margin:16px 0 16px 24px;font-style:italic;color:#333;">${html}</blockquote>`;

/** Press callout — stands in for the doc's screenshot embeds (Forbes,
 *  Fortune, Investopedia headlines) which can't ship as images. */
export const press = (source: string, headline: string): string =>
  `<div style="border:1px solid #e2e2e2;border-radius:8px;padding:14px 18px;margin:16px 0;background:#fafafa;">` +
  `<div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#666;margin-bottom:6px;">${source}</div>` +
  `<div style="font-size:17px;font-weight:700;color:#111;line-height:1.35;">${headline}</div></div>`;
