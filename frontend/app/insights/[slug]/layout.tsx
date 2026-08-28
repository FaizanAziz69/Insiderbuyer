import type { Metadata } from "next";
import { maskScoreText } from "@/lib/sanitizeArticleHtml";
import { seoEntry } from "@/lib/seo-meta";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://insiderbuying.com";

/** Per-article SEO: unique <title>, meta description, canonical, OpenGraph +
 *  Twitter cards — pulled from the article itself at request time. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  // SEO-team copy takes precedence over article-derived metadata. Still
  // masked: some of the supplied descriptions quote raw Insider Scores.
  const override = seoEntry(`/insights/${slug}`);
  try {
    const res = await fetch(`${BACKEND}/api/content/blogs/${encodeURIComponent(slug)}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) throw new Error(String(res.status));
    const data = await res.json();
    const post = data?.post ?? data;
    if (!post?.title) throw new Error("no post");
    // Always masked: metadata is rendered for crawlers and social unfurls,
    // where no subscription applies, and a leaked score in an OG card is
    // public forever.
    const title = override
      ? maskScoreText(override.t)
      : `${maskScoreText(post.title)} | InsiderBuying.com`;
    const description = maskScoreText(
      override?.d || String(post.summary || ""),
    ).slice(0, 160);
    const url = `${SITE}/insights/${slug}`;
    // Absolute URL: chat apps (WhatsApp, iMessage, Slack) do not resolve a
    // relative og:image against the page, they just fail and fall back to
    // the site-wide card.
    const rawImage = post.imageUrl ? String(post.imageUrl) : null;
    const image = rawImage ? (rawImage.startsWith("/") ? `${SITE}${rawImage}` : rawImage) : undefined;
    const openGraph = {
      title,
      description,
      url,
      type: "article" as const,
      siteName: "InsiderBuying.com",
      ...(image ? { images: [{ url: image, width: 1606, height: 1000, alt: maskScoreText(post.imageAlt || post.title) }] } : {}),
    };
    const twitter = {
      card: (image ? "summary_large_image" : "summary") as "summary_large_image" | "summary",
      title,
      description,
      ...(image ? { images: [image] } : {}),
    };
    // An unlisted draft is never indexed (absent from the sitemap and every
    // feed, noindex here), but the link IS passed around for review, so the
    // unfurl carries the real cover and headline instead of the site card
    // (George, 2026-08-29). The title keeps the [DRAFT] marker.
    if (post.draft) {
      const draftTitle = `[DRAFT] ${maskScoreText(post.title)}`;
      return {
        title: draftTitle,
        description,
        robots: { index: false, follow: false, nocache: true },
        alternates: { canonical: url },
        openGraph: { ...openGraph, title: draftTitle },
        twitter: { ...twitter, title: draftTitle },
      };
    }
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph,
      twitter,
    };
  } catch {
    if (override) {
      return {
        title: maskScoreText(override.t),
        description: maskScoreText(override.d),
        alternates: { canonical: `${SITE}/insights/${slug}` },
      };
    }
    return {
      title: "InsiderBuying.com — Live SEC Form 4 + Congressional Trades",
    };
  }
}

export default function InsightArticleLayout({ children }: { children: React.ReactNode }) {
  return children;
}
