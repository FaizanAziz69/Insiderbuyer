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
export default async function Page() {
  const fallback = await ssrFallback('reports');
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
