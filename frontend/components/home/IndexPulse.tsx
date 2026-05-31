"use client";
import useSWR from "swr";
import { motion } from "framer-motion";
import { API_BASE, DashboardResponse, fetcher, formatCurrency } from "@/lib/api";

function Sparkline({ data, positive }: { data: number[]; positive: boolean }) {
  if (!data.length) return null;
  const w = 100;
  const h = 28;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = Math.max(0.0001, max - min);
  const xStep = w / Math.max(1, data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * xStep;
    const y = h - ((v - min) / range) * h;
    return [x, y] as [number, number];
  });
  const path = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
  const area = `${path} L ${w} ${h} L 0 ${h} Z`;
  const stroke = positive ? "var(--good)" : "var(--bad)";
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className="w-full h-7">
      <path d={area} fill={stroke} opacity="0.14" />
      <path
        d={path}
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

interface Index {
  label: string;
  value: string;
  change: number;
  sparkData: number[];
}

export function IndexPulse() {
  const { data, isLoading } = useSWR<DashboardResponse>(
    `${API_BASE}/dashboard`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="card h-[88px] shimmer" />
        ))}
      </div>
    );
  }

  const activity = data.activity || [];
  const counts = activity.map((d) => d.count);
  const values = activity.map((d) => d.value);

  const last7Count = counts.slice(-7).reduce((a, b) => a + b, 0);
  const prev7Count = counts.slice(-14, -7).reduce((a, b) => a + b, 0);
  const buysWeekChange =
    prev7Count > 0 ? ((last7Count - prev7Count) / prev7Count) * 100 : 0;

  const last7Val = values.slice(-7).reduce((a, b) => a + b, 0);
  const prev7Val = values.slice(-14, -7).reduce((a, b) => a + b, 0);
  const volChange = prev7Val > 0 ? ((last7Val - prev7Val) / prev7Val) * 100 : 0;

  const sectors = data.sectors || [];
  const topSector = sectors[0];

  const indices: Index[] = [
    {
      label: "IQS Index",
      value: data.metrics.confidence.toFixed(2),
      change: buysWeekChange / 2,
      sparkData: counts.slice(-14).length ? counts.slice(-14) : [1, 2, 1, 3, 2, 4, 3],
    },
    {
      label: "Insider Buys 24h",
      value: data.metrics.insiderBuys24h.toLocaleString(),
      change: data.metrics.pct24hVs7d,
      sparkData: counts.slice(-14).length ? counts.slice(-14) : [1, 2, 1, 3, 2, 4, 3],
    },
    {
      label: "Volume 7d",
      value: formatCurrency(last7Val || data.metrics.totalRecentValue),
      change: volChange,
      sparkData: values.slice(-14).length ? values.slice(-14) : [1, 2, 1, 3, 2, 4, 3],
    },
    {
      label: "Active Insiders",
      value: `${
        data.activity
          .slice(-7)
          .reduce((a, d) => a + d.count, 0)
      }`,
      change: buysWeekChange,
      sparkData: counts.slice(-14).length ? counts.slice(-14) : [1, 2, 1, 3, 2, 4, 3],
    },
    {
      label: "Top Sector",
      value: topSector
        ? topSector.name.length > 14
          ? topSector.name.slice(0, 14) + "…"
          : topSector.name
        : "—",
      change: 0,
      sparkData: sectors.slice(0, 6).map((s) => s.value),
    },
    {
      label: "Companies",
      value: String(sectors.reduce((a, s) => a + s.count, 0) || data.topTrades.length),
      change: buysWeekChange,
      sparkData: counts.slice(-14).length ? counts.slice(-14) : [1, 2, 1, 3, 2, 4, 3],
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      {indices.map((idx, i) => {
        const positive = idx.change >= 0;
        return (
          <motion.div
            key={idx.label}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.04 }}
            className="card card-lift px-3 py-2.5"
          >
            <div className="text-[11px] font-bold text-soft truncate">{idx.label}</div>
            <div className="flex items-baseline justify-between mt-1 gap-2">
              <div className="text-[15px] font-bold tabular truncate">{idx.value}</div>
              <div
                className="text-[10px] font-bold tabular whitespace-nowrap"
                style={{ color: idx.change === 0 ? "var(--text-mute)" : positive ? "var(--good)" : "var(--bad)" }}
              >
                {idx.change === 0
                  ? "—"
                  : `${positive ? "+" : ""}${idx.change.toFixed(2)}%`}
              </div>
            </div>
            <div className="mt-1">
              <Sparkline data={idx.sparkData} positive={positive} />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
