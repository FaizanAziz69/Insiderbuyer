"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo } from "react";
import {
  API_BASE,
  IndicesResponse,
  NewsResponse,
  fetcher,
} from "@/lib/api";

/**
 * Slim horizontal marquee bar pinned at the very top of the page.
 * Combines live news headlines with a single market quote, scrolls right→left
 * via a pure-CSS animation. Hover pauses the scroll.
 */
export function TopTickerBar() {
  const { data: news } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=20`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const { data: indices } = useSWR<IndicesResponse>(
    `${API_BASE}/indices`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const items = useMemo(() => {
    const headlines = (news?.items || []).slice(0, 14).map((n) => ({
      kind: "news" as const,
      title: n.title,
      href: `/article?u=${encodeURIComponent(n.link)}&c=${encodeURIComponent(n.label)}`,
    }));
    const quotes = (indices?.quotes || []).map((q) => ({
      kind: "quote" as const,
      symbol: q.shortName,
      value: q.value,
      changePct: q.changePct,
    }));
    // Interleave: 3 headlines, 1 quote, 3 headlines, 1 quote, …
    const out: Array<(typeof headlines)[number] | (typeof quotes)[number]> = [];
    let qi = 0;
    for (let i = 0; i < headlines.length; i++) {
      out.push(headlines[i]);
      if ((i + 1) % 3 === 0 && qi < quotes.length) {
        out.push(quotes[qi++]);
      }
    }
    while (qi < quotes.length) out.push(quotes[qi++]);
    return out;
  }, [news, indices]);

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
          if (it.kind === "news") {
            return (
              <Link
                key={`n-${i}`}
                href={it.href}
                className="flex items-center gap-3 flex-shrink-0 hover:underline"
                style={{ color: "rgba(255,255,255,0.95)" }}
              >
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full flex-shrink-0"
                  style={{ background: "var(--gold)" }}
                />
                <span className="font-medium">{it.title}</span>
              </Link>
            );
          }
          const up = it.changePct >= 0;
          return (
            <span
              key={`q-${i}`}
              className="inline-flex items-center gap-1.5 flex-shrink-0 tabular"
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
                {it.value.toLocaleString(undefined, {
                  maximumFractionDigits: it.value < 100 ? 2 : 0,
                })}
              </span>
              <span
                className="font-mono font-bold text-[11px]"
                style={{ color: up ? "#1bff8b" : "#ff6b8a" }}
              >
                {up ? "+" : ""}
                {it.changePct.toFixed(2)}%
              </span>
            </span>
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
