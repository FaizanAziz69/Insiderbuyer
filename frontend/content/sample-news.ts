// Stub sample news items used as fallback when the live feed has fewer than
// the 12 items the home carousel needs. Headlines are intentionally generic
// (no specific tickers, no claimed financial figures) so they can't be read
// as specific market commentary; images are free-use Unsplash photo URLs.

import type { NewsItem } from "@/lib/api";

const sampleSets: Array<Omit<NewsItem, "id" | "pubDate"> & { image: string }> = [
  {
    title: "AI Infrastructure Spending Stays Resilient Through Q2 Earnings Cycle",
    description:
      "Hyperscaler capital-expenditure guidance held up across the second-quarter reporting season, suggesting the AI-investment cycle remains intact for at least another two quarters.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["ai", "earnings"],
    image:
      "https://images.unsplash.com/photo-1518770660439-4636190af475?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Biotech Pipeline Watch: Late-Stage Trials Lining Up for the Fall Calendar",
    description:
      "A cluster of mid-cap biotech names have meaningful Phase II and Phase III readouts on the horizon — and our IQS feed has been flagging insider buying ahead of several.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["biotech"],
    image:
      "https://images.unsplash.com/photo-1532187863486-abf9dbad1b69?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Energy Sector Setup: Insider Buying Picks Up at Mid-Cap Producers",
    description:
      "Form 4 activity in the oil and gas mid-tier has stepped up over the last month even as spot crude has chopped — a pattern worth watching as the OPEC+ meeting nears.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["macro"],
    image:
      "https://images.unsplash.com/photo-1611273426858-450d8e3c9fce?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Precious Metals Update: Gold Miner Executives Adding to Personal Stakes",
    description:
      "An unusual cluster of senior-officer Form 4 buys across the top North American gold producers — even as spot prices sit near multi-year highs.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["macro"],
    image:
      "https://images.unsplash.com/photo-1610375461246-83df859d849d?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Semiconductor Equipment Names Quietly Outperforming the Megacaps",
    description:
      "The picks-and-shovels names tied to leading-edge chip fabrication have started to lead the broader semi rally — and director-level buying has been picking up alongside.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["semis", "ai"],
    image:
      "https://images.unsplash.com/photo-1551103782-8ab07afd45c1?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Regional Banks: Loan-Book Quality Improving, Insider Activity Confirms",
    description:
      "Credit metrics at the larger regional banks improved sequentially in the latest cycle, and the Form 4 data shows board members and senior officers leaning in.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Funds",
    region: "US",
    label: "Sample",
    tags: ["earnings"],
    image:
      "https://images.unsplash.com/photo-1554260570-e9689a3418b8?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Macro Watch: Yield Curve Behavior Hints at Soft-Landing Continuation",
    description:
      "Recent moves in the front and belly of the curve are consistent with the soft-landing thesis — a backdrop that has historically favored quality cyclicals.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Economy",
    region: "US",
    label: "Sample",
    tags: ["macro"],
    image:
      "https://images.unsplash.com/photo-1559526324-4b87b5e36e44?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Space Sector Inflows Pick Up Ahead of High-Profile Launch Calendar",
    description:
      "ETF inflows into space-themed funds have stepped up alongside a heavy late-summer launch schedule. Public-market exposure to the theme remains concentrated in a handful of names.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["space"],
    image:
      "https://images.unsplash.com/photo-1457364887197-9150188c107b?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Dividend Aristocrats: Cluster Buying at Two Consumer-Staples Names",
    description:
      "Two long-time dividend payers in the staples sector saw multiple Form 4 buys this week from senior officers — historically a useful signal in cyclical-defensive transitions.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["dividends"],
    image:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Auto Industry: EV-Adjacent Suppliers Becoming the Real Trade",
    description:
      "Direct EV exposure has been volatile; the suppliers and component manufacturers feeding the entire industry are quietly compounding through the cycle.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["ev"],
    image:
      "https://images.unsplash.com/photo-1542219550-37153d387c27?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Short Interest Cooling at Several Heavily-Shorted Tech Names",
    description:
      "Aggregate short interest in a handful of high-profile growth names has rolled over in recent weeks — historically the start of position cleanup ahead of earnings.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["short-interest"],
    image:
      "https://images.unsplash.com/photo-1543286386-2e659306cd6c?w=1200&h=700&fit=crop&q=80",
  },
  {
    title: "Analyst Activity: Bulge-Bracket Desks Re-rating Industrials Higher",
    description:
      "A cluster of price-target revisions across the U.S. industrials complex this week — paired with rising insider activity at a handful of cap-ex levered names.",
    link: "https://www.sec.gov/news/pressreleases",
    source: "Insider Buying Editorial",
    category: "Market",
    region: "US",
    label: "Sample",
    tags: ["analyst-ratings"],
    image:
      "https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1200&h=700&fit=crop&q=80",
  },
];

// Build full NewsItem objects with deterministic IDs and recent timestamps.
export function getSampleNews(): Array<NewsItem & { image?: string }> {
  const now = Date.now();
  return sampleSets.map((s, i) => ({
    ...s,
    id: `sample-${i}`,
    pubDate: new Date(now - i * 90 * 60_000).toISOString(),
  }));
}

import { SAMPLE_IDEA_IMAGE_BY_ID } from "./stock-ideas";
import { SAMPLE_POPULAR_IMAGE_BY_ID } from "./sample-popular";

// Combined lookup across all sample sources. BigPlusFour and FeaturedImagesGrid
// resolve images by ID through this single map.
export const SAMPLE_IMAGE_BY_ID: Record<string, string> = {
  ...Object.fromEntries(sampleSets.map((s, i) => [`sample-${i}`, s.image])),
  ...SAMPLE_IDEA_IMAGE_BY_ID,
  ...SAMPLE_POPULAR_IMAGE_BY_ID,
};
