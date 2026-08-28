import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { DataArticleView, type DataArticle } from "@/components/data-articles/DataArticleView";

/**
 * Evergreen data article — Developer Project Brief (Aug 24 2026), Workstream A.
 * Server-rendered so the question-style H1, dek and body are in the HTML for
 * search; the chart module hydrates client-side against its own endpoint.
 * Headlines and URLs are permanent (SEO); "Updated" comes from the data.
 */

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";
const SITE = process.env.NEXT_PUBLIC_SITE_URL || "https://insiderbuying.com";

async function load(slug: string): Promise<DataArticle | null> {
  try {
    const res = await fetch(`${BACKEND}/api/data-articles/${encodeURIComponent(slug)}`, { next: { revalidate: 300 } });
    if (!res.ok) return null;
    return (await res.json()) as DataArticle;
  } catch {
    return null;
  }
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = await load(slug);
  if (!a) return { title: "Data article | InsiderBuying.com" };
  const title = `${a.headline} | InsiderBuying.com`;
  const url = `${SITE}/data/${a.slug}`;
  return {
    title,
    description: a.dek,
    alternates: { canonical: url },
    openGraph: { title, description: a.dek, url, siteName: "InsiderBuying.com", type: "article", modifiedTime: a.refreshedAt ?? undefined },
    twitter: { card: "summary_large_image", title, description: a.dek },
  };
}

export default async function DataArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = await load(slug);
  if (!article) notFound();
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Article",
    headline: article.headline,
    description: article.dek,
    dateModified: article.refreshedAt ?? undefined,
    author: { "@type": "Organization", name: "InsiderBuying.com" },
    publisher: { "@type": "Organization", name: "InsiderBuying.com" },
    mainEntityOfPage: `${SITE}/data/${article.slug}`,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <DataArticleView article={article} />
    </>
  );
}
