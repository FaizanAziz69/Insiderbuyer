import { ComingSoon } from "@/components/ComingSoon";

export default function MoversPage() {
  return (
    <ComingSoon
      title="Biggest movers"
      description="Stocks with the most insider activity in the last 24h."
      features={[
        "Top 20 by purchase value",
        "Top 20 by # of distinct insiders",
        "Compare against daily price action",
      ]}
    />
  );
}
