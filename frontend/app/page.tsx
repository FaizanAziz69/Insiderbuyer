"use client";
import useSWR from "swr";
import { useMemo } from "react";
import {
  API_BASE,
  NewsItem,
  NewsResponse,
  RankingsResponse,
  fetcher,
} from "@/lib/api";
import { MonthlyBuySellMeter } from "@/components/home/MonthlyBuySellMeter";
import { PredictionOfTheDay } from "@/components/home/PredictionOfTheDay";
import { FeaturedCarousel } from "@/components/home/FeaturedCarousel";
import { BigPlusFour } from "@/components/home/BigPlusFour";
import { getSampleIdeas } from "@/content/stock-ideas";
import { getSamplePopular } from "@/content/sample-popular";
import { HomeDatasets } from "@/components/home/HomeDatasets";
import { EarningsCalendar } from "@/components/home/EarningsCalendar";
import { SidebarPopularTools } from "@/components/home/SidebarPopularTools";
import { SidebarStockListsPills } from "@/components/home/SidebarStockListsPills";
import { AllAccessCta } from "@/components/home/AllAccessCta";
import { TrialAndNewsletterStrip } from "@/components/home/TrialAndNewsletterStrip";
import { StockHeatmap } from "@/components/heatmap/StockHeatmap";
import { AdSlot } from "@/components/AdSlot";

export default function HomePage() {
  // News pool
  const { data: news } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=60`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  // Rankings (used by the hero sector heatmap + the bottom stock-heatmap section)
  const { data: rankings } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=80`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const items = useMemo<NewsItem[]>(() => {
    const raw = news?.items || [];
    const seen = new Set<string>();
    const out: NewsItem[] = [];
    for (const n of raw) {
      const key = (n.link || "").split("#")[0].split("?")[0].toLowerCase();
      if (seen.has(key) || seen.has(n.id)) continue;
      seen.add(key);
      seen.add(n.id);
      out.push(n);
    }
    return out;
  }, [news]);

  // Slice news pool into the hero + Latest section.
  // Hero carousel takes 12 (3 slides × 4); Latest takes the next 5.
  // Popular Articles uses a curated sample set (see `sample-popular.ts`).
  const featuredImages = items.slice(0, 12);
  const latest = items.slice(12, 17);

  return (
    <div className="space-y-10">
      {/* HERO — featured carousel on the LEFT + two stacked smaller heatmaps on the right */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-4">
        <FeaturedCarousel items={featuredImages} slides={3} itemsPerSlide={4} />
        <div className="flex flex-col gap-4">
          <HeroHeatmapPanel
            title="Market Performance by Sector"
            rows={rankings?.rows?.slice(0, 28) || []}
            mode="sector"
          />
          <HeroHeatmapPanel
            title="Performance by IQS"
            rows={rankings?.rows?.slice(0, 24) || []}
            mode="iqs"
          />
        </div>
      </section>

      {/* Free-trial + newsletter dual strip */}
      <TrialAndNewsletterStrip />

      {/* LATEST FINANCIAL NEWS + Popular Tools sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <BigPlusFour
          title="Latest Financial News"
          href="/news?sort=latest"
          items={latest}
          images
          large
        />
        <SidebarPopularTools />
      </div>

      {/* Banner ad between sections */}
      <AdSlot slot="leaderboard" seed="home-mid-1" />

      {/* POPULAR ARTICLES + Stock List pills sidebar */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <BigPlusFour
          title="Popular Articles"
          href="/news?sort=popular"
          items={getSamplePopular()}
          images
          large
        />
        <SidebarStockListsPills />
      </div>

      {/* STOCK IDEAS — article-style cards (image + headline + summary) */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <BigPlusFour
          title="Stock Ideas"
          href="/lists"
          items={getSampleIdeas()}
          images
          large
        />
        <aside className="space-y-4">
          <PredictionOfTheDay />
          <MonthlyBuySellMeter />
        </aside>
      </div>

      {/* Three datasets side-by-side */}
      <HomeDatasets />

      {/* Inline ad before earnings */}
      <AdSlot slot="leaderboard" seed="home-mid-2" />

      {/* Earnings calendar */}
      <EarningsCalendar days={7} />

      {/* All-Access CTA — the "Get 30 Days for Free" closer */}
      <AllAccessCta />
    </div>
  );
}

function HeroHeatmapPanel({
  title,
  rows,
  mode,
}: {
  title: string;
  rows: import("@/lib/api").RankingRow[];
  mode: "sector" | "iqs";
}) {
  const HEIGHT = 270;
  return (
    <aside
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <h3 className="text-[13px] font-bold uppercase tracking-wider truncate">
          {title}
        </h3>
        <span className="text-[10px] font-mono text-mute uppercase tracking-wider">
          live
        </span>
      </div>
      <div className="p-2">
        {rows.length > 0 ? (
          <StockHeatmap rows={rows} height={HEIGHT} mode={mode} />
        ) : (
          <div
            className="shimmer rounded"
            style={{ height: HEIGHT }}
          />
        )}
      </div>
    </aside>
  );
}
