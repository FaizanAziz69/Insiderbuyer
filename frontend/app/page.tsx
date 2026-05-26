"use client";
import useSWR from "swr";
import { motion } from "framer-motion";
import { API_BASE, DashboardResponse, fetcher, formatCurrency } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SectorHeatmap } from "@/components/dashboard/SectorHeatmap";
import { TopTrades } from "@/components/dashboard/TopTrades";
import { MarketSignals } from "@/components/dashboard/MarketSignals";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { PremiumCTA } from "@/components/dashboard/PremiumCTA";
import { NewsWidget } from "@/components/news/NewsWidget";

export default function DashboardPage() {
  const { data, isLoading } = useSWR<DashboardResponse>(
    `${API_BASE}/dashboard`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const m = data?.metrics;

  return (
    <div className="max-w-7xl mx-auto space-y-7 sm:space-y-9">
      <section className="relative overflow-hidden rounded-2xl">
        <div className="hero-orb hero-orb-a" />
        <div className="hero-orb hero-orb-b" />
        <div className="hero-orb hero-orb-c" />
        <div className="bg-grid-animated" />

        <div className="relative py-2 sm:py-3">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.18em] mb-4"
            style={{
              background: "var(--accent-soft)",
              color: "var(--accent)",
            }}
          >
            <span className="live-dot live-dot-good" />
            Live · SEC EDGAR feed
          </motion.div>
          <motion.h1
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
            className="text-[30px] sm:text-[40px] lg:text-[44px] font-bold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.8px" }}
          >
            Insider intelligence,{" "}
            <span className="gradient-text">instantly</span>.
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.7, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 text-soft text-base max-w-2xl"
          >
            Track insider buys and sells in real-time. SEC filing analysis reveals where smart
            money is accumulating.
          </motion.p>
        </div>
      </section>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {isLoading || !m ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="card p-5 h-[126px] shimmer" />
          ))
        ) : (
          <>
            <MetricCard
              index={0}
              label="Insider buys (24h)"
              value={m.insiderBuys24h.toLocaleString()}
              animatedTo={m.insiderBuys24h}
              format={(n) => Math.round(n).toLocaleString()}
              delta={
                Math.abs(m.pct24hVs7d) > 0
                  ? {
                      value: `${Math.abs(m.pct24hVs7d).toFixed(0)}%`,
                      positive: m.pct24hVs7d >= 0,
                    }
                  : undefined
              }
              hint="vs 7d avg"
              accent="var(--accent)"
            />
            <MetricCard
              index={1}
              label="Total volume"
              value={formatCurrency(m.totalRecentValue)}
              animatedTo={m.totalRecentValue}
              format={(n) => formatCurrency(n, true)}
              hint="Last 7 days"
              accent="var(--good)"
            />
            <MetricCard
              index={2}
              label="Insider confidence"
              value={`${m.confidence.toFixed(1)}/10`}
              animatedTo={m.confidence}
              format={(n) => `${n.toFixed(1)}/10`}
              hint={m.confidence >= 5 ? "Strong signal" : "Cautious"}
              accent="var(--accent-2)"
            />
            <MetricCard
              index={3}
              label="Top sector"
              value={m.topSector.name === "Other" ? "—" : truncate(m.topSector.name, 18)}
              hint={`${formatCurrency(m.topSector.value)} traded`}
              accent="var(--warn)"
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

      <NewsWidget />

      <PremiumCTA />
    </div>
  );
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
