import { pageMetadata } from "@/lib/seo-meta";

/** /insiders is the unified Top Insiders page (Brief v7 Build 3). The same
 *  layout wraps /insiders/leaderboard and the profiles, which set their own
 *  metadata. */
export const metadata = pageMetadata("/insiders");

export default function InsidersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
