"use client";
import { TrendingDown } from "lucide-react";
import { MarketDataTable } from "@/components/market-data/MarketDataTable";

export default function TopLosersPage() {
  return (
    <MarketDataTable
      endpoint="top-losers"
      title="Today's Top Losers"
      blurb="Every U.S. stock down 10% or more today. When insiders step in on sharp declines, that's often the strongest contrarian signal in the Insider Score scoring system."
      Icon={TrendingDown}
    />
  );
}
