import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/** Title + the last-10 position-changes share card (Brief v7 §3). */
export async function generateMetadata(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const who = slug.split("-").map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w)).join(" ");
  const title = `${who}: 13F Holdings, Performance & Latest Position Changes | InsiderBuying.com`;
  const description = `The disclosed 13F portfolio of ${who}: holdings, value-weighted performance by filing period, and the latest quarter's position changes.`;
  const image = `https://insiderbuying.com/api/og/last10?type=investor&key=${encodeURIComponent(slug)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

/**
 * Server shell for this route (2026-09-09, site-wide SSR pass).
 *
 * The page itself is unchanged — it now lives in PageClient.tsx. This wrapper
 * runs on the server, prefetches the SWR keys the client tree requests on
 * first render (lib/ssr/manifest.json, recorded per route) and seeds them
 * through <SwrFallback>, so the content is in the HTML a crawler receives
 * instead of arriving only after hydration. Data the server cannot fetch is
 * skipped and loads on the client exactly as before.
 */
export default async function Page(props: { params: Promise<{ slug: string }> }) {
  const fallback = await ssrFallback('investors/[slug]', await props.params);
  return (
    <SwrFallback fallback={fallback}>
      <PageClient params={props.params} />
    </SwrFallback>
  );
}
