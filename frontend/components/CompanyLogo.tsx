"use client";
import { useState, useEffect } from "react";

interface Props {
  ticker?: string | null;
  name?: string;
  size?: number; // pixel size, defaults 28
  className?: string;
}

// Keyless public logo CDNs, tried in order. FMP covers most US listings; the
// others fill gaps (class shares, smaller/foreign names FMP is missing). Only
// after every source 404s do we fall back to an initials chip.
const LOGO_SOURCES: ((sym: string) => string)[] = [
  (s) => `https://financialmodelingprep.com/image-stock/${encodeURIComponent(s)}.png`,
  // EODHD fills FMP's gaps (e.g. LAES) and vice versa — both are keyless.
  (s) => `https://eodhd.com/img/logos/US/${encodeURIComponent(s)}.png`,
];

/**
 * Company logo, keyed by ticker. Tries several keyless logo CDNs before
 * falling back to an initials chip, so gaps in any single provider don't leave
 * placeholder tiles on the heatmap.
 */
export function CompanyLogo({ ticker, name, size = 28, className = "" }: Props) {
  const sym = (ticker || "").toUpperCase().trim();
  const [srcIdx, setSrcIdx] = useState(0);

  // A new ticker gets a fresh chance to load through all sources.
  useEffect(() => setSrcIdx(0), [sym]);

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
      src={LOGO_SOURCES[srcIdx](sym)}
      alt={ticker || name || ""}
      width={size}
      height={size}
      onError={() => setSrcIdx((i) => i + 1)}
      className={`flex-shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: 6, objectFit: "contain", background: "#ffffff" }}
      loading="lazy"
    />
  );
}
