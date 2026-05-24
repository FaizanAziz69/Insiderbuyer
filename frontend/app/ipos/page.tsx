import { ComingSoon } from "@/components/ComingSoon";

export default function IposPage() {
  return (
    <ComingSoon
      title="IPOs"
      description="Recent IPOs with the earliest insider buying signals."
      features={[
        "IPOs in the last 90 days",
        "First insider buy timestamp",
        "Lockup expiry calendar",
      ]}
    />
  );
}
