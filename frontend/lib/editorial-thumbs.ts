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

/** Insider-buying/investor article kinds — eligible for the neutral pool. */
const INSIDER_SLUG = /^(daily-briefing|top-iqs|cluster|ceo|weekly|stock-idea|ticker-deep-dive|series|sector-roundup|topic)/i;

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

/** Best editorial thumbnail for an article, or null (→ curated fallback). */
export function pickEditorialThumb(opts: {
  ticker?: string | null;
  sector?: string | null;
  tags?: string[] | null;
  seed?: string | null;
  /** Position within its list — spreads the pool so no two adjacent cards
   *  share an image. */
  index?: number;
}): string | null {
  const seed = (opts.seed || "").toLowerCase();
  const idx = opts.index ?? 0;
  const sym = (opts.ticker || "").toUpperCase();
  const hay = [seed, (opts.sector || "").toLowerCase(), ...(opts.tags || []).map((t) => t.toLowerCase())]
    .join(" ");

  // 1. Exact ticker match wins.
  if (sym) {
    const hits = THUMBS.filter((t) => t.tickers?.includes(sym));
    if (hits.length) return pick(hits, seed, idx);
  }

  // 2. Congressional / politician content.
  if (/congress|politician|senate|pelosi|capitol/.test(hay)) {
    return pick(CONGRESS_POOL, seed, idx);
  }

  // 3. Specific topic / keyword match.
  const kwHits = THUMBS.filter((t) => t.kw?.some((k) => hay.includes(k)));
  if (kwHits.length) return pick(kwHits, seed, idx);

  // 4. Neutral investor/finance pool for insider-buying article kinds.
  if (INSIDER_SLUG.test(seed)) return pick(GENERIC_POOL, seed, idx);

  return null;
}
