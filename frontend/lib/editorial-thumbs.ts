/**
 * Client-supplied editorial thumbnails (in /public/editorial-thumbs).
 * Each article is matched to the best-fitting image by ticker → congressional
 * → specific topic → a neutral investor/finance pool; when nothing fits, the
 * caller falls back to the curated sector photo. A per-list `index` spreads
 * the pool so cards in the same section never repeat an image.
 */

interface Thumb {
  file: string;
  /** Exact ticker matches — strongest signal. */
  tickers?: string[];
  /** SPECIFIC keyword fragments (topic/persona) — deliberately narrow so a
   *  broad word like "insider" never collapses every article to one image. */
  kw?: string[];
  /** Eligible for congressional / politician content. */
  congress?: boolean;
  /** Neutral investor/finance image — safe for any insider-buying story. */
  generic?: boolean;
}

const THUMBS: Thumb[] = [
  // Ticker-specific
  { file: "ryan-cohen-alibaba", tickers: ["BABA"] },
  { file: "ryan-cohen-alibaba-2", tickers: ["BABA"] },
  { file: "ackman-uber-stake", tickers: ["UBER"] },
  { file: "apple-500b-investment", tickers: ["AAPL"] },
  { file: "englander-nvidia-etf", tickers: ["NVDA"] },
  { file: "vimeo-insider-buys", tickers: ["VMEO"] },
  // Specific topic
  { file: "bill-ackman-letter", kw: ["ackman", "pershing"] },
  { file: "tom-lee-rally", kw: ["tom-lee", "fundstrat"] },
  { file: "tomlee-record-highs", kw: ["tom-lee", "record-high"] },
  { file: "jensen-huang-2026", kw: ["jensen-huang", "sustainable-energy"] },
  { file: "gates-four-seasons-msft", kw: ["bill-gates", "four-seasons", "nevis"] },
  { file: "anthropic-ipo-filing", kw: ["anthropic", "openai", "ipo-filing"] },
  { file: "chamath-perimeter-ai", kw: ["artificial-intelligence", "medical-imaging", "\bai\b", "semis", "semiconductor"] },
  { file: "carl-icahn-fertilizer", kw: ["fertilizer", "chemical", "metals-and-mining", "materials"] },
  { file: "zefiro-methane-ceo", kw: ["methane", "energy", "oil", "petroleum"] },
  { file: "abudhabi-bitcoin-etf", kw: ["bitcoin", "crypto", "blackrock"] },
  // Congressional / politician
  { file: "invest-like-pelosi", congress: true },
  { file: "pelosi-husband-trades", congress: true },
  { file: "trump-jr-hot-stock", congress: true },
  { file: "musk-congress-wealth", congress: true },
  { file: "kash-patel-shein", congress: true },
  { file: "trump-social-posts", congress: true },
  // Neutral investor / finance pool (spread across insider-buying stories)
  { file: "buffett-40pct-stock", generic: true },
  { file: "buffett-value-stock", generic: true },
  { file: "buffett-annual-letter", generic: true },
  { file: "cathie-wood-bargain", generic: true },
  { file: "billionaires-super-stocks", generic: true },
  { file: "insiders-most-money", generic: true },
  { file: "ackman-howard-hughes", generic: true },
  { file: "lutnick-cantor", generic: true },
  { file: "jamie-dimon-doge", generic: true },
];

const GENERIC_POOL = THUMBS.filter((t) => t.generic);
const CONGRESS_POOL = THUMBS.filter((t) => t.congress);

/** Article kinds eligible for an editorial thumbnail (every article type). */
const INSIDER_SLUG = /^(daily-briefing|top-iqs|cluster|ceo|weekly|stock-idea|ticker-deep-dive|series|sector-roundup|topic|editorial)/i;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function url(file: string): string {
  return `/editorial-thumbs/${file}.jpg`;
}

/** Deterministic pick from a pool, offset by a per-list index so adjacent
 *  cards in the same section land on different images. */
function pick(pool: Thumb[], seed: string, index: number): string {
  return url(pool[(hash(seed) + index) % pool.length].file);
}

export interface ThumbInput {
  ticker?: string | null;
  sector?: string | null;
  tags?: string[] | null;
  seed?: string | null;
}

/** Ordered candidate files for an article: its best-fit bucket first, then
 *  the neutral pool as backup so a unique assignment can always find an
 *  unused image. Empty → no editorial thumb (curated fallback). */
/** Hard pin: specific article slugs → a specific thumbnail file (wins over
 *  all keyword/pool logic). Used when an editorial needs one exact image. */
const SLUG_OVERRIDES: Record<string, string> = {
  "editorial-trump-3b-critical-minerals-2026-08-08": "trump-social-posts",
  // 2026-08-14: swapped from bill-ackman-letter to the Uber-stake photo (client).
  "editorial-ackman-letter-top-13-positions-2026-08-13": "ackman-uber-stake",
  // 2026-08-21: swapped from tom-lee-rally to the new stylized graphic (client).
  "editorial-tom-lee-generational-rally-2026-08-13": "tomlee-record-highs",
  "editorial-jensen-huang-sustainable-energy-2026-08-14": "jensen-huang-2026",
  "editorial-gates-four-seasons-nevis-lawsuit-2026-08-20": "gates-four-seasons-msft",
  "editorial-anthropic-ipo-2t-valuation-2026-08-24": "anthropic-ipo-filing",
};

function candidatesFor(opts: ThumbInput): Thumb[] {
  const seed = (opts.seed || "").toLowerCase();
  const pin = SLUG_OVERRIDES[seed];
  if (pin) {
    const t = THUMBS.find((x) => x.file === pin);
    if (t) return [t];
  }
  const sym = (opts.ticker || "").toUpperCase();
  const hay = [seed, (opts.sector || "").toLowerCase(), ...(opts.tags || []).map((t) => t.toLowerCase())]
    .join(" ");

  let primary: Thumb[] = [];
  if (sym) primary = THUMBS.filter((t) => t.tickers?.includes(sym));
  if (!primary.length && /congress|politician|senate|pelosi|capitol/.test(hay)) primary = CONGRESS_POOL;
  if (!primary.length) primary = THUMBS.filter((t) => t.kw?.some((k) => hay.includes(k)));
  // Any article kind → the FULL 25-image set (keyed by slug downstream) so a
  // card's thumbnail and its opened article page always show the same image.
  if (!primary.length && INSIDER_SLUG.test(seed)) primary = THUMBS;
  if (!primary.length) return [];

  // Append the neutral pool as backup (deduped) so uniqueness never runs dry.
  const seen = new Set(primary.map((t) => t.file));
  return [...primary, ...GENERIC_POOL.filter((t) => !seen.has(t.file))];
}

/** Best editorial thumbnail for a single article, or null (→ curated). */
export function pickEditorialThumb(opts: ThumbInput & { index?: number }): string | null {
  const cands = candidatesFor(opts);
  if (!cands.length) return null;
  const seed = (opts.seed || "").toLowerCase();
  return pick(cands, seed, opts.index ?? 0);
}

/** A pleasing fixed ordering of all 25 client thumbnails. The home page maps
 *  each card to a slot in this list so every cover across the whole page is
 *  unique (Top Stories, Popular, Stock Ideas, Latest News draw disjoint
 *  ranges — see homeThumbAt / HOME_THUMB_BASE). */
const HOME_ORDER: string[] = [
  // Top Stories range (0–5): market/finance scenes + marquee investors
  "insiders-most-money", "abudhabi-bitcoin-etf", "billionaires-super-stocks",
  "apple-500b-investment", "buffett-40pct-stock", "englander-nvidia-etf",
  // Popular range (6–11) — ackman-uber-stake moved to the letter-article pin
  // (2026-08-14), its old slot takes the freed-up letter photo instead so
  // home covers stay unique.
  "cathie-wood-bargain", "bill-ackman-letter", "ryan-cohen-alibaba",
  "jamie-dimon-doge", "carl-icahn-fertilizer", "buffett-value-stock",
  // Stock Ideas range (12–17)
  "chamath-perimeter-ai", "vimeo-insider-buys", "lutnick-cantor",
  "ackman-howard-hughes", "zefiro-methane-ceo", "ryan-cohen-alibaba-2",
  // Latest News range (18–24)
  "buffett-annual-letter", "invest-like-pelosi", "pelosi-husband-trades",
  "trump-jr-hot-stock", "musk-congress-wealth", "kash-patel-shein",
  "trump-social-posts",
];

/** Per-section starting slot in HOME_ORDER so sections never overlap. */
export const HOME_THUMB_BASE = { top: 0, popular: 6, ideas: 12, latest: 18 } as const;

/** Home-page cover for a card at (base + index) — guarantees a unique image
 *  across the whole page (25 images cover the ~20 home cards). */
export function homeThumbAt(base: number, index: number): string {
  return url(HOME_ORDER[(base + index) % HOME_ORDER.length]);
}

/** Assign editorial thumbnails to a LIST so no two cards repeat an image
 *  (like assignUniquePhotos for the curated library). Returns a map keyed by
 *  each item's `seed` (slug); value is a URL or null (→ curated fallback). */
export function assignEditorialThumbs(items: ThumbInput[]): Record<string, string | null> {
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  items.forEach((item, i) => {
    const seed = (item.seed || `i${i}`).toLowerCase();
    const cands = candidatesFor(item);
    if (!cands.length) {
      out[seed] = null;
      return;
    }
    // Rotate candidate order deterministically, then take the first unused.
    const start = hash(seed) % cands.length;
    let chosen: Thumb | null = null;
    for (let k = 0; k < cands.length; k++) {
      const c = cands[(start + k) % cands.length];
      if (!used.has(c.file)) {
        chosen = c;
        break;
      }
    }
    // Pool exhausted (more cards than images) — allow a repeat rather than blank.
    if (!chosen) chosen = cands[start];
    used.add(chosen.file);
    out[seed] = url(chosen.file);
  });
  return out;
}
