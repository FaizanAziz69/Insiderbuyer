import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

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
/** The member's name in the tab; the copy is the tracker's, never "net worth". */
export async function generateMetadata(props: { params: Promise<{ name: string }> }) {
  const { name } = await props.params;
  const who = decodeURIComponent(name);
  const title = `${who}: Stock Trades, Disclosed Holdings & Portfolio Growth (est.) | InsiderBuying.com`;
  const description = `Every disclosed stock trade by ${who}, the portfolio rebuilt from those filings, estimated cost per holding, returns against the S&P 500, hit rate and badges.`;
  // The share card is the last-10-trades strip (Brief v7 §3 "social pipeline").
  const image = `https://insiderbuying.com/api/og/last10?type=congress&key=${encodeURIComponent(who)}`;
  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: image, width: 1200, height: 630 }] },
    twitter: { card: "summary_large_image", title, description, images: [image] },
  };
}

export default async function Page(props: { params: Promise<{ name: string }> }) {
  const fallback = await ssrFallback('politicians/[name]', await props.params);
  return (
    <SwrFallback fallback={fallback}>
      <PageClient params={props.params} />
    </SwrFallback>
  );
}
