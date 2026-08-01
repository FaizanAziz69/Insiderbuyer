import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Insider Buying — Find out what insiders are really doing",
  description:
    "Search any stock and get its Insider Quality Score plus a full insider report, built from live SEC Form 4 filings.",
};

export default function InsiderReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
