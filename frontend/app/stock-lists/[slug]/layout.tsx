import type { Metadata } from "next";
import { pageMetadata, humanizeSlug } from "@/lib/seo-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(`/stock-lists/${slug}`, {
    title: `${humanizeSlug(slug)} Stock List & Insider Buys | InsiderBuying.com`,
    description: "Curated stock list with real-time SEC Form 4 insider buying activity from Insider Buying.",
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
