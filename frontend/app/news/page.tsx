"use client";
import { Newspaper } from "lucide-react";
import { FilteredNewsPage } from "@/components/news/FilteredNewsPage";

export default function NewsPage() {
  return (
    <FilteredNewsPage
      title="News & analysis"
      subtitle="Live coverage from SEC, Federal Reserve, U.S. Treasury, CFTC, Bank of Canada, and Statistics Canada — refreshed every 5 minutes."
      iconLabel="News"
      icon={<Newspaper className="h-4 w-4" />}
    />
  );
}
