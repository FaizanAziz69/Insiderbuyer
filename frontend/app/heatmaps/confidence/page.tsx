import { ComingSoon } from "@/components/ComingSoon";

export default function ConfidenceHeatmapPage() {
  return (
    <ComingSoon
      title="Confidence index"
      description="Insider sentiment over time, plotted as a line chart with colored bullish/bearish zones."
      premium
      features={[
        "30/90/180-day confidence trends",
        "Annotated with major insider events",
        "Sector overlays",
        "Export to PNG for reports",
      ]}
    />
  );
}
