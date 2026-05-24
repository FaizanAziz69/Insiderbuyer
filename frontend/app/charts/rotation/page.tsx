import { PremiumChartPreview } from "@/components/charts/PremiumChartPreview";

export default function RotationChartPage() {
  return (
    <PremiumChartPreview
      title="Sector rotation"
      subtitle="Visualize how insider capital is flowing between sectors."
      variant="sankey"
      description="A Sankey diagram of weekly capital flows across sectors — spot early sector rotation before it shows up in mutual-fund flows."
      features={[
        "Sankey diagram of weekly capital flows",
        "Identify early sector rotation",
        "Compare to mutual-fund flow data",
        "Filter by insider role (CEO/CFO/Director)",
        "Adjustable time windows",
        "Export raw flow data",
      ]}
    />
  );
}
