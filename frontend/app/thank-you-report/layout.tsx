import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your report is on its way | InsiderBuying.com",
  description: "Your insider-discount report has been delivered.",
  robots: { index: false, follow: false },
};

export default function ThankYouReportLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
