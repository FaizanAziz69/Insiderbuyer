/**
 * Build a Pollinations AI image-generation URL from an art-direction prompt.
 *
 * Pollinations serves a free, key-less image-gen endpoint that returns a
 * jpeg/png from a text prompt. We append financial-publication styling so
 * every cover image fits the site visually, then let Pollinations cache the
 * result via the seed.
 *
 * The prompt is intentionally kept opinionated — "no text in image" because
 * generated text in raster images is always mangled, and "minimal" to avoid
 * over-busy backgrounds behind our headlines.
 */
/**
 * Build a Pollinations AI image-generation URL from a finance art-direction
 * prompt. Every cover image gets the same "Wall Street editorial" treatment
 * so the site reads as a coherent financial publication.
 *
 * IMPORTANT — Pollinations renders text badly, so we always forbid words in
 * the image. The visual layer is purely scene + composition; the headline
 * sits over it in the layout, not inside the image.
 */
/**
 * AI-image provider configuration — swap providers via env, no code changes.
 *
 *   AI_IMAGE_ENDPOINT — base URL of the image-generation service. The styled
 *     prompt is appended URL-encoded, so any GET-style "prompt in the path"
 *     API works. Defaults to Pollinations (free, key-less).
 *   AI_IMAGE_API_KEY  — appended as an `apikey` query param when set.
 *     // TODO: paste your paid AI-image API key/endpoint (hosted Flux, DALL·E
 *     // proxy, etc.) into .env to upgrade thumbnail quality site-wide.
 */
const AI_IMAGE_ENDPOINT =
  process.env.AI_IMAGE_ENDPOINT || 'https://image.pollinations.ai/prompt';
const AI_IMAGE_API_KEY = process.env.AI_IMAGE_API_KEY || '';

export function buildAiImageUrl(
  prompt: string,
  opts: {
    seed?: string | number;
    width?: number;
    height?: number;
    /** Optional ticker / company hint — gets folded into the scene
     *  (e.g. "Tesla EV factory floor", "NVIDIA data-center server rack"). */
    ticker?: string | null;
    sector?: string | null;
  } = {},
): string {
  const sectorHint = sectorScene(opts.sector);
  const tickerHint = opts.ticker ? `${opts.ticker} corporate visual identity, ` : '';
  const styled =
    `Cinematic photo-realistic editorial photograph for a Wall Street finance publication. ` +
    `${tickerHint}${sectorHint}` +
    `Scene: ${prompt}. ` +
    'Visual style: shot on a 35mm cinema camera, depth of field, golden-hour lighting, ' +
    'rich navy + gold + warm-grey palette, glossy glass towers, real-world textures, ' +
    'hint of bull-market energy (rising bar-chart shapes, upward-pointing arrows formed by light, ' +
    'or a tickertape-style motion blur in the background). ' +
    'Mood: confident, professional, premium Bloomberg-meets-Forbes magazine cover. ' +
    'STRICT RULES: photo-realistic (NOT illustration, NOT cartoon, NOT 3D render), ' +
    'NO TEXT anywhere, NO WORDS, NO LETTERS, NO NUMBERS, NO LOGOS, NO BRAND MARKS, ' +
    'NO WATERMARKS. Centred subject, generous negative space at the top for an overlaid headline, ' +
    '16:9 wide framing.';
  const seed =
    typeof opts.seed === 'number'
      ? String(opts.seed)
      : (opts.seed ?? '0').toString().split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0);
  const w = opts.width || 1200;
  const h = opts.height || 630;
  const params = new URLSearchParams({
    width: String(w),
    height: String(h),
    nologo: 'true',
    enhance: 'true',
    model: 'flux',
    seed: String(Math.abs(Number(seed) || 0)),
  });
  if (AI_IMAGE_API_KEY) params.set('apikey', AI_IMAGE_API_KEY);
  return `${AI_IMAGE_ENDPOINT.replace(/\/$/, '')}/${encodeURIComponent(styled)}?${params.toString()}`;
}

/** Map a sector to a concrete photographic scene so the image always looks
 *  like it belongs to the company's actual business — not a generic finance
 *  stock photo. */
function sectorScene(sector: string | null | undefined): string {
  if (!sector) return '';
  const s = sector.toLowerCase();
  if (s.includes('tech') || s.includes('communication'))
    return 'Setting: ultra-modern data center, server racks glowing with blue and gold light, GPU silicon close-ups, fiber-optic light trails. ';
  if (s.includes('health') || s.includes('biotech') || s.includes('pharma'))
    return 'Setting: gleaming biotech laboratory, scientist hand holding a glass vial, pharmaceutical clean-room, modern hospital atrium. ';
  if (s.includes('energy') || s.includes('oil') || s.includes('gas'))
    return 'Setting: oil refinery pipework at golden hour, offshore drilling rig silhouette, solar-array geometry, energy-grid steel towers. ';
  if (s.includes('financ') || s.includes('bank') || s.includes('insurance'))
    return "Setting: New York Wall Street trading floor, glass skyscrapers, marble bank columns, dealing-room screens reflected in a banker's desk. ";
  if (s.includes('real estate') || s.includes('reit'))
    return 'Setting: aerial twilight skyline of Manhattan / Chicago, glass skyscraper facade, luxury office lobby, downtown city street. ';
  if (s.includes('consumer') || s.includes('retail'))
    return 'Setting: bustling premium retail flagship store at twilight, modern boutique window, consumer goods aesthetically arranged, shopping district at golden hour. ';
  if (s.includes('industrial') || s.includes('construct') || s.includes('aerospace'))
    return 'Setting: massive aerospace factory floor with a jet engine in focus, precision-machined gears, robotic assembly line, port logistics yard. ';
  if (s.includes('material') || s.includes('mining') || s.includes('steel'))
    return 'Setting: open-pit copper mine at sunrise, molten-steel pour at a foundry, raw mineral close-up, heavy-industry conveyor system. ';
  if (s.includes('utilit'))
    return 'Setting: high-voltage transmission towers against an orange sky, hydroelectric dam, wind-turbine field at dawn, power-grid control room. ';
  if (s.includes('staples') || s.includes('food') || s.includes('beverage'))
    return 'Setting: premium beverage bottling line, supermarket shelves stocked at twilight, agricultural fields drone shot, packaged-goods studio shot. ';
  return 'Setting: New York financial district at golden hour, glass-tower facade, ticker-tape motion blur, brass and marble lobby textures. ';
}
