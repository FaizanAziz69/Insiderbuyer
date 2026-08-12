import { BlogKind, BlogPostListItem } from "./api";

/**
 * Per-article eyebrow wording for article cards.
 *
 * WHY THIS EXISTS: every card used to render `item.eyebrow || KIND_LABEL[kind]`,
 * and both halves of that are constants. The backend pins the eyebrow to its
 * format's `section` string — only four distinct values across all 28 formats
 * ("STOCK IDEAS", "ORIGINAL SERIES", "POPULAR", "TOP STORIES") — and the
 * frontend fallbacks are per-kind literals ("STOCK IDEA", "INSIDER BUYING",
 * "INSIDER"). So a column of five cards showed the same word five times, which
 * is the repetition the client flagged.
 *
 * WHAT THIS DOES: builds the label from the article's OWN record — its kind,
 * plus its topic / sector / ticker when present — and picks between equivalent
 * framings with a hash of the slug, so wording differs per article and is
 * stable across renders (no hydration mismatch, no reshuffle on refresh).
 *
 * WHAT THIS DOES NOT DO: it never asserts anything about a company. Every
 * variant is a neutral section/framing label ("TICKER FOCUS", "CLOSER LOOK") —
 * there is no claim about performance, no recommendation, and no number. The
 * only company-specific words that can appear are the article's own `ticker`,
 * `sector` and `topic` values.
 */

/** Interchangeable framings per kind. Descriptive only — nothing here reads as
 *  advice or as a claim about a company's prospects. */
const VARIANTS: Record<BlogKind, string[]> = {
  "daily-summary": [
    "DAILY BRIEFING",
    "TODAY'S BRIEFING",
    "THE DAY IN FORM 4s",
    "MORNING BRIEFING",
  ],
  "top-iqs": [
    "TOP INSIDER SCORE PICKS",
    "THE RANKED LIST",
    "SCORE LEADERBOARD",
    "RANKED BY INSIDER SCORE",
  ],
  "ticker-deep-dive": ["TICKER FOCUS", "DEEP DIVE", "CLOSER LOOK", "FILING BREAKDOWN"],
  "sector-roundup": ["SECTOR ROUNDUP", "SECTOR SWEEP", "ACROSS THE SECTOR"],
  "cluster-buy": ["CLUSTER BUY", "CLUSTER ALERT", "MULTIPLE BUYERS", "BUYING IN NUMBERS"],
  "ceo-buying": ["CEO BUYING", "EXECUTIVE PURCHASES", "IN THE CORNER OFFICE", "C-SUITE FILINGS"],
  "stock-idea": ["STOCK IDEA", "IDEA IN FOCUS", "ON THE RADAR", "FROM THE IDEA DESK"],
  "weekly-report": ["WEEKLY REPORT", "THE WEEK IN FORM 4s", "WEEK IN REVIEW", "THIS WEEK'S FILINGS"],
  "topic-roundup": ["TOPIC ROUNDUP", "THEME WATCH", "SECTOR THEME", "COVERAGE ROUNDUP"],
  editorial: ["EDITORIAL", "OUR TAKE", "FROM THE DESK", "EDITORIAL DESK"],
  "guide-format": ["ORIGINAL SERIES", "FROM THE SERIES", "EXPLAINER", "THE SERIES"],
};

/** Fallback pool for a kind the API adds before the frontend knows about it —
 *  still varied, still free of any claim. */
const GENERIC = ["INSIDER BUYING", "FORM 4 FILINGS", "INSIDER ACTIVITY", "FROM THE FEED"];

/** Topic slug → the display word used inside a label ("AI WATCH"). Mirrors the
 *  labels on /topics/[slug] so the two surfaces agree. */
const TOPIC_WORDS: Record<string, string> = {
  ai: "AI",
  biotech: "BIOTECH",
  ev: "EV",
  etf: "ETF",
  macro: "MACRO",
  markets: "MARKETS",
  ma: "M&A",
  semis: "SEMICONDUCTORS",
};

/** Stable 32-bit hash (FNV-1a) — same slug always yields the same variant, on
 *  the server and in the browser alike. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

type LabelSource = Pick<
  BlogPostListItem,
  "slug" | "kind" | "ticker" | "sector" | "topic"
>;

/**
 * The label for one article, optionally skipping `offset` variants so a caller
 * can break a tie against another card in the same view.
 */
export function articleLabel(item: LabelSource, offset = 0): string {
  const pool = VARIANTS[item.kind] ?? GENERIC;
  const base = pool[(hash(item.slug) + offset) % pool.length];

  // A topic roundup carries its theme in the record — use it, so "AI WATCH"
  // and "SEMICONDUCTORS ROUNDUP" replace one shared "TOPIC ROUNDUP".
  if (item.kind === "topic-roundup") {
    const word = item.topic ? TOPIC_WORDS[item.topic] ?? item.topic.toUpperCase() : null;
    if (word) return `${word} ${base === "THEME WATCH" ? "WATCH" : "ROUNDUP"}`;
  }
  // A sector roundup does the same with its sector.
  if (item.kind === "sector-roundup" && item.sector) {
    return `${item.sector.toUpperCase()} ROUNDUP`;
  }
  return base;
}

/**
 * Labels for a whole rendered list, keyed by slug, guaranteeing no two cards in
 * that list show the same wording while the pool has room. This is what kills
 * the "five cards, one repeated label" look — per-article hashing alone can
 * still collide by chance inside a group of five.
 */
export function articleLabels(items: LabelSource[]): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const item of items) {
    const pool = VARIANTS[item.kind] ?? GENERIC;
    let label = articleLabel(item);
    // Walk the pool for this kind until an unused framing turns up. If every
    // variant is taken (more cards of one kind than framings), the repeat is
    // unavoidable and the loop exits on the offset bound rather than spinning.
    for (let offset = 1; used.has(label) && offset < pool.length; offset++) {
      label = articleLabel(item, offset);
    }
    used.add(label);
    out[item.slug] = label;
  }
  return out;
}
