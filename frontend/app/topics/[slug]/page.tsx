"use client";
import useSWR from "swr";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Search } from "lucide-react";
import {
  API_BASE,
  BlogListResponse,
  BlogPostListItem,
  fetcher,
} from "@/lib/api";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { AdSlot } from "@/components/AdSlot";
import { bylineFor } from "@/lib/byline";
import { assignUniquePhotos } from "@/lib/sector-photos";

/** Topic slug → display label + the representative tickers. */
const TOPIC_META: Record<string, { label: string; tickers: string[] }> = {
  ai: { label: "AI", tickers: ["NVDA", "MSFT", "GOOGL", "META", "AMD", "PLTR", "AVGO", "CRM"] },
  biotech: { label: "Biotech", tickers: ["LLY", "MRNA", "ABBV", "AMGN", "PFE", "MRK", "JNJ", "GILD"] },
  ev: { label: "Electric Vehicles", tickers: ["TSLA", "RIVN", "GM", "F", "ALB", "FCX"] },
  etf: { label: "ETFs", tickers: ["SPY", "IVV", "GLD", "SLV", "TLT", "IEMG"] },
  macro: { label: "Macro", tickers: ["JPM", "BAC", "GS", "XOM", "WMT", "NEE"] },
  markets: { label: "Markets", tickers: ["AAPL", "MSFT", "NVDA", "AMZN", "META", "JPM"] },
  ma: { label: "Mergers & Acquisitions", tickers: ["MSFT", "GOOGL", "JPM", "GS", "AVGO", "ORCL"] },
  semis: { label: "Semiconductors", tickers: ["NVDA", "AMD", "AVGO", "MU", "QCOM", "TXN", "AMAT", "LRCX"] },
};

const TIME_FRAMES = [
  { label: "Last 7 Days", days: 7 },
  { label: "Last 30 Days", days: 30 },
  { label: "Last 90 Days", days: 90 },
  { label: "All Time", days: 100000 },
];

/** "JUNE 17, 2026 10:25 AM ET"-style stamp to match a financial newsroom. */
function stampET(s: string): string {
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return "";
  const date = d
    .toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })
    .toUpperCase();
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
  return `${date} ${time} ET`;
}

const TICKER_EXCHANGE: Record<string, string> = {};
function exchangeFor(ticker: string): string {
  // Lightweight heuristic for the chip prefix; defaults to NASDAQ.
  return TICKER_EXCHANGE[ticker] || "NASDAQ";
}

export default function TopicPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const meta = TOPIC_META[slug] || {
    label: slug.replace(/-/g, " "),
    tickers: [] as string[],
  };

  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?topic=${encodeURIComponent(slug)}&limit=60`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );

  const [sort, setSort] = useState<"latest" | "oldest">("latest");
  const [frame, setFrame] = useState(90);
  const [kw, setKw] = useState("");

  const items = useMemo(() => {
    let rows = (data?.items || []).slice();
    const cutoff = Date.now() - frame * 86400000;
    rows = rows.filter((r) => new Date(r.generatedAt).getTime() >= cutoff);
    if (kw.trim()) {
      const q = kw.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.title.toLowerCase().includes(q) ||
          (r.summary || "").toLowerCase().includes(q) ||
          (r.ticker || "").toLowerCase().includes(q),
      );
    }
    rows.sort((a, b) => {
      const da = new Date(a.generatedAt).getTime();
      const db = new Date(b.generatedAt).getTime();
      return sort === "latest" ? db - da : da - db;
    });
    return rows;
  }, [data, frame, kw, sort]);

  // Assign a unique cover to every visible article so no photo repeats.
  const covers = useMemo(
    () =>
      assignUniquePhotos(
        items.map((it) => ({ seed: it.slug, sector: it.sector })),
      ),
    [items],
  );

  return (
    <div className="w-full space-y-6">
      <header>
        <h1
          className="font-bold tracking-tight"
          style={{ fontSize: "clamp(34px, 4.6vw, 48px)", letterSpacing: "-0.8px" }}
        >
          {meta.label} Articles
        </h1>
        <p className="text-mute text-[13px] mt-1">
          AI-refined {meta.label} coverage from SEC, market and IQS data —
          new articles published daily.
        </p>
      </header>

      {/* Filter bar — Sort By · Time Frame · Keywords (MarketBeat-style) */}
      <div
        className="rounded-lg p-3 sm:p-4 flex flex-col sm:flex-row gap-3 sm:items-end"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <Field label="Sort By">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as "latest" | "oldest")}
            className="filter-select"
          >
            <option value="latest">Latest News</option>
            <option value="oldest">Oldest First</option>
          </select>
        </Field>
        <Field label="Time Frame">
          <select
            value={frame}
            onChange={(e) => setFrame(Number(e.target.value))}
            className="filter-select"
          >
            {TIME_FRAMES.map((t) => (
              <option key={t.days} value={t.days}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Keywords" grow>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-mute" />
            <input
              value={kw}
              onChange={(e) => setKw(e.target.value)}
              placeholder="Search articles"
              className="filter-select w-full"
              style={{ paddingLeft: "2rem" }}
            />
          </div>
        </Field>
      </div>

      <AdSlot slot="leaderboard" seed={`topic-${slug}-top`} />

      {isLoading && !data ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="space-y-2">
              <div className="shimmer rounded-lg" style={{ aspectRatio: "16/10" }} />
              <div className="h-3 w-24 shimmer rounded" />
              <div className="h-4 w-full shimmer rounded" />
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg p-10 text-center"
          style={{ background: "var(--bg-2)", border: "1px dashed var(--border-strong)" }}
        >
          <p className="text-[14px] text-mute">
            No {meta.label} articles match these filters yet. New coverage is
            generated daily.
          </p>
        </div>
      ) : (
        <>
          <div className="text-[12px] text-mute">
            {items.length} {items.length === 1 ? "article" : "articles"}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-8">
            {items.map((item, i) => (
              <ArticleCard key={item.slug} item={item} index={i} src={covers[item.slug]} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Field({
  label,
  children,
  grow,
}: {
  label: string;
  children: React.ReactNode;
  grow?: boolean;
}) {
  return (
    <label className={`block ${grow ? "flex-1" : "sm:w-44"}`}>
      <span className="block text-[10px] uppercase tracking-wider font-bold text-mute mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}

function ArticleCard({
  item,
  index,
  src,
}: {
  item: BlogPostListItem;
  index: number;
  src?: string;
}) {
  const chips = (item.featuredTickers && item.featuredTickers.length
    ? item.featuredTickers
    : item.ticker
    ? [item.ticker]
    : []
  ).slice(0, 3);

  return (
    <motion.article
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: Math.min(index, 8) * 0.03 }}
    >
      <Link href={`/insights/${item.slug}`} className="group block">
        <AiCoverImage
          primary={item.imageUrl}
          seed={item.slug}
          src={src}
          tags={item.tags}
          ticker={item.ticker}
          sector={item.sector}
          overlay="none"
          style={{ aspectRatio: "16 / 10" }}
          className="w-full rounded-lg transition-transform duration-500 group-hover:scale-[1.02]"
        />
        <div className="mt-3">
          <div className="text-[11px] font-semibold text-mute tracking-wide">
            {stampET(item.generatedAt as unknown as string)}
          </div>
          <h2 className="mt-1.5 text-[16px] font-bold leading-snug tracking-tight group-hover:underline decoration-2 underline-offset-2 line-clamp-3">
            {item.title}
          </h2>
          <div className="mt-1.5 text-[11px] uppercase tracking-wider font-bold text-mute">
            {bylineFor(item.kind, item.slug)}
          </div>
        </div>
      </Link>
      {chips.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {chips.map((t) => (
            <Link
              key={t}
              href={`/companies/${encodeURIComponent(t)}`}
              className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold tabular"
              style={{
                background: "var(--bg-3)",
                border: "1px solid var(--border)",
                color: "var(--text-soft)",
              }}
            >
              {exchangeFor(t)}:<span className="text-accent">{t}</span>
            </Link>
          ))}
        </div>
      )}
    </motion.article>
  );
}
