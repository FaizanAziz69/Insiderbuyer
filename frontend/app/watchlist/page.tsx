import { ComingSoon } from "@/components/ComingSoon";

export default function WatchlistPage() {
  return (
    <ComingSoon
      title="Watchlist"
      description="Track your holdings + see insider activity on them, side-by-side."
      premium
      features={[
        "Add up to 50 tickers (unlimited on premium)",
        "Daily summary of insider activity on watched stocks",
        "Email alerts when a CEO/CFO buys",
        "30d performance comparison vs benchmark",
      ]}
    />
  );
}
