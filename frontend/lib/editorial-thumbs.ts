/**
 * Client-supplied editorial thumbnails (in /public/editorial-thumbs).
 * Each article is matched to the best-fitting image by ticker → topic →
 * a general insider/investor pool; when nothing fits, the caller falls back
 * to the curated sector photo. Images are figure/story-centric editorial
 * covers (Buffett, Pelosi, Ackman, Icahn, Cathie Wood, Musk, Trump, plus
 * ticker- and topic-specific art), so they read like a real finance
 * publication.
 */

interface Thumb {
  file: string;
  /** Exact ticker matches — strongest signal. */
  tickers?: string[];
  /** Keyword fragments matched against the article's slug/sector/tags. */
  kw?: string[];
  /** Eligible for congressional / politician content. */
  congress?: boolean;
  /** Eligible for the general insider-buying / investor pool. */
  generic?: boolean;
}

const THUMBS: Thumb[] = [
  { file: "ryan-cohen-alibaba", tickers: ["BABA"], kw: ["alibaba", "china"] },
  { file: "ryan-cohen-alibaba-2", tickers: ["BABA"], kw: ["alibaba"] },
  { file: "ackman-uber-stake", tickers: ["UBER"], kw: ["uber", "ackman"] },
  { file: "apple-500b-investment", tickers: ["AAPL"], kw: ["apple"] },
  { file: "englander-nvidia-etf", tickers: ["NVDA"], kw: ["nvidia"] },
  { file: "vimeo-insider-buys", tickers: ["VMEO"], kw: ["vimeo"] },
  { file: "chamath-perimeter-ai", kw: ["ai", "artificial-intelligence", "medical-imaging", "spac", "semis"] },
  { file: "carl-icahn-fertilizer", kw: ["fertilizer", "icahn", "materials", "chemical", "metals", "mining"] },
  { file: "zefiro-methane-ceo", kw: ["methane", "energy", "oil", "gas", "emission"] },
  { file: "abudhabi-bitcoin-etf", kw: ["bitcoin", "crypto", "etf", "blackrock", "coin"] },
  { file: "jamie-dimon-doge", kw: ["dimon", "jpmorgan", "bank", "financial", "doge"] },
  { file: "lutnick-cantor", kw: ["cantor", "wall-street", "financial", "broker"] },
  { file: "invest-like-pelosi", kw: ["pelosi", "congress", "politician"], congress: true },
  { file: "pelosi-husband-trades", kw: ["pelosi", "congress"], congress: true },
  { file: "trump-jr-hot-stock", kw: ["trump"], congress: true },
  { file: "musk-congress-wealth", kw: ["musk", "congress", "doge"], congress: true },
  { file: "kash-patel-shein", kw: ["shein", "china", "politician"], congress: true },
  { file: "trump-social-posts", kw: ["trump", "market"], congress: true },
  { file: "cathie-wood-bargain", kw: ["cathie", "ark", "growth"], generic: true },
  { file: "buffett-40pct-stock", kw: ["buffett", "berkshire"], generic: true },
  { file: "buffett-value-stock", kw: ["buffett", "berkshire", "value"], generic: true },
  { file: "buffett-annual-letter", kw: ["buffett", "berkshire", "letter"], generic: true },
  { file: "insiders-most-money", kw: ["insider", "buying", "bought"], generic: true },
  { file: "billionaires-super-stocks", kw: ["billionaire", "super-stock"], generic: true },
  { file: "ackman-howard-hughes", kw: ["ackman", "howard-hughes", "real-estate"], generic: true },
];

const GENERIC_POOL = THUMBS.filter((t) => t.generic);

/** Slug prefixes that are insider-buying / investor content — eligible for
 *  the general editorial pool even without a specific keyword hit. */
const INSIDER_SLUG = /^(daily-briefing|top-iqs|cluster|ceo|weekly|stock-idea|ticker-deep-dive|series|sector-roundup)/i;

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

function url(file: string): string {
  return `/editorial-thumbs/${file}.jpg`;
}

/** Pick the best editorial thumbnail for an article, or null to let the
 *  caller fall back to the curated sector photo. Deterministic per seed. */
export function pickEditorialThumb(opts: {
  ticker?: string | null;
  sector?: string | null;
  tags?: string[] | null;
  seed?: string | null;
}): string | null {
  const seed = (opts.seed || "").toLowerCase();
  const sym = (opts.ticker || "").toUpperCase();
  const hay = [seed, (opts.sector || "").toLowerCase(), ...(opts.tags || []).map((t) => t.toLowerCase())]
    .join(" ");

  // 1. Exact ticker match wins.
  if (sym) {
    const tickerHits = THUMBS.filter((t) => t.tickers?.includes(sym));
    if (tickerHits.length) return url(tickerHits[hash(seed) % tickerHits.length].file);
  }

  // 2. Congressional / politician content.
  const isCongress = /congress|politician|senate|pelosi|capitol/.test(hay);
  if (isCongress) {
    const c = THUMBS.filter((t) => t.congress);
    if (c.length) return url(c[hash(seed) % c.length].file);
  }

  // 3. Topic / keyword match.
  const kwHits = THUMBS.filter((t) => t.kw?.some((k) => hay.includes(k)));
  if (kwHits.length) return url(kwHits[hash(seed) % kwHits.length].file);

  // 4. General insider/investor pool for insider-buying article kinds.
  if (INSIDER_SLUG.test(seed) || /insider|buy/.test(hay)) {
    return url(GENERIC_POOL[hash(seed) % GENERIC_POOL.length].file);
  }

  return null;
}
