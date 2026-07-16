"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight, Newspaper } from "lucide-react";
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
 * Benzinga-style "Top Stories" block — full width at the very top of the
 * homepage: one large featured story + four smaller cards, inside a single
 * bordered container. Replaces the old MarketBeat-style hero carousel.
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
      className="rounded-xl overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border-strong)" }}
    >
      {/* Section header */}
      <div
        className="flex items-center justify-between px-5 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "transparent" }}
      >
        <h2 className="flex items-center gap-2 text-[15px] font-bold uppercase tracking-wider">
          <Newspaper className="h-4 w-4 text-accent" />
          Top Stories
        </h2>
        <Link
          href="/insights"
          className="text-[11px] font-mono text-accent uppercase tracking-wider inline-flex items-center gap-1 hover:underline"
        >
          All stories <ChevronRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading && items.length === 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-5">
          <div className="shimmer rounded-lg h-[420px]" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="shimmer rounded-lg h-[200px]" />
            ))}
          </div>
        </div>
      ) : !lead ? null : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 p-4 sm:p-5">
          {/* Featured story — large card */}
          <Link
            href={`/insights/${lead.slug}`}
            className="group relative rounded-lg overflow-hidden min-h-[320px] lg:min-h-[460px] flex flex-col justify-end"
            style={{ border: "1px solid var(--border)" }}
          >
            <div className="absolute inset-0">
              <AiCoverImage
                primary={lead.imageUrl}
                seed={lead.slug}
                tags={lead.tags}
                alt={lead.title}
                overlay="lg"
                loading="eager"
                style={{ width: "100%", height: "100%" }}
                className="w-full h-full object-cover group-hover:scale-[1.02] transition-transform duration-500"
              />
            </div>
            <div className="relative p-5 sm:p-6">
              {lead.eyebrow && (
                <span
                  className="inline-block text-[10px] font-bold uppercase tracking-widest px-2 py-1 rounded mb-2.5"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {lead.eyebrow}
                </span>
              )}
              <h3
                className="text-[22px] sm:text-[28px] font-bold leading-tight text-white group-hover:underline"
                style={{ textShadow: "0 2px 12px rgba(0,0,0,0.6)" }}
              >
                {lead.title}
              </h3>
              <p
                className="mt-2 text-[14px] leading-relaxed text-white/85 line-clamp-2"
                style={{ textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}
              >
                {lead.summary}
              </p>
              <p className="mt-2.5 text-[12px] text-white/70">
                {bylineFor(lead.kind, lead.slug)} · {timeAgo(lead.generatedAt)}
              </p>
            </div>
          </Link>

          {/* Four smaller cards — 2×2 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {rest.map((item) => (
              <Link
                key={item.slug}
                href={`/insights/${item.slug}`}
                className="group rounded-lg overflow-hidden flex flex-col"
                style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
              >
                <div className="relative h-[120px] flex-shrink-0 overflow-hidden">
                  <AiCoverImage
                    primary={item.imageUrl}
                    seed={item.slug}
                    tags={item.tags}
                    alt={item.title}
                    overlay="sm"
                    style={{ width: "100%", height: "100%" }}
                    className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500"
                  />
                </div>
                <div className="p-3.5 flex flex-col flex-1">
                  <h4 className="text-[14px] font-bold leading-snug group-hover:text-accent transition line-clamp-3">
                    {item.title}
                  </h4>
                  <p className="mt-auto pt-2 text-[11px] text-mute">
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
