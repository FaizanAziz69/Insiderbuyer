"use client";
import { Suspense } from "react";
import useSWR from "swr";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, FileText, User } from "lucide-react";
import {
  API_BASE,
  BlogKind,
  BlogListResponse,
  fetcher,
  formatDate,
} from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { assignUniquePhotos } from "@/lib/sector-photos";
import { articleLabel } from "@/lib/articleLabel";
import { maskScoreInList } from "@/lib/sanitizeArticleHtml";
import { usePremium } from "@/components/premium/PremiumContext";
import { bylineFor } from "@/lib/byline";

/* The per-kind label map that used to live here gave every article of a kind
   the same eyebrow, so a page of 40 cards repeated a handful of words. Card
   eyebrows now come from `articleLabel`, which varies the wording per article
   off that article's own record. */

// "Most-read"/popular ordering: high-signal editorial kinds float to the top.
// We have no read-count metric, so this deterministic priority stands in for it.
const POPULAR_WEIGHT: Partial<Record<BlogKind, number>> = {
  "top-iqs": 6,
  "cluster-buy": 5,
  "ceo-buying": 4,
  "ticker-deep-dive": 3,
  "weekly-report": 2,
  "sector-roundup": 1,
};

const SORT_COPY: Record<
  string,
  { eyebrow: string; title: string; blurb: string }
> = {
  latest: {
    eyebrow: "LATEST",
    title: "Latest Financial News",
    blurb:
      "The freshest editorial briefings, newest first — synthesised from today’s SEC Form 4 filings and our Insider Score scoring engine.",
  },
  popular: {
    eyebrow: "POPULAR",
    title: "Popular Articles",
    blurb:
      "The most-read insider-buying stories — top Insider Score picks, cluster buys and CEO purchases drawn from the live Form 4 feed.",
  },
};

export default function InsightsIndexPage() {
  return (
    <Suspense fallback={<div className="h-screen" />}>
      <InsightsIndexInner />
    </Suspense>
  );
}

function InsightsIndexInner() {
  const sort = useSearchParams().get("sort") || "";
  const copy = SORT_COPY[sort] ?? {
    eyebrow: "INSIGHTS",
    title: "Insider Buying Insights",
    blurb:
      "Editorial briefings synthesised from today’s SEC Form 4 filings and our proprietary Insider Score scoring engine. New posts published every morning from the live insider-buying feed.",
  };

  const { unlocked } = usePremium();
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=40`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const base = data?.items || [];
  // "latest" = newest first (API default order); "popular" = high-signal kinds first.
  const rawItems =
    sort === "popular"
      ? [...base].sort(
          (a, b) =>
            (POPULAR_WEIGHT[b.kind] ?? 0) - (POPULAR_WEIGHT[a.kind] ?? 0),
        )
      : base;
  // Card titles/summaries can state the score — mask the list once here.
  const items = maskScoreInList(rawItems, { unlocked });
  const featured = items[0];
  const rest = items.slice(1);
  const covers = assignUniquePhotos(
    items.map((it) => ({ seed: it.slug, sector: it.sector })),
  );

  return (
    <div className="space-y-8">
      <header>
        <div
          className="mb-2 font-mono uppercase"
          style={{
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
          }}
        >
          <FileText className="inline-block h-3 w-3 mr-1.5 -mt-0.5" />
          {copy.eyebrow}
        </div>
        <h1
          className="font-semibold tracking-tight"
          style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            letterSpacing: "-1px",
            lineHeight: 1.05,
          }}
        >
          {copy.title}
        </h1>
        <p
          className="mt-4 max-w-3xl leading-relaxed"
          style={{ color: "var(--text-soft)", fontSize: 17 }}
        >
          {copy.blurb}
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="insights-top" />

      {isLoading && !featured ? (
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
          <div className="shimmer rounded-lg h-[440px]" />
          <div className="grid grid-cols-1 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="shimmer rounded-lg h-[100px]" />
            ))}
          </div>
        </div>
      ) : items.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* Featured top story + side rail */}
          <section className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6">
            {featured && <FeaturedCard item={featured} src={covers[featured.slug]} />}
            <div className="grid grid-cols-1 gap-3">
              {rest.slice(0, 4).map((item) => (
                <RailRow key={item.slug} item={item} src={covers[item.slug]} />
              ))}
            </div>
          </section>

          <AdSlot slot="leaderboard" seed="insights-mid" />

          {/* Grid of remaining articles */}
          {rest.length > 4 && (
            <section>
              <h2 className="text-[20px] font-semibold tracking-tight mb-4">
                More from our editors
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                {rest.slice(4).map((item, i) => (
                  <GridCard key={item.slug} item={item} index={i} src={covers[item.slug]} />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}

function FeaturedCard({ item, src }: { item: BlogListResponse["items"][number]; src?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/insights/${item.slug}`}
        className="block rounded-xl overflow-hidden group h-full"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        <AiCoverImage
          primary={item.imageUrl}
          src={src}
          tags={item.tags}
          ticker={item.ticker}
          sector={item.sector}
          seed={item.slug}
          overlay="none"
          loading="eager"
          style={{ aspectRatio: "16 / 9" }}
          className="w-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="p-6 sm:p-7">
          <div
            className="mb-3 font-bold uppercase"
            style={{
              fontSize: 11,
              color: "var(--accent)",
              letterSpacing: "0.12em",
            }}
          >
            {articleLabel(item)}
          </div>
          <h2
            className="font-semibold tracking-tight group-hover:text-accent transition"
            style={{
              fontSize: "clamp(22px, 2.4vw, 30px)",
              letterSpacing: "-0.5px",
              lineHeight: 1.15,
            }}
          >
            {item.title}
          </h2>
          <p
            className="mt-3 leading-relaxed"
            style={{ color: "var(--text-soft)", fontSize: 15 }}
          >
            {item.summary}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
            <span
              className="inline-flex items-center gap-1.5 font-semibold"
              style={{ color: "var(--text)" }}
            >
              <User className="h-3 w-3 text-accent" />
              {bylineFor(item.kind, item.slug)}
            </span>
            <span className="text-mute">·</span>
            <span
              className="inline-flex items-center gap-1"
              style={{ color: "var(--text-mute)" }}
            >
              <Calendar className="h-3 w-3" />
              <span style={{ color: "var(--text)" }} className="font-semibold">
                {formatDate(item.generatedAt as unknown as string)}
              </span>
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function RailRow({ item, src }: { item: BlogListResponse["items"][number]; src?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 14 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      <Link
        href={`/insights/${item.slug}`}
        className="group flex gap-3 p-2.5 rounded-lg transition"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        <AiCoverImage
          primary={item.imageUrl}
          src={src}
          tags={item.tags}
          ticker={item.ticker}
          sector={item.sector}
          seed={item.slug}
          overlay="none"
          className="flex-shrink-0 rounded-md transition-transform duration-500 group-hover:scale-110"
          style={{ width: 96, height: 96 }}
        />
        <div className="min-w-0 flex-1 flex flex-col justify-between py-0.5">
          <div>
            <div
              className="text-[9px] uppercase font-extrabold mb-1.5"
              style={{ color: "var(--accent)", letterSpacing: "0.12em" }}
            >
              {articleLabel(item)}
            </div>
            <h3
              className="font-semibold leading-snug line-clamp-3 group-hover:text-accent transition"
              style={{ fontSize: 14, letterSpacing: "-0.01em" }}
            >
              {item.title}
            </h3>
          </div>
          <div className="text-[10px] mt-1.5 flex items-center gap-1.5">
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--text)" }}
            >
              <User className="h-2.5 w-2.5" />
              {bylineFor(item.kind, item.slug)}
            </span>
            <span className="text-mute">·</span>
            <span className="text-mute font-semibold">
              {formatDate(item.generatedAt as unknown as string)}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function GridCard({
  item,
  index,
  src,
}: {
  item: BlogListResponse["items"][number];
  index: number;
  src?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.05 }}
    >
      <Link
        href={`/insights/${item.slug}`}
        className="block rounded-lg overflow-hidden group h-full"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border)",
        }}
      >
        <AiCoverImage
          primary={item.imageUrl}
          src={src}
          tags={item.tags}
          ticker={item.ticker}
          sector={item.sector}
          seed={item.slug}
          overlay="none"
          style={{ aspectRatio: "16 / 9" }}
          className="w-full transition-transform duration-500 group-hover:scale-105"
        />
        <div className="p-4">
          <div
            className="text-[10px] uppercase font-bold mb-1.5"
            style={{ color: "var(--accent)", letterSpacing: "0.12em" }}
          >
            {articleLabel(item)}
          </div>
          <h3
            className="font-semibold leading-snug line-clamp-3 group-hover:text-accent transition"
            style={{ fontSize: 16, letterSpacing: "-0.01em" }}
          >
            {item.title}
          </h3>
          <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
            <span
              className="inline-flex items-center gap-1 font-semibold"
              style={{ color: "var(--text)" }}
            >
              <User className="h-2.5 w-2.5 text-accent" />
              {bylineFor(item.kind, item.slug)}
            </span>
            <span className="text-mute">·</span>
            <span
              className="inline-flex items-center gap-1 text-mute font-semibold"
            >
              <Calendar className="h-2.5 w-2.5" />
              {formatDate(item.generatedAt as unknown as string)}
            </span>
          </div>
        </div>
      </Link>
    </motion.div>
  );
}

function EmptyState() {
  return (
    <div
      className="rounded-lg p-10 text-center"
      style={{
        background: "var(--bg-2)",
        border: "1px dashed var(--border-strong)",
      }}
    >
      <FileText
        className="h-8 w-8 mx-auto mb-3"
        style={{ color: "var(--accent)" }}
      />
      <h2 className="text-[18px] font-bold mb-2">No insights yet</h2>
      <p className="text-[14px] text-mute max-w-md mx-auto leading-relaxed">
        The first batch of editorial briefings will appear once the daily
        refresh runs (or you trigger one with{" "}
        <code className="text-accent">POST /content/refresh</code>).
      </p>
      <Link
        href="/companies"
        className="inline-flex items-center gap-1 mt-5 text-[13px] font-bold text-accent hover:underline"
      >
        Browse the live Insider Score rankings <ArrowRight className="h-3 w-3" />
      </Link>
    </div>
  );
}
