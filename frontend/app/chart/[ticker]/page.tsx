"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PriceChart } from "@/components/PriceChart";

/** Standalone full-page price chart (stockanalysis.com/chart/SPY style):
 *  the profile header's "Full Chart" button lands here. */
export default function FullChartPage({
  params,
}: {
  params: Promise<{ ticker: string }>;
}) {
  const { ticker } = use(params);
  const sym = decodeURIComponent(ticker).toUpperCase();

  const { data } = useSWR<{
    stats: { symbol: string; name: string | null; exchange?: string | null } | null;
  }>(`${API_BASE}/market-stats/stats?symbol=${encodeURIComponent(sym)}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
  });
  const name = data?.stats?.name || null;

  return (
    <div className="w-full">
      <Link
        href={`/companies/${encodeURIComponent(sym)}`}
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to {sym} profile
      </Link>

      <div className="flex items-center gap-3 mb-4">
        <CompanyLogo ticker={sym} name={name || sym} size={36} />
        <div>
          <h1 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight">
            {sym} Chart
          </h1>
          {name && (
            <div className="text-mute text-[13px] font-medium">{name}</div>
          )}
        </div>
      </div>

      <PriceChart ticker={sym} height={480} />

      <p className="text-[12px] text-mute mt-4">
        Interactive price history for {name || sym}. Hover for exact prices;
        switch timeframes above the chart. Data refreshes throughout the
        trading day.
      </p>
    </div>
  );
}
