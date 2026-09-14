import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/** Top Ranking Congress Trades — Brief v5 §4, the flagship data page. */
export default async function Page() {
  const fallback = await ssrFallback("top-congress-trades");
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
