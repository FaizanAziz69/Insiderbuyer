"use client";
import useSWR from "swr";
import { Newspaper } from "lucide-react";
import { API_BASE, NewsResponse, fetcher } from "@/lib/api";
import { NewsCard } from "@/components/news/NewsCard";

export default function NewsPage() {
  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=40`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Newspaper className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">News</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
          News & analysis
        </h1>
        <p className="text-mute text-sm mt-1">
          Press releases and statements from the U.S. Securities and Exchange Commission. Refreshed
          every 5 minutes.
        </p>
      </header>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="h-3 w-24 shimmer rounded mb-3" />
              <div className="h-5 w-full shimmer rounded mb-2" />
              <div className="h-4 w-4/5 shimmer rounded mb-1" />
              <div className="h-4 w-3/5 shimmer rounded" />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          No news available right now. Check back in a few minutes.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {data.items.map((n, i) => (
            <NewsCard key={n.id} item={n} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
