import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Metadata } from "next";
import { maskScoreText } from "@/lib/sanitizeArticleHtml";
import { seoEntry } from "@/lib/seo-meta";
import { pickEditorialThumb } from "@/lib/editorial-thumbs";
import { pickSectorPhoto } from "@/lib/sector-photos";

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://insiderbuying.com";

/**
 * The og/ copy of an editorial thumb, or the full-size cover when that copy is
 * missing.
 *
 * The og/ file is what the unfurl actually needs — 1200x747, baseline, under
 * WhatsApp's ~300 KB drop threshold — and `prebuild` (scripts/thumbs-og.mjs)
 * writes one for every thumb, so it should always be there. This check is the
 * second belt: a 404 og:image makes WhatsApp fall back to the site-wide IB
 * logo (George, 2026-09-04, on the Vistra story), whereas the full-size cover
 * is at worst a large-but-correct picture. Never the logo again.
 */
function ogCopy(thumbUrl: string): string {
  const og = thumbUrl.replace("/editorial-thumbs/", "/editorial-thumbs/og/");
  try {
    return existsSync(join(process.cwd(), "public", og.replace(/^\//, ""))) ? og : thumbUrl;
  } catch {
    return og;
  }
}

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
    //
    // The unfurl must show the SAME picture the article page renders (George,
    // 2026-08-30: the Durant/Hugging Face card unfurled with the IB logo while
    // the page showed the client cover). The page (AiCoverImage, no
    // preferPrimary) resolves its cover as: editorial thumb (SLUG_OVERRIDES
    // pin / keyword match) → curated sector photo; the stored AI imageUrl is
    // only a fallback. Mirror that order here instead of reading imageUrl
    // alone — most editorials have imageUrl = null, which is exactly when the
    // site-wide card used to leak in.
    const editorialThumb = pickEditorialThumb({
      ticker: post.ticker,
      sector: post.sector,
      tags: post.tags,
      seed: String(post.slug || slug),
    });
    // WhatsApp (and iMessage) silently DROP an og:image above ~300 KB and
    // show a text-only card (George, 2026-08-30 — the 432 KB Durant cover).
    // The house 1606x1000 thumbs are 100–430 KB, so the unfurl uses a
    // 1200x747 copy in /editorial-thumbs/og/ (≤200 KB, generated with
    // `npm run thumbs:og`, baseline JPEG — WhatsApp rejects progressive). The page itself keeps the full-size cover.
    const rawImage =
      (editorialThumb && ogCopy(editorialThumb)) ||
      (post.imageUrl ? String(post.imageUrl) : null) ||
      // `auto=format` makes Unsplash negotiate WebP, which not every chat
      // client decodes — an unfurl wants a plain JPEG. This branch only runs
      // for an article with no editorial cover at all.
      pickSectorPhoto(post.sector, String(post.slug || slug)).replace("&auto=format", "");
    const image = rawImage.startsWith("/") ? `${SITE}${rawImage}` : rawImage;
    // OG copies are 1200x747; the full-size fallback is 1606x1000, and other
    // sources are unknown — so only declare dimensions we actually know.
    const dims = editorialThumb
      ? rawImage.includes("/editorial-thumbs/og/")
        ? { width: 1200, height: 747 }
        : { width: 1606, height: 1000 }
      : {};
    const openGraph = {
      title,
      description,
      url,
      type: "article" as const,
      siteName: "InsiderBuying.com",
      images: [{ url: image, ...dims, alt: maskScoreText(post.imageAlt || post.title) }],
    };
    const twitter = {
      card: "summary_large_image" as const,
      title,
      description,
      images: [image],
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
