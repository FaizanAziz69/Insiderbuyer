"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { API_BASE, BlogListResponse, fetcher } from "@/lib/api";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { assignEditorialThumbs } from "@/lib/editorial-thumbs";
import { bylineFor } from "@/lib/byline";

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
  // Top Stories = the Editorial Desk: real world stock-market news rewritten
  // by our AI. This is a DISTINCT feed from Stock Ideas / Popular Articles
  // (which show internal insider-buying content).
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?kind=editorial&limit=12`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10 * 60_000 },
  );
  // Fallback fill: if editorial is thin, top up with the newest general
  // articles so the block is never empty.
  const { data: fillData } = useSWR<BlogListResponse>(
    (data?.items?.length ?? 0) < 5 ? `${API_BASE}/content/blogs?limit=10` : null,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10 * 60_000 },
  );
  const editorial = data?.items || [];
  const seen = new Set(editorial.map((i) => i.slug));
  const items = [
    ...editorial,
    ...(fillData?.items || []).filter((i) => !seen.has(i.slug)),
  ];
  const lead = items[0];
  const rest = items.slice(1, 5);
  // List-level assignment so all 5 covers are guaranteed distinct.
  const thumbs = assignEditorialThumbs(
    [lead, ...rest].filter(Boolean).map((it) => ({
      ticker: it.ticker,
      sector: it.sector,
      tags: it.tags,
      seed: it.slug,
    })),
  );

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
            className="group rounded-lg overflow-hidden flex flex-col sm:flex-row flex-1"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <div className="relative sm:w-[40%] flex-shrink-0 min-h-[170px] sm:min-h-[200px] overflow-hidden">
              <AiCoverImage
                primary={lead.imageUrl}
                seed={lead.slug}
                tags={lead.tags}
                ticker={lead.ticker}
                sector={lead.sector}
                preferPrimary
                editorialSrc={thumbs[lead.slug.toLowerCase()]}
                overlay="none"
                alt={lead.title}
                loading="eager"
                style={{ width: "100%", height: "100%" }}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              />
              {lead.eyebrow && (
                <span
                  className="absolute left-3 bottom-3 inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {lead.eyebrow}
                </span>
              )}
            </div>
            <div className="p-4 sm:p-5 flex flex-col justify-center min-w-0">
              <h3 className="text-[18px] sm:text-[22px] font-bold leading-tight group-hover:text-accent transition">
                {lead.title}
              </h3>
              <p className="mt-2 text-[13.5px] leading-relaxed text-soft line-clamp-2">
                {lead.summary}
              </p>
              <p className="mt-2 text-[12px] text-mute">
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
                    editorialSrc={thumbs[item.slug.toLowerCase()]}
                    overlay="none"
                    alt={item.title}
                    style={{ width: "100%", height: "100%" }}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </div>
                <div className="p-3 flex flex-col flex-1">
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
