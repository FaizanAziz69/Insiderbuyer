import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";
import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/insiders/leaderboard");

/** The Form 4 leaderboard — the table that was /insiders before the unified
 *  Top Insiders page (Brief v7 Build 3) took that URL. */
export default async function Page() {
  const fallback = await ssrFallback("insiders/leaderboard");
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
