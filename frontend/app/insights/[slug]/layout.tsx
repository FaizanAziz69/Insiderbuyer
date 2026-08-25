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
    const image = post.imageUrl || undefined;
    return {
      title,
      description,
      alternates: { canonical: url },
      openGraph: {
        title,
        description,
        url,
        type: "article",
        siteName: "InsiderBuying.com",
        ...(image ? { images: [{ url: image }] } : {}),
      },
      twitter: {
        card: image ? "summary_large_image" : "summary",
        title,
        description,
        ...(image ? { images: [image] } : {}),
      },
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
