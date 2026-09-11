import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/visualizers/goldminer", {
  title: "Goldminer AI — Every Major Gold Project, Mapped | Insider Buying",
  description:
    "An interactive world map of gold projects, each bubble anchored where the deposit is and sized by what the most advanced economic study says the asset is worth.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
