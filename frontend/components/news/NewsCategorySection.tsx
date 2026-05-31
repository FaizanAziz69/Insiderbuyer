"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight } from "lucide-react";
import useSWR from "swr";
import { useState } from "react";
import { API_BASE, NewsItem, fetcher, formatRelative } from "@/lib/api";
import { NewsImage } from "./NewsImage";

interface Props {
  title: string;
  href: string;
  items: NewsItem[];
  loading?: boolean;
  index?: number;
}

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function articleHref(n: NewsItem) {
  return `/article?u=${encodeURIComponent(n.link)}&c=${encodeURIComponent(n.label)}`;
}

export function NewsCategorySection({ title, href, items, loading, index = 0 }: Props) {
  const lead = items[0];
  const rest = items.slice(1, 3);

  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.45, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
      className="min-w-0"
    >
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-[var(--border)]">
        <h3 className="text-[14px] font-bold tracking-tight">{title}</h3>
        <Link
          href={href}
          className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-accent hover:underline"
        >
          View all <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {loading ? (
        <div className="space-y-3">
          <div className="h-32 shimmer rounded-md" />
          <div className="h-4 w-3/4 shimmer rounded" />
          <div className="h-4 w-1/2 shimmer rounded" />
        </div>
      ) : !lead ? (
        <div className="text-[12px] text-mute py-6 text-center">
          No recent {title} stories — check back soon.
        </div>
      ) : (
        <>
          <LeadArticle item={lead} />
          {rest.length > 0 && (
            <ul className="mt-3 divide-y divide-[var(--border)]">
              {rest.map((n) => (
                <li key={n.id} className="py-2.5">
                  <Link href={articleHref(n)} className="group block">
                    <h4 className="text-[13px] font-semibold leading-snug line-clamp-2 group-hover:text-accent transition">
                      {n.title}
                    </h4>
                    <div className="text-[11px] text-mute mt-1 truncate">
                      {n.source} · {formatRelative(n.pubDate)}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </motion.section>
  );
}

function LeadArticle({ item }: { item: NewsItem }) {
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
    <Link href={articleHref(item)} className="block group">
      <div className="relative h-32 sm:h-36 rounded-md overflow-hidden bg-[var(--bg-3)] mb-3">
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
        {img?.image && !loaded && !failed && <div className="absolute inset-0 shimmer" />}
      </div>
      <h4 className="text-[14px] font-semibold leading-snug line-clamp-3 group-hover:text-accent transition">
        {item.title}
      </h4>
      <div className="text-[11px] text-mute mt-1.5 truncate">
        {item.source} · {formatRelative(item.pubDate)}
      </div>
    </Link>
  );
}
