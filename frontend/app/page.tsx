"use client";
import Link from "next/link";
import useSWR from "swr";
import { ChevronRight } from "lucide-react";
import { API_BASE, RankingsResponse, fetcher } from "@/lib/api";
import { MonthlyBuySellMeter } from "@/components/home/MonthlyBuySellMeter";
import { PredictionOfTheDay } from "@/components/home/PredictionOfTheDay";
import { HomeDatasets } from "@/components/home/HomeDatasets";
import { EarningsCalendar } from "@/components/home/EarningsCalendar";
import { SidebarPopularTools } from "@/components/home/SidebarPopularTools";
import { SidebarStockListsPills } from "@/components/home/SidebarStockListsPills";
import { AllAccessCta } from "@/components/home/AllAccessCta";
import { TrialAndNewsletterStrip } from "@/components/home/TrialAndNewsletterStrip";
import { StockHeatmap } from "@/components/heatmap/StockHeatmap";
import { AdSlot } from "@/components/AdSlot";
import { AiStockIdeasSection } from "@/components/insights/AiStockIdeasSection";
import { AiPopularArticlesSection } from "@/components/insights/AiPopularArticlesSection";
import { AiLatestNewsSection } from "@/components/insights/AiLatestNewsSection";
import { AiFeaturedHero } from "@/components/insights/AiFeaturedHero";

export default function HomePage() {
  return (
    <div className="space-y-10 px-2 sm:px-6 lg:px-12 xl:px-20">
      {/* HERO — AI editorial carousel (grid of images + news, refreshed daily)
          + two stacked smaller heatmaps on the right */}
      <section className="grid grid-cols-1 xl:grid-cols-[1.8fr_1fr] gap-4">
        <AiFeaturedHero />
        {/* Desktop: heatmap + meter sit in the hero's right rail. On mobile
            these move below the news articles (see the xl:hidden block lower
            down) so news leads, MarketBeat-style. */}
        <div className="hidden xl:flex flex-col gap-4">
          <HeroHeatmapPanel title="Market Performance by Sector" />
          <MonthlyBuySellMeter />
        </div>
      </section>

      {/* Mobile only: heatmap + buy/sell meter sit directly under the hero
          (on desktop they live in the hero's right rail above). */}
      <div className="flex xl:hidden flex-col gap-4">
        <HeroHeatmapPanel title="Market Performance by Sector" />
        <MonthlyBuySellMeter />
      </div>

      {/* Free-trial + newsletter dual strip */}
      <TrialAndNewsletterStrip />

      {/* LATEST FINANCIAL NEWS — AI-refined editorial from SEC + IQS data */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <AiLatestNewsSection />
        <SidebarPopularTools />
      </div>

      {/* Banner ad between sections */}
      <AdSlot slot="leaderboard" seed="home-mid-1" />

      {/* POPULAR ARTICLES — AI-generated editorial, refreshed daily */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <AiPopularArticlesSection />
        <SidebarStockListsPills />
      </div>

      {/* STOCK IDEAS — AI-generated trade-idea cards refreshed daily */}
      <div className="grid grid-cols-1 xl:grid-cols-[2.5fr_1fr] gap-6 xl:gap-10">
        <AiStockIdeasSection />
        <aside className="space-y-4">
          <PredictionOfTheDay />
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

function HeroHeatmapPanel({ title }: { title: string }) {
  const HEIGHT = 360;
  const { data } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=120&live=1`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows ?? [];
  return (
    <aside
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <Link
        href="/heatmaps/market"
        className="flex items-center justify-between px-4 py-2.5 border-b group hover:bg-[var(--accent-soft)] transition"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
        title="Open the full market heat map"
      >
        <h3 className="text-[13px] font-bold uppercase tracking-wider truncate group-hover:text-accent transition">
          {title}
        </h3>
        <span className="text-[10px] font-mono text-accent uppercase tracking-wider inline-flex items-center gap-1">
          Full map <ChevronRight className="h-3 w-3" />
        </span>
      </Link>
      <div className="p-2">
        {rows.length > 0 ? (
          <StockHeatmap rows={rows} height={HEIGHT} mode="sector" />
        ) : (
          <div className="shimmer rounded" style={{ height: HEIGHT }} />
        )}
      </div>
    </aside>
  );
}
