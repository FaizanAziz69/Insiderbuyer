"use client";
import { TrendingUp } from "lucide-react";
import { FilteredNewsPage } from "@/components/news/FilteredNewsPage";

export default function MarketsPage() {
  return (
    <FilteredNewsPage
      title="Markets"
      subtitle="Equity-market headlines — exchanges, trading, market structure, and enforcement actions that move stocks."
      iconLabel="Markets"
      icon={<TrendingUp className="h-4 w-4" />}
      defaultCategory="Market"
      allowCategorySwitch={false}
    />
  );
}
