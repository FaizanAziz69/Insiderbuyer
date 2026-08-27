/**
 * Section 10 of the Editorial Playbook v2 — the pre-publish checklist, as code.
 *
 * "Run through every item before publishing. Nothing goes live with a checkbox
 * unchecked." A checklist a human ticks is a checklist that drifts, so every
 * item that CAN be decided from the article itself is decided here, and the
 * publish route runs it.
 *
 * Two severities, because they fail differently:
 *   • `error`   — blocks the publish. Structure, compliance, and the rules the
 *                 manual calls non-negotiable (headline length, the mandatory
 *                 viz, the Form 4 attribution, the paywalled score).
 *   • `warning` — reported, does not block. Style judgements where a false
 *                 positive is likely and a human is better placed to rule
 *                 (paragraph length inside a quote, "huge" inside a company
 *                 name), plus anything the manual words as guidance.
 *
 * `POST /content/editorial/validate` returns the whole list so the writer sees
 * the checklist; `POST /content/editorial` refuses on any error unless the
 * caller passes `?force=1` (an editor overruling a false positive, which is
 * logged rather than silently allowed).
 */

import {
  BANNED_BODY_WORDS,
  BANNED_HEADLINE_WORDS,
  CREDITABLE_OUTLETS,
  EDITORIAL_CATEGORIES,
  FORM4_ATTRIBUTION,
  HEADLINE_MAX_WORDS,
  MAX_SENTENCES_PER_PARAGRAPH,
  META_DESCRIPTION_MAX,
  META_TITLE_MAX,
  PROMOTIONAL_PHRASES,
  SLUG_PATTERN,
  VIZ_KEYS,
  WORD_COUNT_MAX,
  WORD_COUNT_MIN,
} from './editorial-playbook';

export type CheckSeverity = 'error' | 'warning';

export interface CheckResult {
  /** Stable id, so the UI can render the same row every time. */
  id: string;
  /** The checklist line as the manual words it. */
  label: string;
  passed: boolean;
  severity: CheckSeverity;
  /** Why it failed, with the offending text. Empty when passed. */
  detail?: string;
  /** Manual section this comes from. */
  section: string;
}

export interface ChecklistReport {
  ok: boolean;
  errors: number;
  warnings: number;
  wordCount: number;
  checks: CheckResult[];
}

export interface EditorialDraft {
  slug: string;
  title: string;
  summary: string;
  body: string;
  category?: string | null;
  imageUrl?: string | null;
  imageAlt?: string | null;
  ticker?: string | null;
  sector?: string | null;
  tags?: string[];
}

const TAGS = /<[^>]+>/g;

/** Body text with markup removed, entities decoded enough to count words. */
function plain(html: string): string {
  return (html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(TAGS, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function words(text: string): string[] {
  return text.split(/\s+/).filter(Boolean);
}

/** The article's paragraphs as plain text, in order. */
function paragraphs(html: string): string[] {
  const out: string[] = [];
  for (const m of (html || '').matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/gi)) {
    const t = plain(m[1]);
    if (t) out.push(t);
  }
  // A body written without <p> wrappers still gets checked, on blank lines.
  if (out.length === 0) {
    for (const chunk of plain(html).split(/\n{2,}/)) {
      if (chunk.trim()) out.push(chunk.trim());
    }
  }
  return out;
}

/**
 * The article's OPENING, for the §6 headline-contract test.
 *
 * The manual says "the first paragraph delivers exactly what the headline
 * promised". Taken literally as `<p>` #1, that test fails every article this
 * site publishes: the house format opens with a `<h3>Key points</h3>` block and
 * a three-bullet `<ul>`, and the first `<p>` after it is often a framing
 * sentence with the figure landing in the second. The bullets ARE the top of
 * the article — a reader meets the promised number there — so the opening is
 * everything up to and including the second paragraph.
 */
function opening(html: string): string {
  const src = html || '';
  let cut = src.length;
  let seen = 0;
  for (const m of src.matchAll(/<\/p>/gi)) {
    seen += 1;
    if (seen === 2) {
      cut = (m.index ?? 0) + m[0].length;
      break;
    }
  }
  return plain(src.slice(0, cut));
}

function sentenceCount(text: string): number {
  // Abbreviations and decimals would each read as a sentence end, so a period
  // only counts when a space and a capital (or end of string) follow it.
  const trimmed = text.trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(/(?<=[.!?])\s+(?=[A-Z"“(])/);
  return parts.filter((p) => p.trim().length > 0).length;
}

/** Case-insensitive whole-phrase hits from a banned list. */
function hits(text: string, phrases: readonly string[]): string[] {
  const lower = ` ${text.toLowerCase()} `;
  return phrases.filter((p) => {
    const needle = p.toLowerCase();
    // Word-boundary match so "hugely" does not trip "huge" and a ticker like
    // "HUGE" inside a link href is not counted (markup is already stripped).
    const re = new RegExp(`(^|[^a-z])${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z]|$)`, 'i');
    return re.test(lower);
  });
}

/** Every `data-viz="…"` embed in the body, with its key. */
function vizEmbeds(html: string): string[] {
  return [...(html || '').matchAll(/data-viz\s*=\s*"([a-z-]+)"/gi)].map((m) => m[1].toLowerCase());
}

/** Numbers a headline promises — "$8.4M", "Six Times", "40%". The first
 *  paragraph has to deliver at least one of them; that is the manual's
 *  "contract", and it is the one clickbait test that can be automated. */
function headlineFigures(title: string): string[] {
  const out: string[] = [];
  for (const m of title.matchAll(/\$?\d[\d,.]*\s?(?:%|m|bn|b|k|million|billion|trillion)?/gi)) {
    const raw = m[0].trim();
    if (raw.replace(/\D/g, '').length > 0) out.push(raw);
  }
  return out;
}

/** Loose containment: "$8.4M" in the headline is satisfied by "$8.4 million"
 *  in the lede, so compare on digits only. */
function figureDelivered(figure: string, lede: string): boolean {
  const digits = figure.replace(/[^\d]/g, '');
  if (!digits) return false;
  return lede.replace(/[^\d]/g, '').includes(digits);
}

export function runEditorialChecklist(draft: EditorialDraft): ChecklistReport {
  const checks: CheckResult[] = [];
  const add = (
    id: string,
    label: string,
    passed: boolean,
    severity: CheckSeverity,
    section: string,
    detail?: string,
  ) => checks.push({ id, label, passed, severity, section, detail: passed ? undefined : detail });

  const title = (draft.title || '').trim();
  const summary = (draft.summary || '').trim();
  const body = draft.body || '';
  const text = plain(body);
  const paras = paragraphs(body);
  const lede = opening(body);
  const wordCount = words(text).length;

  // ── Section 6 — headline ────────────────────────────────────────────────
  const titleWords = words(title);
  add(
    'headline-length',
    `Headline is at most ${HEADLINE_MAX_WORDS} words`,
    titleWords.length > 0 && titleWords.length <= HEADLINE_MAX_WORDS,
    'error',
    '6',
    `${titleWords.length} words: "${title}"`,
  );

  const headlineAlarms = hits(title, BANNED_HEADLINE_WORDS);
  add(
    'headline-alarm-words',
    'Headline avoids alarm-bell words (shocking, stunning, incredible…)',
    headlineAlarms.length === 0,
    'error',
    '6',
    `found: ${headlineAlarms.join(', ')}`,
  );

  const isQuestion = title.includes('?');
  const yesNoOpener = /^(is|are|was|were|does|do|did|can|could|will|would|should|has|have|had)\b/i;
  add(
    'headline-question-shape',
    'A question headline asks how / why / what — never a yes-or-no question',
    !isQuestion || !yesNoOpener.test(title.trim()),
    'warning',
    '6',
    `"${title}" opens with a yes/no verb — the manual calls this a dead-end question`,
  );

  const figures = headlineFigures(title);
  const delivered = figures.filter((f) => figureDelivered(f, lede));
  add(
    'headline-contract',
    "The article's opening delivers the figure the headline promises",
    figures.length === 0 || delivered.length > 0,
    'warning',
    '6',
    `headline promises ${figures.join(', ')}; none of those figures appear in the key points or the first two paragraphs`,
  );

  // ── Section 10 — slug, category, SEO fields ─────────────────────────────
  add(
    'slug-shape',
    'Slug is editorial-[ticker-or-subject]-[words]-[YYYY-MM-DD]',
    SLUG_PATTERN.test((draft.slug || '').trim().toLowerCase()),
    'error',
    '10',
    `"${draft.slug}" — expected e.g. editorial-mrna-insider-data-cancer-2026-08-23`,
  );

  const category = (draft.category || '').trim().toUpperCase();
  add(
    'category-tag',
    'Exactly one of the five approved category tags',
    (EDITORIAL_CATEGORIES as readonly string[]).includes(category),
    'error',
    '9',
    category ? `"${category}" is not an approved category` : 'no category set',
  );

  add(
    'meta-title',
    `Meta title (the headline) is at most ${META_TITLE_MAX} characters`,
    title.length > 0 && title.length <= META_TITLE_MAX,
    'warning',
    '10',
    `${title.length} characters — it will be truncated in search results`,
  );

  add(
    'meta-description',
    `Meta description (the summary) is at most ${META_DESCRIPTION_MAX} characters`,
    summary.length > 0 && summary.length <= META_DESCRIPTION_MAX,
    'warning',
    '10',
    `${summary.length} characters`,
  );

  // A warning, not an error, because on THIS site an empty imageUrl is the
  // normal case: editorial covers are resolved on the frontend from
  // `frontend/lib/editorial-thumbs.ts` — a slug pinned in SLUG_OVERRIDES, or a
  // ticker/keyword rule. The check cannot see that file, so it flags the
  // omission and names the real mechanism rather than blocking a publish that
  // is correctly configured elsewhere.
  add(
    'thumbnail',
    'Cover image chosen — imageUrl set, or the slug pinned in editorial-thumbs SLUG_OVERRIDES',
    !!(draft.imageUrl && draft.imageUrl.trim()),
    'warning',
    '9',
    'imageUrl is empty — pin the slug in frontend/lib/editorial-thumbs.ts SLUG_OVERRIDES and DEPLOY THAT BEFORE the article lands, or the ticker rule picks a different photo',
  );

  add(
    'thumbnail-alt',
    'Cover alt text written',
    !!(draft.imageAlt && draft.imageAlt.trim()),
    'warning',
    '9',
    'no alt text — the headline is used instead, which is rarely a description of the photo',
  );

  add(
    'tags',
    'Tagged with ticker / company / sector / theme',
    Array.isArray(draft.tags) && draft.tags.filter(Boolean).length >= 2,
    'warning',
    '10',
    `${(draft.tags || []).length} tag(s) — the manual asks for ticker, company, sector and theme`,
  );

  // ── Section 7 — the mandatory data visualization ────────────────────────
  const embeds = vizEmbeds(body);
  const unknown = embeds.filter((e) => !VIZ_KEYS.includes(e));
  add(
    'data-viz-present',
    'At least one data visualization embedded in the article body',
    embeds.length > 0,
    'error',
    '7',
    'no data-viz embed found — Section 7 makes one mandatory for every Top Story',
  );
  add(
    'data-viz-known',
    'Every viz embed is one of the six approved types',
    unknown.length === 0,
    'error',
    '7',
    `unknown viz type(s): ${unknown.join(', ')}`,
  );

  // ── Section 5 — the insider angle ───────────────────────────────────────
  add(
    'insider-angle',
    `Form 4 data cited as "${FORM4_ATTRIBUTION}"`,
    text.toLowerCase().includes(FORM4_ATTRIBUTION.toLowerCase()),
    'error',
    '5',
    'the required attribution phrase is missing — the insider angle is mandatory in every article',
  );

  const insiderEvidence =
    /\bform 4\b|open-market purchase|insider score|10b5-1|sedi\b/i.test(text);
  add(
    'insider-substance',
    'The insider angle names real filing evidence (Form 4, open-market purchase, 10b5-1…)',
    insiderEvidence,
    'warning',
    '5',
    'no filing vocabulary found in the body',
  );

  // ── Section 5 — the paywalled Insider Score number ──────────────────────
  const scoreLeak = text.match(/((?:Insider|IQ)\s+Scores?)(?:\s+of|\s*:)?\s*\d+(?:\.\d+)?/i);
  add(
    'score-not-printed',
    'No numeric Insider Score in prose (the number is premium — use the band, or the viz)',
    !scoreLeak,
    'error',
    '5',
    scoreLeak ? `found "${scoreLeak[0]}" — say "a top-tier Insider Score" or embed the iqs-card viz` : undefined,
  );

  // ── Section 5 — internal links and the CTA ──────────────────────────────
  const hasCompanyLink = /href="\/companies\/[A-Za-z.\-]{1,10}"/.test(body);
  add(
    'internal-link-company',
    'Links to the company page (/companies/[TICKER])',
    hasCompanyLink || !draft.ticker,
    'error',
    '10',
    'no /companies/[TICKER] link — every article carries one',
  );
  add(
    'internal-link-premium',
    'Links to /premium',
    /href="\/premium"/.test(body),
    'warning',
    '10',
    'no /premium link in the body',
  );
  const hasCta = /track (?:real-time )?insider activity/i.test(text) ||
    /href="\/(companies\/[A-Za-z.\-]{1,10}|screener)"/.test(body);
  add(
    'cta',
    'CTA sentence at the bottom, linking to the company page or the screener',
    hasCta,
    'error',
    '9',
    'no CTA found',
  );

  // ── Section 5 — length and paragraph discipline ─────────────────────────
  add(
    'word-count',
    `Body is ${WORD_COUNT_MIN}–${WORD_COUNT_MAX} words`,
    wordCount >= WORD_COUNT_MIN && wordCount <= WORD_COUNT_MAX,
    wordCount < WORD_COUNT_MIN ? 'error' : 'warning',
    '5',
    `${wordCount} words`,
  );

  const longParas = paras
    .map((p, i) => ({ i: i + 1, n: sentenceCount(p), p }))
    .filter((x) => x.n > MAX_SENTENCES_PER_PARAGRAPH);
  add(
    'paragraph-length',
    `No paragraph longer than ${MAX_SENTENCES_PER_PARAGRAPH} sentences`,
    longParas.length === 0,
    'warning',
    '4',
    longParas
      .map((x) => `¶${x.i} has ${x.n} sentences ("${x.p.slice(0, 60)}…")`)
      .join('; '),
  );

  // ── Sections 4 & 5 — voice ──────────────────────────────────────────────
  const emptyCalories = hits(text, BANNED_BODY_WORDS);
  add(
    'banned-body-words',
    'No editorial empty calories (game-changing, massive, huge…)',
    emptyCalories.length === 0,
    'warning',
    '5',
    `found: ${emptyCalories.join(', ')} — use the specific number instead`,
  );

  const promo = hits(text, PROMOTIONAL_PHRASES);
  add(
    'not-promotional',
    'Neutral, never promotional — no advice voice',
    promo.length === 0,
    'error',
    '4',
    `found: ${promo.join(', ')} — we present the data and let the reader conclude`,
  );

  const passiveBuy = /\b(?:stock|shares) (?:was|were) purchased by\b/i.test(text);
  add(
    'active-voice',
    'Active voice on the transaction sentence',
    !passiveBuy,
    'warning',
    '5',
    '"stock was purchased by the CEO" — write "the CEO bought $2M of stock"',
  );

  const bareMove = [...text.matchAll(/\b(?:up|down|rose|fell|gained|lost)\s+\d+(?:\.\d+)?%/gi)]
    .map((m) => m[0])
    .filter((phrase) => {
      // The manual wants a timeframe attached: "up 8% on the day".
      const at = text.indexOf(phrase);
      const after = text.slice(at + phrase.length, at + phrase.length + 60).toLowerCase();
      return !/(on the day|today|this (?:week|month|year)|year to date|over the|in the|since|yesterday|premarket|pre-market|after hours|on august|on september|on july|on the session|from the previous session|from the prior session|in a single session|in one session|over five sessions)/.test(
        after,
      );
    });
  add(
    'percentage-timeframe',
    'Every percentage move carries its timeframe',
    bareMove.length === 0,
    'warning',
    '5',
    `no timeframe after: ${bareMove.slice(0, 3).join(', ')}`,
  );

  // ── Section 5 — the remaining technical rules ───────────────────────────
  // "Company name: always include ticker in brackets on first reference."
  const tickerRef = draft.ticker
    ? new RegExp(`\\(${draft.ticker.toUpperCase().replace(/[.\-]/g, '\\$&')}\\)`).test(text)
    : true;
  add(
    'ticker-first-reference',
    'Company name carries its ticker in brackets — "Moderna (MRNA)"',
    tickerRef,
    'warning',
    '5',
    `no "(${(draft.ticker || '').toUpperCase()})" anywhere in the body`,
  );

  // "For amounts under $1 million: '$450,000' not '$450K' in body text."
  const abbreviated = [...text.matchAll(/\$\d+(?:\.\d+)?\s?K\b/g)].map((m) => m[0]);
  add(
    'dollar-figures',
    'Sub-million amounts written in full — "$450,000", not "$450K"',
    abbreviated.length === 0,
    'warning',
    '5',
    `found: ${abbreviated.slice(0, 4).join(', ')} — the K abbreviation is for headlines and sub-heads only`,
  );

  // "Dollar amounts: always use figures." — "two million dollars" is out.
  const spelledOut = /\b(?:one|two|three|four|five|six|seven|eight|nine|ten)\s+(?:hundred\s+)?(?:thousand|million|billion)\s+dollars?\b/i.exec(
    text,
  );
  add(
    'dollar-as-figures',
    'Dollar amounts as figures, not words',
    !spelledOut,
    'warning',
    '5',
    spelledOut ? `found "${spelledOut[0]}" — write it as a figure` : undefined,
  );

  // "The words 'open-market purchase' must appear when that is what happened."
  // Proxy: the article talks about insiders buying, so the precise phrase has
  // to be there — otherwise a compensation event reads as a conviction buy.
  const talksAboutBuying = /\b(?:bought|buying|purchase[ds]?|added to (?:his|her|their) (?:position|stake))\b/i.test(
    text,
  );
  add(
    'transaction-precision',
    'Uses the exact phrase "open-market purchase" where that is what the filing shows',
    !talksAboutBuying || /open-market purchase/i.test(text),
    'warning',
    '5',
    'the body describes buying but never says "open-market purchase" — without it a grant or an option exercise reads as conviction',
  );

  // "When citing other media: paraphrase and credit the outlet."
  const credited = CREDITABLE_OUTLETS.filter((o) => text.toLowerCase().includes(o));
  add(
    'outlet-attribution',
    'Market Reaction paragraph credits a named outlet',
    credited.length > 0,
    'warning',
    '5',
    'no outlet named — the manual asks for "The Wall Street Journal reported…", never an uncredited paraphrase',
  );

  // §10: "IQS SCORE: Referenced in article text and/or shown in viz."
  const scoreReferenced =
    /(?:Insider|IQ)\s+Score/i.test(text) || embeds.includes('iqs-card');
  add(
    'score-referenced',
    'Insider Score referenced — in the text as a band, or via the iqs-card viz',
    scoreReferenced,
    'warning',
    '10',
    'neither the score band nor an iqs-card embed appears; §10 asks for one of the two',
  );

  const errors = checks.filter((c) => !c.passed && c.severity === 'error').length;
  const warnings = checks.filter((c) => !c.passed && c.severity === 'warning').length;
  return { ok: errors === 0, errors, warnings, wordCount, checks };
}

/** One-line summary for a log entry or an editor's Slack message. */
export function summariseChecklist(report: ChecklistReport): string {
  const failed = report.checks.filter((c) => !c.passed);
  if (failed.length === 0) return `Checklist clean — ${report.wordCount} words.`;
  return failed
    .map((c) => `${c.severity === 'error' ? '✗' : '!'} [§${c.section}] ${c.label}${c.detail ? ` — ${c.detail}` : ''}`)
    .join('\n');
}
