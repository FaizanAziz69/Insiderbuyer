import { ComingSoon } from "@/components/ComingSoon";

export default function TrendingNewsPage() {
  return (
    <ComingSoon
      title="Trending news"
      description="The day's most-discussed stories cross-referenced with insider activity."
      features={["Auto-clustered by topic", "Tied to tickers in our DB", "Refreshed every hour"]}
    />
  );
}
