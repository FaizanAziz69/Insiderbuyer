"use client";
import Link from "next/link";
import { ChevronRight, Sparkles } from "lucide-react";

const POPULAR_LISTS = [
  { slug: "tech", title: "Tech Stocks" },
  { slug: "gold", title: "Gold Stocks" },
  { slug: "blue-chip", title: "Blue Chip Stocks" },
  { slug: "warren-buffett", title: "Warren Buffett Portfolio" },
  { slug: "politicians", title: "Politicians (Congressional)" },
];

export function RightRailStockLists() {
  return (
    <aside
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        Stock Lists
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {POPULAR_LISTS.map((l) => (
          <li key={l.slug}>
            <Link
              href={`/stock-lists/${l.slug}`}
              className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--accent-soft)] transition group"
            >
              <span className="text-[13px] font-semibold text-soft group-hover:text-accent transition">
                {l.title}
              </span>
              <ChevronRight className="h-3.5 w-3.5 text-faint group-hover:text-accent" />
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/stock-lists/iqs-top-picks"
            className="flex items-center justify-between px-4 py-3"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, transparent), color-mix(in srgb, var(--accent-2) 12%, transparent))",
            }}
          >
            <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-accent">
              <Sparkles className="h-3.5 w-3.5" />
              IQS Top Picks · Premium
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-accent" />
          </Link>
        </li>
      </ul>
    </aside>
  );
}
