import PageClient from "./PageClient";
import { SwrFallback } from "@/components/SwrFallback";
import { ssrFallback } from "@/lib/ssr/prefetch";

/**
 * Server shell for the Promoter Score ranking page (Workstream F §2.5).
 * Same pattern as every other data page here: prefetch the SWR keys the
 * client tree asks for on first render and seed them, so the rankings are in
 * the HTML a crawler receives.
 */
export default async function Page() {
  const fallback = await ssrFallback("promoter-score");
  return (
    <SwrFallback fallback={fallback}>
      <PageClient />
    </SwrFallback>
  );
}
