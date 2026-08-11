"use client";
import useSWR from "swr";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Newspaper } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE, NewsResponse, fetcher, formatRelative } from "@/lib/api";

const ROTATE_MS = 9000;

export function NewsWidget() {
  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=24`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil((data?.items.length || 0) / 5));

  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), ROTATE_MS);
    return () => clearInterval(id);
  }, [pages]);

  const visible = data?.items.slice(page * 5, page * 5 + 5) || [];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <Newspaper className="h-4 w-4 text-accent" />
            <div className="text-[15px] font-semibold">Market news</div>
            <span className="live-dot live-dot-good text-faint">live</span>
          </div>
          <div className="text-xs text-mute mt-0.5">SEC press releases & speeches · rotating</div>
        </div>
        <div className="flex items-center gap-2">
          {pages > 1 && (
            <div className="hidden sm:flex items-center gap-1">
              {Array.from({ length: pages }).map((_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className="h-1.5 rounded-full transition-all"
                  style={{
                    width: i === page ? 16 : 6,
                    background: i === page ? "var(--accent)" : "var(--border-strong)",
                  }}
                  aria-label={`Page ${i + 1}`}
                />
              ))}
            </div>
          )}
          <Link href="/news" className="text-xs text-accent hover:underline font-medium">
            View all →
          </Link>
        </div>
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
      ) : visible.length === 0 ? (
        <div className="px-5 py-10 text-sm text-mute text-center">
          No news right now. Check back later.
        </div>
      ) : (
        <AnimatePresence mode="wait">
          <motion.ul
            key={page}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="divide-y divide-[var(--border)]"
          >
            {visible.map((n, i) => (
              <li key={n.id}>
                <Link
                  href={`/article?u=${encodeURIComponent(n.link)}&c=${encodeURIComponent(n.label || n.category)}`}
                  className="block px-5 py-3.5 hover:bg-[var(--accent-soft)] transition group"
                >
                  <div className="flex items-center gap-2 text-[11px] text-mute mb-1">
                    <span className="font-semibold text-soft">{n.source}</span>
                    <span className="text-faint">·</span>
                    <span>{n.category}</span>
                    <span className="ml-auto text-faint">{formatRelative(n.pubDate)}</span>
                  </div>
                  <div className="font-serif text-[13.5px] font-semibold leading-snug line-clamp-2 group-hover:text-accent transition">
                    {n.title}
                  </div>
                </Link>
              </li>
            ))}
          </motion.ul>
        </AnimatePresence>
      )}
    </div>
  );
}
