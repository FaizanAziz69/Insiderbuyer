"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
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
import { RightSidebar } from "./RightSidebar";
import { TopStoriesStrip } from "./TopStoriesStrip";
import { GetInsightsCard } from "./GetInsightsCard";
import { TrendingHeadlines } from "./TrendingHeadlines";
import { PopularTopics } from "./PopularTopics";
import { IndexPulse } from "./IndexPulse";
import { FeaturedVideo } from "./FeaturedVideo";
import { UpcomingEvents } from "./UpcomingEvents";
import Link from "next/link";
import { ChevronRight } from "lucide-react";

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
  fallback?: (n: NewsItem) => boolean;
};

const STOCK_RX = /(stock|equity|equit|share|nasdaq|nyse|exchange|company\s+earnings|listed)/i;
const ETF_RX = /(etf|exchange[-\s]?traded|index\s+fund|passive\s+(fund|invest|strateg)|registered\s+investment)/i;
const FUND_RX = /(fund|mutual|adviser|advisor|investment\s+compan|portfolio\s+manag)/i;
const BOND_RX = /(bond|treasury\s+yield|yield\s+curve|fixed[-\s]?income|t-bill|debt\s+market|government\s+securit|treasury\s+secur|note\s+auction|coupon|sovereign|interest\s+rate)/i;
const PERSONAL_RX = /(retire|savings|consumer|household|personal\s+(finance|invest)|inflation|wages|employment|jobs)/i;
const SUSTAIN_RX = /(sustainab|climate|esg|environmental|green\b|net\s+zero|carbon|renewable)/i;

const SECTIONS: Section[] = [
  {
    key: "stocks",
    title: "Stocks",
    href: "/companies",
    filter: (n) => STOCK_RX.test(n.title + " " + n.description),
    fallback: (n) => n.category === "Market",
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
    fallback: (n) =>
      n.category === "Funds" || FUND_RX.test(n.title + " " + n.description),
  },
  {
    key: "bonds",
    title: "Bonds",
    href: "/economy",
    filter: (n) => BOND_RX.test(n.title + " " + n.description),
    fallback: (n) => n.category === "Economy",
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
    fallback: (n) => n.category === "Economy",
  },
  {
    key: "sustain",
    title: "Sustainable Investing",
    href: "/news",
    filter: (n) => SUSTAIN_RX.test(n.title + " " + n.description),
    fallback: (n) => n.category === "Regulatory",
  },
];

export function NewsMagazine() {
  const { data, isLoading } = useSWR<NewsResponse>(
    `${API_BASE}/news?limit=120`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  const items = useMemo(() => {
    const raw = data?.items || [];
    const seenIds = new Set<string>();
    const seenLinks = new Set<string>();
    const out: NewsItem[] = [];
    for (const n of raw) {
      const linkKey = (n.link || "").split("#")[0].split("?")[0].toLowerCase();
      if (seenIds.has(n.id)) continue;
      if (linkKey && seenLinks.has(linkKey)) continue;
      seenIds.add(n.id);
      if (linkKey) seenLinks.add(linkKey);
      out.push(n);
    }
    return out;
  }, [data]);

  const sectionItems = useMemo(() => {
    const used = new Set<string>();
    const out: Record<string, NewsItem[]> = {};
    for (const sec of SECTIONS) {
      const matched = items.filter((n) => sec.filter(n) && !used.has(n.id)).slice(0, 4);
      matched.forEach((m) => used.add(m.id));
      out[sec.key] = matched;
    }
    for (const sec of SECTIONS) {
      if (!sec.fallback) continue;
      if (out[sec.key].length >= 3) continue;
      const supplement = items
        .filter((n) => sec.fallback!(n) && !used.has(n.id))
        .slice(0, 4 - out[sec.key].length);
      supplement.forEach((m) => used.add(m.id));
      out[sec.key] = [...out[sec.key], ...supplement];
    }
    return out;
  }, [items]);

  const heroUsed = new Set<string>();
  const featuredCandidate =
    items.find((n) => n.category === "Market") || items[0];
  if (featuredCandidate) heroUsed.add(featuredCandidate.id);
  const heroSecondary = items.filter((n) => !heroUsed.has(n.id)).slice(0, 2);
  heroSecondary.forEach((s) => heroUsed.add(s.id));
  const topStories = items.filter((n) => !heroUsed.has(n.id)).slice(0, 6);
  topStories.forEach((s) => heroUsed.add(s.id));
  const trendingHeadlines = items.filter((n) => !heroUsed.has(n.id)).slice(0, 10);
  trendingHeadlines.forEach((s) => heroUsed.add(s.id));

  return (
    <div className="space-y-8">
      {/* Index pulse — top market-pulse strip */}
      <IndexPulse />

      {/* Top Stories text strip */}
      {topStories.length > 0 && <TopStoriesStrip items={topStories} />}

      {/* Featured SEC investor-education video with headlines above */}
      <FeaturedVideo headlines={trendingHeadlines} />

      {/* Single 3-column layout for the rest */}
      <div className="grid grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)_280px] gap-6 lg:gap-8">
        {/* LEFT: MostActive + GetInsights + Trending Headlines stacked */}
        <div className="order-2 lg:order-1 space-y-6">
          <MostActiveStocks />
          <GetInsightsCard />
          <TrendingHeadlines items={trendingHeadlines} />
        </div>

        {/* CENTER: Featured hero + Category grid + More news */}
        <div className="order-1 lg:order-2 min-w-0 space-y-10">
          {/* Featured + 2 secondary */}
          {!featuredCandidate ? (
            <div className="space-y-5">
              <div className="card h-[420px] shimmer" />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="card h-32 shimmer" />
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <Featured item={featuredCandidate} />
              {heroSecondary.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-[var(--border)]">
                  {heroSecondary.map((item) => (
                    <SecondaryCompact key={item.id} item={item} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Category grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-x-6 gap-y-8 pt-2">
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

        </div>

        {/* RIGHT: AI Promo + Newsletter + Popular Topics + Upcoming Events stacked */}
        <div className="order-3 space-y-6">
          <RightSidebar />
          <PopularTopics />
          <UpcomingEvents />
        </div>
      </div>

      {/* Full-width More news section */}
      {items.length > 30 && (
        <section className="pt-2">
          <div className="flex items-baseline justify-between mb-5 pb-2 border-b border-[var(--border)]">
            <div>
              <h2 className="text-xl font-bold tracking-tight">More news</h2>
              <p className="text-xs text-mute mt-0.5">
                Latest releases from across our public-source feeds
              </p>
            </div>
            <Link
              href="/news"
              className="text-[13px] font-semibold text-accent inline-flex items-center gap-0.5"
            >
              All news <ChevronRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {items.slice(30, 42).map((n, i) => (
              <NewsCard key={n.id} item={n} index={i} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Featured({ item }: { item: NewsItem }) {
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
        <div className="relative aspect-[4/3] rounded-md overflow-hidden bg-[var(--bg-3)] mb-3">
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
        <h3
          className="text-[20px] sm:text-[22px] font-bold tracking-tight leading-snug group-hover:text-accent transition"
          style={{ letterSpacing: "-0.2px" }}
        >
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

function SecondaryCompact({ item }: { item: NewsItem }) {
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
    <Link
      href={`/article?u=${encodeURIComponent(item.link)}&c=${encodeURIComponent(item.label)}`}
      className="block group grid grid-cols-[1fr_96px] gap-3 items-center py-3 border-b border-[var(--border)] last:border-b-0"
    >
      <div className="min-w-0">
        <h4 className="text-[14px] font-semibold leading-snug line-clamp-3 group-hover:text-accent transition">
          {item.title}
        </h4>
        <div className="text-[11px] text-mute mt-1.5 truncate">
          {item.source} · {formatRelative(item.pubDate)}
        </div>
      </div>
      <div className="relative h-20 w-24 rounded-md overflow-hidden bg-[var(--bg-3)] flex-shrink-0">
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
