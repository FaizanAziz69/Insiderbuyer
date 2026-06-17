"use client";
import { useState } from "react";

/** Curated ticker → website domain map. Clearbit's logo CDN looks up
 *  domains, not tickers, so a small override list handles the noisy ones.
 *  Kept in sync with components/CompanyLogo.tsx — duplicated here so the
 *  overlay has zero dependency on the existing CompanyLogo's <img> wrapper. */
const TICKER_DOMAIN: Record<string, string> = {
  AAPL: "apple.com",
  MSFT: "microsoft.com",
  GOOGL: "abc.xyz",
  GOOG: "abc.xyz",
  AMZN: "amazon.com",
  NVDA: "nvidia.com",
  META: "meta.com",
  TSLA: "tesla.com",
  BRKB: "berkshirehathaway.com",
  "BRK.B": "berkshirehathaway.com",
  JPM: "jpmorganchase.com",
  V: "visa.com",
  MA: "mastercard.com",
  WMT: "walmart.com",
  XOM: "exxonmobil.com",
  CVX: "chevron.com",
  JNJ: "jnj.com",
  PG: "pg.com",
  KO: "coca-cola.com",
  PEP: "pepsico.com",
  COST: "costco.com",
  HD: "homedepot.com",
  ABBV: "abbvie.com",
  PFE: "pfizer.com",
  MRK: "merck.com",
  LLY: "lilly.com",
  AVGO: "broadcom.com",
  CSCO: "cisco.com",
  ORCL: "oracle.com",
  CRM: "salesforce.com",
  ADBE: "adobe.com",
  INTC: "intel.com",
  AMD: "amd.com",
  IBM: "ibm.com",
  PLTR: "palantir.com",
  COIN: "coinbase.com",
  MSTR: "microstrategy.com",
  SMCI: "supermicro.com",
  DELL: "dell.com",
  HPE: "hpe.com",
  CRWD: "crowdstrike.com",
  MRNA: "modernatx.com",
  TGT: "target.com",
  BBY: "bestbuy.com",
  BA: "boeing.com",
  F: "ford.com",
  GM: "gm.com",
  LMT: "lockheedmartin.com",
  RTX: "rtx.com",
  NOC: "northropgrumman.com",
  NEE: "nexteraenergy.com",
  WFC: "wellsfargo.com",
  C: "citigroup.com",
  BAC: "bankofamerica.com",
  GS: "goldmansachs.com",
  BLK: "blackrock.com",
  AXP: "americanexpress.com",
  MCO: "moodys.com",
  NFLX: "netflix.com",
  UBER: "uber.com",
  COP: "conocophillips.com",
  OXY: "oxy.com",
  KHC: "kraftheinzcompany.com",
};

function inferDomain(ticker: string): string | null {
  const t = ticker.toUpperCase().trim();
  if (TICKER_DOMAIN[t]) return TICKER_DOMAIN[t];
  // Skip the heuristic if we don't have a curated mapping — a wrong domain
  // produces an empty Clearbit hit that just shows the initials fallback.
  return null;
}

function BrandTile({
  ticker,
  size,
}: {
  ticker: string;
  size: "sm" | "md" | "lg";
}) {
  const [failed, setFailed] = useState(false);
  const domain = inferDomain(ticker);

  const dims =
    size === "lg" ? { h: 64, fs: 16, pad: "0 22px" } :
    size === "md" ? { h: 54, fs: 14, pad: "0 18px" } :
    { h: 44, fs: 12, pad: "0 14px" };

  // No domain → coloured pill with the ticker text (still readable, on-brand).
  if (!domain || failed) {
    const hue =
      Array.from(ticker).reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) % 360;
    return (
      <span
        className="inline-flex items-center justify-center font-bold flex-shrink-0 rounded-md"
        style={{
          height: dims.h,
          padding: dims.pad,
          fontSize: dims.fs,
          background: `hsl(${hue}, 70%, 92%)`,
          color: `hsl(${hue}, 70%, 28%)`,
          letterSpacing: "-0.01em",
        }}
        aria-label={ticker}
      >
        {ticker}
      </span>
    );
  }
  return (
    <img
      src={`https://logo.clearbit.com/${domain}`}
      alt={ticker}
      onError={() => setFailed(true)}
      className="flex-shrink-0"
      style={{
        height: dims.h,
        width: "auto",
        maxWidth: dims.h * 3.2,
        objectFit: "contain",
      }}
      loading="lazy"
    />
  );
}

interface Props {
  /** Array of ticker symbols to render. Empty / null hides the overlay. */
  tickers?: string[] | null;
  /** Position of the band on the cover. Default 'center'. */
  position?: "center" | "bottom";
  /** Tile sizing — 'lg' for hero covers, 'md' for medium, 'sm' for thumbs. */
  size?: "sm" | "md" | "lg";
}

/** MarketBeat-style frosted-glass band overlaying brand logos on a cover
 *  image. Renders absolutely-positioned inside any parent with
 *  `position: relative`. Hides itself when no tickers are passed. */
export function BrandLogoOverlay({
  tickers,
  position = "center",
  size = "md",
}: Props) {
  if (!tickers || tickers.length === 0) return null;
  const list = tickers.slice(0, 3);
  const gap = size === "lg" ? 24 : size === "md" ? 18 : 12;

  return (
    <div
      className="absolute inset-x-0 z-10 flex items-center justify-center pointer-events-none"
      style={{
        ...(position === "bottom"
          ? { bottom: "12%" }
          : { top: "50%", transform: "translateY(-50%)" }),
      }}
    >
      <div
        className="flex items-center"
        style={{
          gap,
          padding:
            size === "lg" ? "16px 28px" : size === "md" ? "12px 22px" : "8px 14px",
          background: "rgba(255, 255, 255, 0.82)",
          backdropFilter: "blur(8px) saturate(1.1)",
          WebkitBackdropFilter: "blur(8px) saturate(1.1)",
          borderRadius: 8,
          boxShadow:
            "0 8px 28px rgba(0,0,0,0.18), inset 0 0 0 1px rgba(255,255,255,0.6)",
        }}
      >
        {list.map((t) => (
          <BrandTile key={t} ticker={t} size={size} />
        ))}
      </div>
    </div>
  );
}
