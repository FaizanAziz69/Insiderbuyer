import { ComingSoon } from "@/components/ComingSoon";

export default function TopPerformersPage() {
  return (
    <ComingSoon
      title="Top performers"
      description="Companies where insider buys preceded the biggest stock-price moves."
      premium
      features={[
        "Backtested 30/60/90-day returns after insider clusters",
        "Sortable by return %",
        "Filter by sector or insider role",
      ]}
    />
  );
}
