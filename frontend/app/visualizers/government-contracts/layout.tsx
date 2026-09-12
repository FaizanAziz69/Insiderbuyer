import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/visualizers/government-contracts", {
  title: "Government Contracts Visualizer — Who Wins Federal Money | Insider Buying",
  description:
    "Every bubble is a company, sized by the federal dollars it was awarded. Switch between the United States and Canada, then see which winners had insiders buying their own stock.",
});

const OG = "https://insiderbuying.com/api/og/visualizer?v=contracts";
metadata.openGraph = { ...(metadata.openGraph ?? {}), images: [{ url: OG, width: 1200, height: 630 }] };
metadata.twitter = { card: "summary_large_image", images: [OG] };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
