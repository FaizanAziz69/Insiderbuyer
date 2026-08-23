"use client";
import { useState, useEffect, useRef } from "react";

interface Props {
  ticker?: string | null;
  name?: string;
  size?: number; // pixel size, defaults 28
  className?: string;
}

// Logo sources, tried in order — both served through OUR nginx (/ext-logo/*),
// which mirrors the keyless FMP and EODHD CDNs with a 30-day shared cache.
// Same-origin + HTTP/2 means no extra DNS/TLS per logo and no repeat fetches
// across visitors; only after every source 404s do we fall back to initials.
const LOGO_SOURCES: ((sym: string) => string)[] = [
  (s) => `/ext-logo/fmp/${encodeURIComponent(s)}.png`,
  // EODHD fills FMP's gaps (e.g. LAES) and vice versa.
  (s) => `/ext-logo/eodhd/${encodeURIComponent(s)}.png`,
];

/**
 * Chip background a given logo needs, remembered per symbol across mounts so
 * the sampling below runs once rather than on every tile render.
 */
const chipTone = new Map<string, "light" | "dark">();

/**
 * Decide which backdrop a logo needs by looking at the pixels.
 *
 * Some providers ship logos drawn in WHITE on a transparent background —
 * meant for dark UIs. Measured across the twenty largest US listings: sixteen
 * are dark or coloured marks on transparency, one is fully opaque, and three
 * (V, ABBV, UNH) are pure white. Those three rendered as blank chips on the
 * heat map, because the image loads fine — there is no 404 to catch — and then
 * paints white on white.
 *
 * So the backdrop cannot be a constant: white breaks those three, dark breaks
 * the other sixteen. Sample instead. A fully opaque logo carries its own
 * background and is left alone; only a transparent one whose visible ink is
 * near-white gets the dark chip.
 *
 * Returns null when the pixels cannot be read (canvas tainted, decode failed),
 * so the caller keeps the light default rather than guessing.
 */
function detectTone(img: HTMLImageElement): "light" | "dark" | null {
  try {
    const N = 16; // plenty to judge ink colour, and cheap enough for 250 tiles
    const canvas = document.createElement("canvas");
    canvas.width = N;
    canvas.height = N;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, N, N);
    const { data } = ctx.getImageData(0, 0, N, N);

    let opaque = 0;
    let brightness = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] <= 16) continue; // effectively transparent
      opaque++;
      brightness += (data[i] + data[i + 1] + data[i + 2]) / 3;
    }
    if (!opaque) return null; // nothing visible; leave the default alone
    const total = N * N;
    if (opaque / total > 0.95) return "light"; // opaque: brings its own backdrop
    return brightness / opaque > 235 ? "dark" : "light";
  } catch {
    return null; // cross-origin refusal — not worth breaking the logo over
  }
}

/**
 * Company logo, keyed by ticker. Tries several keyless logo CDNs before
 * falling back to an initials chip, so gaps in any single provider don't leave
 * placeholder tiles on the heatmap.
 */
export function CompanyLogo({ ticker, name, size = 28, className = "" }: Props) {
  const sym = (ticker || "").toUpperCase().trim();
  const [srcIdx, setSrcIdx] = useState(0);
  const [tone, setTone] = useState<"light" | "dark">(() => chipTone.get(sym) ?? "light");
  const imgRef = useRef<HTMLImageElement | null>(null);

  // A new ticker gets a fresh chance to load through all sources.
  useEffect(() => {
    setSrcIdx(0);
    setTone(chipTone.get(sym) ?? "light");
  }, [sym]);

  const initials = (ticker || name || "?").slice(0, 2).toUpperCase();
  const hue =
    Array.from(ticker || name || "?").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) %
    360;

  // No ticker, or every logo source 404'd → initials chip.
  if (!sym || srcIdx >= LOGO_SOURCES.length) {
    return (
      <span
        className={`inline-flex items-center justify-center font-bold flex-shrink-0 ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: 6,
          background: `hsl(${hue}, 65%, 88%)`,
          color: `hsl(${hue}, 65%, 30%)`,
          fontSize: Math.max(9, Math.round(size * 0.4)),
        }}
        aria-label={ticker || name || "logo"}
      >
        {initials}
      </span>
    );
  }
  return (
    <img
      ref={imgRef}
      src={LOGO_SOURCES[srcIdx](sym)}
      alt={ticker || name || ""}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      // Required for the pixel read below; both CDNs answer with
      // `access-control-allow-origin: *`, and detectTone degrades safely if a
      // future one does not.
      crossOrigin="anonymous"
      onLoad={(e) => {
        if (chipTone.has(sym)) return;
        const t = detectTone(e.currentTarget);
        if (!t) return;
        chipTone.set(sym, t);
        setTone(t);
      }}
      onError={() => setSrcIdx((i) => i + 1)}
      className={`flex-shrink-0 ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: 6,
        objectFit: "contain",
        // Slate rather than pure black: a white mark reads clearly against it
        // without the chip turning into a hard square on a pale tile.
        background: tone === "dark" ? "#334155" : "#ffffff",
      }}
      loading="lazy"
    />
  );
}
