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

/**
 * Slim horizontal market-data marquee pinned at the very top of the page.
 * Shows LIVE stock quotes only (no news headlines) — each → that stock's page.
 * Scrolls right→left via a pure-CSS animation; hover pauses.
 */
export function TopTickerBar() {
  // Pull a wide set of live movers so the tape stays full of stock data.
  const { data: gainers } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=40`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const { data: active } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/most-active?limit=20`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  // Merge gainers + most-active, de-dupe by symbol, keep only real quotes.
  const bySymbol = new Map<string, MoverRow>();
  for (const r of [...(gainers?.rows || []), ...(active?.rows || [])]) {
    if (r?.symbol && typeof r.price === "number" && !bySymbol.has(r.symbol)) {
      bySymbol.set(r.symbol, r);
    }
  }
  const stocks = Array.from(bySymbol.values());

  if (stocks.length === 0) return null;

  // Duplicate the sequence so the marquee loop is seamless.
  const doubled = [...stocks, ...stocks];

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
          const up = it.changePct >= 0;
          return (
            <Link
              key={`s-${i}`}
              href={`/companies/${encodeURIComponent(it.symbol)}`}
              className="inline-flex items-center gap-2 flex-shrink-0 tabular hover:opacity-90"
              style={{
                color: "#fff",
                padding: "4px 12px",
                borderRadius: 6,
                background: "rgba(0,0,0,0.15)",
              }}
            >
              <span className="font-bold uppercase tracking-wider text-[14px]">
                {it.symbol}
              </span>
              <span className="font-mono font-semibold text-[15px]">
                {it.price.toLocaleString(undefined, {
                  maximumFractionDigits: it.price < 100 ? 2 : 0,
                })}
              </span>
              <span
                className="font-mono font-bold text-[13px]"
                style={{ color: up ? "#1bff8b" : "#ff6b8a" }}
              >
                {up ? "+" : ""}
                {it.changePct.toFixed(2)}%
              </span>
            </Link>
          );
        })}
      </div>
      <style jsx>{`
        .ticker-track {
          animation: ticker-scroll 150s linear infinite;
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
