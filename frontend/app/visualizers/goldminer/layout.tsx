import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/visualizers/goldminer", {
  title: "Goldminer AI — Every Major Gold Project, Mapped | Insider Buying",
  description:
    "An interactive world map of gold projects, each bubble anchored where the deposit is and sized by what the most advanced economic study says the asset is worth.",
});

const OG = "https://insiderbuying.com/api/og/visualizer?v=mining";
metadata.openGraph = { ...(metadata.openGraph ?? {}), images: [{ url: OG, width: 1200, height: 630 }] };
metadata.twitter = { card: "summary_large_image", images: [OG] };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
