"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  API_BASE,
  BlogKind,
  BlogListResponse,
  fetcher,
  formatDate,
} from "@/lib/api";
import { AiCoverImage } from "@/components/insights/AiCoverImage";

interface Props {
  excludeLink?: string;
  tag?: string;
}

// "Most-read"/popular ordering — high-signal editorial kinds float to the top
// (we have no read-count metric, so this deterministic priority stands in).
const POPULAR_WEIGHT: Partial<Record<BlogKind, number>> = {
  "top-iqs": 6,
  "cluster-buy": 5,
  "ceo-buying": 4,
  "ticker-deep-dive": 3,
  "weekly-report": 2,
  "sector-roundup": 1,
};

/** "Popular Articles" rail — AI editorial from /content/blogs (the same source
 *  as the Insights / Stock Ideas feed), each with a cover thumbnail. Links open
 *  the full article at /insights/[slug]. */
export function RightRailArticles({ excludeLink: _excludeLink, tag: _tag }: Props) {
  const { data } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=20`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const items = [...(data?.items || [])]
    .sort((a, b) => (POPULAR_WEIGHT[b.kind] ?? 0) - (POPULAR_WEIGHT[a.kind] ?? 0))
    .slice(0, 5);

  return (
    <aside
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        Popular Articles
      </div>
      <ul className="divide-y divide-[var(--border)]">
        {items.map((n) => (
          <li key={n.slug}>
            <Link
              href={`/insights/${n.slug}`}
              className="grid grid-cols-[84px_1fr] gap-3 px-4 py-3 hover:bg-[var(--accent-soft)] transition group"
            >
              <AiCoverImage
                primary={n.imageUrl}
                seed={n.slug}
                tags={n.tags}
                ticker={n.ticker}
                sector={n.sector}
                className="w-full rounded-md"
                style={{ aspectRatio: "16 / 9" }}
              />
              <div className="min-w-0">
                <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-0.5">
                  {n.eyebrow || n.kind.replace(/-/g, " ")}
                  {n.ticker && <span className="ml-1.5 font-mono">· {n.ticker}</span>}
                </div>
                <div className="text-[13px] font-bold leading-snug line-clamp-3 group-hover:text-accent transition">
                  {n.title}
                </div>
                <div className="text-[11px] text-mute mt-1">
                  {formatDate(n.generatedAt as unknown as string)}
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </aside>
  );
}
