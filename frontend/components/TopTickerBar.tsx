"use client";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, fetcher } from "@/lib/api";

interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

// Markets to float across the top: major indices, commodities, then famous
// large-cap stocks. `label` is what shows; `href` (stocks only) links to the
// company page. Order is preserved.
// Exactly the requested markets, in order: indices, commodities, Bitcoin,
// Nvidia, and SpaceX. `privateNote` marks a private company (no live quote).
const ITEMS: {
  symbol: string;
  label: string;
  href?: string;
  privateNote?: string; // marks a private company (no live quote)
  valuation?: string; // static private-market valuation to display
}[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "SI=F", label: "Silver" },
  { symbol: "CL=F", label: "Oil" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  { symbol: "NVDA", label: "Nvidia", href: "/companies/NVDA" },
  // SpaceX is privately held (no live quote) — show its latest private-market
  // valuation. ~$1T per Forge secondary pricing (Apr 2026); edit as it moves.
  { symbol: "SPACEX", label: "SpaceX", privateNote: "Private", valuation: "~$1T" },
];

// Only real, quotable symbols are fetched (SpaceX is private → static).
const SYMBOLS = ITEMS.filter((i) => !i.privateNote).map((i) => i.symbol);

/**
 * Slim horizontal market-data marquee pinned at the top of the page. Shows LIVE
 * quotes for the major indices, commodities, and famous stocks. Scrolls
 * right→left via a pure-CSS animation; hover pauses.
 */
export function TopTickerBar() {
  const { data } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(SYMBOLS.join(","))}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const bySymbol = new Map<string, MoverRow>();
  for (const r of data?.rows || []) {
    if (r?.symbol && typeof r.price === "number") bySymbol.set(r.symbol, r);
  }
  // Preserve curated order: any private entries always show; the rest
  // (SpaceX included) only when a real live quote is available.
  const items = ITEMS.map((it) => ({ ...it, q: bySymbol.get(it.symbol) })).filter(
    (it) => it.privateNote || it.q,
  );

  if (items.length === 0) return null;

  const doubled = [...items, ...items];

  return (
    <div
      className="w-full overflow-hidden border-b"
      style={{
        background: "var(--brand-surface)",
        borderColor: "var(--brand-surface-border)",
        color: "#fff",
      }}
    >
      <div className="ticker-track flex items-center gap-7 py-3 whitespace-nowrap">
        {doubled.map((it, i) => {
          const q = it.q;
          const up = q ? q.changePct >= 0 : true;
          const inner = it.privateNote ? (
            <>
              <span className="font-bold uppercase tracking-wider text-[14px]">
                {it.label}
              </span>
              {it.valuation && (
                <span className="font-mono font-semibold text-[15px]">
                  {it.valuation}
                </span>
              )}
            </>
          ) : q ? (
            <>
              <span className="font-bold uppercase tracking-wider text-[14px]">
                {it.label}
              </span>
              <span className="font-mono font-semibold text-[15px]">
                {q.price.toLocaleString(undefined, {
                  maximumFractionDigits: q.price < 100 ? 2 : 0,
                })}
              </span>
              <span
                className="font-mono font-bold text-[13px]"
                style={{ color: up ? "#1bff8b" : "#ff6b8a" }}
              >
                {up ? "+" : ""}
                {q.changePct.toFixed(2)}%
              </span>
            </>
          ) : null;
          const cls =
            "inline-flex items-center gap-2 flex-shrink-0 tabular hover:opacity-90";
          const style = {
            color: "#fff",
            padding: "4px 12px",
            borderRadius: 6,
            background: "rgba(0,0,0,0.15)",
          } as const;
          return it.href ? (
            <Link key={`t-${i}`} href={it.href} className={cls} style={style}>
              {inner}
            </Link>
          ) : (
            <span key={`t-${i}`} className={cls} style={style}>
              {inner}
            </span>
          );
        })}
      </div>
      <style jsx>{`
        .ticker-track {
          animation: ticker-scroll 240s linear infinite;
          width: max-content;
        }
        .ticker-track:hover {
          animation-play-state: paused;
        }
        @keyframes ticker-scroll {
          from {
            transform: translateX(0);
          }
          to {
            transform: translateX(-50%);
          }
        }
      `}</style>
    </div>
  );
}
