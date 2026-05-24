import { ComingSoon } from "@/components/ComingSoon";

export default function MarketHeatmapPage() {
  return (
    <ComingSoon
      title="Market heatmap"
      description="Company-level heatmap colored by insider conviction strength."
      premium
      features={[
        "Every U.S. listed company with insider activity",
        "Size of cell = market cap; color = IQS intensity",
        "Click to drill into company detail",
        "Filter by sector",
      ]}
    />
  );
}
