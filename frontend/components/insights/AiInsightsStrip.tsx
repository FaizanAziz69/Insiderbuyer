"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Calendar, User } from "lucide-react";
import {
  API_BASE,
  BlogListResponse,
  fetcher,
  formatDate,
} from "@/lib/api";
import { AiCoverImage } from "./AiCoverImage";
import { bylineFor } from "@/lib/byline";

interface Props {
  title?: string;
  /** When set, only fetch articles tagged to this ticker. */
  ticker?: string;
  /** How many cards to render. Default 4. */
  limit?: number;
  /** When true, hides the section if the API returns nothing — useful on a
   *  ticker page where we don't want an empty box when there's no AI coverage
   *  yet. Default false. */
  hideIfEmpty?: boolean;
}

export function AiInsightsStrip({
  title = "Latest Editorial",
  ticker,
  limit = 4,
  hideIfEmpty = false,
}: Props) {
  const url = ticker
    ? `${API_BASE}/content/by-ticker/${encodeURIComponent(ticker)}?limit=${limit}`
    : `${API_BASE}/content/blogs?limit=${limit}`;
  const { data, isLoading } = useSWR<BlogListResponse | { items: any[] }>(
    url,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const items = (data?.items as BlogListResponse["items"]) || [];

  if (!isLoading && items.length === 0 && hideIfEmpty) return null;

  return (
    <section>
      <div className="flex items-baseline justify-between mb-4">
        <h2
          className="font-bold tracking-tight inline-flex items-center gap-2"
          style={{ fontSize: 22, letterSpacing: "-0.3px" }}
        >
          {title}
          <span
            className="ml-1 text-[10px] uppercase font-bold px-2 py-0.5 rounded"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
              letterSpacing: "0.1em",
            }}
          >
          </span>
        </h2>
        <Link
          href="/insights"
          className="text-[12px] font-bold text-accent hover:underline uppercase tracking-wider inline-flex items-center gap-0.5"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {isLoading && items.length === 0 ? (
        <div
          className="grid grid-cols-1 sm:grid-cols-2 gap-4"
          style={{ gridTemplateColumns: `repeat(${Math.min(items.length || limit, 4)}, 1fr)` }}
        >
          {Array.from({ length: limit }).map((_, i) => (
            <div key={i} className="shimmer rounded-lg h-[220px]" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div
          className="rounded-lg p-6 text-center"
          style={{
            background: "var(--bg-2)",
            border: "1px dashed var(--border-strong)",
          }}
        >
          <p className="text-[13px] text-mute">
            No editorial coverage yet — fresh briefings publish every morning
            from the live insider-buying feed.
          </p>
        </div>
      ) : (
        <div
          className={`grid gap-4 ${
            items.length === 1
              ? "grid-cols-1"
              : items.length === 2
                ? "grid-cols-1 sm:grid-cols-2"
                : items.length === 3
                  ? "grid-cols-1 sm:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
          }`}
        >
          {items.map((it, i) => (
            <motion.div
              key={it.slug}
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={{ duration: 0.3, delay: i * 0.05 }}
            >
              <Link
                href={`/insights/${it.slug}`}
                className="block rounded-lg overflow-hidden group h-full"
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
                  className="w-full transition-transform duration-500 group-hover:scale-105"
                  style={{ aspectRatio: "16 / 9" }}
                />
                <div className="p-3.5">
                  <div
                    className="text-[9px] uppercase font-extrabold mb-1.5"
                    style={{
                      color: "var(--accent)",
                      letterSpacing: "0.12em",
                    }}
                  >
                    {it.eyebrow || it.kind.replace(/-/g, " ")}
                  </div>
                  <h3
                    className="font-bold leading-snug group-hover:text-accent transition"
                    style={{ fontSize: 14, letterSpacing: "-0.01em" }}
                  >
                    {it.title}
                  </h3>
                  <div className="mt-2.5 text-[10px] flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <span
                      className="inline-flex items-center gap-1 font-semibold"
                      style={{ color: "var(--text)" }}
                    >
                      <User className="h-2.5 w-2.5 text-accent" />
                      {bylineFor(it.kind, it.slug)}
                    </span>
                    <span className="text-mute">·</span>
                    <span className="inline-flex items-center gap-1 text-mute font-semibold">
                      <Calendar className="h-2.5 w-2.5" />
                      {formatDate(it.generatedAt as unknown as string)}
                    </span>
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      )}
    </section>
  );
}
