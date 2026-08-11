"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  API_BASE,
  NewsCategory,
  NewsItem,
  fetcher,
  formatRelative,
} from "@/lib/api";
import { NewsImage } from "./NewsImage";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

interface Props {
  items: NewsItem[];
  initialCount?: number;
  step?: number;
}

export function VerticalNewsList({
  items,
  initialCount = 8,
  step = 8,
}: Props) {
  const [visible, setVisible] = useState(initialCount);
  const slice = items.slice(0, visible);
  const hasMore = items.length > visible;

  return (
    <section>
      <ul className="divide-y divide-[var(--border)]">
        {slice.map((n, i) => (
          <NewsListRow key={n.id} item={n} index={i} />
        ))}
      </ul>
      {hasMore && (
        <div className="text-center mt-6">
          <button
            onClick={() => setVisible((v) => v + step)}
            className="btn-primary"
            style={{ padding: "10px 24px", fontSize: 13 }}
          >
            Show more
          </button>
        </div>
      )}
    </section>
  );
}

function NewsListRow({ item, index }: { item: NewsItem; index: number }) {
  const seed = hashStr(item.id || item.title);
  const qs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
    title: item.title.slice(0, 120),
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    `${API_BASE}/news/image?${qs}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.35, delay: Math.min(index, 6) * 0.03 }}
    >
      <Link
        href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
        className="grid grid-cols-[96px_1fr] sm:grid-cols-[120px_1fr] gap-4 sm:gap-5 py-4 group"
      >
        <div
          className="relative rounded-md overflow-hidden bg-[var(--bg-3)]"
          style={{ aspectRatio: "16 / 9" }}
        >
          <div className="absolute inset-0">
            <NewsImage category={item.category as NewsCategory} seed={seed} />
          </div>
          {img?.image && !failed && (
            <img
              src={img.image}
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

        <div className="min-w-0 flex flex-col justify-center">
          <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
            <Tag>{item.category}</Tag>
            <Tag muted>{item.region === "US" ? "United States" : item.region}</Tag>
          </div>
          <h3
            className="text-[16px] sm:text-[19px] font-semibold leading-snug tracking-tight group-hover:text-accent transition line-clamp-2"
            style={{ letterSpacing: "-0.2px" }}
          >
            {item.title}
          </h3>
          {item.description && (
            <p className="text-[13px] sm:text-[14px] text-mute mt-1.5 leading-relaxed line-clamp-2">
              {item.description}
            </p>
          )}
          <div className="text-[11px] text-faint mt-1.5 truncate">
            {item.source} · {formatRelative(item.pubDate)}
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

function Tag({ children, muted = false }: { children: React.ReactNode; muted?: boolean }) {
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider"
      style={
        muted
          ? {
              background: "var(--bg-3)",
              color: "var(--accent)",
            }
          : {
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }
      }
    >
      {children}
    </span>
  );
}
