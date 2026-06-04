"use client";
import { Activity } from "lucide-react";
import { MarketDataTable } from "@/components/market-data/MarketDataTable";

export default function MostActivePage() {
  return (
    <MarketDataTable
      endpoint="most-active"
      title="Most Active Stocks"
      blurb="The U.S. stocks with the highest dollar volume today. Volume spikes often follow news releases, earnings reactions, or institutional repositioning — the kind of moves worth a closer look."
      Icon={Activity}
    />
  );
}
