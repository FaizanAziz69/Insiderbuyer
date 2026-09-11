import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/visualizers/prediction-markets", {
  title: "Prediction Market Bubbles — Live Odds, Visualized | Insider Buying",
  description:
    "Watch the market bet in real time. Every bubble is one event contract on Polymarket or Kalshi, sized by dollars traded and coloured by which way the money leans — politics, the Fed, crypto, sports and tech.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
