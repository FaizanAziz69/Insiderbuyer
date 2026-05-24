import { ComingSoon } from "@/components/ComingSoon";

export default function VolumeChartPage() {
  return (
    <ComingSoon
      title="Trading volume"
      description="Insider buying volume across time, broken out by role and sector."
      features={[
        "30/90/180/365-day windows",
        "CEO/CFO/Director breakdown",
        "Compare two sectors",
        "Annotations on regime shifts",
      ]}
    />
  );
}
