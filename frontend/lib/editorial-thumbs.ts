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
  // 2026-09-12: client-supplied Khosrowshahi + Uber cover for the CEO-buy
  // top story. pinnedOnly: it is one man's portrait made for one story.
  { file: "uber-ceo-dara-khosrowshahi", tickers: ["UBER"], kw: ["khosrowshahi"], pinnedOnly: true },
  // 2026-09-04: Markiplier / GoPro cover (client-supplied for the GPRO 13G story).
  { file: "markiplier-gopro-stake", tickers: ["GPRO"], kw: ["markiplier", "gopro"] },
  // 2026-09-04: client-supplied Pelosi + Thiel composite for the Vistra story,
  // resized from 2624x1628 to the house 1606x1000. pinnedOnly: a two-person
  // cover made for one trade is not a generic portrait, and with it in
  // MATCHABLE the slug-hash catch-all immediately put it on an unrelated
  // healthcare daily briefing. invest-like-pelosi still serves congress
  // stories.
  // 2026-09-10: Thiel Macro 13F — 72% of the book in energy and power.
  // Client-supplied Thiel composite; pinned only (person the story is about).
  // 2026-09-15: Gina Rinehart buys 13.5% of White Cliff Minerals, her
  // estranged son's copper explorer. Client-supplied Rinehart composite;
  // pinned only (person the story is about).
  // 2026-09-19: Greenland security deal top story. Client-supplied Trump /
  // Frederiksen composite over Nuuk, resized from 2752x1536. pinnedOnly: two
  // real people made for one story.
  // 2026-09-21: hair-loss drug stocks top story. Client-supplied balding-man
  // skyline shot (replaced the Rogaine product graphic on request), resized
  // from 3024x1376. pinnedOnly: made for one story.
  // 2026-09-21: Steve Eisman AI top story. Client-supplied composite,
  // resized to the house 1606x1000. pinnedOnly: one man's likeness made for
  // one story.
  { file: "steve-eisman-ai-moats", pinnedOnly: true },
  // 2026-09-21: replaced the Rogaine product shot at the client's request.
  { file: "hair-loss-balding-skyline", pinnedOnly: true },
  { file: "trump-frederiksen-greenland-deal", pinnedOnly: true },
  { file: "nyse-flag-23-hour-trading", pinnedOnly: true },
  { file: "gina-rinehart-white-cliff-2026", pinnedOnly: true },
  { file: "thiel-energy-power-2026", pinnedOnly: true },
  { file: "pelosi-thiel-vistra", pinnedOnly: true },
  // 2026-09-05: client-supplied Burry composite (red ticker board) for the
  // Lululemon "trickster" story, resized from 2624x1624 to 1606x1000.
  // pinnedOnly: burry-portrait-clean already serves generic Burry/Scion
  // stories; this one was made for a single article.
  { file: "burry-lululemon-trickster", pinnedOnly: true },
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
  // 2026-09-22: PesoRama sponsored CEO interview (unlisted draft). The pin
  // matters as much as the file: the page resolves its cover through this
  // registry BEFORE the stored imageUrl, so without it the keyword matcher
  // would hand this slug an unrelated photo. Second composite from the client
  // 2026-09-24 (Bhaloo against a JOI storefront, no headline type baked in);
  // it lands under a NEW filename because the thumbs are served with
  // `expires 30d` and replacing bytes in place is invisible for a month.
  "editorial-pesorama-ceo-rahim-bhaloo-mexico-dollar-stores-2026-09-22":
    "pesorama-bhaloo-joi-storefront",
  // 2026-09-22: Michael Burry / Ero Copper top story. Reuses the clean Burry
  // portrait that already fronts the Alibaba piece, at the client's request.
  "editorial-michael-burry-copper-ero-position-2026-09-22": "burry-portrait-clean",
  // 2026-09-21: Steve Eisman AI top story. Client-supplied composite.
  "editorial-steve-eisman-ai-terminator-moats-2026-09-21": "steve-eisman-ai-moats",
  // 2026-09-21: hair-loss drug stocks top story.
  "editorial-hair-loss-drug-stocks-next-glp-1-bet-2026-09-21": "hair-loss-balding-skyline",
  // 2026-09-19: Greenland security deal top story. Client-supplied composite.
  "editorial-us-denmark-greenland-security-deal-2026-09-19": "trump-frederiksen-greenland-deal",
  // 2026-09-18: 23-hour trading top story. Client-supplied NYSE facade photo.
  "editorial-us-stocks-23-hour-trading-december-6-2026-09-18": "nyse-flag-23-hour-trading",
  "stock-idea-borr-2026-09-18": "zefiro-methane-ceo",
  "topic-insider-buying-week-2026-09-18": "buffett-40pct-stock",
  // 2026-09-11: the three Popular Articles topic roundups. Covers picked per
  // topic from the library (client rule: library only, cover must match the
  // subject) and pinned so the home-page registry cannot hand them to a
  // keyword match from another card.
  "topic-congress-trading-summer-2026-09-11": "invest-like-pelosi",
  "topic-insider-buy-sell-ratio-2026-09-11": "insiders-most-money",
  // NOT ryan-cohen-alibaba-2 despite the filename: that file is an unrelated
  // portrait on a quantum-chip background with no Alibaba in it (checked
  // 2026-09-11). This one carries the Alibaba signage, which is the
  // company the story is about. The face on it is Ryan Cohen, who is not
  // in the story — swap if the client wants the subjects instead.
  "topic-alibaba-insider-buying-2026-09-11": "ryan-cohen-alibaba",
  // 2026-09-15: Rinehart / White Cliff. Client-supplied cover.
  "editorial-gina-rinehart-white-cliff-estranged-son-2026-09-15": "gina-rinehart-white-cliff-2026",
  // 2026-09-11: SpaceX directors funding MDMA therapy. The library's Musk /
  // Capitol composite is the closest thing we have to "Musk world meets
  // Washington", which is what this story is.
  "editorial-spacex-directors-mdma-funding-2026-09-11": "musk-congress-wealth",
  // 2026-09-10: Peter Thiel's Q2 13F — 72% energy and power. Client-supplied cover.
  "editorial-peter-thiel-72-percent-energy-power-2026-09-10": "thiel-energy-power-2026",
  // 2026-09-05: Burry says he will buy more Lululemon under $100. Cover is the
  // client-supplied Burry composite, the person the story is about.
  "editorial-lulu-burry-buy-under-100-2026-09-05": "burry-lululemon-trickster",
  // 2026-09-04: Pelosi / Thiel / Burke all buying Vistra. Started on the
  // library's invest-like-pelosi portrait; the client then supplied a
  // Pelosi + Thiel composite, which is the two names the story is about.
  "editorial-vst-pelosi-thiel-ceo-buying-2026-09-04": "pelosi-thiel-vistra",
  // 2026-09-04: the Markiplier / GoPro 13G editorial. Cover is the person the
  // story is about, per the standing rule.
  "editorial-gpro-markiplier-stake-2026-09-04": "markiplier-gopro-stake",
  // 2026-09-03 Top Stories. Pinned, not left to the keyword/ticker rules:
  // George's standing rule is that the cover must be the person the story is
  // about, chosen from the covers already in public/editorial-thumbs — no new
  // images. Buffett leads the Alphabet story; the Uber story is Ackman's, and
  // that photo is already the Uber-stake one.
  "editorial-buffett-ackman-alphabet-split-2026-09-03": "buffett-value-stock",
  // 2026-09-11: moved to Ackman's own portrait. The Uber-signage cover it used
  // to hold is now on the story about Uber's OWN insiders buying (the CEO's
  // $10M purchase) — a cover with a company's branding belongs on the article
  // about that company, and this story is about Ackman's stake in it.
  "editorial-ackman-pelosi-uber-insiders-2026-09-03": "ackman-uber-stake",
  // 2026-09-11: the three Stock Ideas. Covers matched to the subject: Gates is
  // the buyer behind Cascade; the Uber signage goes on the Uber filing story;
  // the three-executives-over-a-trading-floor frame carries the GameStop
  // director cluster (no GameStop image exists in the library).
  "stock-idea-rsg-2026-09-11": "gates-four-seasons-msft",
  "editorial-uber-ceo-10m-buy-2026-09-12": "uber-ceo-dara-khosrowshahi",
  "stock-idea-gme-2026-09-11": "vimeo-insider-buys",
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
  // 2026-09-08: the viral "Jensen Huang's stock calls" nuclear list (Oklo /
  // Bloom / Energy Fuels). Client: "use thumbnail of jensen we have already".
  // Fourth slug on this file; without the pin the story has no NVDA ticker
  // and would hash-pick an unrelated portrait.
  "editorial-jensen-huang-nuclear-stock-list-oklo-bloom-2026-09-08": "jensen-huang-2026",
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

  // 2026-09-03 stock ideas. Klarna, DICK'S and Somnigroup have no likeness in
  // the library, so each takes the closest thing the neutral investor pool
  // offers to its actual subject: a founder buying his own stock, a value
  // buyer stepping into a sold-off name, and a long-horizon holder adding to a
  // position. Pinned rather than left to the keyword rule so the cover on the
  // card and the cover on the article page can never drift apart.
  "stock-idea-klar-2026-09-03": "billionaires-super-stocks",
  "stock-idea-dks-2026-09-03": "buffett-40pct-stock",
  "stock-idea-sgi-2026-09-03": "buffett-annual-letter",
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

/**
 * The slug that owns each pinned cover, keyed by the URL `candidatesForClaim`
 * returns. A pin means "this file belongs to that article" — so on the home
 * page a card that merely keyword-matches must never take it. Without this the
 * dedupe was first-come-first-served by render order, and Latest News handed
 * the Burry portrait to a generic daily briefing while the actual Burry story
 * two blocks down fell through to a Buffett cover.
 */
export const PIN_OWNER: Record<string, string[]> = Object.entries(SLUG_OVERRIDES).reduce(
  (acc, [slug, file]) => {
    // A cover can be pinned to more than one article (ackman-uber-stake is on
    // both the Uber story and the older Ackman letter). Keep every owner —
    // collapsing to one silently locked the newer article out of its own pin.
    (acc[url(file)] ||= []).push(slug);
    return acc;
  },
  {} as Record<string, string[]>,
);

/**
 * Candidate cover URLs for one article, best match first, for the home-page
 * registry to claim from (HomeThumbRegistry). Same matching as
 * pickEditorialThumb — pin, then ticker, then keyword, then the neutral pool —
 * but it hands back the whole ordered list instead of choosing, because only
 * the registry knows what the rest of the page has already taken.
 */
export function candidatesForClaim(opts: ThumbInput): string[] {
  const cands = candidatesFor(opts);
  // The pin is honoured first, then its own non-pinned matches as fallbacks,
  // so a pinned cover already used elsewhere still lands on a topical image
  // rather than dropping to the generic pool.
  const extra = cands.length === 1 && SLUG_OVERRIDES[(opts.seed || "").toLowerCase()]
    ? candidatesFor(opts, true)
    : [];
  // Home cards must ALWAYS land on an editorial thumb (George 2026-09-03: "koi
  // new ya extra na hoon"), so an article that matched nothing still gets the
  // library rather than falling through to the curated stock set.
  const floor = cands.length || extra.length ? [] : [...MATCHABLE, ...GENERIC_POOL];
  const seen = new Set<string>();
  return [...cands, ...extra, ...floor]
    .filter((t) => (seen.has(t.file) ? false : (seen.add(t.file), true)))
    .map((t) => url(t.file));
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
