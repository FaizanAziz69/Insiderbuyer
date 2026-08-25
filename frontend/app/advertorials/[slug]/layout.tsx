import type { Metadata } from "next";
import { pageMetadata, humanizeSlug } from "@/lib/seo-meta";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  return pageMetadata(`/advertorials/${slug}`, {
    title: `${humanizeSlug(slug)} | InsiderBuying.com`,
    description: "Sponsored insider-buying research from Insider Buying.",
  });
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
