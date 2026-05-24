import { ComingSoon } from "@/components/ComingSoon";

export default function AlertsPage() {
  return (
    <ComingSoon
      title="Alerts"
      description="Real-time notifications when insiders you watch make moves."
      premium
      features={[
        "Real-time, daily, or weekly email frequency",
        "Trigger on insider, sector, CEO/CFO moves, or big buys",
        "Telegram bot integration",
        "Sample alert preview before subscribing",
      ]}
    />
  );
}
