// Sample "Popular Articles" cards — gives the home Popular Articles row real
// imagery when the live SEC/Fed feeds don't expose og:image. Original
// headlines + free-license Unsplash photo URLs.

import type { NewsItem } from "@/lib/api";

const popularSets: Array<Omit<NewsItem, "id" | "pubDate"> & { image: string }> = [
  {
    title:
      "After the AI Megacaps, the Cloud Infrastructure Names Are Next on Watch",
    description:
      "Earnings season has thrown a spotlight on what the cloud providers spend — and on the public-market names that capture that spend.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Popular",
    tags: ["ai", "earnings"],
    image:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Five Stocks Quietly Winning the AI Race While the Market Watches the Megacaps",
    description:
      "While the headlines stay glued to the top three names, a handful of mid-caps with focused AI exposure are seeing real Form 4 buying.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Popular",
    tags: ["ai"],
    image:
      "https://images.unsplash.com/photo-1620712943543-bcc4688e7485?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "Cybersecurity Names Drop on Cycle Worries — Is the Pullback a Buy Opportunity?",
    description:
      "A cluster of cyber-focused tickers gave up early-year gains last week. The insider data tells a different story than the tape.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Popular",
    tags: ["short-interest"],
    image:
      "https://images.unsplash.com/photo-1550751827-4bd374c3f58b?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "Three Names Rallying on a Memory Chip Price Boost — Substance or Hype?",
    description:
      "Memory-chip spot prices have stepped up. Three semiconductor names with leveraged exposure are catching a bid — here's how to think about it.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Popular",
    tags: ["semis"],
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "Quantum-Computing Stocks Just Got a Federal Lifeline — Who Benefits?",
    description:
      "A new federal allocation toward quantum-computing research has the small-cap quantum names back in focus. Insider activity is heating up alongside.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Popular",
    tags: ["ai", "macro"],
    image:
      "https://images.unsplash.com/photo-1635070041078-e363dbe005cb?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "Rocket Lab Keeps Making New Highs — What's Driving the Latest Leg of the Move?",
    description:
      "Space-launch operators have outperformed broader industrials by a wide margin. We look at the catalysts and the insider data alongside the chart.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Popular",
    tags: ["space"],
    image:
      "https://images.unsplash.com/photo-1517976487492-5750f3195933?w=1200&h=700&fit=crop&q=80",
  },
];

export function getSamplePopular(): Array<NewsItem & { image?: string }> {
  const now = Date.now();
  return popularSets.map((s, i) => ({
    ...s,
    id: `popular-${i}`,
    pubDate: new Date(now - i * 3 * 60 * 60_000).toISOString(),
  }));
}

export const SAMPLE_POPULAR_IMAGE_BY_ID: Record<string, string> = Object.fromEntries(
  popularSets.map((s, i) => [`popular-${i}`, s.image]),
);
