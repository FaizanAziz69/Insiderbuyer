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

const INVESTORS = [
  { initials: "WB", name: "Warren Buffett", color: "#175d8d", href: "/stock-lists/warren-buffett" },
  { initials: "RD", name: "Ray Dalio", color: "#0e8a6d", href: "/stock-lists/ray-dalio" },
  { initials: "ES", name: "Eric Sprott", color: "#8d5a17", href: "/stock-lists/eric-sprott" },
  { initials: "JB", name: "Jeff Bezos", color: "#5a3d8d", href: "/stock-lists/jeff-bezos" },
  { initials: "TF", name: "Trump Family", color: "#8d1740", href: "/stock-lists/trump-family" },
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
  { name: "Dividends", icon: DollarSign, href: "/dividends" },
  { name: "Congressional Trading", icon: Landmark, href: "/congressional-trades" },
  { name: "Earnings", icon: Calendar, href: "/earnings" },
  { name: "Insider Trades", icon: Activity, href: "/trades" },
  { name: "IPOs", icon: Rocket, href: "/ipos" },
  { name: "Short Interest", icon: TrendingDown, href: "/short-interest" },
  { name: "Stock Heatmap", icon: LayoutGrid, href: "/heatmaps/market" },
];

const LABEL: React.CSSProperties = {
  fontSize: "10.5px",
  fontWeight: 700,
  letterSpacing: "0.12em",
  textTransform: "uppercase",
  color: "#8494a8",
  marginBottom: 9,
};

function Header({ title, allHref, allLabel }: { title: string; allHref: string; allLabel: string }) {
  return (
    <div className="flex items-center justify-between" style={{ marginBottom: 14 }}>
      <h3 style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.01em", color: "#0f1e2e" }}>
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
 * "More Tools" (2-column tool grid). Spec-locked light styling (fixed hex
 * values, Figtree) — intentionally not theme-variable based.
 */
export function SidebarListsAndTools() {
  return (
    <nav className="sbw-card" aria-label="Stock lists and tools" style={{ maxWidth: 380 }}>
      {/* ── SECTION 1 — STOCK LISTS ── */}
      <section>
        <Header title="Stock Lists" allHref="/stock-lists" allLabel="All lists" />

        <div style={LABEL}>Follow an Investor</div>
        <ul className="flex" style={{ gap: 14, marginBottom: 18, listStyle: "none", padding: 0 }}>
          {INVESTORS.map((inv) => (
            <li key={inv.initials} style={{ width: 56 }}>
              <Link
                href={inv.href}
                className="flex flex-col items-center"
                style={{ gap: 6, cursor: "pointer" }}
              >
                <span
                  className="flex items-center justify-center"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 999,
                    background: inv.color,
                    border: "2px solid #fff",
                    boxShadow: "0 0 0 1.5px #dbe4ee",
                    fontSize: 15,
                    fontWeight: 800,
                    color: "#fff",
                  }}
                >
                  {inv.initials}
                </span>
                <span
                  style={{
                    fontSize: "10.5px",
                    fontWeight: 700,
                    color: "#45566b",
                    textAlign: "center",
                    lineHeight: 1.2,
                  }}
                >
                  {inv.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div style={LABEL}>By Sector &amp; Theme</div>
        <ul className="flex flex-wrap" style={{ gap: 7, listStyle: "none", padding: 0 }}>
          {CHIPS.map((c) => {
            const Icon = c.icon;
            return (
              <li key={c.name}>
                <Link href={c.href} className="sbw-chip">
                  <Icon style={{ width: 12, height: 12, color: "#175d8d" }} />
                  {c.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </section>

      {/* divider */}
      <div style={{ height: 1, background: "#e6ebf1", margin: "24px 0" }} aria-hidden />

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
                  <Icon style={{ width: 14, height: 14, color: "#175d8d", flexShrink: 0 }} />
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
