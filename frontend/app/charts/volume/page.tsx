"use client";
import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import { Activity, BarChart3, TrendingUp } from "lucide-react";
import { API_BASE, VolumeSeriesResponse, fetcher, formatCurrency } from "@/lib/api";
import { LineChart } from "@/components/charts/LineChart";

const RANGES = [
  { key: 7, label: "7D" },
  { key: 30, label: "30D" },
  { key: 90, label: "90D" },
  { key: 180, label: "180D" },
  { key: 365, label: "1Y" },
];

const ROLE_COLORS: Record<string, string> = {
  CEO: "var(--accent)",
  CFO: "var(--accent-2)",
  COO: "var(--good)",
  Director: "var(--gold)",
  Other: "var(--text-faint)",
};

export default function VolumeChartPage() {
  const [days, setDays] = useState(30);
  const [metric, setMetric] = useState<"value" | "count">("value");

  const { data, isLoading } = useSWR<VolumeSeriesResponse>(
    `${API_BASE}/charts/volume?days=${days}`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );

  const roleTotal =
    data &&
    (Object.values(data.byRole).reduce((a, b) => a + b, 0) || 1);

  return (
    <div className="w-full space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="live-dot live-dot-good text-mute">live</span>
          </div>
          <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
            Trading volume
          </h1>
          <p className="text-mute text-sm mt-1">
            Insider purchase volume across time, broken out by role and date.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex p-1 rounded-lg border"
            style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
          >
            {RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setDays(r.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  days === r.key ? "text-white" : "text-mute hover:text-soft"
                }`}
                style={
                  days === r.key
                    ? {
                        background: "var(--accent)",
                        boxShadow: "0 4px 12px rgba(0,102,255,0.25)",
                      }
                    : {}
                }
              >
                {r.label}
              </button>
            ))}
          </div>
          <div
            className="inline-flex p-1 rounded-lg border"
            style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
          >
            <button
              onClick={() => setMetric("value")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition inline-flex items-center gap-1.5 ${
                metric === "value" ? "text-white" : "text-mute hover:text-soft"
              }`}
              style={metric === "value" ? { background: "var(--accent-2)" } : {}}
            >
              <TrendingUp className="h-3 w-3" />
              Value
            </button>
            <button
              onClick={() => setMetric("count")}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition inline-flex items-center gap-1.5 ${
                metric === "count" ? "text-white" : "text-mute hover:text-soft"
              }`}
              style={metric === "count" ? { background: "var(--accent-2)" } : {}}
            >
              <BarChart3 className="h-3 w-3" />
              Count
            </button>
          </div>
        </div>
      </motion.header>

      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <Stat
          label="Total volume"
          value={formatCurrency(data?.totalValue || 0)}
          accent="var(--good)"
          loading={isLoading}
          delay={0.05}
        />
        <Stat
          label="Total trades"
          value={(data?.totalCount || 0).toLocaleString()}
          accent="var(--accent)"
          loading={isLoading}
          delay={0.1}
        />
        <Stat
          label="Avg / day"
          value={(data?.avgPerDay || 0).toFixed(1)}
          accent="var(--accent-2)"
          loading={isLoading}
          delay={0.15}
        />
        <Stat
          label="Window"
          value={`${data?.windowDays || days}D`}
          accent="var(--warn)"
          loading={isLoading}
          delay={0.2}
        />
      </section>

      <motion.section
        key={`${days}-${metric}`}
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        className="card p-5 sm:p-6 relative overflow-hidden"
      >
        <div
          aria-hidden
          className="absolute -top-12 -left-12 h-40 w-40 rounded-full blur-3xl pointer-events-none"
          style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)" }}
        />
        <div className="flex items-center justify-between mb-4 relative">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="text-[15px] font-semibold">
                {metric === "value" ? "Daily purchase value" : "Daily trade count"}
              </div>
              <span className="live-dot live-dot-good text-faint">live</span>
            </div>
            <div className="text-xs text-mute mt-0.5">Last {data?.windowDays || days} days</div>
          </div>
        </div>
        <div className="relative">
          {isLoading || !data ? (
            <div className="h-80 shimmer rounded-lg" />
          ) : data.series.every((s) => s.count === 0) ? (
            <div className="h-80 flex items-center justify-center text-mute text-sm">
              No trades in this window yet.
            </div>
          ) : (
            <LineChart
              data={data.series}
              metric={metric}
              height={320}
              formatValue={(n) =>
                metric === "value" ? formatCurrency(n, true) : Math.round(n).toString()
              }
            />
          )}
        </div>
      </motion.section>

      <section className="card p-5 sm:p-6">
        <div className="flex items-center justify-between mb-5">
          <div>
            <div className="text-[15px] font-semibold flex items-center gap-2.5">
              Volume by role
              <Activity className="h-4 w-4 text-mute" />
            </div>
            <div className="text-xs text-mute mt-0.5">
              Total purchase value contributed by each insider role
            </div>
          </div>
        </div>
        {isLoading || !data ? (
          <div className="space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-8 shimmer rounded-md" />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(data.byRole)
              .sort((a, b) => b[1] - a[1])
              .map(([role, v], i) => {
                const pct = roleTotal ? (v / roleTotal) * 100 : 0;
                return (
                  <motion.div
                    key={role}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.4, delay: 0.05 + i * 0.06 }}
                  >
                    <div className="flex items-center justify-between text-sm mb-1.5">
                      <span className="font-semibold inline-flex items-center gap-2">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ background: ROLE_COLORS[role] }}
                        />
                        {role}
                      </span>
                      <span className="tabular text-soft">
                        {formatCurrency(v)}{" "}
                        <span className="text-faint font-mono text-xs">
                          ({pct.toFixed(1)}%)
                        </span>
                      </span>
                    </div>
                    <div
                      className="h-2 rounded-full overflow-hidden"
                      style={{ background: "var(--bg-3)" }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 1, delay: 0.2 + i * 0.06, ease: [0.22, 1, 0.36, 1] }}
                        className="h-full rounded-full"
                        style={{
                          background: `linear-gradient(90deg, ${ROLE_COLORS[role]}, color-mix(in srgb, ${ROLE_COLORS[role]} 60%, var(--bg-2)))`,
                          boxShadow: `0 0 8px color-mix(in srgb, ${ROLE_COLORS[role]} 40%, transparent)`,
                        }}
                      />
                    </div>
                  </motion.div>
                );
              })}
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
  loading,
  delay,
}: {
  label: string;
  value: string;
  accent: string;
  loading?: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay, ease: [0.22, 1, 0.36, 1] }}
      className="card card-lift p-5 relative overflow-hidden"
    >
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-[2px]"
        style={{ background: accent }}
      />
      <div className="label-mini">{label}</div>
      <div className="mt-2.5 text-[24px] font-bold tracking-tight leading-none tabular">
        {loading ? <span className="inline-block h-6 w-20 shimmer rounded" /> : value}
      </div>
    </motion.div>
  );
}
