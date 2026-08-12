/**
 * Render-time Insider Score paygate for ARTICLE PROSE.
 *
 * The numeric score is premium data on every other product surface (stock
 * lists gate the column behind a Pro pill; `PremiumValue`/`ScoreGate` gate it
 * on cards), but generated article bodies state it in plain text — "a 73.60
 * Insider Score", "scores 96.39", "Insider Score to a perfect 100.00", even an
 * "Insider Score | 100.00" row inside a data table and a "…With 90+ Score"
 * section heading. The generator no longer receives the raw number (it is
 * handed a qualitative BAND instead), but every article already stored still
 * carries those numbers, so stored HTML is masked here as it renders.
 *
 * What is premium and what is not, per the scoring engine's own policy: the
 * NUMBER is paygated, the qualitative BAND is not — the generator is explicitly
 * instructed to describe the score as "a Very Strong Insider Score". So this
 * masks values, and rewrites value-revealing superlatives ("perfect" = the top
 * of the scale) down to a band word rather than deleting the sentence.
 *
 * Deliberately preserved, because neither reveals a given company's score:
 *   • model documentation — "CEO purchases carry the highest weight (100/100)
 *     in our Insider Score model";
 *   • generic thresholds — "an Insider Score above 70 has historically been
 *     associated with…".
 *
 * Subscribers are exempt: pass `{ unlocked: true }` and the prose renders
 * verbatim, so paying readers still SEE the score. This is a gate, not a
 * deletion.
 *
 * LIMIT worth knowing: this is a render-time net over free-form generated
 * prose, not a guarantee at the source. Articles whose stored text states the
 * score in some phrasing not represented below would still slip through — the
 * durable fix is regenerating stored bodies with the current (band-only)
 * prompt.
 */

/** The site-standard paygate pill — the same `Pro` idiom and premium colour
 *  token as a gated stock-list column. A span, not a link: prose already
 *  contains anchors and nesting one inside another is invalid HTML. */
const PILL =
  '<span class="badge badge-premium" title="The Insider Score is a premium feature — subscribe to view the number">Pro</span>';

/** Band word standing in for a superlative that would give the value away. */
const BAND = "top-tier";

/** Re-case `word` to match `sample`, so a swap inside a title-case section
 *  heading ("Draws Near-Perfect Score") does not come out lowercase. */
function matchCase(sample: string, word: string): string {
  if (!/^[A-Z]/.test(sample)) return word;
  return word.replace(/(^|-)([a-z])/g, (_m, sep: string, c: string) => sep + c.toUpperCase());
}

/** A stated score value: `70`, `73.60`, `70/100`, `90+`. */
const NUM = String.raw`\d{1,3}(?:\.\d+)?(?:\s*\/\s*100|\s*\+)?`;

/** Phrase rules run first — they keep the sentence grammatical (and its
 *  plurality intact) where a blunt value swap would read badly. */
type Replacement = string | ((substring: string, ...args: string[]) => string);

const PHRASE_RULES: Array<[RegExp, Replacement]> = [
  // "pushed its Insider Score to a perfect 100.00" / "…to a perfect 100—"
  [
    new RegExp(String.raw`\s+(?:to|at)\s+a\s+(?:near-)?perfect\s+${NUM}`, "gi"),
    ` to a ${BAND} level`,
  ],
  // "reflected in a perfect 100.00 Insider Score"
  [
    new RegExp(String.raw`\b((?:near-)?perfect)\s+${NUM}\s+(Insider|IQ)\s+Score(s?)\b`, "gi"),
    (_m, sup: string, brand: string, plural: string) =>
      `${matchCase(sup, BAND)} ${brand} Score${plural}`,
  ],
  // "carries a perfect Insider Score" / "recorded perfect Insider Scores" /
  // "Draws Near-Perfect Score". "Perfect" IS the value — it names the top of
  // the scale — so the superlative drops to a band word.
  [
    new RegExp(String.raw`\b((?:near-)?perfect)\s+((?:Insider|IQ)\s+)?(Scores?)\b`, "gi"),
    (_m, sup: string, brand: string | undefined, score: string) =>
      `${matchCase(sup, BAND)} ${brand ?? ""}${score}`,
  ],
  // Data-table rows: "<td>Insider Score</td><td>100.00</td>". Label and value
  // live in separate cells, so no text-level rule sees them as adjacent.
  [
    new RegExp(
      String.raw`(<t[dh][^>]*>\s*(?:<[^>]+>\s*)*(?:Insider|IQ)\s+Scores?\s*(?:<\/[^>]+>\s*)*<\/t[dh]>\s*<t[dh][^>]*>\s*)${NUM}(\s*<\/t[dh]>)`,
      "gi",
    ),
    `$1${PILL}$2`,
  ],
];

/** Threshold/comparative wording — "above 70", "70 or higher". A number on
 *  either side of one of these is a statement about the MODEL, not a
 *  disclosure of one company's score, so it stays. */
// NB: bare "at" is absent on purpose — "…Rounds Out Top Five at 73.60" is a
// disclosure, not a threshold. Only "at least" qualifies.
const COMPARATIVE_BEFORE =
  /(?:above|below|over|under|exceed\w*|greater than|higher than|lower than|less than|at least|north of|south of|beyond)\s+$/i;
const COMPARATIVE_AFTER = /^\s*(?:\+|or (?:above|higher|better|more|greater|below|lower))/i;

/** Contexts where a 0–100 number is something other than a score. */
// The trailing `[(\[]?` matters for model documentation, which parenthesises
// the weight: "carry the highest weight (100/100) in our Insider Score model".
const NOT_A_SCORE_BEFORE =
  /(?:\$|€|£|top|rank(?:ed|s)?|number|no\.|#|q|fy|weight(?:ed|ing)?|per share|52-week|chapter|section|form|figure|table)\s*[([]?\s*$/i;
const NOT_A_SCORE_AFTER =
  /^\s*(?:%|x|×|shares?|buyers?|insiders?|days?|weeks?|months?|years?|filings?|transactions?|trades?|am|pm|bps|k\b|m\b|bn\b|billion|million|thousand)/i;
const MONTH_BEFORE =
  /(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+$/i;

/** The value sits directly in front of the metric it belongs to — "a 73.60
 *  Insider Score", "96.39 score". This outranks the noun guards above, which
 *  otherwise read the following "Insider" as a buyer count. */
const SCORED_AFTER = /^\s*(?:(?:Insider|IQ)\s+)?Scores?\b/i;

const TAG = /<[^>]*>/g;

/** Text-only view of a slice of HTML, for judging context across tag
 *  boundaries (a value can sit in its own `<strong>` or `<td>`). */
function textAround(html: string, from: number, to: number): string {
  return html.slice(Math.max(0, from), to).replace(TAG, " ");
}

/**
 * Mask every stated score value that sits in a scoring context.
 *
 * Two tiers, because the false-positive risk differs sharply:
 *   • decimals (`96.39`, `73.60`) — masked anywhere a score is being discussed;
 *     in this prose a 0–100 decimal is a score, and prices/percentages are
 *     excluded by the guards above;
 *   • bare integers (`100`, `90+`) — masked only when they sit right next to
 *     the word "score", so counts, ranks and dates elsewhere in the same
 *     sentence are untouched.
 */
function maskScoreValues(html: string): string {
  const re = new RegExp(String.raw`\d{1,3}(?:\.\d+)?(?:\s*\/\s*100|\s*\+)?`, "g");
  let out = "";
  let last = 0;
  for (const m of html.matchAll(re)) {
    const i = m.index ?? 0;
    const raw = m[0];
    const before = html.slice(Math.max(0, i - 30), i);
    const after = html.slice(i + raw.length, i + raw.length + 30);

    // Part of a larger number (thousands separators, decimals we already
    // consumed, "618,333") — never a score.
    if (/[\d.,]$/.test(before) || /^[\d]/.test(after) || /^,\d/.test(after)) continue;

    const value = parseFloat(raw);
    if (!Number.isFinite(value) || value > 100) continue;

    // Guards that always win: a dollar figure, a date, or a threshold
    // statement about the model is never this company's score.
    if (
      NOT_A_SCORE_BEFORE.test(before) ||
      MONTH_BEFORE.test(before) ||
      COMPARATIVE_BEFORE.test(before) ||
      COMPARATIVE_AFTER.test(after)
    ) {
      continue;
    }
    // The noun guards ("3 insiders", "90 days") only apply when the value is
    // NOT already attached to the metric.
    const scoredDirectly = SCORED_AFTER.test(after);
    if (!scoredDirectly && NOT_A_SCORE_AFTER.test(after)) continue;
    if (scoredDirectly) {
      out += html.slice(last, i) + PILL;
      last = i + raw.length;
      continue;
    }

    const hasDecimal = raw.includes(".");
    // Decimal: a score anywhere in the surrounding passage is enough.
    // Integer: the word "score" must be immediately alongside.
    const window = hasDecimal
      ? textAround(html, i - 200, i + raw.length + 200)
      : textAround(html, i - 45, i + raw.length + 45);
    if (!/scores?\b/i.test(window)) continue;

    out += html.slice(last, i) + PILL;
    last = i + raw.length;
  }
  return out + html.slice(last);
}

/**
 * Mask every stated Insider Score value in stored article HTML.
 *
 * @param html  the stored article body
 * @param opts  `unlocked: true` for entitled readers — returns the prose
 *              verbatim so subscribers still see the real number.
 */
export function sanitizeArticleHtml(
  html: string,
  opts: { unlocked?: boolean } = {},
): string {
  if (opts.unlocked) return html || "";
  let out = html || "";
  for (const [re, sub] of PHRASE_RULES) {
    out = typeof sub === "string" ? out.replace(re, sub) : out.replace(re, sub);
  }
  return maskScoreValues(out);
}

/* ────────────────────────── headlines & summaries ──────────────────────────
 * Titles and summaries leak too — "Perfect Insider Scores Lead Today's
 * Briefing", "Two stocks hit 100.00 Insider Score as energy…" — and they render
 * as TEXT on every card, in the <h1>, and in the SEO/social metadata, so the
 * HTML pill cannot be used there.
 *
 * A stated number is replaced with its own BAND instead. That is not an
 * invented claim: the band boundaries below are the scoring engine's published
 * ones (`iqsBand` in backend/src/content/content-generator.service.ts), bands
 * are the qualitative form the generator is already told to use in prose, and
 * the band is derived from the very number being hidden. Grammar survives
 * ("hit 100.00 Insider Score" → "hit a top-tier Insider Score") where deleting
 * the value outright would not.
 */

/** Mirrors the engine's own band boundaries — keep the two in step. */
function bandFor(value: number): string {
  if (value >= 80) return "top-tier";
  if (value >= 70) return "very strong";
  if (value >= 60) return "strong";
  if (value >= 45) return "moderate";
  return "emerging";
}

const TEXT_RULES: Array<[RegExp, Replacement]> = [
  // "pushing the Insider Score to a perfect 100"
  [
    new RegExp(String.raw`\s+(?:to|at)\s+a\s+(?:near-)?perfect\s+${NUM}`, "gi"),
    ` to a ${BAND} level`,
  ],
  // "perfect or near-perfect conviction scores" — the compound has to go as a
  // unit, and the noun between it and "scores" ("conviction") is allowed for.
  [
    new RegExp(
      String.raw`\b((?:near-)?perfect)(?:\s+or\s+(?:near-)?perfect)?(\s+[a-z]+)?\s+(Scores?)\b`,
      "gi",
    ),
    (_m, sup: string, noun: string | undefined, score: string) =>
      `${matchCase(sup, BAND)}${noun ?? ""} ${score}`,
  ],
  // "Perfect Insider Scores Lead Today's Briefing"
  [
    new RegExp(String.raw`\b((?:near-)?perfect)\s+((?:Insider|IQ)\s+)?(Scores?)\b`, "gi"),
    (_m, sup: string, brand: string | undefined, score: string) =>
      `${matchCase(sup, BAND)} ${brand ?? ""}${score}`,
  ],
  // "hit 100.00 Insider Score" → "hit a top-tier Insider Score"
  [
    new RegExp(String.raw`\b(${NUM})\s+((?:Insider|IQ)\s+)?(Scores?)\b`, "gi"),
    (_m, num: string, brand: string | undefined, score: string) =>
      `a ${bandFor(parseFloat(num))} ${brand ?? ""}${score}`,
  ],
  // "Insider Score of 73.60" / "Insider Score: 88" / "Insider Score is 88".
  // "of"/"at" need recasting to a band phrase — "a Score of very strong" does
  // not read — while the colon and "is" forms take the band word directly.
  [
    new RegExp(
      String.raw`\b((?:Insider|IQ)\s+Scores?)(\s+of\s+|\s+at\s+|\s*:\s*|\s+is\s+)(${NUM})`,
      "gi",
    ),
    (_m, phrase: string, joiner: string, num: string) => {
      const band = bandFor(parseFloat(num));
      return /^\s+(?:of|at)\s+$/i.test(joiner)
        ? `${phrase} in the ${band} band`
        : `${phrase}${joiner}${band}`;
    },
  ],
];

/**
 * Mask stated Insider Score values in a plain-text headline or summary.
 *
 * @param text  a title, summary or meta description
 * @param opts  `unlocked: true` returns the text verbatim for subscribers. SEO
 *              metadata is rendered server-side for everyone, so it always
 *              passes through masked.
 */
export function maskScoreText(
  text: string | null | undefined,
  opts: { unlocked?: boolean } = {},
): string {
  const input = text ?? "";
  if (opts.unlocked || !input) return input;
  let out = input;
  for (const [re, sub] of TEXT_RULES) {
    out = typeof sub === "string" ? out.replace(re, sub) : out.replace(re, sub);
  }
  return out;
}

/**
 * Mask the title and summary of a whole list of article cards in one pass.
 *
 * Card grids render `item.title` / `item.summary` in several places each (big
 * card, small card, alt text), so masking the list once where it is derived is
 * both shorter and safer than patching every JSX site — a missed site is a
 * leak. `slug` is untouched, so cover-image and label maps keyed on it still
 * line up.
 */
export function maskScoreInList<T extends { title: string; summary?: string }>(
  items: T[],
  opts: { unlocked?: boolean } = {},
): T[] {
  if (opts.unlocked) return items;
  return items.map((item) => ({
    ...item,
    title: maskScoreText(item.title),
    ...(item.summary === undefined ? {} : { summary: maskScoreText(item.summary) }),
  }));
}
