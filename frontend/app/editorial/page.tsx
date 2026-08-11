"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Newspaper } from "lucide-react";
import { API_BASE, BlogListResponse, fetcher, formatDate } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { bylineFor } from "@/lib/byline";

/**
 * Editorial Desk — structured, non-promotional coverage of the day's breaking
 * financial stories in a factual WSJ/Barron's tone. Refreshed daily (≥4 new
 * stories) by the content engine, grounded in the aggregated live news feed.
 */
export default function EditorialPage() {
  const { data, isLoading } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?kind=editorial&limit=24`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const items = data?.items || [];
  const [lead, ...rest] = items;

  return (
    <div className="w-full space-y-8">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Newspaper className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Editorial Desk
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Breaking Financial Stories
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-3xl leading-relaxed">
          Factual, non-promotional coverage of the stories moving markets —
          reported first, with our read clearly labeled and the skeptic&rsquo;s
          case in every story. Refreshed daily.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="editorial-top" />

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card h-64 shimmer rounded-lg" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          Today&rsquo;s editorial stories are being prepared — check back shortly.
        </div>
      ) : (
        <>
          {/* Lead story */}
          {lead && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Link
                href={`/insights/${lead.slug}`}
                className="card overflow-hidden grid grid-cols-1 md:grid-cols-2 group"
              >
                <AiCoverImage
                  primary={lead.imageUrl}
                  seed={lead.slug}
                  tags={lead.tags}
                  alt={lead.title}
                  className="h-56 md:h-full w-full object-cover"
                />
                <div className="p-6 flex flex-col justify-center">
                  <div className="text-[10px] uppercase tracking-[0.16em] font-bold text-accent mb-2">
                    {lead.eyebrow || "Editorial"}
                  </div>
                  <h2 className="text-[22px] sm:text-[26px] font-semibold tracking-tight leading-snug group-hover:text-accent transition">
                    {lead.title}
                  </h2>
                  <p className="text-[14px] text-soft mt-3 leading-relaxed line-clamp-3">
                    {lead.summary}
                  </p>
                  <div className="text-[12px] text-mute mt-4">
                    {bylineFor(lead.kind, lead.slug)} · {formatDate(lead.generatedAt)}
                  </div>
                  <span className="inline-flex items-center gap-1 text-[13px] font-bold text-accent mt-3">
                    Read the story <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            </motion.div>
          )}

          {/* Rest of the desk */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {rest.map((item, i) => (
              <motion.div
                key={item.slug}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i, 8) * 0.04 }}
              >
                <Link
                  href={`/insights/${item.slug}`}
                  className="card overflow-hidden flex flex-col h-full group"
                >
                  <AiCoverImage
                    primary={item.imageUrl}
                    seed={item.slug}
                    tags={item.tags}
                    alt={item.title}
                    className="h-40 w-full object-cover"
                  />
                  <div className="p-4 flex flex-col flex-1">
                    <h3 className="text-[16px] font-semibold tracking-tight leading-snug group-hover:text-accent transition line-clamp-3">
                      {item.title}
                    </h3>
                    <p className="text-[13px] text-soft mt-2 leading-relaxed line-clamp-2 flex-1">
                      {item.summary}
                    </p>
                    <div className="text-[11.5px] text-mute mt-3">
                      {formatDate(item.generatedAt)}
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </div>
        </>
      )}

      <p className="text-[11px] text-faint max-w-3xl">
        Editorial stories are produced by our content engine from aggregated
        public news headlines and market data, then structured for clarity.
        Informational only — not investment advice.
      </p>
    </div>
  );
}
