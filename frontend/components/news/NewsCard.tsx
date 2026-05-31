"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, MapPin } from "lucide-react";
import useSWR from "swr";
import { useState } from "react";
import { API_BASE, NewsItem, fetcher, formatRelative } from "@/lib/api";
import { NewsImage } from "./NewsImage";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function NewsCard({ item, index = 0 }: { item: NewsItem; index?: number }) {
  const seed = hashStr(item.id || item.title);
  const href = `/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`;
  const imgQs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
    title: item.title.slice(0, 120),
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    `${API_BASE}/news/image?${imgQs}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link href={href} className="card card-lift block group overflow-hidden">
        <div className="relative h-40 overflow-hidden bg-[var(--bg-3)]">
          <div className="absolute inset-0">
            <NewsImage category={item.category} seed={seed} />
          </div>
          {img?.image && !failed && (
            <img
              src={img.image}
              alt=""
              loading="lazy"
              decoding="async"
              onLoad={() => setLoaded(true)}
              onError={() => setFailed(true)}
              className="absolute inset-0 w-full h-full object-cover transition-all duration-500 group-hover:scale-105"
              style={{ opacity: loaded ? 1 : 0 }}
            />
          )}
          {img?.image && !loaded && !failed && (
            <div className="absolute inset-0 shimmer" />
          )}
          <div
            className="absolute top-3 left-3 inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
          >
            {item.category}
          </div>
          <div
            className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
            style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
          >
            <MapPin className="h-2.5 w-2.5" />
            {item.region === "US" ? "🇺🇸 US" : "🇨🇦 CA"}
          </div>
          {loaded && (
            <div
              className="absolute inset-x-0 bottom-0 h-16"
              style={{
                background:
                  "linear-gradient(180deg, transparent 0%, rgba(0,0,0,0.55) 100%)",
              }}
            />
          )}
          <div className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 text-white text-[11px] font-semibold drop-shadow-md">
            {item.source}
            <span className="text-white/80">· {item.label}</span>
          </div>
          <div
            className="absolute bottom-3 right-3 text-white text-[10px] font-mono px-2 py-0.5 rounded"
            style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)" }}
          >
            {formatRelative(item.pubDate)}
          </div>
        </div>
        <div className="p-5">
          <h3 className="text-[15px] font-semibold leading-snug mb-1.5 group-hover:text-accent transition line-clamp-2">
            {item.title}
          </h3>
          {item.description && (
            <p className="text-[13px] text-mute leading-relaxed line-clamp-2">{item.description}</p>
          )}
          <div className="mt-3 inline-flex items-center gap-1 text-[11px] font-medium text-accent">
            Read article
            <ArrowRight className="h-3 w-3" />
          </div>
        </div>
      </Link>
    </motion.div>
  );
}
