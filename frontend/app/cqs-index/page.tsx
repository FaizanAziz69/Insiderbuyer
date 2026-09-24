import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/**
 * Server shell: prefetches the leaderboard key the client asks for on first
 * render and seeds it, so the board is in the HTML a crawler receives instead
 * of arriving only after hydration — the same pattern every other data route
 * on the site uses.
 */
export default async function Page() {
  const fallback = await ssrFallback("cqs-index");
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
