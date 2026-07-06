"use client";
import { Newspaper } from "lucide-react";
import { IndicesStrip } from "@/components/home/IndicesStrip";
import { AiLatestNewsSection } from "@/components/insights/AiLatestNewsSection";
import { AiPopularArticlesSection } from "@/components/insights/AiPopularArticlesSection";
import { AiStockIdeasSection } from "@/components/insights/AiStockIdeasSection";
import { RealTimeNewsFeed } from "@/components/news/RealTimeNewsFeed";
import { AdSlot } from "@/components/AdSlot";

/**
 * News & analysis — AI editorial only. No raw SEC press releases or their
 * (often broken) images: every story is an AI-written briefing synthesised from
 * the live Form 4 + Insider Score feed, rendered in the same card style as Stock Ideas.
 */
export default function NewsPage() {
  return (
    <div className="w-full space-y-8">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Newspaper className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">News</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1
          className="font-bold tracking-tight"
          style={{ fontSize: "clamp(32px, 4.5vw, 46px)", letterSpacing: "-0.8px", lineHeight: 1.05 }}
        >
          News &amp; analysis
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          AI-written financial news and analysis, synthesised from today&rsquo;s SEC Form 4
          filings and our proprietary Insider Score scoring engine — refreshed every morning.
        </p>
      </header>

      {/* Live market indices strip */}
      <IndicesStrip />

      <AdSlot slot="leaderboard" seed="news-top" />

      {/* Real-time market feed — insider trades, congress, earnings, headlines */}
      <section>
        <h2 className="text-[20px] font-bold tracking-tight mb-3">Real-Time Market Feed</h2>
        <RealTimeNewsFeed />
      </section>

      {/* AI editorial — same card layout as Stock Ideas, no SEC feed */}
      <AiLatestNewsSection />

      <AdSlot slot="leaderboard" seed="news-mid" />

      <AiPopularArticlesSection />

      <AiStockIdeasSection />
    </div>
  );
}
