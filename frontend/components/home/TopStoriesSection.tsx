"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { API_BASE, BlogListResponse, fetcher } from "@/lib/api";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
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
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=10`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 10 * 60_000 },
  );
  const items = data?.items || [];
  const lead = items[0];
  const rest = items.slice(1, 5);

  return (
    <section
      className="rounded-xl overflow-hidden p-4 sm:p-5 flex flex-col"
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-surface-border)",
      }}
    >
      {/* Header — white on the navbar-colored band */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-[17px] font-bold uppercase tracking-wide" style={{ color: "#ffffff" }}>
          Top Stories
        </h2>
        <Link
          href="/insights"
          className="text-[11px] font-mono uppercase tracking-wider inline-flex items-center gap-1 hover:underline"
          style={{ color: "rgba(255,255,255,0.85)" }}
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
            <div className="relative sm:w-[42%] flex-shrink-0 min-h-[200px] sm:min-h-[260px] overflow-hidden">
              <AiCoverImage
                primary={lead.imageUrl}
                seed={lead.slug}
                tags={lead.tags}
                alt={lead.title}
                overlay="none"
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
            <div className="p-5 sm:p-7 flex flex-col justify-center min-w-0">
              <h3 className="text-[20px] sm:text-[26px] font-bold leading-tight group-hover:text-accent transition">
                {lead.title}
              </h3>
              <p className="mt-3 text-[14.5px] leading-relaxed text-soft line-clamp-3">
                {lead.summary}
              </p>
              <p className="mt-3 text-[12px] text-mute">
                {bylineFor(lead.kind, lead.slug)} · {timeAgo(lead.generatedAt)}
              </p>
            </div>
          </Link>

          {/* Four smaller cards in a row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {rest.map((item) => (
              <Link
                key={item.slug}
                href={`/insights/${item.slug}`}
                className="group rounded-lg overflow-hidden flex flex-col"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
              >
                <div className="relative h-[110px] sm:h-[130px] flex-shrink-0 overflow-hidden">
                  <AiCoverImage
                    primary={item.imageUrl}
                    seed={item.slug}
                    tags={item.tags}
                    alt={item.title}
                    overlay="none"
                    style={{ width: "100%", height: "100%" }}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </div>
                <div className="p-3 flex flex-col flex-1">
                  <h4 className="text-[13.5px] font-bold leading-snug group-hover:text-accent transition line-clamp-3">
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
