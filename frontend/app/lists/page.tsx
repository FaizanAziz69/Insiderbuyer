import { ComingSoon } from "@/components/ComingSoon";

export default function ListsPage() {
  return (
    <ComingSoon
      title="Curated lists"
      description="Hand-curated lists of high-conviction insider trades."
      features={[
        "Founder buys",
        "Mega-cap insider clusters",
        "Cheap valuation + insider buying",
        "Community-shared lists (premium)",
      ]}
    />
  );
}
