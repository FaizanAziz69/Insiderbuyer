"use client";
import Link from "next/link";
import { useState } from "react";
import { ChevronRight, Search } from "lucide-react";
import { useRouter } from "next/navigation";

/** A MarketBeat-style section heading: bold title on the left, an uppercase
 *  "see all" link pushed to the right. */
function SectionHeading({ title, link }: { title: string; link: { href: string; label: string } }) {
  return (
    <div
      className="flex items-end justify-between mb-2.5 pb-1"
      style={{ borderBottom: "2px solid var(--border-strong)" }}
    >
      <h2 className="font-bold tracking-tight" style={{ fontSize: 20 }}>
        {title}
      </h2>
      <Link
        href={link.href}
        className="text-[11px] uppercase font-bold tracking-wider text-accent hover:underline whitespace-nowrap pb-0.5 inline-flex items-center gap-0.5"
      >
        {link.label}
        <ChevronRight className="h-3 w-3" />
      </Link>
    </div>
  );
}

/** Pill cloud — first pill rendered "filled" (active), the rest "outline",
 *  exactly like MarketBeat's link-cloud. */
function PillCloud({ pills }: { pills: { href: string; label: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-2 list-none p-0 m-0">
      {pills.map((p, i) => (
        <li key={p.label} className="inline-block">
          <Link
            href={p.href}
            className="inline-block text-[13px] font-semibold rounded-full px-3 py-1 transition"
            style={
              i === 0
                ? { background: "var(--accent)", color: "var(--on-accent)", border: "1px solid var(--accent)" }
                : {
                    background: "var(--bg-2)",
                    color: "var(--accent)",
                    border: "1px solid var(--border-strong)",
                  }
            }
          >
            {p.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}

const STOCK_LIST_PILLS = [
  { href: "/stock-lists/tech", label: "Tech" },
  { href: "/stock-lists/biotech", label: "Biotech" },
  { href: "/stock-lists/blue-chip", label: "Blue Chip" },
  { href: "/stock-lists/faang", label: "FAANG" },
  { href: "/stock-lists/gold", label: "Gold" },
  { href: "/stock-lists/large-cap", label: "Large Cap" },
  { href: "/stock-lists/oil", label: "Oil" },
  { href: "/stock-lists/reits", label: "REITs" },
  { href: "/stock-lists/small-cap", label: "Small Cap" },
  { href: "/stock-lists/warren-buffett", label: "Warren Buffett" },
];

const INVESTING_TOOL_PILLS = [
  { href: "/analyst-ratings", label: "Analyst Ratings" },
  { href: "/top-analysts", label: "Top Analysts" },
  { href: "/congressional-trades", label: "Congressional Trading" },
  { href: "/dividends", label: "Dividends" },
  { href: "/earnings", label: "Earnings" },
  { href: "/trades", label: "Insider Trades" },
  { href: "/movers", label: "Top Movers" },
  { href: "/watchlist", label: "Portfolio Monitoring" },
  { href: "/short-interest", label: "Short Interest" },
  { href: "/sectors", label: "Sector Performance" },
  { href: "/screener", label: "Stock Screener" },
];

export function RightRailStockLists() {
  const router = useRouter();
  const [q, setQ] = useState("");

  return (
    <div className="space-y-6">
      {/* Stock Lists */}
      <section>
        <SectionHeading title="Stock Lists" link={{ href: "/stock-lists", label: "All Stock Lists" }} />
        <PillCloud pills={STOCK_LIST_PILLS} />
      </section>

      {/* Investing Tools */}
      <section>
        <SectionHeading title="Investing Tools" link={{ href: "/market-data", label: "Calendars and Tools" }} />
        <PillCloud pills={INVESTING_TOOL_PILLS} />
      </section>

      {/* Search Headlines */}
      <section>
        <SectionHeading title="Search Headlines" link={{ href: "/insights", label: "All Headlines" }} />
        <form
          onSubmit={(e) => {
            e.preventDefault();
            router.push(`/insights?q=${encodeURIComponent(q.trim())}`);
          }}
          className="flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Find an Article"
              className="w-full pl-9 pr-3 py-2 rounded-md text-[13px]"
              style={{
                background: "var(--bg-1)",
                border: "1px solid var(--border-strong)",
                color: "var(--text)",
              }}
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 rounded-md text-[13px] font-bold whitespace-nowrap"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Search
          </button>
        </form>
      </section>
    </div>
  );
}
