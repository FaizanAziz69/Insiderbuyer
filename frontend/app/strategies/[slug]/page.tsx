import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/**
 * §1 calls this page "a high-intent SEO and social destination", which a
 * client-only render cannot be: a crawler receives an empty shell and indexes
 * nothing. The strategy's payload is seeded into the HTML the same way every
 * other data route here does it.
 *
 * The seeded payload is the GUEST one — no bearer token travels with a server
 * fetch — so holdings and the rebalance log arrive stripped, which is what a
 * crawler should see anyway. A subscriber's own fetch replaces it on the
 * client, and `usePremiumSWR` changes the SWR key when signed in precisely so
 * that replacement is not skipped.
 */
export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fallback = await ssrFallback("strategies/[slug]", { slug });
  return (
    <SwrFallback fallback={fallback}>
      <PageClient slug={slug} />
    </SwrFallback>
  );
}
