"use client";

/* eslint-disable @next/next/no-img-element */

interface Props {
  size?: "sm" | "md" | "lg";
  className?: string;
  /** `theme` swaps dark/light wordmark with the site theme; `light` forces the
   *  white-text wordmark (for dark headers/footers regardless of theme). */
  tone?: "theme" | "light";
}

const HEIGHTS = { sm: 34, md: 46, lg: 72 } as const;

/** Official stacked "INSIDER BUYING" wordmark (client-supplied PNGs, served
 *  as trimmed transparent versions in /public). */
export function Logo({ size = "md", className = "", tone = "theme" }: Props) {
  const h = HEIGHTS[size];
  if (tone === "light") {
    return (
      <img
        src="/logo-wordmark-light-text.png"
        alt="Insider Buying"
        style={{ height: h, width: "auto" }}
        className={`select-none ${className}`}
      />
    );
  }
  return (
    <span className={`inline-flex select-none ${className}`} aria-label="Insider Buying">
      <img
        src="/logo-wordmark-dark-text.png"
        alt="Insider Buying"
        style={{ height: h, width: "auto" }}
        className="logo-when-light"
      />
      <img
        src="/logo-wordmark-light-text.png"
        alt=""
        aria-hidden
        style={{ height: h, width: "auto" }}
        className="logo-when-dark"
      />
    </span>
  );
}
