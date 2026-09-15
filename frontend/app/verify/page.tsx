import type { Metadata } from "next";
import { VerifyClient } from "./VerifyClient";

/**
 * Bot-gate interstitial. middleware.ts REWRITES uncookied page requests here
 * (status 200, original URL kept in ?return=), so this route must never be
 * indexed under either its own path or the page it stands in for.
 */
export const metadata: Metadata = {
  title: "Checking your browser — InsiderBuying",
  robots: { index: false, follow: false, nocache: true },
};

export const dynamic = "force-static";

export default function VerifyPage() {
  return <VerifyClient siteKey={process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || ""} />;
}
