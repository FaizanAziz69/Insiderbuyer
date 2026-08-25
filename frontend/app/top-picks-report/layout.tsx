import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Stocks You Can Buy Cheaper Than the Insiders Did | InsiderBuying.com",
  description:
    "A one-time $3 report: stocks where insiders recently paid more than today's market price, with each buyer's role, dollar amount and IQS score.",
  robots: { index: false, follow: false },
};

export default function TopPicksReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
