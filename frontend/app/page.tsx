"use client";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { LazyMount } from "@/components/LazyMount";
import { API_BASE, HeatQuote, heatToRanking, fetcher } from "@/lib/api";
import { MonthlyBuySellMeter } from "@/components/home/MonthlyBuySellMeter";
import { TopStoriesSection } from "@/components/home/TopStoriesSection";
import { HomeDatasets } from "@/components/home/HomeDatasets";
import { EarningsCalendar } from "@/components/home/EarningsCalendar";
import { SidebarListsAndTools } from "@/components/home/SidebarListsAndTools";
import { SidebarPopularTools } from "@/components/home/SidebarPopularTools";
import { StockHeatmap, HeatmapLegend } from "@/components/heatmap/StockHeatmap";
import { AdSlot } from "@/components/AdSlot";
import { AiCatalyst, useExplainerPrewarm } from "@/components/AiCatalyst";
import { AiStockIdeasSection } from "@/components/insights/AiStockIdeasSection";
import { AiPopularArticlesSection } from "@/components/insights/AiPopularArticlesSection";
import { AiLatestNewsSection } from "@/components/insights/AiLatestNewsSection";

export default function HomePage() {
  return (
    <div className="space-y-10">
      {/* TOP — Benzinga-style Top Stories (left) with the Top Gainers rail +
          buy/sell meter on the right side, same split as the old hero. */}
      {/* No fixed row height: the old xl:h-[540px] clamp was SHORTER than the
          Top Stories content, so the section overflowed and the Market Heat
          Map heading rendered on top of it. The row now sizes to the stories;
          the gainers list on the right scrolls inside whatever height it gets. */}
      {/* The two columns end on the same line: the rail stretches to the
          stories' height and the buy/sell meter — not the story card — absorbs
          the difference, with its content centred. Nothing inside the lead
          story stretches, which is what produced the blank box earlier
          (client 2026-08-24). */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-4 items-stretch">
        <div className="min-h-0">
          <TopStoriesSection />
        </div>
        <div className="flex flex-col gap-4 h-full min-h-0">
          <TopGainersPanel />
          <MonthlyBuySellMeter fill />
        </div>
      </section>

      {/* Everything below the hero is deferred until scrolled near — the heat
          map (260KB), AI news/articles/ideas and their explain-batch calls no
          longer fire on first paint, so the top of the page appears fast. */}
      <LazyMount minHeight={420}>
      {/* Horizontal market heat map (full width) */}
      <MarketHeatmapPanel />

      {/* LATEST FINANCIAL NEWS — with the redesigned Popular Tools rail */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <AiLatestNewsSection />
        <SidebarPopularTools />
      </div>

      {/* Banner ad between sections */}
      <AdSlot slot="leaderboard" seed="home-mid-1" />

      {/* POPULAR ARTICLES — AI-generated editorial, refreshed daily */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <AiPopularArticlesSection />
        <SidebarListsAndTools />
      </div>

      {/* STOCK IDEAS — AI-generated trade-idea cards refreshed daily */}
      <AiStockIdeasSection />

      {/* Three datasets side-by-side */}
      <HomeDatasets />

      {/* Inline ad before earnings */}
      <AdSlot slot="leaderboard" seed="home-mid-2" />

      {/* Earnings calendar */}
      <EarningsCalendar days={7} />
      </LazyMount>

    </div>
  );
}

interface GainerRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  marketCap: number | null;
}

function fmtCap(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(2)}K`;
  return `$${Math.round(v)}`;
}

/** Top-25 gainers rail — scrollable list beside the hero. Columns: #,
 *  Company, Price, Change/Cap, and the AI Catalyst ✨ explainer per row. */
function TopGainersPanel() {
  // Top 10 only (client 2026-08-24) — the card shows the whole list with no
  // inner scrollbar, so it ends where the tenth row ends.
  const { data } = useSWR<{ rows: GainerRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=10`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const gainers = (data?.rows ?? []).slice(0, 10);

  // Pre-generate every row's AI Movement Explainer in one batched call so
  // hovering the ✨ icon is instant.
  useExplainerPrewarm(
    gainers.map((g) => ({ symbol: g.symbol, name: g.name, changePct: g.changePct })),
  );

  return (
    <aside
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <Link
        href="/market-data/top-gainers"
        className="flex items-center justify-between px-4 py-2.5 border-b group hover:bg-[var(--accent-soft)] transition flex-shrink-0"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
        title="See all top gainers"
      >
        <h3 className="text-[13px] font-bold uppercase tracking-wider group-hover:text-accent transition">
          Top Gainers
        </h3>
        <span className="text-[10px] font-mono text-accent uppercase tracking-wider inline-flex items-center gap-1">
          All <ChevronRight className="h-3 w-3" />
        </span>
      </Link>
      {/* Column header */}
      <div
        className="grid grid-cols-[18px_1fr_64px_auto_60px] gap-2 px-4 py-2 text-[12px] uppercase tracking-wider font-bold border-b flex-shrink-0"
        style={{ color: "var(--text-mute)", borderColor: "var(--border)" }}
      >
        <span>#</span>
        <span>Company</span>
        <span className="text-center">Price</span>
        <span className="text-right">Chg / Cap</span>
        <span className="text-center">Catalyst</span>
      </div>
      <ul className="divide-y divide-[var(--border)] flex flex-col">
        {gainers.length === 0 ? (
          <li className="px-4 py-6 text-center text-mute text-[12px]">Loading…</li>
        ) : (
          gainers.map((g, i) => (
            <li
              key={g.symbol}
              className="flex-shrink-0 grid grid-cols-[18px_1fr_64px_auto_60px] gap-2 items-center px-4 py-2 hover:bg-[var(--accent-soft)] transition"
            >
              <Link
                href={`/companies/${encodeURIComponent(g.symbol)}`}
                className="contents"
              >
                <span className="text-[11px] font-mono font-bold text-faint text-center">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[14px] font-bold font-mono text-accent truncate leading-tight">
                    {g.symbol}
                  </span>
                  <span className="block text-[11px] text-mute truncate leading-tight">
                    {g.name}
                  </span>
                </span>
                <span className="text-[13px] font-bold tabular text-center">
                  ${g.price.toFixed(2)}
                </span>
                <span className="text-right leading-tight">
                  <span className="block text-[13px] font-bold tabular" style={{ color: "var(--good)" }}>
                    +{g.changePct.toFixed(2)}%
                  </span>
                  <span className="block text-[11px] tabular" style={{ color: "var(--text-mute)" }}>
                    {fmtCap(g.marketCap)}
                  </span>
                </span>
              </Link>
              {/* AI Catalyst — 5th grid cell, aligned under the header */}
              <span className="flex items-center justify-center">
                <AiCatalyst ticker={g.symbol} name={g.name} changePct={g.changePct} />
              </span>
            </li>
          ))
        )}
      </ul>
    </aside>
  );
}

/** Full-width horizontal market heat map. */
function MarketHeatmapPanel() {
  const HEIGHT = 380;
  const { data } = useSWR<{ rows: HeatQuote[] }>(
    `${API_BASE}/market-stats/heatmap`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  // The endpoint now returns the whole $100M+ universe — thousands of rows.
  // A 380px-tall treemap cannot draw that many tiles legibly: everything below
  // the mega caps collapses into unlabelled dots. Take the largest companies
  // only (the API sorts by market cap), which leaves the big tiles exactly the
  // size they already were and simply removes the specks. The full map at
  // /heatmaps/market still gets everything, and has search to reach the rest.
  const TILES = 250;
  const rows = (data?.rows ?? []).slice(0, TILES).map(heatToRanking);

  return (
    <aside
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <Link
        href="/heatmaps/market"
        className="flex items-center justify-between px-4 py-2.5 border-b group hover:bg-[var(--accent-soft)] transition"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
        title="Open the full market heat map"
      >
        <h3 className="text-[13px] font-bold uppercase tracking-wider truncate group-hover:text-accent transition">
          Market Heat Map
        </h3>
        <span className="text-[10px] font-mono text-accent uppercase tracking-wider inline-flex items-center gap-1">
          Full map <ChevronRight className="h-3 w-3" />
        </span>
      </Link>
      <div className="p-2">
        {rows.length > 0 ? (
          <StockHeatmap rows={rows} height={HEIGHT} mode="sector" rawSectors />
        ) : (
          <div className="shimmer rounded" style={{ height: HEIGHT }} />
        )}
        {/* Color legend — same bar as the full heat map page */}
        <div className="px-1 pt-3">
          <HeatmapLegend colorBy="change" />
        </div>
      </div>
    </aside>
  );
}
