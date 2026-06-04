"use client";
import { TrendingDown } from "lucide-react";
import { MarketDataTable } from "@/components/market-data/MarketDataTable";

export default function TopLosersPage() {
  return (
    <MarketDataTable
      endpoint="top-losers"
      title="Today's Top Losers"
      blurb="The biggest percentage decliners on the U.S. market today. When insiders step in on sharp declines, that's often the strongest contrarian signal in the IQS scoring system."
      Icon={TrendingDown}
    />
  );
}
