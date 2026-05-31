"use client";
import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  API_BASE,
  NewsCategory,
  NewsRegion,
  NewsResponse,
  fetcher,
} from "@/lib/api";
import { NewsCard } from "./NewsCard";

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

  const params = new URLSearchParams();
  params.set("limit", "60");
  if (cat !== "All") params.set("category", cat);
  if (region !== "All") params.set("region", region);

  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?${params.toString()}`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          {icon}
          <span className="font-mono uppercase tracking-wider text-[11px]">{iconLabel}</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
          {title}
        </h1>
        <p className="text-mute text-sm mt-1">{subtitle}</p>
      </header>

      <div className="card p-3 sm:p-4 flex flex-col gap-3">
        {allowCategorySwitch && (
          <div className="flex flex-wrap gap-2">
            {CATEGORY_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setCat(t.key)}
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
                onClick={() => setRegion(t.key)}
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
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="card p-5">
              <div className="h-36 shimmer rounded mb-3" />
              <div className="h-4 w-full shimmer rounded mb-2" />
              <div className="h-3 w-3/4 shimmer rounded" />
            </div>
          ))}
        </div>
      ) : data.items.length === 0 ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="card p-12 text-center text-mute"
        >
          No news matches these filters right now. Try a different region or category.
        </motion.div>
      ) : (
        <>
          <div className="text-xs text-mute">
            {data.items.length} {data.items.length === 1 ? "story" : "stories"}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {data.items.map((n, i) => (
              <NewsCard key={n.id} item={n} index={i} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
