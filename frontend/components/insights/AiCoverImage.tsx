"use client";
import { useEffect, useRef, useState } from "react";
import { BrandLogoOverlay } from "./BrandLogoOverlay";
import { pickSectorPhoto } from "@/lib/sector-photos";

interface Props {
  /** Pollinations AI URL stored on the post — used as a fallback only.
   *  Real finance publications use stock photos, so the curated library is
   *  the primary source. */
  primary: string | null | undefined;
  /** Stable seed for the curated photo picker (usually the post slug — slug
   *  is date-stamped so each day's articles get fresh covers). */
  seed?: string | null;
  /** Explicit deduped cover URL (from assignUniquePhotos) — when set it is
   *  used as the primary curated image so a list never repeats a photo. */
  src?: string | null;
  /** Used to build the Unsplash search fallback query. */
  fallbackQuery?: string | null;
  /** Tags pulled from the post — used to pick a stock photo when nothing else loads. */
  tags?: string[] | null;
  ticker?: string | null;
  sector?: string | null;
  /** 1-3 tickers rendered as a MarketBeat-style frosted-glass brand-logo
   *  band on top of the cover. Off by default; switch on for hero detail
   *  covers where the logos add editorial value. */
  featuredTickers?: string[] | null;
  /** Logo-band sizing — 'lg' for hero detail page, 'md' for medium, 'sm' for thumbs.
   *  Defaults to 'none' — clean sector photos read better as cards. */
  overlay?: "none" | "sm" | "md" | "lg";
  className?: string;
  /** Tailwind aspect-ratio classes don't compose well — use raw style if needed. */
  style?: React.CSSProperties;
  /** Loaded-priority hint forwarded to <img>. */
  loading?: "eager" | "lazy";
  alt?: string;
}

/** Sector → concrete photographic search terms. Every entry blends a
 *  business-specific noun with a stock/finance noun so the fallback Unsplash
 *  photo always reads as "investing publication", not generic stock photo. */
const FALLBACK_KEYWORDS: Record<string, string[]> = {
  technology: [
    "semiconductor,microchip,stock-chart",
    "data-center,servers,trading",
    "silicon-wafer,wall-street",
  ],
  health: [
    "biotech-lab,stock-chart",
    "pharmaceutical,investing,vial",
    "hospital,wall-street",
  ],
  energy: [
    "oil-rig,sunrise,trading",
    "refinery,stock-market",
    "wind-turbine,investing",
  ],
  financial: [
    "wall-street,trading-floor",
    "bank-tower,stock-chart",
    "bloomberg-terminal,investing",
  ],
  consumer: [
    "retail-store,shopping,stock-chart",
    "luxury-boutique,investing",
    "supermarket,wall-street",
  ],
  industrials: [
    "factory,jet-engine,investing",
    "manufacturing,robot,stock-market",
    "port,logistics,wall-street",
  ],
  materials: [
    "open-pit-mine,sunrise,stock-chart",
    "steel-mill,investing",
    "copper,gold-bars,wall-street",
  ],
  utilities: [
    "power-grid,transmission,investing",
    "hydro-dam,stock-market",
    "electricity,wall-street",
  ],
  "real estate": [
    "manhattan-skyline,investing",
    "skyscraper-glass,wall-street",
    "city-twilight,stock-chart",
  ],
  communication: [
    "broadcast-tower,wall-street",
    "fiber-optic,investing",
    "satellite,stock-chart",
  ],
};

const DEFAULT_FINANCE_QUERIES = [
  "wall-street,stock-chart,investing",
  "trading-floor,bull-market,finance",
  "manhattan-skyline,stock-market,golden-hour",
  "stock-ticker,investing,bloomberg",
];

function pickKeyword(
  tags?: string[] | null,
  sector?: string | null,
  ticker?: string | null,
): string {
  if (sector) {
    const key = sector.toLowerCase();
    for (const k of Object.keys(FALLBACK_KEYWORDS)) {
      if (key.includes(k)) {
        const pool = FALLBACK_KEYWORDS[k];
        // Use ticker hash to keep the fallback stable per article.
        const idx = ticker
          ? ticker.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
          : tags?.length || 0;
        return pool[Math.abs(idx) % pool.length];
      }
    }
  }
  if (tags && tags.length > 0) {
    const direct = tags.find((t) => FALLBACK_KEYWORDS[t]);
    if (direct) {
      const pool = FALLBACK_KEYWORDS[direct];
      return pool[0];
    }
    // Tag-based query — always pair with finance terms so it never lands on
    // a generic unrelated photo.
    return `${tags[0].replace(/[^a-z0-9-]+/gi, "-")},stock-chart,investing`;
  }
  const idx = ticker
    ? ticker.split("").reduce((h, c) => (h * 31 + c.charCodeAt(0)) | 0, 0)
    : 0;
  return DEFAULT_FINANCE_QUERIES[Math.abs(idx) % DEFAULT_FINANCE_QUERIES.length];
}

function unsplashUrl(query: string, w = 1200, h = 630): string {
  // source.unsplash.com is deprecated; use the images.unsplash.com static
  // featured-collection endpoint, which redirects to a real curated photo
  // matched against the comma-separated query terms.
  return `https://source.unsplash.com/featured/${w}x${h}/?${encodeURIComponent(query)}`;
}

/** Cover image with a graceful fallback chain:
 *   0. Curated sector photo from the local library (primary — always loads)
 *   1. Pollinations AI URL stored on the post (fallback)
 *   2. Unsplash search by keyword (fallback)
 *   3. Inline SVG placeholder (last resort)
 *
 * Each step swaps on an <img> error event, so flaky image servers never
 * leave the user with a broken-image icon. */
export function AiCoverImage({
  primary,
  seed,
  src: srcOverride,
  fallbackQuery,
  tags,
  ticker,
  sector,
  featuredTickers,
  overlay = "none",
  className,
  style,
  loading = "lazy",
  alt = "",
}: Props) {
  const key = seed || ticker || "default";
  // Primary = the reliable curated Unsplash photo (always loads full). An
  // explicit deduped src (assignUniquePhotos) wins so lists never repeat.
  const curated = srcOverride || pickSectorPhoto(sector, key);
  // Fallbacks stay INSIDE the curated library so a cover is ALWAYS a
  // finance/business photo — never a random Flickr/Unsplash result that could
  // be a person. Stage 1 = another photo from the same sector bucket; stage 2
  // = the default finance bucket; stage 3 = on-brand SVG.
  const curatedAlt = pickSectorPhoto(sector, `${key}~alt`);
  const curatedDefault = pickSectorPhoto(null, `${key}~def`);

  // Stages: 0 = curated, 1 = alt curated, 2 = default-bucket curated, 3 = SVG.
  // Almost always stays on stage 0.
  const [stage, setStage] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  // Reset whenever the underlying article changes.
  useEffect(() => {
    setStage(0);
    setLoaded(false);
  }, [primary, seed, srcOverride]);

  // Cached/eager images can finish loading before React attaches onLoad — the
  // event never fires and the image would stay stuck at opacity 0. Check
  // `complete` on mount and after each src change to catch that case.
  useEffect(() => {
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true);
    }
  });

  let src: string;
  if (stage === 0) {
    src = curated;
  } else if (stage === 1) {
    src = curatedAlt;
  } else if (stage === 2) {
    src = curatedDefault;
  } else {
    src = placeholderSvg(ticker || key);
  }

  return (
    <div
      className={className}
      style={{
        position: "relative",
        overflow: "hidden",
        background: "var(--bg-3)",
        ...style,
      }}
    >
      {/* Shimmer underlay while the chosen src is still loading. */}
      {!loaded && stage < 3 && (
        <div
          className="absolute inset-0 shimmer"
          aria-hidden
          style={{ borderRadius: "inherit" }}
        />
      )}
      <img
        key={`${stage}-${src}`}
        ref={imgRef}
        src={src}
        alt={alt}
        loading={loading}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={() => {
          if (stage < 3) setStage((s) => s + 1);
        }}
        className="absolute inset-0 w-full h-full object-cover transition-opacity duration-500"
        style={{ opacity: loaded ? 1 : 0 }}
      />
      {/* Subtle vignette so logos always read against any background. */}
      {overlay !== "none" && (featuredTickers?.length || ticker) && (
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              "linear-gradient(135deg, rgba(0,0,0,0.06) 0%, rgba(0,0,0,0.18) 60%, rgba(0,0,0,0.34) 100%)",
          }}
          aria-hidden
        />
      )}
      {overlay !== "none" && (
        <BrandLogoOverlay
          tickers={
            featuredTickers && featuredTickers.length > 0
              ? featuredTickers
              : ticker
                ? [ticker]
                : null
          }
          size={overlay}
          position="center"
        />
      )}
    </div>
  );
}

/** Tiny inline SVG that gets used when both the AI URL and Unsplash 404. */
function placeholderSvg(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  // On-brand navy→blue gradient (never red). Slug only nudges the hue within
  // the blue band so the rare placeholder still looks like the site.
  const hue = 205 + (Math.abs(h) % 25); // 205–230 = navy/blue only
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="hsl(${hue},55%,22%)"/><stop offset="1" stop-color="hsl(${hue + 8},60%,10%)"/></linearGradient></defs><rect width="1200" height="630" fill="url(#g)"/><g stroke="rgba(255,255,255,0.30)" stroke-width="4" fill="none"><polyline points="80,500 220,420 360,460 500,340 640,380 780,260 920,300 1080,180"/></g></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
