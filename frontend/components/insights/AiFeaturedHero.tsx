"use client";
import useSWR from "swr";
import Link from "next/link";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  API_BASE,
  BlogListResponse,
  BlogPostListItem,
  fetcher,
} from "@/lib/api";
import { AiCoverImage } from "./AiCoverImage";

const SLIDES = 3;
const PER_SLIDE = 4; // 1 big + 3 thumbs
const AUTO_ADVANCE_MS = 9000;

/** Hero carousel — same grid-of-images layout as the old SEC-news carousel
 *  (1 big card + 3 thumbs, dot navigation, auto-advance), but fed entirely
 *  by our AI editorial pipeline: SEC Form 4 data → IQS scoring → articles.
 *  Posts are date-stamped, so the whole hero rolls over every 24 hours when
 *  the daily content refresh runs. */
export function AiFeaturedHero() {
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=${SLIDES * PER_SLIDE}`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const items = data?.items || [];

  const groups: BlogPostListItem[][] = [];
  for (let i = 0; i < SLIDES; i++) {
    const slice = items.slice(i * PER_SLIDE, (i + 1) * PER_SLIDE);
    if (slice.length > 0) groups.push(slice);
  }

  const [active, setActive] = useState(0);
  useEffect(() => {
    if (groups.length <= 1) return;
    const t = setInterval(
      () => setActive((a) => (a + 1) % groups.length),
      AUTO_ADVANCE_MS,
    );
    return () => clearInterval(t);
  }, [groups.length]);

  if (isLoading && items.length === 0) {
    return (
      <section className="flex flex-col gap-3 sm:gap-4 w-full">
        <div className="w-full shimmer rounded-lg" style={{ height: 420 }} />
        <div className="flex gap-3 sm:gap-4 w-full">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 shimmer rounded-lg"
              style={{ height: 150 }}
            />
          ))}
        </div>
      </section>
    );
  }

  if (groups.length === 0) {
    return (
      <section
        className="rounded-lg p-10 text-center flex items-center justify-center"
        style={{
          background: "var(--bg-2)",
          border: "1px dashed var(--border-strong)",
          minHeight: 560,
        }}
      >
        <p className="text-[14px] text-mute">
          Daily editorial briefings appear here once the content refresh runs
          — trigger one with <code className="text-accent">POST /content/refresh</code>.
        </p>
      </section>
    );
  }

  const slide = groups[Math.min(active, groups.length - 1)];
  const big = slide[0];
  const thumbs = slide.slice(1);

  return (
    <div className="flex flex-col h-full">
      <div className="relative overflow-hidden flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.section
            key={active}
            initial={{ opacity: 0, x: 40, scale: 0.985 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: -40, scale: 0.985 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
            className="absolute inset-0 flex flex-col gap-3 sm:gap-4 w-full"
          >
            {/* Big card grows to fill the column so the hero bottom aligns
                with the heatmaps on the right. */}
            <div className="w-full flex-1 min-h-[260px]">
              <HeroCard item={big} size="big" eager />
            </div>
            {thumbs.length > 0 && (
              <div className="flex gap-3 sm:gap-4 w-full flex-shrink-0" style={{ height: 150 }}>
                {thumbs.map((it) => (
                  <div key={it.slug} className="flex-1 min-w-0 h-full">
                    <HeroCard item={it} size="small" />
                  </div>
                ))}
              </div>
            )}
          </motion.section>
        </AnimatePresence>
      </div>

      {/* Dot navigation */}
      {groups.length > 1 && (
        <div className="flex items-center justify-center gap-2 mt-4 flex-shrink-0">
          {groups.map((_, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              aria-label={`Slide ${i + 1}`}
              className="transition-all rounded-full"
              style={{
                width: i === active ? 22 : 8,
                height: 8,
                background:
                  i === active ? "var(--accent)" : "var(--border-strong)",
                cursor: "pointer",
                border: "none",
                padding: 0,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function HeroCard({
  item,
  size,
  eager = false,
}: {
  item: BlogPostListItem;
  size: "big" | "small";
  eager?: boolean;
}) {
  const titleSize =
    size === "big" ? "text-[20px] sm:text-[26px]" : "text-[12px] sm:text-[13px]";
  const eyebrowSize = size === "big" ? "text-[11px]" : "text-[9px]";
  const padding = size === "big" ? "p-5 sm:p-6" : "p-2.5 sm:p-3";

  return (
    <Link
      href={`/insights/${item.slug}`}
      className="block relative rounded-md overflow-hidden group h-full"
      style={{ background: "var(--bg-3)" }}
    >
      <AiCoverImage
        primary={item.imageUrl}
        seed={item.slug}
        tags={item.tags}
        ticker={item.ticker}
        sector={item.sector}
        overlay="none"
        loading={eager ? "eager" : "lazy"}
        style={{ width: "100%", height: "100%" }}
        className="transition-transform duration-500 group-hover:scale-105"
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 30%, rgba(0,0,0,0.78) 100%)",
        }}
      />
      <div
        className={`absolute bottom-0 left-0 right-0 ${padding}`}
        style={{ color: "#ffffff" }}
      >
        <div
          className={`uppercase font-extrabold mb-1.5 ${eyebrowSize}`}
          style={{
            color: "#ffd56a",
            letterSpacing: "0.12em",
            textShadow: "0 1px 2px rgba(0,0,0,0.6)",
          }}
        >
          {item.eyebrow || item.kind.replace(/-/g, " ").toUpperCase()}
          {item.ticker && (
            <span className="ml-2 font-mono opacity-90">· {item.ticker}</span>
          )}
        </div>
        <h3
          className={`font-semibold leading-tight line-clamp-3 ${titleSize}`}
          style={{
            color: "#ffffff",
            letterSpacing: "-0.01em",
            textShadow: "0 2px 6px rgba(0,0,0,0.5), 0 0 12px rgba(0,0,0,0.3)",
          }}
        >
          {item.title}
        </h3>
      </div>
    </Link>
  );
}
