"use client";
import useSWR from "swr";
import { API_BASE, DashboardResponse, fetcher, formatCurrency } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SectorHeatmap } from "@/components/dashboard/SectorHeatmap";
import { TopTrades } from "@/components/dashboard/TopTrades";
import { MarketSignals } from "@/components/dashboard/MarketSignals";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { PremiumCTA } from "@/components/dashboard/PremiumCTA";

export default function DashboardPage() {
  const { data, isLoading } = useSWR<DashboardResponse>(
    `${API_BASE}/dashboard`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const m = data?.metrics;

  return (
    <div className="space-y-6 sm:space-y-8 max-w-7xl mx-auto">
      <section>
        <h1 className="text-[28px] sm:text-[32px] font-bold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.5px" }}>
          Insider intelligence, instantly
        </h1>
        <p className="mt-2 text-soft text-base max-w-2xl">
          Track insider buys and sells in real-time. SEC filing analysis reveals where smart money
          is accumulating.
        </p>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading || !m ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 h-[112px] animate-pulse" />
          ))
        ) : (
          <>
            <MetricCard
              label="Insider buys (24h)"
              value={m.insiderBuys24h.toLocaleString()}
              delta={
                Math.abs(m.pct24hVs7d) > 0
                  ? {
                      value: `${m.pct24hVs7d > 0 ? "↑" : "↓"} ${Math.abs(m.pct24hVs7d).toFixed(0)}%`,
                      positive: m.pct24hVs7d >= 0,
                    }
                  : undefined
              }
              hint="vs 7d avg"
            />
            <MetricCard
              label="Total volume"
              value={formatCurrency(m.totalRecentValue)}
              hint="Last 7 days"
            />
            <MetricCard
              label="Insider confidence"
              value={`${m.confidence.toFixed(1)}/10`}
              hint={m.confidence >= 5 ? "Strong signal" : "Cautious"}
            />
            <MetricCard
              label="Top sector"
              value={m.topSector.name === "Other" ? "—" : truncate(m.topSector.name, 18)}
              hint={`${formatCurrency(m.topSector.value)} traded`}
            />
          </>
        )}
      </section>

      {data && data.sectors.length > 0 && <SectorHeatmap sectors={data.sectors} />}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2">
          <TopTrades trades={data?.topTrades || []} total={data?.topTrades.length || 0} />
        </div>
        <div>
          {m && (
            <MarketSignals
              confidence={m.confidence}
              totalRecentValue={m.totalRecentValue}
              insiderBuys24h={m.insiderBuys24h}
              topSector={m.topSector}
            />
          )}
        </div>
      </section>

      {data && data.activity.length > 0 && <ActivityChart days={data.activity} />}

      <PremiumCTA />
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
