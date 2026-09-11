import { pageMetadata } from "@/lib/seo-meta";

export const metadata = pageMetadata("/visualizers/biotech", {
  title: "Biotech Catalyst Map — PDUFA Dates and Insider Buying | Insider Buying",
  description:
    "Biotech companies mapped by headquarters and sized by market cap, pulsing when an FDA decision or data readout is inside ninety days — with the insider buying that ran ahead of it.",
});

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
