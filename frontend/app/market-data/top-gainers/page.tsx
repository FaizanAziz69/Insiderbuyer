"use client";
import { TrendingUp } from "lucide-react";
import { MarketDataTable } from "@/components/market-data/MarketDataTable";

export default function TopGainersPage() {
  return (
    <MarketDataTable
      endpoint="top-gainers"
      title="Today's Top Gainers"
      blurb="The biggest percentage gainers on the U.S. market today, ranked by intraday change. Pair with the IQS feed to separate momentum-driven pops from insider-supported moves."
      Icon={TrendingUp}
    />
  );
}
