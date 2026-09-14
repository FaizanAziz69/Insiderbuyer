import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/promoter-score", {
  title: "Promoter Score — What Canadian Venture Issuers Pay for IR",
  description:
    "Disclosed investor-relations and promotional spend at TSXV and CSE issuers, from the Policy 3.4 news releases: provider, monthly fee, term, options granted, and a quarterly Promoter Score.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
