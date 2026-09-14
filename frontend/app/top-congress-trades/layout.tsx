import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/top-congress-trades", {
  title: "Top Ranking Congress Trades — Trades, Committees and Contracts",
  description:
    "Where a member of Congress's disclosed stock trade meets the committee that oversees a federal agency and a contract that agency awarded. Every row links to the filing, the committee record and the award.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
