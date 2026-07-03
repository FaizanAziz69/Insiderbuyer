"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import useSWR from "swr";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";

/**
 * Real-time market news feed (TipRanks / MarketBeat style) — a single
 * reverse-chronological stream that merges the live data we have: insider
 * Form 4 trades, congressional (STOCK Act) trades, upcoming earnings, and
 * AI headlines. Each row is a category-tagged, timestamped entry.
 */

type Cat = "Insider" | "Congress" | "Earnings" | "Headline";

interface FeedItem {
  id: string;
  cat: Cat;
  badge: string;
  color: string; // badge text/border color
  ticker: string | null;
  text: string;
  time: number; // ms epoch
  href: string;
}

const CATS: { key: "all" | Cat; label: string }[] = [
  { key: "all", label: "All" },
  { key: "Insider", label: "Insider Trades" },
  { key: "Earnings", label: "Earnings" },
  { key: "Congress", label: "Congress" },
  { key: "Headline", label: "Headlines" },
];

function ago(ms: number): string {
  const s = (Date.now() - ms) / 1000;
  if (s < 0) {
    const d = Math.round(-s / 86400);
    return d <= 0 ? "today" : `in ${d}d`;
  }
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RealTimeNewsFeed() {
  const [filter, setFilter] = useState<"all" | Cat>("all");

  const opts = { revalidateOnFocus: false, dedupingInterval: 60_000 };
  const { data: trades } = useSWR<{ rows: any[] }>(`${API_BASE}/trades?limit=80`, fetcher, opts);
  const { data: congress } = useSWR<{ rows: any[] }>(
    `${API_BASE}/congressional-trades?limit=40`, fetcher, opts,
  );
  const { data: earnings } = useSWR<{ rows: any[] }>(
    `${API_BASE}/earnings/calendar?days=7`, fetcher, opts,
  );
  const { data: blogs } = useSWR<{ items: any[] }>(
    `${API_BASE}/content/blogs?limit=25`, fetcher, opts,
  );

  const items = useMemo<FeedItem[]>(() => {
    const out: FeedItem[] = [];

    for (const t of trades?.rows || []) {
      const buy = t.type !== "SELL";
      out.push({
        id: `t-${t.id}`,
        cat: "Insider",
        badge: buy ? "Insider Buy" : "Insider Sell",
        color: buy ? "var(--good)" : "var(--bad)",
        ticker: t.ticker || null,
        text: `${t.insiderName}${t.role ? ` (${t.role})` : ""} ${buy ? "bought" : "sold"} ${formatCurrency(Number(t.totalValue || 0))} of ${t.companyName || t.ticker}`,
        time: new Date(t.transactionDate).getTime(),
        href: t.ticker ? `/companies/${encodeURIComponent(t.ticker)}` : "/trades",
      });
    }

    for (const c of congress?.rows || []) {
      const buy = c.action === "Buy";
      const amt =
        c.amountMin != null && c.amountMax != null
          ? ` (${formatCurrency(c.amountMin)}–${formatCurrency(c.amountMax)})`
          : "";
      out.push({
        id: `c-${c.id}`,
        cat: "Congress",
        badge: "Congress",
        color: "#9333ea",
        ticker: c.ticker || null,
        text: `${c.politicianName}${c.party ? ` (${c.party})` : ""} ${buy ? "bought" : "sold"} ${c.ticker || c.companyName}${amt}`,
        time: new Date(c.transactionDate).getTime(),
        href: c.ticker ? `/companies/${encodeURIComponent(c.ticker)}` : "/congressional-trades",
      });
    }

    for (const e of earnings?.rows || []) {
      out.push({
        id: `e-${e.symbol}-${e.date}`,
        cat: "Earnings",
        badge: "Earnings",
        color: "#d97706",
        ticker: e.symbol || null,
        text: `${e.name || e.symbol} reports earnings${e.estimate ? ` · EPS est. ${e.estimate}` : ""}`,
        time: new Date(e.date).getTime(),
        href: e.symbol ? `/companies/${encodeURIComponent(e.symbol)}` : "/earnings",
      });
    }

    for (const b of blogs?.items || []) {
      out.push({
        id: `b-${b.slug}`,
        cat: "Headline",
        badge: b.eyebrow || "Headline",
        color: "var(--accent)",
        ticker: b.ticker || null,
        text: b.title,
        time: new Date(b.generatedAt).getTime(),
        href: `/insights/${b.slug}`,
      });
    }

    return out
      .filter((i) => !Number.isNaN(i.time))
      .sort((a, b) => b.time - a.time);
  }, [trades, congress, earnings, blogs]);

  const shown = (filter === "all" ? items : items.filter((i) => i.cat === filter)).slice(0, 60);
  const loading = !trades && !congress && !earnings && !blogs;

  return (
    <section className="card overflow-hidden">
      {/* Header + category filters */}
      <div
        className="flex flex-wrap items-center gap-2 px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-2)" }}
      >
        <span className="live-dot live-dot-good text-[11px] font-bold uppercase tracking-wider mr-1">
          Live Feed
        </span>
        <div className="flex flex-wrap gap-1.5 ml-auto">
          {CATS.map((c) => {
            const on = filter === c.key;
            return (
              <button
                key={c.key}
                onClick={() => setFilter(c.key)}
                className="px-2.5 py-1 rounded-full text-[12px] font-semibold transition"
                style={{
                  background: on ? "var(--accent)" : "var(--bg-3)",
                  color: on ? "var(--on-accent)" : "var(--text-mute)",
                }}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="p-10 text-center text-mute text-sm">Loading live feed…</div>
      ) : shown.length === 0 ? (
        <div className="p-10 text-center text-mute text-sm">No items in this category.</div>
      ) : (
        <ul className="divide-y" style={{ borderColor: "var(--border)" }}>
          {shown.map((it) => (
            <li key={it.id}>
              <Link
                href={it.href}
                className="flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--accent-soft)] transition"
              >
                <span
                  className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full flex-shrink-0 w-[92px] text-center"
                  style={{
                    color: it.color,
                    background: `color-mix(in srgb, ${it.color} 14%, transparent)`,
                  }}
                >
                  {it.badge}
                </span>
                {it.ticker && (
                  <span className="font-mono font-bold text-[13px] text-accent flex-shrink-0 w-[52px]">
                    {it.ticker}
                  </span>
                )}
                <span className="flex-1 min-w-0 text-[13.5px] truncate" style={{ color: "var(--text)" }}>
                  {it.text}
                </span>
                <span className="text-[11px] text-mute tabular whitespace-nowrap flex-shrink-0">
                  {ago(it.time)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
