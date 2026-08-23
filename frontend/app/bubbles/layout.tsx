import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/bubbles", {
  title: "Insider Bubbles Map — Live Insider Buying, Visualized | Insider Buying",
  description:
    "Every bubble is an insider purchase of $100K or more. Watch where executive conviction is concentrating — sized by dollars bought, colored by whether the stock still trades below what insiders paid.",
});

export default function BubblesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
