"use client";
import { useState, useEffect } from "react";

interface Props {
  ticker?: string | null;
  name?: string;
  size?: number; // pixel size, defaults 28
  className?: string;
}

/**
 * Company logo, keyed by ticker. Uses Financial Modeling Prep's public logo
 * CDN (real PNG logos for essentially every US-listed ticker, no API key on
 * the image path). Falls back to an initials chip only when there's no ticker
 * or the image genuinely 404s. (The old Clearbit domain API was shut down.)
 */
export function CompanyLogo({ ticker, name, size = 28, className = "" }: Props) {
  const sym = (ticker || "").toUpperCase().trim();
  const [failed, setFailed] = useState(false);

  // A new ticker gets a fresh chance to load (reused component instances).
  useEffect(() => setFailed(false), [sym]);

  const initials = (ticker || name || "?").slice(0, 2).toUpperCase();
  const hue =
    Array.from(ticker || name || "?").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) %
    360;

  if (!sym || failed) {
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
      src={`https://financialmodelingprep.com/image-stock/${encodeURIComponent(sym)}.png`}
      alt={ticker || name || ""}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`flex-shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: 6, objectFit: "contain", background: "#ffffff" }}
      loading="lazy"
    />
  );
}
