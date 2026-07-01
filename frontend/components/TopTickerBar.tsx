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
const ITEMS: { symbol: string; label: string; href?: string }[] = [
  { symbol: "^GSPC", label: "S&P 500" },
  { symbol: "^DJI", label: "Dow" },
  { symbol: "^IXIC", label: "Nasdaq" },
  { symbol: "GC=F", label: "Gold" },
  { symbol: "SI=F", label: "Silver" },
  { symbol: "CL=F", label: "Oil" },
  { symbol: "BTC-USD", label: "Bitcoin" },
  ...[
    "NVDA", "AAPL", "AMZN", "META", "TSLA", "MSFT", "GOOGL", "AMD", "NFLX", "AVGO",
    "JPM", "V", "WMT", "COST", "DIS", "KO", "MCD", "BA", "PLTR", "COIN",
  ].map((s) => ({ symbol: s, label: s, href: `/companies/${s}` })),
];

const SYMBOLS = ITEMS.map((i) => i.symbol);

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
  // Preserve curated order, keep only items with a real quote.
  const items = ITEMS.map((it) => ({ ...it, q: bySymbol.get(it.symbol) })).filter(
    (it): it is typeof it & { q: MoverRow } => !!it.q,
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
          const up = it.q.changePct >= 0;
          const inner = (
            <>
              <span className="font-bold uppercase tracking-wider text-[14px]">
                {it.label}
              </span>
              <span className="font-mono font-semibold text-[15px]">
                {it.q.price.toLocaleString(undefined, {
                  maximumFractionDigits: it.q.price < 100 ? 2 : 0,
                })}
              </span>
              <span
                className="font-mono font-bold text-[13px]"
                style={{ color: up ? "#1bff8b" : "#ff6b8a" }}
              >
                {up ? "+" : ""}
                {it.q.changePct.toFixed(2)}%
              </span>
            </>
          );
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
