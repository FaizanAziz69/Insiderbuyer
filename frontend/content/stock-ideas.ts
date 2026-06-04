// Sample stock-idea articles — used to fill the home "Stock Ideas" section
// with article-style cards (image + headline) when the live `/api/ideas` feed
// doesn't yet have richly-formatted entries. Headlines are intentionally
// general; images are free-use Unsplash photo URLs.

import type { NewsItem } from "@/lib/api";

const ideaSets: Array<Omit<NewsItem, "id" | "pubDate"> & { image: string }> = [
  {
    title:
      "5 Public Space Stocks Worth Watching as the IPO Calendar Heats Up",
    description:
      "With several private space companies preparing for a public-market debut, here are the listed names that historically move on launch news.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Ideas",
    category: "Market",
    region: "US",
    label: "Stock Idea",
    tags: ["space", "ipo"],
    image:
      "https://images.unsplash.com/photo-1517976487492-5750f3195933?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "Newest $1 Trillion Market Cap Club Members — Bubble or New Normal?",
    description:
      "Three names crossed the trillion-dollar line in the last twelve months. We look at whether insider activity supports the move or warns of froth.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Ideas",
    category: "Market",
    region: "US",
    label: "Stock Idea",
    tags: ["ai", "analyst-ratings"],
    image:
      "https://images.unsplash.com/photo-1611974789855-9c2a0a7236a3?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "3 CLO ETFs Targeting an Overlooked Corner of the Fixed-Income Market",
    description:
      "Collateralized loan obligation ETFs have quietly attracted significant flows. Here's where the structure makes sense — and where it doesn't.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Ideas",
    category: "Funds",
    region: "US",
    label: "Stock Idea",
    tags: ["etf", "dividends"],
    image:
      "https://images.unsplash.com/photo-1554260570-e9689a3418b8?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "3 Beaten-Down Stocks That Just Saw $25 Million in Cluster Insider Buying",
    description:
      "Three names with multiple senior-officer Form 4 buys in the past two weeks — each well off recent highs. We look at why insiders are stepping in.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Ideas",
    category: "Market",
    region: "US",
    label: "Stock Idea",
    tags: ["insider-trades"],
    image:
      "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "Is Co-Diagnostics National Security's Next Diagnostic Pick?",
    description:
      "A look at the diagnostics sub-sector and how federal contracts could reshape valuations for two small-cap pure plays.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Ideas",
    category: "Market",
    region: "US",
    label: "Stock Idea",
    tags: ["biotech"],
    image:
      "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1200&h=700&fit=crop&q=80",
  },
  {
    title:
      "If the Market Rally Stalls, This ETF Family Can Insulate Portfolios",
    description:
      "Low-volatility and minimum-variance ETFs have a strong track record in choppy tape. Here's how to think about position sizing if momentum fades.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Ideas",
    category: "Funds",
    region: "US",
    label: "Stock Idea",
    tags: ["etf"],
    image:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&h=700&fit=crop&q=80",
  },
];

export function getSampleIdeas(): Array<NewsItem & { image?: string }> {
  const now = Date.now();
  return ideaSets.map((s, i) => ({
    ...s,
    id: `idea-${i}`,
    pubDate: new Date(now - i * 4 * 60 * 60_000).toISOString(),
  }));
}

export const SAMPLE_IDEA_IMAGE_BY_ID: Record<string, string> = Object.fromEntries(
  ideaSets.map((s, i) => [`idea-${i}`, s.image]),
);
