import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/**
 * Revalidate on a clock rather than at build time.
 *
 * Without this the route is fully static: the SSR payload is baked once, SWR
 * is seeded from it and does not refetch, so a newly verified flag stayed
 * invisible until the next deploy — the page read "No verified rows" while the
 * API was returning them. Two minutes matches the prefetch's own window.
 */
export const revalidate = 120;

/** Top Ranking Congress Trades — Brief v5 §4, the flagship data page. */
export default async function Page() {
  const fallback = await ssrFallback("top-congress-trades");
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
