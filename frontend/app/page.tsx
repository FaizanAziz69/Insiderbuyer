"use client";
import useSWR from "swr";
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useState } from "react";
import { Activity, Newspaper } from "lucide-react";
import { API_BASE, DashboardResponse, fetcher, formatCurrency } from "@/lib/api";
import { MetricCard } from "@/components/dashboard/MetricCard";
import { SectorHeatmap } from "@/components/dashboard/SectorHeatmap";
import { TopTrades } from "@/components/dashboard/TopTrades";
import { MarketSignals } from "@/components/dashboard/MarketSignals";
import { ActivityChart } from "@/components/dashboard/ActivityChart";
import { PremiumCTA } from "@/components/dashboard/PremiumCTA";
import { NewsMagazine } from "@/components/home/NewsMagazine";

type Tab = "news" | "signals";

export default function HomePage() {
  const [tab, setTab] = useState<Tab>("news");

  useEffect(() => {
    try {
      const saved = localStorage.getItem("ib-home-tab") as Tab | null;
      if (saved === "news" || saved === "signals") setTab(saved);
    } catch {}
  }, []);

  function setTabPersist(t: Tab) {
    setTab(t);
    try {
      localStorage.setItem("ib-home-tab", t);
    } catch {}
  }

  return (
    <div className="space-y-5 sm:space-y-6">
      <TabToggle tab={tab} setTab={setTabPersist} />
      <AnimatePresence mode="wait">
        {tab === "news" ? (
          <motion.div
            key="news"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <NewsMagazine />
          </motion.div>
        ) : (
          <motion.div
            key="signals"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <SignalsView />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TabToggle({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div
        className="inline-flex p-1 rounded-xl border"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setTab("news")}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition"
          style={{
            background: tab === "news" ? "var(--accent)" : "transparent",
            color: tab === "news" ? "white" : "var(--text-soft)",
            boxShadow: tab === "news" ? "0 4px 12px rgba(0,102,255,0.25)" : "none",
          }}
        >
          <Newspaper className="h-4 w-4" />
          News
        </button>
        <button
          onClick={() => setTab("signals")}
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-sm font-semibold transition"
          style={{
            background: tab === "signals" ? "var(--accent)" : "transparent",
            color: tab === "signals" ? "white" : "var(--text-soft)",
            boxShadow: tab === "signals" ? "0 4px 12px rgba(0,102,255,0.25)" : "none",
          }}
        >
          <Activity className="h-4 w-4" />
          Signals
        </button>
      </div>
    </div>
  );
}

function SignalsView() {
  const { data, isLoading } = useSWR<DashboardResponse>(
    `${API_BASE}/dashboard`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
  const m = data?.metrics;
  return (
    <div className="space-y-7 sm:space-y-9">
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
              hint="Last 30 days"
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
              value={
                m.topSector.name === "Other" ? "—" : truncate(m.topSector.name, 18)
              }
              hint={`${formatCurrency(m.topSector.value)} traded`}
              accent="var(--warn)"
            />
          </>
        )}
      </section>

      {data && data.sectors.length > 0 && <SectorHeatmap sectors={data.sectors} />}

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="lg:col-span-2">
          <TopTrades
            trades={data?.topTrades || []}
            total={data?.topTrades.length || 0}
          />
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
