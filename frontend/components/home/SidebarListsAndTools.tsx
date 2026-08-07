"use client";
import Link from "next/link";
import {
  Activity,
  Calendar,
  Coins,
  Cpu,
  DollarSign,
  Flame,
  Gem,
  Landmark,
  LayoutGrid,
  Rocket,
  ShieldCheck,
  Star,
  TrendingDown,
  Wrench,
} from "lucide-react";

/** Portraits are self-hosted from Wikimedia Commons (CC BY / public-domain
 *  originals; Trump = official 2025 presidential portrait, public domain).
 *  Initials render as the fallback if an image ever fails to load. */
const INVESTORS = [
  { initials: "WB", name: "Warren Buffett", color: "#175d8d", href: "/stock-lists/warren-buffett", img: "/investors/warren-buffett.jpg" },
  { initials: "RD", name: "Ray Dalio", color: "#0e8a6d", href: "/stock-lists/ray-dalio", img: "/investors/ray-dalio.jpg" },
  { initials: "ES", name: "Eric Sprott", color: "#8d5a17", href: "/stock-lists/eric-sprott", img: "/investors/eric-sprott.jpg" },
  { initials: "JB", name: "Jeff Bezos", color: "#5a3d8d", href: "/stock-lists/jeff-bezos", img: "/investors/jeff-bezos.jpg" },
  { initials: "TF", name: "Trump Family", color: "#8d1740", href: "/stock-lists/trump-family", img: "/investors/trump-family.jpg" },
];

const CHIPS = [
  { name: "Tech", icon: Cpu, href: "/stock-lists/tech" },
  { name: "Gold", icon: Coins, href: "/stock-lists/gold" },
  { name: "Silver", icon: Gem, href: "/stock-lists/silver" },
  { name: "Oil", icon: Flame, href: "/stock-lists/oil" },
  { name: "Metals & Mining", icon: Wrench, href: "/stock-lists/metals-and-mining" },
  { name: "Blue Chip", icon: ShieldCheck, href: "/stock-lists/blue-chip" },
  { name: "Politicians", icon: Landmark, href: "/stock-lists/politicians" },
];

const TOOLS = [
  { name: "Analyst Ratings", icon: Star, href: "/analyst-ratings" },
  { name: "Top Analysts", icon: Star, href: "/top-analysts" },
  { name: "Dividends", icon: DollarSign, href: "/dividends" },
  { name: "Congressional Trading", icon: Landmark, href: "/congressional-trades" },
  { name: "Earnings", icon: Calendar, href: "/earnings" },
  { name: "Insider Trades", icon: Activity, href: "/trades" },
  { name: "IPOs", icon: Rocket, href: "/ipos" },
  { name: "Short Interest", icon: TrendingDown, href: "/short-interest" },
  { name: "Stock Heatmap", icon: LayoutGrid, href: "/heatmaps/market" },
];



function Header({ title, allHref, allLabel }: { title: string; allHref: string; allLabel: string }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
      <h3 className="sbw-title" style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em" }}>
        {title}
      </h3>
      <Link href={allHref} className="sbw-alllink">
        {allLabel} →
      </Link>
    </div>
  );
}

/**
 * Sidebar widget — "Stock Lists" (investor avatars + sector/theme chips) and
 * "More Tools" (2-column tool grid). Light mode follows the fixed design
 * spec; dark mode maps onto the site palette via the .sbw-* classes.
 */
export function SidebarListsAndTools() {
  return (
    <nav className="sbw-card" aria-label="Stock lists and tools" style={{ maxWidth: 380 }}>
      {/* ── SECTION 1 — STOCK LISTS ── */}
      <section>
        <Header title="Stock Lists" allHref="/stock-lists" allLabel="All lists" />

        <div className="sbw-label">Follow an Investor</div>
        <ul className="flex" style={{ gap: 14, marginBottom: 18, listStyle: "none", padding: 0 }}>
          {INVESTORS.map((inv) => (
            <li key={inv.initials} style={{ width: 56 }}>
              <Link
                href={inv.href}
                className="flex flex-col items-center"
                style={{ gap: 6, cursor: "pointer" }}
              >
                <span
                  className="sbw-avatar relative flex items-center justify-center overflow-hidden"
                  style={{
                    background: inv.color,
                    boxShadow: `0 0 0 2px var(--bg-1), 0 0 0 3.5px ${inv.color}66`,
                  }}
                >
                  {/* Initials sit underneath as the fallback… */}
                  <span className="absolute inset-0 flex items-center justify-center">
                    {inv.initials}
                  </span>
                  {/* …and the portrait covers them (hides itself on 404). */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={inv.img}
                    alt={inv.name}
                    className="relative h-full w-full object-cover"
                    style={{ objectPosition: "center 20%" }}
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = "none";
                    }}
                  />
                </span>
                <span className="sbw-name">{inv.name}</span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="sbw-label">By Sector &amp; Theme</div>
        <ul className="flex flex-wrap" style={{ gap: 7, listStyle: "none", padding: 0 }}>
          {CHIPS.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.name}>
                <Link href={c.href} className="sbw-chip">
                  <Icon className="sbw-icon" style={{ width: 12, height: 12 }} />
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* divider */}
      <div className="sbw-divider" aria-hidden />

      {/* ── SECTION 2 — MORE TOOLS ── */}
      <section>
        <Header title="More Tools" allHref="/screener" allLabel="All tools" />
        <ul
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: 8,
            listStyle: "none",
            padding: 0,
          }}
        >
          {TOOLS.map((t) => {
            const Icon = t.icon;
            return (
              <li key={t.name}>
                <Link href={t.href} className="sbw-tool">
                  <Icon className="sbw-icon" style={{ width: 14, height: 14, flexShrink: 0 }} />
                  {t.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>
    </nav>
  );
}
