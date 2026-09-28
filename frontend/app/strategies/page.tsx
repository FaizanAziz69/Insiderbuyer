import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/**
 * Server shell for Brief v8's strategies index — the library is seeded into the
 * HTML so a crawler receives the cards rather than an empty grid, the same
 * pattern every other data route here uses.
 */
export default async function Page() {
  const fallback = await ssrFallback("strategies");
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
