"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import useSWR from "swr";
import { useState } from "react";
import { API_BASE, NewsItem, fetcher, formatRelative } from "@/lib/api";
import { NewsImage } from "./NewsImage";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function hrefFor(item: NewsItem) {
  return `/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`;
}

function useNewsImage(item: NewsItem) {
  const imgQs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
    title: item.title.slice(0, 120),
  }).toString();
  const { data } = useSWR<{ image: string | null }>(
    `${API_BASE}/news/image?${imgQs}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  return data?.image || null;
}

function LeadCard({ item }: { item: NewsItem }) {
  const seed = hashStr(item.id || item.title);
  const img = useNewsImage(item);
  const [loaded, setLoaded] = useState(false);
  return (
    <Link
      href={hrefFor(item)}
      className="relative block rounded-xl overflow-hidden group h-full min-h-[340px]"
      style={{ background: "var(--bg-3)" }}
    >
      <div className="absolute inset-0">
        <NewsImage category={item.category} seed={seed} />
      </div>
      {img && (
        <img
          src={img}
          alt=""
          loading="eager"
          onLoad={() => setLoaded(true)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          style={{ opacity: loaded ? 1 : 0 }}
        />
      )}
      <div
        className="absolute inset-0"
        style={{ background: "linear-gradient(180deg, rgba(0,0,0,0.1) 30%, rgba(0,0,0,0.82) 100%)" }}
      />
      <div className="absolute top-4 left-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider text-white"
        style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}>
        {item.category}
      </div>
      <div className="absolute bottom-0 left-0 right-0 p-5 sm:p-7 text-white">
        <h2
          className="font-semibold tracking-tight leading-tight line-clamp-3"
          style={{ fontSize: "clamp(22px, 2.6vw, 32px)", letterSpacing: "-0.5px" }}
        >
          {item.title}
        </h2>
        {item.description && (
          <p className="mt-2 text-[14px] text-white/85 leading-relaxed line-clamp-2 max-w-2xl">
            {item.description}
          </p>
        )}
        <div className="mt-3 text-[12px] text-white/80 font-semibold">
          {item.source} · {formatRelative(item.pubDate)}
        </div>
      </div>
    </Link>
  );
}

function MiniCard({ item }: { item: NewsItem }) {
  const seed = hashStr(item.id || item.title);
  const img = useNewsImage(item);
  const [loaded, setLoaded] = useState(false);
  return (
    <Link
      href={hrefFor(item)}
      className="group flex gap-3 p-2.5 rounded-lg transition"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div className="relative flex-shrink-0 rounded-md overflow-hidden" style={{ width: 84, height: 84 }}>
        <div className="absolute inset-0">
          <NewsImage category={item.category} seed={seed} />
        </div>
        {img && (
          <img
            src={img}
            alt=""
            loading="lazy"
            onLoad={() => setLoaded(true)}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
            style={{ opacity: loaded ? 1 : 0 }}
          />
        )}
      </div>
      <div className="min-w-0 flex-1 flex flex-col justify-center">
        <div className="text-[9px] uppercase font-extrabold mb-1 text-accent tracking-wider">
          {item.category}
        </div>
        <h3 className="text-[13px] font-semibold leading-snug line-clamp-3 group-hover:text-accent transition">
          {item.title}
        </h3>
        <div className="text-[10px] text-mute mt-1">
          {item.source} · {formatRelative(item.pubDate)}
        </div>
      </div>
    </Link>
  );
}

/** Stock-exchange-style lead block — one large hero story + four secondary
 *  headlines beside it. */
export function FeaturedNewsHero({ items }: { items: NewsItem[] }) {
  if (items.length === 0) return null;
  const lead = items[0];
  const secondary = items.slice(1, 5);
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="grid grid-cols-1 lg:grid-cols-[1.7fr_1fr] gap-4"
    >
      <LeadCard item={lead} />
      <div className="grid grid-cols-1 gap-3">
        {secondary.map((it) => (
          <MiniCard key={it.id} item={it} />
        ))}
      </div>
    </motion.section>
  );
}
