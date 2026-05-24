import { PremiumChartPreview } from "@/components/charts/PremiumChartPreview";

export default function ConfidenceHeatmapPage() {
  return (
    <PremiumChartPreview
      title="Confidence index"
      subtitle="Insider sentiment over time with bullish/bearish zones."
      variant="line"
      description="A continuous read on collective insider conviction — when the line crosses into the green zone, smart money is leaning bullish across the board."
      features={[
        "30/90/180-day confidence trends",
        "Bullish & bearish zone overlays",
        "Annotated with major insider events",
        "Sector overlays",
        "Compare against S&P 500",
        "Export to PNG",
      ]}
    />
  );
}
