import type { BlogListResponse, BlogPost } from "@/lib/api";
import InsightDetailClient from "./InsightDetailClient";

/**
 * Server-rendered article page.
 *
 * Until 2026-09-09 this route was a client component that fetched the post
 * with SWR after hydration, so the HTML Google received carried the <title>
 * and meta description and nothing else — no headline, no standfirst, no body
 * (verified against the live Burry/Lululemon piece: not one sentence of the
 * body was in the response). George: "Google will not recognize our content."
 *
 * Now the post and the right-rail list are fetched here, on the server, and
 * handed to the existing client view as SWR fallback data. The view renders
 * the same markup it always did — it just has the data on the first pass, so
 * the full article is in the document. `generateMetadata` in layout.tsx
 * fetches the same URL with the same revalidate window, and Next dedupes the
 * two into one backend call per render.
 *
 * Failure mode: if the backend is unreachable the props are null and the
 * client view fetches as before. Never a 500 for a fetch hiccup.
 */

const BACKEND = process.env.BACKEND_URL || "http://localhost:4000";

async function loadPost(slug: string): Promise<BlogPost | null> {
  try {
    const res = await fetch(`${BACKEND}/api/content/blogs/${encodeURIComponent(slug)}`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const post = data?.post ?? data;
    return post?.title ? (post as BlogPost) : null;
  } catch {
    return null;
  }
}

async function loadLatest(): Promise<BlogListResponse | null> {
  try {
    const res = await fetch(`${BACKEND}/api/content/blogs?limit=8`, {
      next: { revalidate: 600 },
    });
    if (!res.ok) return null;
    return (await res.json()) as BlogListResponse;
  } catch {
    return null;
  }
}

export default async function InsightDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [initialPost, initialLatest] = await Promise.all([loadPost(slug), loadLatest()]);
  return <InsightDetailClient slug={slug} initialPost={initialPost} initialLatest={initialLatest} />;
}
