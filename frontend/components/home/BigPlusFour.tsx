"use client";
import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import {
  API_BASE,
  NewsCategory,
  NewsItem,
  fetcher,
  formatRelative,
} from "@/lib/api";
import { NewsImage } from "@/components/news/NewsImage";
import { SAMPLE_IMAGE_BY_ID } from "@/content/sample-news";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  title: string;
  href: string;
  items: NewsItem[];
  images?: boolean;
  large?: boolean;
}

function BigCard({ item, images }: { item: NewsItem; images: boolean }) {
  const seed = hashStr(item.id || item.title);
  const sampleImage = SAMPLE_IMAGE_BY_ID[item.id];
  const qs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
    title: item.title.slice(0, 120),
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    images && !sampleImage ? `${API_BASE}/news/image?${qs}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const resolvedImage = sampleImage || img?.image || null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
      className="block group h-full"
    >
      {images && (
        <div
          className="relative aspect-[16/9] rounded-lg overflow-hidden mb-4"
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
        </div>
      )}
      <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1.5">
        {item.category}
      </div>
      <h3
        className="text-[20px] sm:text-[26px] font-semibold tracking-tight leading-snug group-hover:text-accent transition"
        style={{ letterSpacing: "-0.01em" }}
      >
        {item.title}
      </h3>
      {item.description && (
        <p className="text-[13px] sm:text-[14px] text-soft mt-2 leading-relaxed line-clamp-3">
          {item.description}
        </p>
      )}
      <div className="text-[11px] text-mute mt-2.5">
        {item.source} · {formatRelative(item.pubDate)}
      </div>
    </Link>
  );
}

function SmallCard({ item, images }: { item: NewsItem; images: boolean }) {
  const seed = hashStr(item.id || item.title);
  const sampleImage = SAMPLE_IMAGE_BY_ID[item.id];
  const qs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
    title: item.title.slice(0, 120),
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    images && !sampleImage ? `${API_BASE}/news/image?${qs}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const resolvedImage = sampleImage || img?.image || null;
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
      className="block group h-full"
    >
      {images && (
        <div
          className="relative aspect-[16/9] rounded-lg overflow-hidden mb-3"
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
        </div>
      )}
      <div className="min-w-0">
        <div className="text-[9px] uppercase tracking-wider font-bold text-accent mb-1">
          {item.category}
        </div>
        <h4 className="text-[14px] sm:text-[15px] font-semibold leading-snug group-hover:text-accent transition">
          {item.title}
        </h4>
        <div className="text-[11px] text-mute mt-1.5">
          {item.source} · {formatRelative(item.pubDate)}
        </div>
      </div>
    </Link>
  );
}

export function BigPlusFour({
  title,
  href,
  items,
  images = true,
  large = false,
}: Props) {
  if (items.length === 0) return null;
  const big = items[0];
  const smalls = items.slice(1, 5);
  const headingClass = large ? "large-section-h" : "section-h";
  // Wider big-card column when `large`: gives the lead story a chunkier image
  // and matches the more spacious section feel.
  const gridCols = large
    ? "grid-cols-1 lg:grid-cols-[1.6fr_1fr]"
    : "grid-cols-1 lg:grid-cols-[1.2fr_1fr]";

  return (
    <section>
      <div className={headingClass} style={{ alignItems: "baseline" }}>
        <span>{title}</span>
        <Link
          href={href}
          className="text-[12px] font-medium text-accent hover:underline inline-flex items-center gap-0.5 uppercase tracking-wider"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>
      <div className={`grid ${gridCols} gap-6 lg:gap-8`}>
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.1 }}
          transition={{ duration: 0.3 }}
        >
          <BigCard item={big} images={images} />
        </motion.div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
          {smalls.map((it, i) => (
            <motion.div
              key={it.id}
              initial={{ opacity: 0, y: 6 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.3, delay: 0.05 * i }}
            >
              <SmallCard item={it} images={images} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
