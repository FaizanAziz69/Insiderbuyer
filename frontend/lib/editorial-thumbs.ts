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
  /**
   * Reachable ONLY through SLUG_OVERRIDES — never from the keyword match, the
   * ticker rule, the generic pool, or the catch-all below.
   *
   * For covers with article-specific text burned into the graphic. The White
   * Gold cover reads "WHO IS BEHIND WHITE GOLD CORP'S YUKON GOLD STORY?" and
   * the catch-all `primary = THUMBS` put it on a published healthcare
   * leaderboard article, where it advertised an unreleased draft on a live page
   * (2026-08-27). Any cover carrying its own headline must set this.
   */
  pinnedOnly?: boolean;
}

const THUMBS: Thumb[] = [
  // Ticker-specific
  { file: "ryan-cohen-alibaba", tickers: ["BABA"] },
  { file: "ryan-cohen-alibaba-2", tickers: ["BABA"] },
  { file: "ackman-uber-stake", tickers: ["UBER"] },
  { file: "apple-500b-investment", tickers: ["AAPL"] },
  { file: "englander-nvidia-etf", tickers: ["NVDA"], kw: ["nvidia", "nvda"] },
  { file: "vimeo-insider-buys", tickers: ["VMEO"] },
  { file: "burry-portrait-clean", tickers: ["BABA"], kw: ["burry", "scion", "share-sale"] },
  // 2026-08-29: Durant / Hugging Face cover (client-supplied). Pinned to its editorial.
  { file: "kevin-durant-hugging-face", pinnedOnly: true },
  { file: "white-gold-donofrio-clean", pinnedOnly: true },
  { file: "white-gold-district-map", pinnedOnly: true },
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

/** Everything the matcher may reach without an explicit slug pin. */
const MATCHABLE = THUMBS.filter((t) => !t.pinnedOnly);
const GENERIC_POOL = MATCHABLE.filter((t) => t.generic);
const CONGRESS_POOL = MATCHABLE.filter((t) => t.congress);

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
  // 2026-09-03 Top Stories. Pinned, not left to the keyword/ticker rules:
  // George's standing rule is that the cover must be the person the story is
  // about, chosen from the covers already in public/editorial-thumbs — no new
  // images. Buffett leads the Alphabet story; the Uber story is Ackman's, and
  // that photo is already the Uber-stake one.
  "editorial-buffett-ackman-alphabet-split-2026-09-03": "buffett-value-stock",
  "editorial-ackman-pelosi-uber-insiders-2026-09-03": "ackman-uber-stake",
  // 2026-08-29: Durant / Hugging Face / NVIDIA editorial (client cover).
  "editorial-kevin-durant-hugging-face-nvidia-2026-08-29": "kevin-durant-hugging-face",
  // Stock Ideas (breaking-news picks, 2026-08-28): pinned so the card and the
  // article page show the exact topic-matched cover (pickEditorialThumb otherwise
  // hash-picks among candidates). Topic → image, per client.
  "stock-idea-nvda-2026-08-28": "englander-nvidia-etf",
  "stock-idea-intc-2026-08-28": "chamath-perimeter-ai",
  "stock-idea-iren-2026-08-28": "cathie-wood-bargain",
  "stock-idea-nem-2026-08-28": "carl-icahn-fertilizer",
  "stock-idea-aapl-2026-08-28": "apple-500b-investment",
  "editorial-trump-3b-critical-minerals-2026-08-08": "trump-social-posts",
  // 2026-08-14: swapped from bill-ackman-letter to the Uber-stake photo (client).
  "editorial-ackman-letter-top-13-positions-2026-08-13": "ackman-uber-stake",
  // 2026-08-21: swapped from tom-lee-rally to the new stylized graphic (client).
  "editorial-tom-lee-generational-rally-2026-08-13": "tomlee-record-highs",
  "editorial-jensen-huang-sustainable-energy-2026-08-14": "jensen-huang-2026",
  "editorial-gates-four-seasons-nevis-lawsuit-2026-08-20": "gates-four-seasons-msft",
  "editorial-anthropic-ipo-2t-valuation-2026-08-24": "anthropic-ipo-filing",
  "editorial-burry-alibaba-ai-share-sale-2026-08-24": "burry-portrait-clean",
  // 2026-08-25: pinned because the congress pool is hash-picked out of 15
  // candidates (pool + generic backups), and this story first landed on a
  // Buffett photo. The slug is also chosen so the un-deployed pick already
  // resolves here.
  "editorial-nancy-pelosi-first-bloom-energy-trade-2026-08-25": "invest-like-pelosi",
  // 2026-08-26: client asked for the Jensen Huang photo specifically. Without
  // the pin the NVDA ticker rule would pick englander-nvidia-etf instead.
  "editorial-raymond-james-nvidia-352-price-target-2026-08-26": "jensen-huang-2026",
  // 2026-09-01: Anthropic / Lambda / Nvidia cloud deal — client asked for the
  // same Jensen Huang photo. Without the pin the NVDA ticker rule picks
  // englander-nvidia-etf. Third slug sharing this file, which is fine: it
  // carries no baked-in headline text, so it is not pinnedOnly.
  "editorial-anthropic-lambda-cloud-deal-2026-09-01": "jensen-huang-2026",
  // 2026-08-27: the neutral trading-floor collage. Every other thumb in the
  // library is a portrait of a named investor, and this story is about Moderna
  // — pinning any of them would put an unrelated person's face on it. Without
  // the pin, MRNA has no ticker rule and would hash-pick a billionaires
  // montage. Replace when a Moderna/lab cover at 1606x1000 exists.
  "editorial-moderna-insider-absence-cancer-vaccine-2026-08-27": "insiders-most-money",
  // 2026-08-28: client duotone composite (CEO cut-out over the Toronto skyline
  // with candlesticks) + OUR headline bar, composited to 1606x1000. This one
  // matches the house treatment of the client's own thumbs and carries no baked
  // text. Cropped on height, weighted to the top, so the face and the CN Tower
  // both survive. pinnedOnly — the bar names one article.
  // Replaces the first version, whose baked-in text carried "19% AGNMICO
  // EAGLE", "David Donofrio", "Shaun Ryan", "Strongest Bull Case Ever" and a
  // "TSX:SNC" map label — none of which survived the fact-check. New filename
  // because the thumbs folder is served with a 30-day cache.
  // 2026-08-28: client-supplied collage (CEO, White Gold District map, drill
  // site). Carries baked text ("300,000+ hectares of prime land", "High-Grade
  // Gold Intercepts", map labels) — pinnedOnly so it can never land on another
  // article. 1672x941 source extended to 1606x1000 with blurred edge rows, not
  // cropped. New filename: the thumbs folder is served with a 30-day cache.
  "editorial-white-gold-corp-wgo-yukon-team-2026-08-27": "white-gold-district-map",
};

function candidatesFor(opts: ThumbInput, ignorePin = false): Thumb[] {
  const seed = (opts.seed || "").toLowerCase();
  const pin = ignorePin ? undefined : SLUG_OVERRIDES[seed];
  if (pin) {
    const t = THUMBS.find((x) => x.file === pin);
    if (t) return [t];
  }
  const sym = (opts.ticker || "").toUpperCase();
  const hay = [seed, (opts.sector || "").toLowerCase(), ...(opts.tags || []).map((t) => t.toLowerCase())]
    .join(" ");

  let primary: Thumb[] = [];
  if (sym) primary = MATCHABLE.filter((t) => t.tickers?.includes(sym));
  if (!primary.length && /congress|politician|senate|pelosi|capitol/.test(hay)) primary = CONGRESS_POOL;
  if (!primary.length) primary = MATCHABLE.filter((t) => t.kw?.some((k) => hay.includes(k)));
  // Any article kind → the full MATCHABLE set (keyed by slug downstream) so a
  // card's thumbnail and its opened article page always show the same image.
  // MATCHABLE, not THUMBS: this catch-all is how a pin-only cover with another
  // article's headline printed on it reached a live healthcare article.
  if (!primary.length && INSIDER_SLUG.test(seed)) primary = MATCHABLE;
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
export function assignEditorialThumbs(
  items: (ThumbInput & { image?: string | null })[],
  opts: { preferOwnImage?: boolean } = {},
): Record<string, string | null> {
  const used = new Set<string>();
  const out: Record<string, string | null> = {};
  items.forEach((item, i) => {
    const seed = (item.seed || `i${i}`).toLowerCase();
    // George (2026-08-29): the freshly AI-published story at the top must show
    // the NEW image the AI made for it, not a recycled library cover. An
    // article that carries its OWN per-article image (an AI render — anything
    // NOT under /editorial-thumbs/, which is the shared library) keeps that
    // image: null tells the card to fall through to its own `primary`. It also
    // claims no library slot, so the pool stays free for the library-only
    // cards. Hand-authored editorials store a /editorial-thumbs/ file as their
    // image, so they still draw from the deduped pool exactly as before.
    if (opts.preferOwnImage && item.image && !item.image.startsWith("/editorial-thumbs/")) {
      out[seed] = null;
      return;
    }
    let cands = candidatesFor(item);
    // A slug pin wins everywhere EXCEPT against another card in the same list
    // already showing that file (George 2026-08-29: two NVIDIA stories, both
    // pinned to the Jensen Huang photo, sat side by side in Top Stories).
    // Then the pinned card falls back to its ticker/keyword candidates, taken
    // best-fit first (no hash rotation — the rotation is for spreading the
    // neutral pool, and here it skipped the NVIDIA cover for a Buffett one).
    let pinFallback = false;
    if (cands.length === 1 && SLUG_OVERRIDES[seed] && used.has(cands[0].file)) {
      cands = candidatesFor(item, true);
      pinFallback = true;
    }
    if (!cands.length) {
      out[seed] = null;
      return;
    }
    // Rotate candidate order deterministically, then take the first unused.
    const start = pinFallback ? 0 : hash(seed) % cands.length;
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
