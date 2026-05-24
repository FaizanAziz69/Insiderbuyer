import { ComingSoon } from "@/components/ComingSoon";

export default function RotationChartPage() {
  return (
    <ComingSoon
      title="Sector rotation"
      description="Visualize how insider capital is flowing between sectors."
      premium
      features={[
        "Sankey diagram of weekly capital flows",
        "Identify early sector rotation",
        "Compare to mutual-fund flow data",
      ]}
    />
  );
}
