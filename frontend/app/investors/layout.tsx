import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/investors", {
  title: "Top Insiders — Hedge Fund & Famous Investor Portfolios | Insider Buying",
  description:
    "Track the portfolios and performance of 71 famous investors and hedge funds from their quarterly 13F filings — and see where their holdings overlap with active insider buying.",
});

export default function InvestorsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
