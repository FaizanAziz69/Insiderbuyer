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
  formatRelative,
} from "@/lib/api";
import { authorFor } from "@/lib/byline";
import { AiCoverImage } from "./AiCoverImage";

function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

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
    <div className="relative flex flex-col h-full">
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
              <div className="flex gap-3 sm:gap-4 w-full flex-shrink-0" style={{ height: 168 }}>
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

      {/* Dot navigation — floated just below the images (out of the column
          flow) so the images fill the full height and line up with the
          buy/sell bar, while the dots still sit underneath. */}
      {groups.length > 1 && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center gap-2"
          style={{ bottom: -22 }}
        >
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
  const author = authorFor(item.kind, item.slug);

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
      {size === "big" ? (
        /* Frosted translucent white caption — the image shows through a
           semi-transparent white panel (backdrop blur), with dark text.
           Matches MarketBeat's hero caption. */
        <div
          className="absolute left-4 right-4 bottom-4 sm:left-6 sm:right-6 sm:bottom-6 rounded-lg p-4 sm:p-5"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.22)",
          }}
        >
          <div
            className="uppercase font-extrabold mb-1.5 text-[11px]"
            style={{ color: "#1565a0", letterSpacing: "0.12em" }}
          >
            {item.eyebrow || item.kind.replace(/-/g, " ").toUpperCase()}
            {item.ticker && (
              <span className="ml-2 font-mono">· {item.ticker}</span>
            )}
          </div>
          <h3
            className="font-bold leading-tight line-clamp-2 text-[20px] sm:text-[26px]"
            style={{ color: "#0f1d33", letterSpacing: "-0.01em" }}
          >
            {item.title}
          </h3>
          <div className="flex items-center gap-2.5 mt-3">
            <span
              className="inline-flex items-center justify-center h-8 w-8 rounded-full text-[11px] font-bold text-white flex-shrink-0"
              style={{ background: "linear-gradient(135deg, #1565a0, #0f1d33)" }}
            >
              {initials(author.name)}
            </span>
            <div className="leading-tight">
              <div
                className="uppercase font-bold text-[11px]"
                style={{ color: "#243447", letterSpacing: "0.06em" }}
              >
                By {author.name}
              </div>
              <div
                className="uppercase text-[10px]"
                style={{ color: "#5b6b7a", letterSpacing: "0.06em" }}
              >
                {formatRelative(item.generatedAt)}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Thumbs: compact frosted translucent white band with dark title. */
        <div
          className="absolute left-0 right-0 bottom-0 px-3 py-2.5"
          style={{
            background: "rgba(255,255,255,0.82)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
          }}
        >
          <div
            className="uppercase font-extrabold mb-0.5 text-[9px]"
            style={{ color: "#1565a0", letterSpacing: "0.1em" }}
          >
            {item.ticker || item.kind.replace(/-/g, " ").toUpperCase()}
          </div>
          <h3
            className="font-bold leading-snug line-clamp-2 text-[12px] sm:text-[13px]"
            style={{ color: "#0f1d33" }}
          >
            {item.title}
          </h3>
        </div>
      )}
    </Link>
  );
}
