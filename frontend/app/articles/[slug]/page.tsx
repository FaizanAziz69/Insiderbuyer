import { permanentRedirect } from "next/navigation";

/**
 * Editorial Playbook v2 §10 writes article URLs as
 * `/articles/[ticker]-[3-word-desc]-[YYYY-MM-DD]`. This site serves editorials
 * at `/insights/[slug]` — 14 of them are live and indexed there, so moving the
 * canonical route would throw away their ranking for a cosmetic difference.
 *
 * A URL written per the manual resolves instead: it redirects, permanently, to
 * the real one. One canonical location, and nothing a writer copies out of the
 * manual 404s.
 */
export default async function ArticleSlugRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  permanentRedirect(`/insights/${slug}`);
}
