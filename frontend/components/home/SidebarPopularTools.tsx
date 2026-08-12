"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  BarChart3,
  Bell,
  Calendar,
  Flame,
  LineChart,
  TrendingDown,
} from "lucide-react";

/** Each tool gets its own tint so the grid reads as colorful app tiles —
 *  deliberately unlike MarketBeat's plain text-row list. */
const TOOLS = [
  { title: "Watchlist", caption: "Track your stocks live", href: "/watchlist", icon: LineChart, color: "#0ea5e9" },
  { title: "Stock Screener", caption: "Filter by score & sector", href: "/screener", icon: BarChart3, color: "#8b5cf6" },
  { title: "Trade Alerts", caption: "Form 4 email + SMS", href: "/alerts", icon: Bell, color: "#f59e0b" },
  { title: "Earnings Calendar", caption: "Who reports this week", href: "/earnings", icon: Calendar, color: "#10b981" },
  { title: "Top Movers", caption: "Gainers, losers, actives", href: "/movers", icon: Flame, color: "#ef4444" },
  { title: "Short Squeeze", caption: "Ranked squeeze setups", href: "/short-squeeze", icon: TrendingDown, color: "#ec4899" },
];

/**
 * Popular Tools — redesigned per the homepage review: a compact grid of
 * colorful icon tiles (app-launcher style) instead of the old MarketBeat-like
 * stacked text cards. Same tools, same links — new look.
 *
 * The card FILLS its grid row (client: "remove the white space under Popular
 * Tools"). It used to be `self-start`, so the news column beside it — always
 * the taller of the two — left ~200px of dead white space below the card. Now
 * the tile rows share that height (`auto-rows-fr` + `flex-1`) and the rail
 * bottom lines up with the news column. Sticky is gone with `self-start`: a
 * card as tall as its row has nothing to stick past.
 */
export function SidebarPopularTools() {
  return (
    <aside
      className="rounded-xl p-4 h-full flex flex-col"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div className="flex items-baseline justify-between mb-3 flex-shrink-0">
        <h3 className="text-[15px] font-bold tracking-tight" style={{ letterSpacing: "-0.2px" }}>
          Popular Tools
        </h3>
        <Link
          href="/premium"
          className="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
        >
          Insider Access <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-2.5 flex-1" style={{ gridAutoRows: "1fr" }}>
        {TOOLS.map((t) => {
          const Icon = t.icon;
          return (
            <Link
              key={t.title}
              href={t.href}
              className="group rounded-lg p-3 flex flex-col items-start justify-center gap-2 transition hover:-translate-y-0.5"
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--border)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <span
                className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{ background: `color-mix(in srgb, ${t.color} 15%, transparent)` }}
              >
                <Icon className="h-4.5 w-4.5" style={{ color: t.color, height: 18, width: 18 }} />
              </span>
              <span className="min-w-0">
                <span className="block text-[13px] font-bold leading-tight group-hover:text-accent transition">
                  {t.title}
                </span>
                <span className="block text-[11px] text-mute leading-tight mt-0.5">
                  {t.caption}
                </span>
              </span>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
