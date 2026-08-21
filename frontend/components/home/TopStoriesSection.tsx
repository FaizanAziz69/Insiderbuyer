"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { API_BASE, BlogListResponse, fetcher } from "@/lib/api";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { bylineFor } from "@/lib/byline";
import { dealHomeFeed } from "@/lib/homeFeed";
import { articleLabels } from "@/lib/articleLabel";
import { maskScoreInList } from "@/lib/sanitizeArticleHtml";
import { usePremium } from "@/components/premium/PremiumContext";

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 3600) return `${Math.max(1, Math.floor(s / 60))}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

/**
 * Benzinga-style "Top Stories" block — a navbar-colored container holding one
 * large featured story (image left, card right) and four smaller story cards
 * in a row beneath it.
 */
export function TopStoriesSection() {
  // Top Stories = the Editorial Desk: real-world market news rewritten by our
  // AI. It reads the SAME shared feed as Latest Financial News and Popular
  // Articles (SWR dedupes the identical key into one request) and takes its
  // articles through `dealHomeFeed`, which hands each block a disjoint set.
  //
  // The two fetches this replaces were the duplicate-headline bug: a separate
  // `kind=editorial` query plus a general "fill" query meant this block topped
  // itself up from articles the sections below were independently about to
  // show, so the same headlines rendered twice on one page. `dealHomeFeed`
  // still prefers editorial here — it just claims whatever it borrows.
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=20`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10 * 60_000 },
  );
  const { unlocked } = usePremium();
  // Titles and summaries carry the score too ("Two stocks hit 100.00 Insider
  // Score"), so the list is masked once here — subscribers pass through.
  const items = maskScoreInList(dealHomeFeed(data?.items)["top-stories"], { unlocked });
  const lead = items[0];
  const rest = items.slice(1, 5);
  // Per-article eyebrow wording, de-duplicated across the visible cards.
  const labels = articleLabels(items);

  return (
    <section className="flex flex-col h-full">
      {/* Header — clean, on the page background (no colored container) */}
      <div
        className="flex items-center justify-between mb-3 pb-2"
        style={{ borderBottom: "2px solid var(--text)" }}
      >
        <h2
          className="text-[19px] font-bold uppercase tracking-wide"
          style={{ color: "var(--text)", fontFamily: "var(--font-heading), var(--font-sans)" }}
        >
          Top Stories
        </h2>
        <Link
          href="/insights"
          className="text-[11px] font-mono uppercase tracking-wider inline-flex items-center gap-1 text-accent hover:underline"
        >
          All stories <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading && items.length === 0 ? (
        <div className="space-y-4">
          <div className="shimmer rounded-lg h-[280px]" />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer rounded-lg h-[210px]" />
            ))}
          </div>
        </div>
      ) : !lead ? null : (
        <div className="flex flex-col gap-4 flex-1">
          {/* Featured story — image left, content card right (Benzinga style) */}
          <Link
            href={`/insights/${lead.slug}`}
            className="group rounded-lg overflow-hidden flex flex-col flex-1"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <div className="relative w-full flex-shrink-0 h-[220px] sm:h-[320px] overflow-hidden">
              <AiCoverImage
                primary={lead.imageUrl}
                seed={lead.slug}
                tags={lead.tags}
                ticker={lead.ticker}
                sector={lead.sector}
                preferPrimary
                overlay="none"
                alt={lead.title}
                loading="eager"
                fit="contain"
                style={{ width: "100%", height: "100%" }}
                className="w-full h-full group-hover:scale-[1.02] transition-transform duration-500"
              />
              <span
                className="absolute left-3 bottom-3 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded"
                style={{ background: "var(--accent)", color: "#fff" }}
              >
                {labels[lead.slug]}
              </span>
            </div>
            <div className="p-4 sm:p-5 min-w-0">
              <h3 className="text-[19px] sm:text-[25px] font-bold leading-tight group-hover:text-accent transition">
                {lead.title}
              </h3>
              <p className="mt-2.5 text-[14.5px] leading-relaxed text-soft line-clamp-3">
                {lead.summary}
              </p>
              <p className="mt-3 text-[12.5px] text-mute">
                {bylineFor(lead.kind, lead.slug)} · {timeAgo(lead.generatedAt)}
              </p>
            </div>
          </Link>

          {/* Four smaller cards in a row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {rest.map((item, i) => (
              <Link
                key={item.slug}
                href={`/insights/${item.slug}`}
                className="group rounded-lg overflow-hidden flex flex-col"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
              >
                <div className="relative h-[92px] sm:h-[104px] flex-shrink-0 overflow-hidden">
                  <AiCoverImage
                    primary={item.imageUrl}
                    seed={item.slug}
                    tags={item.tags}
                    ticker={item.ticker}
                    sector={item.sector}
                    preferPrimary
                    overlay="none"
                    alt={item.title}
                    style={{ width: "100%", height: "100%" }}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <div className="text-[9px] uppercase tracking-wider font-bold text-accent mb-1">
                    {labels[item.slug]}
                  </div>
                  <h4 className="text-[13px] font-bold leading-snug group-hover:text-accent transition">
                    {item.title}
                  </h4>
                  <p className="mt-auto pt-2 text-[10.5px] text-mute">
                    {bylineFor(item.kind, item.slug)} · {timeAgo(item.generatedAt)}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
