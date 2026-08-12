"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, FileText, User } from "lucide-react";
import {
  API_BASE,
  BlogListResponse,
  BlogPostListItem,
  fetcher,
  formatDate,
} from "@/lib/api";
import { AiCoverImage } from "./AiCoverImage";
import { assignUniquePhotos } from "@/lib/sector-photos";
import { bylineFor } from "@/lib/byline";
import { dealHomeFeed } from "@/lib/homeFeed";
import { articleLabel, articleLabels } from "@/lib/articleLabel";
import { maskScoreInList } from "@/lib/sanitizeArticleHtml";
import { usePremium } from "@/components/premium/PremiumContext";

/** "Latest Financial News" block — pulls AI-refined SEC + Insider Score editorial,
 *  not raw SEC press releases. Its articles are claimed through `dealHomeFeed`,
 *  so nothing here can also appear in Top Stories or Popular Articles (the old
 *  hardcoded `slice(1)` offset could not guarantee that — see lib/homeFeed.ts). */
export function AiLatestNewsSection() {
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=20`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const { unlocked } = usePremium();
  // Titles and summaries carry the score too ("Two stocks hit 100.00 Insider
  // Score"), so the list is masked once here — subscribers pass through.
  const items = maskScoreInList(dealHomeFeed(data?.items)["latest-news"], { unlocked });
  const big = items[0];
  const small = items.slice(1, 5);
  const covers = assignUniquePhotos(
    [big, ...small].filter(Boolean).map((it) => ({ seed: it.slug, sector: it.sector })),
  );
  // Per-article eyebrow wording, de-duplicated across the five visible cards.
  const labels = articleLabels([big, ...small].filter(Boolean));

  return (
    <section className="h-full flex flex-col">
      <div className="large-section-h" style={{ alignItems: "baseline" }}>
        <span>Latest Financial News</span>
        <Link
          href="/insights"
          className="text-[12px] font-medium text-accent hover:underline inline-flex items-center gap-0.5 uppercase tracking-wider"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading && items.length === 0 ? (
        <SkeletonGrid />
      ) : items.length === 0 ? (
        <EmptyHint />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 lg:gap-8 flex-1">
          {big && <BigCard item={big} src={covers[big.slug]} label={labels[big.slug]} />}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 sm:gap-6">
            {small.map((it, i) => (
              <motion.div
                key={it.slug}
                initial={{ opacity: 0, y: 6 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.1 }}
                transition={{ duration: 0.3, delay: 0.05 * i }}
              >
                <SmallCard item={it} src={covers[it.slug]} label={labels[it.slug]} />
              </motion.div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function BigCard({ item, src, editorialSrc, label }: { item: BlogPostListItem; src?: string; editorialSrc?: string | null; label?: string }) {
  return (
    <Link href={`/insights/${item.slug}`} className="flex flex-col group h-full">
      <AiCoverImage
        primary={item.imageUrl}
          src={src}
        seed={item.slug}
        tags={item.tags}
        ticker={item.ticker}
        sector={item.sector}
        editorialSrc={editorialSrc}
        loading="eager"
        className="w-full rounded-lg mb-4 transition-transform duration-500 group-hover:scale-[1.02]"
        style={{ flex: "1 1 auto", minHeight: 300 }}
      />
      <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1.5">
        {label || articleLabel(item)}
        {item.ticker && (
          <span className="ml-2 font-mono">· {item.ticker}</span>
        )}
      </div>
      <h3
        className="text-[20px] sm:text-[26px] font-semibold tracking-tight leading-snug group-hover:text-accent transition"
        style={{ letterSpacing: "-0.01em" }}
      >
        {item.title}
      </h3>
      <p className="text-[13px] sm:text-[14px] text-soft mt-2 leading-relaxed line-clamp-3">
        {item.summary}
      </p>
      <Meta item={item} />
    </Link>
  );
}

function SmallCard({ item, src, editorialSrc, label }: { item: BlogPostListItem; src?: string; editorialSrc?: string | null; label?: string }) {
  return (
    <Link href={`/insights/${item.slug}`} className="block group h-full">
      <AiCoverImage
        primary={item.imageUrl}
          src={src}
        seed={item.slug}
        tags={item.tags}
        ticker={item.ticker}
        sector={item.sector}
        editorialSrc={editorialSrc}
        className="w-full rounded-lg mb-3 transition-transform duration-500 group-hover:scale-[1.02]"
        style={{ aspectRatio: "16 / 9" }}
      />
      <div className="text-[9px] uppercase tracking-wider font-bold text-accent mb-1">
        {label || articleLabel(item)}
        {item.ticker && (
          <span className="ml-1.5 font-mono">· {item.ticker}</span>
        )}
      </div>
      <h4
        className="text-[14px] sm:text-[15px] font-semibold leading-snug group-hover:text-accent transition"
        style={{ letterSpacing: "-0.01em" }}
      >
        {item.title}
      </h4>
      <Meta item={item} compact />
    </Link>
  );
}

function Meta({
  item,
  compact = false,
}: {
  item: BlogPostListItem;
  compact?: boolean;
}) {
  const size = compact ? "text-[10px]" : "text-[11px]";
  const iconSize = compact ? "h-2.5 w-2.5" : "h-3 w-3";
  return (
    <div className={`${compact ? "mt-2" : "mt-3"} ${size} flex flex-wrap items-center gap-x-2 gap-y-1`}>
      <span
        className="inline-flex items-center gap-1 font-semibold"
        style={{ color: "var(--text)" }}
      >
        <User className={`${iconSize} text-accent`} />
        {bylineFor(item.kind, item.slug)}
      </span>
      <span className="text-mute">·</span>
      <span className="inline-flex items-center gap-1 text-mute font-semibold">
        <Calendar className={iconSize} />
        {formatDate(item.generatedAt as unknown as string)}
      </span>
    </div>
  );
}

function SkeletonGrid() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1.6fr_1fr] gap-6 lg:gap-8">
      <div className="shimmer rounded-lg h-[420px]" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="shimmer rounded-lg h-[180px]" />
        ))}
      </div>
    </div>
  );
}

function EmptyHint() {
  return (
    <div
      className="rounded-lg p-6 text-center"
      style={{
        background: "var(--bg-2)",
        border: "1px dashed var(--border-strong)",
      }}
    >
      <FileText
        className="h-7 w-7 mx-auto mb-2"
        style={{ color: "var(--accent)" }}
      />
      <p className="text-[14px] font-bold mb-1">
        Daily news briefings refresh every morning
      </p>
      <p className="text-[12px] text-mute leading-relaxed max-w-md mx-auto">
        Articles are generated from live SEC Form 4 data and our Insider Score scoring
        engine. Trigger a refresh with{" "}
        <code className="text-accent">POST /content/refresh</code>.
      </p>
    </div>
  );
}
