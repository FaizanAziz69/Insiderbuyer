"use client";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
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
      <section className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-4 items-stretch xl:h-[540px]">
        <div className="min-h-0 xl:h-[540px]">
          <TopStoriesSection />
        </div>
        <div className="flex flex-col gap-4 h-full min-h-0 xl:h-[540px]">
          <TopGainersPanel />
          <MonthlyBuySellMeter />
        </div>
      </section>

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
  return `$${v}`;
}

/** Top-25 gainers rail — scrollable list beside the hero. Columns: #,
 *  Company, Price, Change/Cap, and the AI Catalyst ✨ explainer per row. */
function TopGainersPanel() {
  const { data } = useSWR<{ rows: GainerRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=25`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const gainers = (data?.rows ?? []).slice(0, 25);

  // Pre-generate every row's AI Movement Explainer in one batched call so
  // hovering the ✨ icon is instant.
  useExplainerPrewarm(
    gainers.map((g) => ({ symbol: g.symbol, name: g.name, changePct: g.changePct })),
  );

  return (
    <aside
      className="rounded-lg overflow-hidden flex flex-col flex-1 min-h-0"
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
      <ul className="divide-y divide-[var(--border)] flex flex-col flex-1 min-h-0 overflow-y-auto scrollbar-visible">
        {gainers.length === 0 ? (
          <li className="px-4 py-6 text-center text-mute text-[12px]">Loading…</li>
        ) : (
          gainers.map((g, i) => (
            <li key={g.symbol} className="flex-shrink-0 flex items-center">
              <Link
                href={`/companies/${encodeURIComponent(g.symbol)}`}
                className="grid grid-cols-[18px_1fr_60px_auto] gap-2 items-center px-4 py-2 flex-1 min-w-0 hover:bg-[var(--accent-soft)] transition"
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
              {/* AI Catalyst — why this stock is moving (hover) */}
              <span className="w-[56px] flex items-center justify-center flex-shrink-0">
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
  const rows = (data?.rows ?? []).map(heatToRanking);

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
