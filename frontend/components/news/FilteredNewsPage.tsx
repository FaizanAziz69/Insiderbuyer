"use client";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  API_BASE,
  NewsCategory,
  NewsRegion,
  NewsResponse,
  TAG_LABELS,
  fetcher,
} from "@/lib/api";
import { NewsCard } from "./NewsCard";
import { FeaturedNewsHero } from "./FeaturedNewsHero";
import { MoversRail } from "./MoversRail";
import { IndicesStrip } from "@/components/home/IndicesStrip";
import { AdSlot } from "@/components/AdSlot";

interface Props {
  title: string;
  subtitle: string;
  defaultCategory?: NewsCategory;
  defaultRegion?: NewsRegion | "All";
  iconLabel: string;
  icon: React.ReactNode;
  allowCategorySwitch?: boolean;
  allowRegionSwitch?: boolean;
}

const CATEGORY_TABS: { key: NewsCategory | "All"; label: string }[] = [
  { key: "All", label: "All news" },
  { key: "Market", label: "Markets" },
  { key: "Economy", label: "Economy" },
  { key: "Funds", label: "Funds" },
  { key: "Regulatory", label: "Regulatory" },
];

const REGION_TABS: { key: NewsRegion | "All"; label: string; flag: string }[] = [
  { key: "All", label: "US + Canada", flag: "🌐" },
  { key: "US", label: "United States", flag: "🇺🇸" },
  { key: "Canada", label: "Canada", flag: "🇨🇦" },
];

const TRENDING_TOPICS = ["ai", "semis", "biotech", "ev", "etf", "macro", "markets", "ma"];

const INITIAL_VISIBLE = 18;

export function FilteredNewsPage({
  title,
  subtitle,
  defaultCategory,
  defaultRegion = "All",
  iconLabel,
  icon,
  allowCategorySwitch = true,
  allowRegionSwitch = true,
}: Props) {
  const [cat, setCat] = useState<NewsCategory | "All">(defaultCategory || "All");
  const [region, setRegion] = useState<NewsRegion | "All">(defaultRegion);
  const [visible, setVisible] = useState(INITIAL_VISIBLE);

  const params = new URLSearchParams();
  params.set("limit", "100");
  if (cat !== "All") params.set("category", cat);
  if (region !== "All") params.set("region", region);

  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?${params.toString()}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  const all = data?.items || [];
  const featured = all.slice(0, 5);
  const rest = all.slice(5);
  const shown = rest.slice(0, visible);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          {icon}
          <span className="font-mono uppercase tracking-wider text-[11px]">{iconLabel}</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1
          className="font-bold tracking-tight"
          style={{ fontSize: "clamp(32px, 4.5vw, 46px)", letterSpacing: "-0.8px", lineHeight: 1.05 }}
        >
          {title}
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          {subtitle}
        </p>
      </header>

      {/* Live market indices strip */}
      <IndicesStrip />

      {/* Trending topics — AI-refined daily topic desks */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wider font-bold text-mute mr-1">
          Trending
        </span>
        {TRENDING_TOPICS.map((t) => (
          <Link key={t} href={`/topics/${t}`} className="pill-link">
            {TAG_LABELS[t] || t}
          </Link>
        ))}
      </div>

      {/* Filters */}
      <div className="card p-3 sm:p-4 flex flex-col gap-3">
        {allowCategorySwitch && (
          <div className="flex flex-wrap gap-2">
            {CATEGORY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setCat(t.key);
                  setVisible(INITIAL_VISIBLE);
                }}
                className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
                style={{
                  background: cat === t.key ? "var(--accent)" : "var(--bg-2)",
                  color: cat === t.key ? "white" : "var(--text-soft)",
                  border: `1px solid ${cat === t.key ? "var(--accent)" : "var(--border)"}`,
                  boxShadow: cat === t.key ? "0 4px 12px rgba(0,102,255,0.25)" : "none",
                }}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}
        {allowRegionSwitch && (
          <div className="flex flex-wrap gap-2">
            {REGION_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => {
                  setRegion(t.key);
                  setVisible(INITIAL_VISIBLE);
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
                style={{
                  background: region === t.key ? "var(--text-soft)" : "var(--bg-2)",
                  color: region === t.key ? "var(--bg-2)" : "var(--text-mute)",
                  border: `1px solid ${region === t.key ? "var(--text-soft)" : "var(--border)"}`,
                }}
              >
                <span>{t.flag}</span>
                {t.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {isLoading || !data ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4">
            <div className="h-[340px] shimmer rounded-xl" />
            <div className="grid gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-[84px] shimmer rounded-lg" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="card p-5">
                <div className="h-36 shimmer rounded mb-3" />
                <div className="h-4 w-full shimmer rounded mb-2" />
                <div className="h-3 w-3/4 shimmer rounded" />
              </div>
            ))}
          </div>
        </div>
      ) : all.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card p-12 text-center text-mute"
        >
          No news matches these filters right now. Try a different region or category.
        </motion.div>
      ) : (
        <>
          {/* Featured hero */}
          <FeaturedNewsHero items={featured} />

          <AdSlot slot="leaderboard" seed="news-mid" />

          {/* Main feed + live market sidebar */}
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            <div>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-[18px] font-bold tracking-tight">Latest headlines</h2>
                <span className="text-xs text-mute">
                  {all.length} {all.length === 1 ? "story" : "stories"}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {shown.map((n, i) => (
                  <NewsCard key={n.id} item={n} index={i} />
                ))}
              </div>
              {visible < rest.length && (
                <div className="flex justify-center mt-6">
                  <button
                    onClick={() => setVisible((v) => v + 12)}
                    className="px-6 py-2.5 rounded-full text-[13px] font-bold transition"
                    style={{
                      background: "var(--bg-2)",
                      color: "var(--text)",
                      border: "1px solid var(--border-strong)",
                    }}
                  >
                    Load more stories
                  </button>
                </div>
              )}
            </div>

            <aside className="space-y-4 lg:sticky lg:top-4 self-start">
              <MoversRail />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
