"use client";
import { useState } from "react";

// Top tickers → website domain override. Clearbit looks up by domain,
// not ticker, so a small curated map handles the noisy ones.
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
  DJT: "tmtgcorp.com",
  ULTA: "ulta.com",
  LULU: "lululemon.com",
  WBA: "walgreensbootsalliance.com",
  CVS: "cvshealth.com",
  NKE: "nike.com",
  KGC: "kinross.com",
  AEM: "agnicoeagle.com",
  PAAS: "panamericansilver.com",
  WPM: "wheatonpm.com",
  FNV: "franco-nevada.com",
  NFLX: "netflix.com",
  UBER: "uber.com",
  COP: "conocophillips.com",
  OXY: "oxy.com",
  KHC: "kraftheinzcompany.com",
};

function inferDomain(ticker: string | null, name?: string): string | null {
  if (ticker && TICKER_DOMAIN[ticker.toUpperCase()]) {
    return TICKER_DOMAIN[ticker.toUpperCase()];
  }
  if (!name) return null;
  // crude: lowercase, strip Inc/Corp/Co/LLC etc, first word + .com
  const cleaned = name
    .toLowerCase()
    .replace(/[,.]/g, "")
    .replace(
      /\b(inc|incorporated|corp|corporation|co|company|llc|ltd|limited|lp|plc|sa|ag|nv|bv)\b/g,
      "",
    )
    .trim()
    .split(/\s+/);
  const first = cleaned[0];
  if (!first || first.length < 3) return null;
  return `${first}.com`;
}

interface Props {
  ticker?: string | null;
  name?: string;
  size?: number; // pixel size, defaults 28
  className?: string;
}

export function CompanyLogo({ ticker, name, size = 28, className = "" }: Props) {
  const [failed, setFailed] = useState(false);
  const domain = inferDomain(ticker || null, name);
  const initials = (ticker || name || "?").slice(0, 2).toUpperCase();
  const hue =
    Array.from(ticker || name || "?").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0) %
    360;

  if (!domain || failed) {
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
      src={`https://logo.clearbit.com/${domain}`}
      alt={ticker || name || ""}
      width={size}
      height={size}
      onError={() => setFailed(true)}
      className={`flex-shrink-0 ${className}`}
      style={{ width: size, height: size, borderRadius: 6, objectFit: "contain", background: "var(--bg-2)" }}
      loading="lazy"
    />
  );
}
