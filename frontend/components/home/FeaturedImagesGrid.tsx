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
    size === "big"
      ? "text-[20px] sm:text-[26px]"
      : "text-[12px] sm:text-[13px]";
  const padding = size === "big" ? "p-5 sm:p-6" : "p-2.5 sm:p-3";

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
          className={`font-semibold leading-tight ${titleSize}`}
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
  const thumbs = items.slice(1, 5);

  return (
    <section className="flex flex-col gap-3 sm:gap-4 w-full">
      {/* Big hero card on top — full width of the column */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="w-full"
        style={{ height: 420 }}
      >
        <HeroImage item={big} size="big" />
      </motion.div>

      {/* Horizontal row of smaller cards — flex with flex-1 on each so the
          row always spans the full width of the big image, regardless of
          whether there are 2, 3, or 4 thumbs in the slide. */}
      <div className="flex gap-3 sm:gap-4 w-full">
        {thumbs.map((it, i) => (
          <motion.div
            key={it.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{
              duration: 0.35,
              delay: 0.08 + i * 0.06,
              ease: [0.22, 1, 0.36, 1],
            }}
            className="flex-1 min-w-0"
            style={{ height: 150 }}
          >
            <HeroImage item={it} size="small" />
          </motion.div>
        ))}
      </div>
    </section>
  );
}
