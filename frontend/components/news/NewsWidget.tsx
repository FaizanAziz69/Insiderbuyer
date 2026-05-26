"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ExternalLink, Newspaper } from "lucide-react";
import { API_BASE, NewsResponse, fetcher, formatRelative } from "@/lib/api";

export function NewsWidget() {
  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=6`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <Newspaper className="h-4 w-4 text-accent" />
            <div className="text-[15px] font-semibold">Market news</div>
            <span className="live-dot live-dot-good text-faint">live</span>
          </div>
          <div className="text-xs text-mute mt-0.5">SEC press releases & speeches</div>
        </div>
        <Link href="/news" className="text-xs text-accent hover:underline font-medium">
          View all →
        </Link>
      </div>
      {isLoading || !data ? (
        <ul className="divide-y divide-[var(--border)]">
          {Array.from({ length: 5 }).map((_, i) => (
            <li key={i} className="px-5 py-4">
              <div className="h-3 w-24 shimmer rounded mb-2" />
              <div className="h-4 w-full shimmer rounded mb-1" />
              <div className="h-3 w-3/4 shimmer rounded" />
            </li>
          ))}
        </ul>
      ) : data.items.length === 0 ? (
        <div className="px-5 py-10 text-sm text-mute text-center">
          No news right now. Check back later.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {data.items.slice(0, 5).map((n, i) => (
            <motion.li
              key={n.id}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.04 * i }}
            >
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-5 py-3.5 hover:bg-[var(--accent-soft)] transition group"
              >
                <div className="flex items-center gap-2 text-[11px] text-mute mb-1">
                  <span className="font-semibold text-soft">{n.source}</span>
                  <span className="text-faint">·</span>
                  <span>{n.category}</span>
                  <span className="ml-auto text-faint">{formatRelative(n.pubDate)}</span>
                </div>
                <div className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-accent transition">
                  {n.title}
                </div>
              </a>
            </motion.li>
          ))}
        </ul>
      )}
    </div>
  );
}
