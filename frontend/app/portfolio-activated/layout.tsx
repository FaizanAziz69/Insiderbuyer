import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Your portfolio is live | InsiderBuying.com",
  description: "Portfolio Intelligence is active on your account.",
  robots: { index: false, follow: false },
};

export default function PortfolioActivatedLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
