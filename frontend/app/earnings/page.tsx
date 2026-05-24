import { ComingSoon } from "@/components/ComingSoon";

export default function EarningsPage() {
  return (
    <ComingSoon
      title="Earnings"
      description="Insider buys right before earnings — a particularly strong signal."
      premium
      features={[
        "Pre-earnings buys flagged 14d before report",
        "Historical post-earnings price moves",
        "Earnings calendar overlay",
      ]}
    />
  );
}
