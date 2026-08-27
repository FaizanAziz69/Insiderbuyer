import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/congress-bubbles", {
  title: "Congress Bubbles — Congressional Stock Trades, Visualized | Insider Buying",
  description:
    "Every bubble is a member of Congress, sized by the stock they traded in the period and colored by whether they were net buying or net selling. Built from House and Senate Periodic Transaction Reports, refreshed daily.",
});

export default function CongressBubblesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
