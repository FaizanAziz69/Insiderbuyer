import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ ticker: string }>;
}): Promise<Metadata> {
  const { ticker } = await params;
  return pageMetadata(`/reports/cta/${ticker.toUpperCase()}`, {
    title: `${ticker.toUpperCase()} Insider Buying Report | Insider Buying`,
    description: `Insider trading report for ${ticker.toUpperCase()}: SEC Form 4 buys, executive holdings and Insider Score signals.`,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
