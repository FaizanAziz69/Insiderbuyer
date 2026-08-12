"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  API_BASE,
  BlogKind,
  BlogListResponse,
  BlogPostListItem,
  fetcher,
  formatDate,
} from "@/lib/api";
import { AiCoverImage } from "@/components/insights/AiCoverImage";
import { articleLabels } from "@/lib/articleLabel";
import { maskScoreText } from "@/lib/sanitizeArticleHtml";

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
 *  the full article at /insights/[slug].
 *
 *  Both props used to be accepted and then dropped (`_excludeLink`, `_tag`), so
 *  the deterministic weight sort produced the SAME five headlines on every page
 *  carrying this rail — and the rail could list the article being read. Both are
 *  honoured now: `tag` biases the rail toward related coverage, `excludeLink`
 *  drops the current article. */
export function RightRailArticles({ excludeLink, tag }: Props) {
  const { data } = useSWR<BlogListResponse>(
    `${API_BASE}/content/blogs?limit=20`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );

  const pool = (data?.items || []).filter((n) => {
    // `excludeLink` is whatever URL the host page is showing — an /insights
    // slug on our own articles, an external URL in the news reader. Matching on
    // the slug covers the first and harmlessly misses the second.
    if (excludeLink && excludeLink.includes(n.slug)) return false;
    return true;
  });

  // A tagged rail leads with articles that actually share the tag/topic, then
  // falls back to the general weight order so the rail is never short.
  const related = tag
    ? pool.filter((n) => n.topic === tag || (n.tags || []).includes(tag))
    : [];
  const relatedSlugs = new Set(related.map((n) => n.slug));
  const byWeight = (a: BlogPostListItem, b: BlogPostListItem) =>
    (POPULAR_WEIGHT[b.kind] ?? 0) - (POPULAR_WEIGHT[a.kind] ?? 0);
  const items = [
    ...related.sort(byWeight),
    ...pool.filter((n) => !relatedSlugs.has(n.slug)).sort(byWeight),
  ].slice(0, 5);
  const labels = articleLabels(items);

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
                  {labels[n.slug]}
                  {n.ticker && <span className="ml-1.5 font-mono">· {n.ticker}</span>}
                </div>
                <div className="font-serif text-[13.5px] font-semibold leading-snug group-hover:text-accent transition">
                  {maskScoreText(n.title)}
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
