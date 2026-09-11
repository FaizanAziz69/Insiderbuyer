import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/visualizers", {
  title: "Bubble Visualizers — Markets, Contracts, Gold and Biotech | Insider Buying",
  description:
    "Four interactive bubble visualizers that turn dense financial datasets into something you can explore: live prediction markets, federal contract awards, global gold projects and biotech catalysts.",
});

export default function VisualizersLayout({ children }: { children: React.ReactNode }) {
  return children;
}
