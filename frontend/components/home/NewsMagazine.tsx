"use client";
import useSWR from "swr";
import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  API_BASE,
  NewsCategory,
  NewsItem,
  NewsResponse,
  fetcher,
  formatRelative,
} from "@/lib/api";
import { NewsImage } from "@/components/news/NewsImage";
import { NewsCard } from "@/components/news/NewsCard";
import { NewsCategorySection } from "@/components/news/NewsCategorySection";
import { MostActiveStocks } from "./MostActiveStocks";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useState } from "react";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

type Section = {
  key: string;
  title: string;
  href: string;
  filter: (n: NewsItem) => boolean;
};

const STOCK_RX = /(stock|equity|equit|share|nasdaq|nyse|exchange)/i;
const ETF_RX = /(etf|exchange[-\s]?traded)/i;
const FUND_RX = /(fund|mutual|adviser|advisor|investment\s+compan)/i;
const BOND_RX = /(bond|treasury\s+yield|yield curve|fixed[-\s]?income|t-bill|debt market)/i;
const PERSONAL_RX = /(retire|savings|consumer|household|personal|inflation)/i;
const SUSTAIN_RX = /(sustainab|climate|esg|environmental|green\b|net zero)/i;

const SECTIONS: Section[] = [
  {
    key: "stocks",
    title: "Stocks",
    href: "/companies",
    filter: (n) => STOCK_RX.test(n.title + " " + n.description),
  },
  {
    key: "funds",
    title: "Funds",
    href: "/funds",
    filter: (n) =>
      n.category === "Funds" || FUND_RX.test(n.title + " " + n.description),
  },
  {
    key: "etfs",
    title: "ETFs",
    href: "/funds",
    filter: (n) => ETF_RX.test(n.title + " " + n.description),
  },
  {
    key: "bonds",
    title: "Bonds",
    href: "/economy",
    filter: (n) => BOND_RX.test(n.title + " " + n.description),
  },
  {
    key: "markets",
    title: "Markets",
    href: "/markets",
    filter: (n) => n.category === "Market",
  },
  {
    key: "economy",
    title: "Economy",
    href: "/economy",
    filter: (n) => n.category === "Economy",
  },
  {
    key: "personal",
    title: "Personal Finance",
    href: "/news",
    filter: (n) => PERSONAL_RX.test(n.title + " " + n.description),
  },
  {
    key: "sustain",
    title: "Sustainable Investing",
    href: "/news",
    filter: (n) => SUSTAIN_RX.test(n.title + " " + n.description),
  },
];

export function NewsMagazine() {
  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=120`,
    fetcher,
    {
      refreshInterval: 5 * 60 * 1000,
      revalidateOnFocus: false,
    },
  );

  const items = data?.items || [];

  const sectionItems = useMemo(() => {
    const used = new Set<string>();
    const out: Record<string, NewsItem[]> = {};
    for (const sec of SECTIONS) {
      const matched = items.filter((n) => sec.filter(n) && !used.has(n.id)).slice(0, 4);
      matched.forEach((m) => used.add(m.id));
      out[sec.key] = matched;
    }
    return out;
  }, [items]);

  const featuredCandidate = items.find((n) => n.category === "Market") || items[0];
  const insightItems = items.filter((n) => n.id !== featuredCandidate?.id).slice(0, 4);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8">
      <div className="space-y-10 min-w-0">
        {/* Category grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-x-6 gap-y-8">
          {SECTIONS.map((sec, i) => (
            <NewsCategorySection
              key={sec.key}
              title={sec.title}
              href={sec.href}
              items={sectionItems[sec.key] || []}
              loading={isLoading}
              index={i}
            />
          ))}
        </div>

        {/* Market Insights */}
        <section>
          <div className="flex items-baseline justify-between mb-4 pb-2 border-b border-[var(--border)]">
            <h2 className="text-lg font-bold tracking-tight">Market Insights</h2>
            <Link
              href="/news"
              className="text-[13px] font-semibold text-accent inline-flex items-center gap-0.5"
            >
              View all <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {featuredCandidate && <Featured item={featuredCandidate} />}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-4">
              {insightItems.map((n) => (
                <InsightItem key={n.id} item={n} />
              ))}
            </div>
          </div>
        </section>

        {/* More news grid */}
        {items.length > 30 && (
          <section>
            <div className="flex items-baseline justify-between mb-4 pb-2 border-b border-[var(--border)]">
              <h2 className="text-lg font-bold tracking-tight">More news</h2>
              <Link
                href="/news"
                className="text-[13px] font-semibold text-accent inline-flex items-center gap-0.5"
              >
                All news <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {items.slice(30, 39).map((n, i) => (
                <NewsCard key={n.id} item={n} index={i} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Right sidebar */}
      <div className="lg:sticky lg:top-20 self-start">
        <MostActiveStocks />
      </div>
    </div>
  );
}

function Featured({ item }: { item: NewsItem }) {
  const seed = hashStr(item.id || item.title);
  const qs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    `${API_BASE}/news/image?${qs}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
        className="block group"
      >
        <div className="relative h-56 rounded-md overflow-hidden bg-[var(--bg-3)] mb-3">
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
        <h3 className="text-[18px] sm:text-[20px] font-bold tracking-tight leading-snug group-hover:text-accent transition">
          {item.title}
        </h3>
        {item.description && (
          <p className="text-[13px] text-mute mt-1.5 line-clamp-2 leading-relaxed">
            {item.description}
          </p>
        )}
        <div className="text-[11px] text-mute mt-2.5">
          {item.source} · {formatRelative(item.pubDate)}
        </div>
      </Link>
    </motion.div>
  );
}

function InsightItem({ item }: { item: NewsItem }) {
  const seed = hashStr(item.id || item.title);
  const qs = new URLSearchParams({
    u: item.link,
    category: item.category,
    seed: item.id,
  }).toString();
  const { data: img } = useSWR<{ image: string | null }>(
    `${API_BASE}/news/image?${qs}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 24 * 60 * 60 * 1000 },
  );
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <Link
      href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
      className="block group grid grid-cols-[1fr_88px] gap-3 items-start py-3 border-b border-[var(--border)]"
    >
      <div className="min-w-0">
        <h4 className="text-[13px] font-semibold leading-snug line-clamp-3 group-hover:text-accent transition">
          {item.title}
        </h4>
        <div className="text-[11px] text-mute mt-1.5 truncate">
          {item.source} · {formatRelative(item.pubDate)}
        </div>
      </div>
      <div className="relative h-16 w-22 rounded-md overflow-hidden bg-[var(--bg-3)]">
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
            className="absolute inset-0 w-full h-full object-cover"
            style={{ opacity: loaded ? 1 : 0 }}
          />
        )}
      </div>
    </Link>
  );
}
