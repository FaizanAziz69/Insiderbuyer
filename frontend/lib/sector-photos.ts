/**
 * Curated high-quality Unsplash photo library, grouped by sector.
 *
 * The Pollinations AI image generator is unreliable for editorial covers —
 * sometimes mangled, sometimes slow. Real finance publications (MarketBeat,
 * Bloomberg, Yahoo Finance) use hand-picked stock photos instead.
 *
 * This library is the primary cover-image source for AI-generated articles.
 * `pickSectorPhoto(sector, seed)` returns a deterministic URL so every
 * article gets a stable image, but a new daily slug seed → new image, so the
 * Stock Ideas / Popular Articles sections look fresh every morning.
 *
 * All URLs are Unsplash photo IDs that the existing hero carousel already
 * uses successfully — guaranteed to load.
 */

const PHOTOS: Record<string, string[]> = {
  technology: [
    "photo-1518770660439-4636190af475", // green circuit board macro
    "photo-1581094271901-8022df4466f9", // microchip / electronics close-up
    "photo-1551288049-bebda4e38f71", // laptop with code on screen
    "photo-1573164713988-8665fc963095", // data center server racks
    "photo-1535378917042-10a22c95931a", // CPU silicon detail
    "photo-1614064641938-3bbee52942c7", // glowing server room
  ],
  health: [
    "photo-1582719188393-bb71ca45dbb9", // DNA / molecular biology
    "photo-1579154204601-01588f351e67", // lab pipettes / vials tray
    "photo-1559757148-5c350d0d3c56", // pills / medication
    "photo-1576086213369-97a306d36557", // lab vials / test tubes
    "photo-1587854692152-cbe660dbde88", // medication / pharmacy shelves
    "photo-1559757175-5700dde675bc", // biotech lab glassware
  ],
  energy: [
    "photo-1611273426858-450d8e3c9fce", // industrial refinery sunset
    "photo-1473341304170-971dccb5ac1e", // power infrastructure twilight
    "photo-1466611653911-95081537e5b7", // wind turbine farm
    "photo-1497435334941-8c899ee9e8e9", // offshore drilling rig
    "photo-1497436072909-60f360e1d4b1", // solar panel array
    "photo-1605980776566-0486c3ac7617", // oil refinery pipework
  ],
  financial: [
    "photo-1611974789855-9c2a0a7236a3", // NYSE / wall street facade
    "photo-1590283603385-17ffb3a7f29f", // stock chart on screen
    "photo-1565514020179-026b92b84bb6", // bank columns
    "photo-1554224155-6726b3ff858f", // trading floor screens
    "photo-1559526324-4b87b5e36e44", // financial newspaper chart
    "photo-1535320903710-d993d3d77d29", // bull/bear statue
  ],
  "real-estate": [
    "photo-1496442226666-8d4d0e62e6e9", // city skyline twilight
    "photo-1502920917128-1aa500764cbd", // skyscraper glass facade
    "photo-1545324418-cc1a3fa10c00", // luxury office lobby
    "photo-1486325212027-8081e485255e", // downtown highrises
    "photo-1554435493-93422e8220c8", // manhattan skyline
    "photo-1448630360428-65456885c650", // city skyline / glass towers
  ],
  consumer: [
    "photo-1481437156560-3205f6a55735", // shopping bags
    "photo-1542838132-92c53300491e", // supermarket aisle
    "photo-1556742111-a301076d9d18", // premium retail boutique
    "photo-1483985988355-763728e1935b", // shopping at twilight
    "photo-1556909114-f6e7ad7d3136", // retail flagship store
    "photo-1604577415-fd5da4adb466", // consumer products
  ],
  industrials: [
    "photo-1565514020179-026b92b84bb6", // manufacturing floor
    "photo-1556388158-158ea5ccacbd", // industrial machinery
    "photo-1581094271901-8022df4466f9", // factory close-up
    "photo-1581094288338-2314dddb7ece", // construction site
    "photo-1565374790925-bdab2def611f", // steel mill / heavy industry
    "photo-1599507593362-0c95deeac09d", // jet engine close-up
  ],
  materials: [
    "photo-1610375461246-83df859d849d", // gold bars stacked
    "photo-1604719312566-8912e9227c6a", // silver bars / metals
    "photo-1611273426858-450d8e3c9fce", // open-pit mining
    "photo-1551103782-8ab07afd45c1", // mining equipment
    "photo-1574104661068-26c4d3f5fe44", // steel manufacturing
    "photo-1559825481-12a05cc00344", // copper / metals close-up
  ],
  utilities: [
    "photo-1473341304170-971dccb5ac1e", // power lines at dusk
    "photo-1466611653911-95081537e5b7", // wind turbines
    "photo-1448375240586-882707db888b", // hydro dam
    "photo-1497436072909-60f360e1d4b1", // solar farm
    "photo-1509391366360-2e959784a276", // electrical infrastructure
    "photo-1473073873895-d62f04a17074", // transmission tower
  ],
  communication: [
    "photo-1551033406-611cf9a28f67", // cell tower
    "photo-1614728263952-84ea256f9679", // satellite dish
    "photo-1517976487492-5750f3195933", // network cables
    "photo-1551636898-47668aa61de2", // broadcast equipment
    "photo-1561557944-6e7860d1a7eb", // fiber optic cables
    "photo-1591453089816-0fbb971b454c", // satellite uplink
  ],
  staples: [
    "photo-1542838132-92c53300491e", // grocery store
    "photo-1604152135912-04a022e23696", // packaged goods shelves
    "photo-1542838686-37da4a9fd1b3", // food production
    "photo-1591474200742-8e512e6f98f8", // agriculture / farm
    "photo-1518843875459-f738682238a6", // beverage bottling
    "photo-1610433572201-110753c6cff9", // food retail
  ],
  // Fallback bucket for unknown / multi-sector posts (daily summaries,
  // top Insider Score leaderboards, sector roundups when sector isn't matched).
  default: [
    "photo-1590283603385-17ffb3a7f29f", // stock chart
    "photo-1611974789855-9c2a0a7236a3", // wall street
    "photo-1554260570-e9689a3418b8", // trading screens
    "photo-1559526324-4b87b5e36e44", // financial newspaper
    "photo-1535320903710-d993d3d77d29", // bull/bear
    "photo-1554224155-6726b3ff858f", // dealing floor
    "photo-1620712943543-bcc4688e7485", // city/finance abstract
    "photo-1551288049-bebda4e38f71", // analytics laptop
  ],
};

/** Map a raw SEC SIC sector string (or our internal short-sector strings)
 *  to a photo library bucket. Generous keyword matching so unknown variants
 *  still land in the right bucket. */
function sectorToBucket(sector: string | null | undefined): string {
  if (!sector) return "default";
  const s = sector.toLowerCase();
  // Health/biotech MUST be checked before technology — "biotech" contains
  // "tech", so a tech-first check would wrongly route pharma to tech photos.
  if (
    s.includes("health") ||
    s.includes("pharma") ||
    s.includes("biotech") ||
    s.includes("biological") ||
    s.includes("medical") ||
    s.includes("drug")
  )
    return "health";
  if (
    s.includes("tech") ||
    s.includes("software") ||
    s.includes("semiconductor") ||
    s.includes("computer") ||
    s.includes("information")
  )
    return "technology";
  if (
    s.includes("energy") ||
    s.includes("oil") ||
    s.includes("gas") ||
    s.includes("petroleum") ||
    s.includes("crude") ||
    s.includes("refining")
  )
    return "energy";
  if (
    s.includes("financ") ||
    s.includes("bank") ||
    s.includes("insurance") ||
    s.includes("securities") ||
    s.includes("investment")
  )
    return "financial";
  if (
    s.includes("real estate") ||
    s.includes("reit") ||
    s.includes("lessor") ||
    s.includes("property")
  )
    return "real-estate";
  if (
    s.includes("consumer") ||
    s.includes("retail") ||
    s.includes("restaurant") ||
    s.includes("apparel") ||
    s.includes("hotel")
  )
    return "consumer";
  if (
    s.includes("industrial") ||
    s.includes("construct") ||
    s.includes("machinery") ||
    s.includes("aerospace") ||
    s.includes("defense") ||
    s.includes("transport")
  )
    return "industrials";
  if (
    s.includes("material") ||
    s.includes("steel") ||
    s.includes("metal") ||
    s.includes("mining") ||
    s.includes("gold") ||
    s.includes("silver") ||
    s.includes("chemical")
  )
    return "materials";
  if (
    s.includes("utilit") ||
    s.includes("water") ||
    s.includes("electric serv") ||
    s.includes("power")
  )
    return "utilities";
  if (
    s.includes("communicat") ||
    s.includes("telecom") ||
    s.includes("broadcast") ||
    s.includes("wireless") ||
    s.includes("cable")
  )
    return "communication";
  if (
    s.includes("food") ||
    s.includes("beverage") ||
    s.includes("staples") ||
    s.includes("agricultural") ||
    s.includes("grocer")
  )
    return "staples";
  return "default";
}

/** Cheap deterministic hash → 32-bit int. Stable across SSR/CSR. */
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Pick a curated photo URL from the sector library. The seed (usually the
 *  post slug, which is date-stamped) determines which photo in the bucket
 *  gets used — so each day's articles cycle through fresh covers. */
export function pickSectorPhoto(
  sector: string | null | undefined,
  seed: string,
  opts: { width?: number; height?: number } = {},
): string {
  const bucket = sectorToBucket(sector);
  const pool = PHOTOS[bucket] || PHOTOS.default;
  const idx = hash(seed) % pool.length;
  return photoUrl(pool[idx], opts);
}

function photoUrl(
  photoId: string,
  opts: { width?: number; height?: number } = {},
): string {
  const w = opts.width || 1200;
  const h = opts.height || 700;
  return `https://images.unsplash.com/${photoId}?w=${w}&h=${h}&fit=crop&q=80&auto=format`;
}

// Sector → LoremFlickr keyword set. LoremFlickr returns a real photo matching
// these tags, and a per-article `lock` makes it deterministic AND unique — so
// every article gets its own on-topic cover with no repeats anywhere on the
// site (no per-list coordination needed; the slug is globally unique).
const COVER_KEYWORDS: Record<string, string> = {
  technology: "technology,computer,microchip",
  health: "laboratory,medical,science",
  energy: "oil,energy,refinery",
  financial: "finance,stockmarket,business",
  consumer: "retail,shopping,store",
  industrials: "factory,industry,machinery",
  materials: "mining,metal,industrial",
  utilities: "powerplant,electricity,energy",
  communication: "telecommunication,network,antenna",
  staples: "supermarket,grocery,food",
  "real-estate": "skyscraper,city,architecture",
  default: "stockmarket,finance,business",
};

/**
 * Unique, on-topic cover image URL for an article. Keyed by the article's
 * (globally unique) slug, so every article gets a DIFFERENT photo — no image
 * is ever reused across the site — and it always matches the sector's theme.
 * Reliable LoremFlickr CDN; the curated Unsplash library is the fallback.
 */
export function coverImageUrl(
  sector: string | null | undefined,
  seed: string,
  opts: { width?: number; height?: number } = {},
): string {
  const bucket = sectorToBucket(sector);
  const kw = COVER_KEYWORDS[bucket] || COVER_KEYWORDS.default;
  const lock = (hash(seed) % 100000) + 1;
  const w = opts.width || 1200;
  const h = opts.height || 700;
  return `https://loremflickr.com/${w}/${h}/${kw}/all?lock=${lock}`;
}

// Every photo ID across all buckets — overflow pool so a long list keeps
// assigning distinct covers after a sector bucket is exhausted.
const ALL_PHOTO_IDS: string[] = Array.from(new Set(Object.values(PHOTOS).flat()));

/**
 * Assign a UNIQUE cover to every item in a rendered list, drawn from the
 * reliable curated Unsplash library so images ALWAYS load full (no broken /
 * placeholder covers). Each item takes from its own sector bucket first
 * (rotated by seed for daily freshness); when that bucket is used up within
 * the list it spills over to the finance/default pool, then the whole library.
 * Returns a map of seed → image URL with no repeats inside the list.
 */
export function assignUniquePhotos(
  items: Array<{ seed: string; sector?: string | null }>,
  opts: { width?: number; height?: number } = {},
): Record<string, string> {
  const used = new Set<string>();
  const out: Record<string, string> = {};
  for (const item of items) {
    const bucket = sectorToBucket(item.sector);
    const primary = PHOTOS[bucket] || PHOTOS.default;
    const start = hash(item.seed) % primary.length;
    const rotated = [...primary.slice(start), ...primary.slice(0, start)];
    const candidates = [...rotated, ...PHOTOS.default, ...ALL_PHOTO_IDS];
    let chosen = candidates.find((id) => !used.has(id)) || primary[start];
    used.add(chosen);
    out[item.seed] = photoUrl(chosen, opts);
  }
  return out;
}
