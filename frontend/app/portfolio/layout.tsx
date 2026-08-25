import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Portfolio — Scored by Insiders | InsiderBuying.com",
  description:
    "Add the stocks you own and see what the insiders at each company are doing — Insider Scores, cluster-buy alerts and SMS notifications for every holding.",
};

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
