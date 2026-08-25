import type { Metadata } from "next";

/** Funnel pages are conversion surfaces, not search results — noindex keeps
 *  them out of Google while still allowing paid traffic. */
export const metadata: Metadata = {
  title: "Get Insider Access | InsiderBuying.com",
  description:
    "See what insiders are buying before the market does. Enter your email to get started.",
  robots: { index: false, follow: false },
};

export default function JoinLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
