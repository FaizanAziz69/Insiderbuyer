"use client";
import { Sparkles } from "lucide-react";
import { FilteredNewsPage } from "@/components/news/FilteredNewsPage";

export default function FundsPage() {
  return (
    <FilteredNewsPage
      title="Funds"
      subtitle="Fund and ETF coverage — investment-company filings, fund advisor news, and adviser regulatory updates surfaced from SEC feeds."
      iconLabel="Funds"
      icon={<Sparkles className="h-4 w-4" />}
      defaultCategory="Funds"
      allowCategorySwitch={false}
      allowRegionSwitch={false}
    />
  );
}
