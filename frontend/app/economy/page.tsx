"use client";
import { LineChart } from "lucide-react";
import { FilteredNewsPage } from "@/components/news/FilteredNewsPage";

export default function EconomyPage() {
  return (
    <FilteredNewsPage
      title="Economy"
      subtitle="Macro coverage from the Federal Reserve, U.S. Treasury, Bank of Canada, and Statistics Canada. Rates, monetary policy, employment, and economic indicators."
      iconLabel="Economy"
      icon={<LineChart className="h-4 w-4" />}
      defaultCategory="Economy"
      allowCategorySwitch={false}
    />
  );
}
