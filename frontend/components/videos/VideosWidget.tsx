"use client";
import useSWR from "swr";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { Video } from "lucide-react";
import { useEffect, useState } from "react";
import { API_BASE, VideosResponse, fetcher } from "@/lib/api";
import { VideoCard } from "./VideoCard";

const ROTATE_MS = 11000;
const PAGE_SIZE = 3;

export function VideosWidget() {
  const { data, isLoading } = useSWR<VideosResponse>(
    `${API_BASE}/videos`,
    fetcher,
    { refreshInterval: 10 * 60 * 1000, revalidateOnFocus: false },
  );

  const [page, setPage] = useState(0);
  const pages = Math.max(1, Math.ceil((data?.items.length || 0) / PAGE_SIZE));

  useEffect(() => {
    if (pages <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages), ROTATE_MS);
    return () => clearInterval(id);
  }, [pages]);

  const visible = data?.items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE) || [];

  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <div className="flex items-center gap-2.5">
            <Video className="h-4 w-4 text-accent" />
            <div className="text-[15px] font-semibold">Featured videos</div>
          </div>
          <div className="text-xs text-mute mt-0.5">
            Stock & fund explainers · rotating every 11s
          </div>
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
          <Link href="/videos" className="text-xs text-accent hover:underline font-medium">
            View all →
          </Link>
        </div>
      </div>
      <div className="p-4">
        {isLoading || !data ? (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="aspect-video shimmer rounded-lg" />
            ))}
          </div>
        ) : (
          <AnimatePresence mode="wait">
            <motion.div
              key={page}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
              className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
              {visible.map((v, i) => (
                <VideoCard key={v.id} video={v} index={i} />
              ))}
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
