"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Calendar, TrendingUp, User } from "lucide-react";
import {
  API_BASE,
  BlogListResponse,
  BlogPost,
  fetcher,
  formatDate,
  formatRelative,
} from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { ArticleBody } from "@/components/article/ArticleBody";
import { ArticleGate } from "@/components/ArticleLimitPopup";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";
import { ProgrammaticCta } from "@/components/article/ProgrammaticCta";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { ArticleShareRow } from "@/components/insights/ArticleShareRow";
import { TickerSnapshotCard } from "@/components/insights/TickerSnapshotCard";
import { IqsBreakdownCard } from "@/components/insights/IqsBreakdownCard";
import { InsiderActivityTable } from "@/components/insights/InsiderActivityTable";
import { authorFor, reviewerFor } from "@/lib/byline";

const KIND_LABELS: Record<string, string> = {
  "daily-summary": "Daily Briefing",
  "top-iqs": "Top Insider Score Picks",
  "ticker-deep-dive": "Ticker Focus",
  "sector-roundup": "Sector Roundup",
  "cluster-buy": "Cluster Buy Alert",
  "ceo-buying": "CEO Buying",
};

export default function InsightDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const { data: post, isLoading } = useSWR<BlogPost>(
    `${API_BASE}/content/blogs/${encodeURIComponent(slug)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  // Side-rail: latest articles, excluding the current one.
  const { data: latest } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=8`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 30 * 60_000 },
  );
  const railItems =
    latest?.items.filter((it) => it.slug !== slug).slice(0, 5) || [];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_380px] gap-6 lg:gap-10 max-w-[1400px] mx-auto">
      <article className="min-w-0">
        <Link
          href="/insights"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          All insights
        </Link>

        {isLoading || !post ? (
          <SkeletonBody />
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="mb-3 font-bold uppercase"
              style={{
                fontSize: 11,
                color: "var(--accent)",
                letterSpacing: "0.14em",
              }}
            >
              {post.eyebrow || KIND_LABELS[post.kind] || "INSIDER BUYING"}
            </div>

            <h1
              className="font-bold tracking-tight"
              style={{
                fontSize: "clamp(30px, 4.4vw, 48px)",
                lineHeight: 1.08,
                letterSpacing: "-0.8px",
              }}
            >
              {post.title}
            </h1>

            <p
              className="mt-4 leading-relaxed"
              style={{ color: "var(--text-soft)", fontSize: 18 }}
            >
              {post.summary}
            </p>

            {/* Byline row — author + date on the left, social share on the
                right. MarketBeat's exact arrangement. */}
            <div
              className="mt-5 pb-5 flex flex-wrap items-center justify-between gap-x-5 gap-y-3 text-[13px]"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
                <span
                  className="inline-flex items-center gap-2 font-semibold"
                  style={{ color: "var(--text)" }}
                >
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-full"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    <User className="h-4 w-4" />
                  </span>
                  <span>
                    <span className="text-[12px]">
                      <span className="text-[11px] uppercase tracking-wider text-mute font-bold mr-1">
                        Written by
                      </span>
                      <span className="text-accent font-bold">
                        {authorFor(post.kind, post.slug).name}
                      </span>
                      <span className="text-mute mx-1.5">|</span>
                      <span className="text-[11px] uppercase tracking-wider text-mute font-bold mr-1">
                        Reviewed by
                      </span>
                      <span className="text-accent font-bold">
                        {reviewerFor(post.slug)}
                      </span>
                    </span>
                    <span
                      className="block text-[12px] font-semibold"
                      style={{ color: "var(--text-mute)" }}
                    >
                      <Calendar className="inline-block h-3 w-3 mr-1 -mt-0.5" />
                      {formatDate(post.generatedAt as unknown as string)} ·{" "}
                      {formatRelative(post.generatedAt as unknown as string)}
                    </span>
                  </span>
                </span>
              </div>
              <ArticleShareRow title={post.title} />
            </div>

            {/* Hard signup gate — after 3 free articles the cover image AND
                body blur, and the unlock sheet slides up from the bottom
                (free account only, no payment). */}
            <ArticleGate slug={slug}>
              <div
                className="relative mt-6 rounded-lg overflow-hidden"
                style={{ aspectRatio: "16 / 9" }}
              >
                <AiCoverImage
                  primary={post.imageUrl}
                  seed={post.slug}
                  tags={post.tags}
                  ticker={post.ticker}
                  sector={post.sector}
                  overlay="none"
                  loading="eager"
                  style={{ width: "100%", height: "100%" }}
                  className="w-full h-full"
                />
              </div>

              <AdSlot slot="leaderboard" seed={`insight-${slug}`} />

              <div className="h-px my-6" style={{ background: "var(--border)" }} />

              <ArticleBody html={post.body} />
            </ArticleGate>

            {/* Embedded Form 4 table — the data behind the story */}
            {post.ticker && <InsiderActivityTable ticker={post.ticker} />}

            {post.tags && post.tags.length > 0 && (
              <div className="mt-5 flex flex-wrap gap-2">
                {post.tags.map((t) => (
                  <span
                    key={t}
                    className="text-[10px] uppercase font-bold px-2 py-0.5 rounded"
                    style={{
                      background: "var(--bg-3)",
                      color: "var(--text-mute)",
                      letterSpacing: "0.08em",
                    }}
                  >
                    #{t}
                  </span>
                ))}
              </div>
            )}

            {/* Programmatic ticker CTA — reuses the article CTA component */}
            {post.ticker && (
              <ProgrammaticCta
                articleUrl={`${typeof window !== "undefined" ? window.location.origin : ""}/insights/${post.slug}`}
              />
            )}

          </motion.div>
        )}
      </article>

      <aside className="space-y-5">
        {/* Stock quote card + Insider Score breakdown — MarketBeat-style right rail */}
        {post?.ticker && (
          <>
            <TickerSnapshotCard ticker={post.ticker} />
            <IqsBreakdownCard ticker={post.ticker} />
          </>
        )}

        <AdSlot slot="rail-top" seed={`insight-rail-${slug}`} />

        {/* Side rail — more insights */}
        <div>
          <h3
            className="text-[16px] uppercase font-bold tracking-wider mb-3"
            style={{ color: "var(--text-mute)", letterSpacing: "0.12em" }}
          >
            More insights
          </h3>
          <div className="space-y-2.5">
            {railItems.map((it) => (
              <Link
                key={it.slug}
                href={`/insights/${it.slug}`}
                className="group flex gap-3 p-2 rounded-lg transition"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <AiCoverImage
                  primary={it.imageUrl}
                  seed={it.slug}
                  tags={it.tags}
                  ticker={it.ticker}
                  sector={it.sector}
                  overlay="none"
                  className="flex-shrink-0 rounded-md transition-transform duration-500 group-hover:scale-110"
                  style={{ width: 80, height: 64 }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="text-[9px] uppercase font-extrabold mb-1"
                    style={{
                      color: "var(--accent)",
                      letterSpacing: "0.1em",
                    }}
                  >
                    {it.eyebrow || KIND_LABELS[it.kind] || "INSIDER"}
                  </div>
                  <h4
                    className="font-semibold leading-snug line-clamp-2 group-hover:text-accent transition"
                    style={{ fontSize: 13 }}
                  >
                    {it.title}
                  </h4>
                  <div className="text-[11px] text-mute mt-1">
                    By {authorFor(it.kind, it.slug).name}
                    <span className="mx-1">·</span>
                    {formatDate(it.generatedAt as unknown as string)}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        <RightRailStockLists />
      </aside>
    </div>
  );
}

function SkeletonBody() {
  return (
    <div className="space-y-4">
      <div className="h-4 w-32 shimmer rounded" />
      <div className="h-12 w-full shimmer rounded" />
      <div className="h-12 w-3/4 shimmer rounded" />
      <div className="h-4 w-48 shimmer rounded" />
      <div className="aspect-[16/9] shimmer rounded" />
      <div className="space-y-3 mt-6">
        <div className="h-3 w-full shimmer rounded" />
        <div className="h-3 w-[95%] shimmer rounded" />
        <div className="h-3 w-[90%] shimmer rounded" />
        <div className="h-3 w-full shimmer rounded" />
      </div>
    </div>
  );
}
