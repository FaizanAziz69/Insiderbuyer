import { ComingSoon } from "@/components/ComingSoon";

export default function NewsPage() {
  return (
    <ComingSoon
      title="News & analysis"
      description="Curated news that contextualizes insider activity."
      features={[
        "Headlines from Bloomberg, Reuters, SEC press releases",
        "Auto-tagged to tickers in your watchlist",
        "Trending topics by sector",
        "Saved-for-later list",
      ]}
    />
  );
}
