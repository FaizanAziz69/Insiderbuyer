import type { Metadata } from "next";

/** Design-review draft of the new sales page (beehiiv-style, client copy).
 *  Deliberately unlisted: noindex, absent from the sitemap and every nav.
 *  When approved, this page's content replaces /premium and this route dies. */
export const metadata: Metadata = {
  title: "All-In Access — Insider Buying",
  description:
    "Stock analysis, insider rankings, breaking news. One platform.",
  robots: { index: false, follow: false },
};

export default function PremiumPreviewLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
