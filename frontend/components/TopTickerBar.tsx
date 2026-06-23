"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo } from "react";
import { API_BASE, BlogListResponse, fetcher } from "@/lib/api";

interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

/**
 * Slim horizontal marquee bar pinned at the very top of the page.
 * Shows OUR content only — AI articles & stock ideas (→ full article) plus live
 * movers (→ that stock's page). No SEC press-release headlines. Scrolls
 * right→left via a pure-CSS animation; hover pauses.
 */
export function TopTickerBar() {
  const { data: blogs } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=20`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const { data: movers } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=12`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const items = useMemo(() => {
    const articles = (blogs?.items || []).slice(0, 14).map((n) => ({
      kind: "article" as const,
      title: n.title,
      ticker: n.ticker,
      href: `/insights/${n.slug}`,
    }));
    const stocks = (movers?.rows || []).slice(0, 12).map((q) => ({
      kind: "stock" as const,
      symbol: q.symbol,
      price: q.price,
      changePct: q.changePct,
      href: `/companies/${encodeURIComponent(q.symbol)}`,
    }));
    // Interleave: 3 articles, 1 stock, 3 articles, 1 stock, …
    const out: Array<(typeof articles)[number] | (typeof stocks)[number]> = [];
    let si = 0;
    for (let i = 0; i < articles.length; i++) {
      out.push(articles[i]);
      if ((i + 1) % 3 === 0 && si < stocks.length) {
        out.push(stocks[si++]);
      }
    }
    while (si < stocks.length) out.push(stocks[si++]);
    return out;
  }, [blogs, movers]);

  if (items.length === 0) return null;

  // Duplicate the sequence so the marquee loop is seamless.
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
      <div className="ticker-track flex items-center gap-8 py-2 whitespace-nowrap text-[12px]">
        {doubled.map((it, i) => {
          if (it.kind === "article") {
            return (
              <Link
                key={`a-${i}`}
                href={it.href}
                className="flex items-center gap-3 flex-shrink-0 hover:underline"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--gold)" }}
                />
                {it.ticker && (
                  <span className="font-mono font-bold text-[11px]" style={{ color: "var(--gold)" }}>
                    {it.ticker}
                  </span>
                )}
                <span className="font-medium">{it.title}</span>
              </Link>
            );
          }
          const up = it.changePct >= 0;
          return (
            <Link
              key={`s-${i}`}
              href={it.href}
              className="inline-flex items-center gap-1.5 flex-shrink-0 tabular hover:opacity-90"
              style={{
                color: "#fff",
                padding: "2px 10px",
                borderRadius: 4,
                background: "rgba(0,0,0,0.15)",
              }}
            >
              <span className="font-bold uppercase tracking-wider text-[11px]">
                {it.symbol}
              </span>
              <span className="font-mono font-semibold text-[12px]">
                {it.price.toLocaleString(undefined, {
                  maximumFractionDigits: it.price < 100 ? 2 : 0,
                })}
              </span>
              <span
                className="font-mono font-bold text-[11px]"
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
          animation: ticker-scroll 90s linear infinite;
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
