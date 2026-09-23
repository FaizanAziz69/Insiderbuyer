import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/** Title + the last-10-trades share card (Brief v7 §3). */
export async function generateMetadata(props: { params: Promise<{ name: string }> }) {
  const { name } = await props.params;
  const who = decodeURIComponent(name);
  const title = `${who}: Insider Trades, Buy Win Rate & Last 10 Trades | InsiderBuying.com`;
  const description = `Every SEC Form 4 trade filed by ${who}, exact prices and share counts, win rate on open-market buys, and how the last ten trades have done.`;
  const image = `https://insiderbuying.com/api/og/last10?type=insider&key=${encodeURIComponent(who)}`;
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
export default async function Page(props: { params: Promise<{ name: string }> }) {
  const fallback = await ssrFallback('insiders/[name]', await props.params);
  return (
    <SwrFallback fallback={fallback}>
      <PageClient params={props.params} />
    </SwrFallback>
  );
}
