"use client";
import Link from "next/link";
import { ArrowUpRight, BarChart3, Calculator, LineChart } from "lucide-react";

const TOOLS = [
  {
    title: "Portfolio Monitoring",
    body: "Track tickers you follow, watch IQS scores update through the day, and get push alerts when a new Form 4 lands on any of them.",
    href: "/watchlist",
    icon: LineChart,
  },
  {
    title: "IQS Methodology",
    body: "Under the hood of our four-factor score — purchase volume, cluster effect, role weighting, and holding-change magnitude.",
    href: "/premium",
    icon: Calculator,
  },
  {
    title: "Stock Screener",
    body: "Slice the universe by sector, market-cap band, IQS tier, and recent insider activity. Save the screens you keep running.",
    href: "/screener",
    icon: BarChart3,
  },
];

export function SidebarPopularTools() {
  return (
    <aside className="space-y-3">
      <div className="flex items-baseline justify-between mb-2">
        <h3
          className="text-[16px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.2px" }}
        >
          Popular Tools
        </h3>
        <Link
          href="/premium"
          className="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
        >
          Premium tools <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      {TOOLS.map((t) => {
        const Icon = t.icon;
        return (
          <Link
            key={t.title}
            href={t.href}
            className="block rounded-lg p-4 group transition"
            style={{
              background: "var(--bg-2)",
              border: "1px solid var(--border)",
            }}
          >
            <div className="flex items-start justify-between gap-2 mb-1.5">
              <div className="inline-flex items-center gap-2">
                <Icon className="h-4 w-4 text-accent" />
                <span className="text-[14px] font-bold group-hover:text-accent transition">
                  {t.title}
                </span>
              </div>
              <ArrowUpRight className="h-4 w-4 text-faint group-hover:text-accent transition" />
            </div>
            <p className="text-[12px] text-mute leading-relaxed line-clamp-3">
              {t.body}
            </p>
          </Link>
        );
      })}
    </aside>
  );
}
