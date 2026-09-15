import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/top-ir-promoters", {
  title: "Top IR Promoters — Ranked by Client Stock Performance",
  description:
    "Investor-relations and promotional firms hired by Canadian venture issuers, ranked by what their clients' shares and trading volume did after each engagement began. A premium dataset.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
