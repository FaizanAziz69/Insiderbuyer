/**
 * Render-time guard for the Insider Score paygate: older generated articles
 * state the numeric score in prose ("an Insider Score of 70.00") while the
 * product paygates that exact number — a leak the client flagged. New
 * generations only receive a qualitative band, but everything already stored
 * still carries numbers, so the article HTML is scrubbed here as it renders.
 * Grammar-ordered: the article-plus-phrase forms first, bare forms after.
 */
const SCORE_NUM = String.raw`\d+(?:\.\d+)?(?:\s*\/\s*100)?`;

const RULES: [RegExp, string][] = [
  // "an Insider Score of 70.00" / "a IQ Score of 70/100"
  [new RegExp(String.raw`\ban?\s+(Insider|IQ)\s+Score\s+of\s+${SCORE_NUM}`, "gi"), "a premium $1 Score"],
  // "Insider Score of 70.00"
  [new RegExp(String.raw`\b(Insider|IQ)\s+Score\s+of\s+${SCORE_NUM}`, "gi"), "premium $1 Score"],
  // "Insider Score: 70.00" / "Insider Score is 70" / "Insider Score 70.00"
  [new RegExp(String.raw`\b(Insider|IQ)\s+Score(?:\s*:\s*|\s+is\s+|\s+at\s+|\s+)${SCORE_NUM}`, "gi"), "$1 Score (premium)"],
];

export function sanitizeArticleHtml(html: string): string {
  let out = html || "";
  for (const [re, sub] of RULES) out = out.replace(re, sub);
  return out;
}
