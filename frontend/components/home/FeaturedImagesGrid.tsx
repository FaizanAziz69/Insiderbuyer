"use client";
import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  API_BASE,
  NewsCategory,
  NewsItem,
  fetcher,
} from "@/lib/api";
import { NewsImage } from "@/components/news/NewsImage";
import { SAMPLE_IMAGE_BY_ID } from "@/content/sample-news";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function HeroImage({
  item,
  size,
}: {
  item: NewsItem;
  size: "big" | "small" | "wide";
}) {
  const seed = hashStr(item.id || item.title);
  // Sample/seeded items have a known Unsplash URL — skip the API fetch.
  const sampleImage = SAMPLE_IMAGE_BY_ID[item.id];
  const qs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
    title: item.title.slice(0, 120),
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    !sampleImage ? `${API_BASE}/news/image?${qs}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const resolvedImage = sampleImage || img?.image || null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  const titleSize =
    size === "big" ? "text-[18px] sm:text-[22px]" : "text-[12px] sm:text-[13px]";
  const padding = size === "big" ? "p-4 sm:p-5" : "p-2.5 sm:p-3";

  return (
    <Link
      href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
      className="block relative rounded-md overflow-hidden group h-full"
      style={{ background: "var(--bg-3)" }}
    >
      <div className="absolute inset-0">
        <NewsImage category={item.category as NewsCategory} seed={seed} />
      </div>
      {resolvedImage && !failed && (
        <img
          src={resolvedImage}
          alt=""
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.72) 100%)",
        }}
      />
      <div className={`absolute bottom-0 left-0 right-0 ${padding}`} style={{ color: "#ffffff" }}>
        <h3
          className={`font-semibold leading-tight line-clamp-3 ${titleSize}`}
          style={{
            color: "#ffffff",
            letterSpacing: "-0.01em",
            textShadow: "0 1px 3px rgba(0,0,0,0.55), 0 0 6px rgba(0,0,0,0.3)",
          }}
        >
          {item.title}
        </h3>
      </div>
    </Link>
  );
}

interface Props {
  items: NewsItem[];
}

export function FeaturedImagesGrid({ items }: Props) {
  if (items.length === 0) return null;
  const big = items[0];
  const smallTopLeft = items[1];
  const smallTopRight = items[2];
  const wideBottom = items[3];

  return (
    <section
      className="grid grid-cols-1 lg:grid-cols-[1.35fr_1fr] gap-3 sm:gap-4"
      style={{ minHeight: 600 }}
    >
      {/* Left — one big card */}
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="h-full"
        style={{ minHeight: 600 }}
      >
        <HeroImage item={big} size="big" />
      </motion.div>

      {/* Right — 2 small on top, 1 wide on bottom */}
      <div className="grid grid-rows-[1fr_1fr] gap-3 sm:gap-4">
        <div className="grid grid-cols-2 gap-3 sm:gap-4">
          {smallTopLeft && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.05 }}
            >
              <HeroImage item={smallTopLeft} size="small" />
            </motion.div>
          )}
          {smallTopRight && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.1 }}
            >
              <HeroImage item={smallTopRight} size="small" />
            </motion.div>
          )}
        </div>
        {wideBottom && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
          >
            <HeroImage item={wideBottom} size="wide" />
          </motion.div>
        )}
      </div>
    </section>
  );
}
