import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ month: string }>;
}): Promise<Metadata> {
  const { month } = await params;
  return pageMetadata(`/reports/monthly/${month}`, {
    title: `Monthly Insider Buying Report — ${month} | Insider Buying`,
    description: `Monthly recap of notable executive insider buying: top Form 4 purchases, cluster buys and Insider Score movers.`,
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
