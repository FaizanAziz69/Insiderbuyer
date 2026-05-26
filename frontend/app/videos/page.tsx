"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Video } from "lucide-react";
import { API_BASE, VideosResponse, fetcher } from "@/lib/api";
import { VideoCard } from "@/components/videos/VideoCard";

const CATEGORIES = ["All", "Market", "Stocks", "Funds", "ETFs", "Education", "Earnings"] as const;
type Cat = (typeof CATEGORIES)[number];

export default function VideosPage() {
  const { data, isLoading } = useSWR<VideosResponse>(
    `${API_BASE}/videos`,
    fetcher,
    { refreshInterval: 10 * 60 * 1000, revalidateOnFocus: false },
  );
  const [cat, setCat] = useState<Cat>("All");

  const filtered = useMemo(() => {
    if (!data) return [];
    if (cat === "All") return data.items;
    return data.items.filter((v) => v.category === cat);
  }, [data, cat]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Video className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Videos</span>
        </div>
        <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
          Stock & fund explainers
        </h1>
        <p className="text-mute text-sm mt-1">
          Curated finance topics — each card opens a fresh YouTube search so the videos are
          always current.
        </p>
      </header>

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c}
            onClick={() => setCat(c)}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
            style={{
              background: cat === c ? "var(--accent)" : "var(--bg-2)",
              color: cat === c ? "white" : "var(--text-soft)",
              border: `1px solid ${cat === c ? "var(--accent)" : "var(--border)"}`,
              boxShadow: cat === c ? "0 4px 12px rgba(0,102,255,0.25)" : "none",
            }}
          >
            {c}
          </button>
        ))}
      </div>

      {isLoading || !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="aspect-video shimmer rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          No videos in this category yet.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((v, i) => (
            <VideoCard key={v.id} video={v} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}
