"use client";
import useSWR from "swr";
import { useMemo } from "react";
import { API_BASE, NewsItem, NewsResponse, fetcher } from "@/lib/api";
import { VerticalNewsList } from "@/components/news/VerticalNewsList";
import { TopScoresPanel } from "./TopScoresPanel";
import { RightSidebar } from "./RightSidebar";
import { TopStoriesStrip } from "./TopStoriesStrip";
import { GetInsightsCard } from "./GetInsightsCard";
import { TrendingHeadlines } from "./TrendingHeadlines";
import { PopularTopics } from "./PopularTopics";
import { IndexPulse } from "./IndexPulse";
import { FeaturedStory } from "./FeaturedStory";

export function NewsMagazine() {
  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=120`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  const items = useMemo(() => {
    const raw = data?.items || [];
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();
    const out: NewsItem[] = [];
    for (const n of raw) {
      const linkKey = (n.link || "").split("#")[0].split("?")[0].toLowerCase();
      if (seenIds.has(n.id)) continue;
      if (linkKey && seenLinks.has(linkKey)) continue;
      seenIds.add(n.id);
      if (linkKey) seenLinks.add(linkKey);
      out.push(n);
    }
    return out;
  }, [data]);

  const topStories = items.slice(0, 6);
  const trendingHeadlines = items.slice(6, 16);

  return (
    <div className="space-y-8">
      {/* Index pulse — top market-pulse strip */}
      <IndexPulse />

      {/* Top Stories text strip */}
      {topStories.length > 0 && <TopStoriesStrip items={topStories} />}

      {/* 3-column layout: left sidebar / vertical news list / right sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-6 lg:gap-8">
        {/* LEFT */}
        <div className="order-2 lg:order-1 space-y-6">
          <TopScoresPanel />
          <GetInsightsCard />
          <TrendingHeadlines items={trendingHeadlines} />
        </div>

        {/* CENTER */}
        <div className="order-1 lg:order-2 min-w-0 space-y-8">
          <FeaturedStory />

          {isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="grid grid-cols-[120px_1fr] gap-5 py-4">
                  <div className="aspect-[16/9] shimmer rounded-md" />
                  <div className="space-y-2">
                    <div className="h-3 w-32 shimmer rounded" />
                    <div className="h-5 w-full shimmer rounded" />
                    <div className="h-5 w-3/4 shimmer rounded" />
                    <div className="h-3 w-full shimmer rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <VerticalNewsList items={items} initialCount={8} step={8} />
          )}
        </div>

        {/* RIGHT */}
        <div className="order-3 space-y-6">
          <RightSidebar />
          <PopularTopics />
        </div>
      </div>
    </div>
  );
}
