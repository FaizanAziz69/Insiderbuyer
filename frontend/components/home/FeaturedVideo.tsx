"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { ChevronRight, Video } from "lucide-react";
import { NewsItem, formatRelative } from "@/lib/api";
import { YouTubeEmbed } from "./YouTubeEmbed";

// SEC investor-education video ("Check Out Your Investment Professional", investor.gov).
const FEATURED_VIDEO_ID = "J7IB4fH8f8A";
const FEATURED_VIDEO_TITLE = "Check Out Your Investment Professional";
const FEATURED_VIDEO_SOURCE_URL =
  "https://www.investor.gov/introduction-investing/getting-started/working-investment-professional/check-out-your-investment-professional";

interface Props {
  headlines: NewsItem[];
}

export function FeaturedVideo({ headlines }: Props) {
  const above = headlines.slice(0, 3);
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="card overflow-hidden"
    >
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-2">
          <Video className="h-4 w-4 text-accent" />
          <h2 className="text-[15px] font-semibold tracking-tight">Featured video</h2>
          <span
            className="ml-1 inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-bold uppercase tracking-wider"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            SEC investor education
          </span>
        </div>
        <Link
          href="/news"
          className="text-[12px] font-semibold text-accent inline-flex items-center gap-0.5"
        >
          More news <ChevronRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      {/* News headlines above the video */}
      {above.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-[var(--border)] border-b border-[var(--border)]">
          {above.map((n) => (
            <Link
              key={n.id}
              href={`/article?u=${encodeURIComponent(n.link)}&c=${encodeURIComponent(n.label)}`}
              className="block p-4 hover:bg-[var(--accent-soft)] transition group"
            >
              <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1.5">
                {n.category}
              </div>
              <h3 className="text-[13px] font-bold leading-snug line-clamp-3 group-hover:text-accent transition">
                {n.title}
              </h3>
              <div className="text-[11px] text-mute mt-1.5 truncate">
                {n.source} · {formatRelative(n.pubDate)}
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* YouTube video */}
      <div className="p-4 sm:p-5">
        <YouTubeEmbed videoId={FEATURED_VIDEO_ID} title={FEATURED_VIDEO_TITLE} />
        <div className="mt-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-[16px] font-bold tracking-tight leading-snug">
              {FEATURED_VIDEO_TITLE}
            </h3>
            <p className="text-[13px] text-mute mt-1 leading-relaxed">
              A quick walkthrough from the SEC's Office of Investor Education and Advocacy on how
              to verify a financial professional's background before you hand over your money.
            </p>
          </div>
          <a
            href={FEATURED_VIDEO_SOURCE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[12px] font-semibold text-accent hover:underline whitespace-nowrap inline-flex items-center gap-1 self-start"
          >
            View on investor.gov
            <ChevronRight className="h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    </motion.section>
  );
}
