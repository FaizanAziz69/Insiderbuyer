"use client";
import useSWR from "swr";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { PremiumChartPreview } from "@/components/charts/PremiumChartPreview";
import { usePremium } from "@/components/premium/PremiumContext";

interface SectorSeries {
  sector: string;
  cumulativePct: number;
  latestDailyPct: number | null;
  series: Array<{ date: string; cumPct: number }>;
}

const RANGES = [
  { days: 30, label: "1M" },
  { days: 90, label: "3M" },
  { days: 180, label: "6M" },
  { days: 365, label: "1Y" },
];

/** Fixed color per sector so the line, the legend chip and the ranking row
 *  always agree, whatever order the API returns. */
const SECTOR_COLORS: Record<string, string> = {
  Technology: "#60a5fa",
  "Financial Services": "#34d399",
  Healthcare: "#f472b6",
  "Consumer Cyclical": "#fbbf24",
  "Consumer Defensive": "#a78bfa",
  "Communication Services": "#22d3ee",
  Industrials: "#fb923c",
  Energy: "#f87171",
  "Basic Materials": "#a3e635",
  "Real Estate": "#e879f9",
  Utilities: "#94a3b8",
};

const fmtPct = (n: number | null | undefined) =>
  n == null ? "—" : `${n > 0 ? "+" : ""}${n.toFixed(2)}%`;

const PAD = { top: 16, right: 16, bottom: 26, left: 48 };

function RotationChart({
  rows,
  hidden,
}: {
  rows: SectorSeries[];
  hidden: Set<string>;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(860);
  const [hover, setHover] = useState<number | null>(null);
  const height = 380;

  useMemo(() => {
    if (typeof window === "undefined") return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
  }, []);

  const visible = rows.filter((r) => !hidden.has(r.sector) && r.series.length > 1);
  // One shared date axis — sectors all come off the same daily feed, so the
  // longest series carries every trading day in the window.
  const dates = useMemo(() => {
    let best: string[] = [];
    for (const r of visible) {
      const d = r.series.map((p) => p.date);
      if (d.length > best.length) best = d;
    }
    return best;
  }, [visible]);

  const { min, max } = useMemo(() => {
    let lo = 0;
    let hi = 0;
    for (const r of visible)
      for (const p of r.series) {
        if (p.cumPct < lo) lo = p.cumPct;
        if (p.cumPct > hi) hi = p.cumPct;
      }
    const span = Math.max(hi - lo, 1);
    return { min: lo - span * 0.06, max: hi + span * 0.06 };
  }, [visible]);

  if (!visible.length || dates.length < 2) {
    return (
      <div className="h-[380px] flex items-center justify-center text-mute text-sm">
        No sector data for this window.
      </div>
    );
  }

  const x = (date: string) => {
    const i = dates.indexOf(date);
    const idx = i < 0 ? 0 : i;
    return PAD.left + (idx / (dates.length - 1)) * (width - PAD.left - PAD.right);
  };
  const y = (v: number) =>
    PAD.top + (1 - (v - min) / (max - min)) * (height - PAD.top - PAD.bottom);

  // Y grid: ~5 round steps.
  const step = (() => {
    const raw = (max - min) / 5;
    const pow = 10 ** Math.floor(Math.log10(Math.max(raw, 0.1)));
    for (const m of [1, 2, 2.5, 5, 10]) if (raw <= m * pow) return m * pow;
    return 10 * pow;
  })();
  const gridVals: number[] = [];
  for (let v = Math.ceil(min / step) * step; v <= max; v += step) gridVals.push(+v.toFixed(2));

  const hoverDate = hover != null ? dates[hover] : null;

  return (
    <div ref={wrapRef} className="relative w-full select-none">
      <svg
        width={width}
        height={height}
        onMouseLeave={() => setHover(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
          const px = e.clientX - rect.left;
          const frac = (px - PAD.left) / (width - PAD.left - PAD.right);
          const i = Math.round(frac * (dates.length - 1));
          setHover(Math.max(0, Math.min(dates.length - 1, i)));
        }}
      >
        {gridVals.map((v) => (
          <g key={v}>
            <line
              x1={PAD.left}
              x2={width - PAD.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--border)"
              strokeWidth={v === 0 ? 1 : 0.5}
              strokeDasharray={v === 0 ? undefined : "3 3"}
            />
            <text x={PAD.left - 8} y={y(v) + 3.5} textAnchor="end" fontSize={11} fill="var(--text-mute)">
              {v > 0 ? `+${v}%` : `${v}%`}
            </text>
          </g>
        ))}
        {[0, 0.25, 0.5, 0.75, 1].map((f) => {
          const i = Math.round(f * (dates.length - 1));
          const d = dates[i];
          return (
            <text
              key={f}
              x={x(d)}
              y={height - 8}
              textAnchor={f === 0 ? "start" : f === 1 ? "end" : "middle"}
              fontSize={11}
              fill="var(--text-mute)"
            >
              {d?.slice(5)}
            </text>
          );
        })}
        {visible.map((r) => {
          const pts = r.series.map((p) => `${x(p.date)},${y(p.cumPct)}`).join(" ");
          const color = SECTOR_COLORS[r.sector] ?? "var(--accent)";
          return (
            <motion.polyline
              key={r.sector}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.5 }}
              points={pts}
              fill="none"
              stroke={color}
              strokeWidth={1.8}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
          );
        })}
        {hoverDate && (
          <line
            x1={x(hoverDate)}
            x2={x(hoverDate)}
            y1={PAD.top}
            y2={height - PAD.bottom}
            stroke="var(--text-mute)"
            strokeWidth={0.75}
            strokeDasharray="3 3"
          />
        )}
      </svg>
      {hoverDate && (
        <div
          className="absolute top-2 card px-3 py-2 text-xs space-y-1 pointer-events-none z-10"
          style={{
            left: Math.min(Math.max(x(hoverDate) + 10, PAD.left), width - 190),
            width: 178,
          }}
        >
          <div className="font-semibold">{hoverDate}</div>
          {visible
            .map((r) => ({
              sector: r.sector,
              v: r.series.find((p) => p.date === hoverDate)?.cumPct ?? null,
            }))
            .filter((r) => r.v != null)
            .sort((a, b) => (b.v as number) - (a.v as number))
            .map((r) => (
              <div key={r.sector} className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 truncate">
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: SECTOR_COLORS[r.sector] }}
                  />
                  {r.sector}
                </span>
                <span style={{ color: (r.v as number) >= 0 ? "var(--good)" : "var(--bad)" }}>
                  {fmtPct(r.v)}
                </span>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

export default function RotationChartPage() {
  const { unlocked } = usePremium();
  const [days, setDays] = useState(90);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const { data, isLoading } = useSWR<{ rows: SectorSeries[] }>(
    unlocked ? `${API_BASE}/market-stats/sector-rotation?days=${days}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  // The paywall itself is unchanged — only the unlocked view stopped being a
  // fake seeded SVG and became the real chart below.
  if (!unlocked) {
    return (
      <PremiumChartPreview
        title="Sector rotation"
        subtitle="Cumulative sector returns — spot capital rotating between sectors."
        variant="sankey"
        description="Cumulative return per sector, built daily from every listed company's move — spot early sector rotation before it shows up in mutual-fund flows."
        features={[
          "All 11 sectors on one cumulative-return chart",
          "1M / 3M / 6M / 1Y windows",
          "Identify early sector rotation",
          "Leaders & laggards ranking",
          "Toggle sectors on and off",
          "Daily refreshed licensed data",
        ]}
      />
    );
  }

  const rows = data?.rows ?? [];

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
            Sector rotation
          </h1>
          <p className="text-mute text-sm mt-1">
            Cumulative return per sector — where the market&apos;s capital has been rotating.
          </p>
        </div>
        <div className="flex items-center gap-1.5">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setDays(r.days)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                days === r.days
                  ? "bg-[var(--accent)] text-white border-transparent"
                  : "border-[var(--border)] text-mute hover:text-[var(--text)]"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-4 items-start">
        <div className="card p-4 sm:p-5">
          {isLoading ? (
            <div className="h-[380px] flex items-center justify-center text-mute text-sm gap-2">
              <RefreshCw className="h-4 w-4 animate-spin" /> Loading sector data…
            </div>
          ) : (
            <RotationChart rows={rows} hidden={hidden} />
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-4 pt-3 border-t border-[var(--border)]">
            {rows.map((r) => {
              const off = hidden.has(r.sector);
              return (
                <button
                  key={r.sector}
                  onClick={() =>
                    setHidden((prev) => {
                      const next = new Set(prev);
                      if (next.has(r.sector)) next.delete(r.sector);
                      else next.add(r.sector);
                      return next;
                    })
                  }
                  className={`flex items-center gap-1.5 text-xs ${off ? "opacity-35" : ""}`}
                >
                  <span
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ background: SECTOR_COLORS[r.sector] }}
                  />
                  {r.sector}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-4">
          <div className="text-[13px] font-semibold mb-3">
            Leaders &amp; laggards ({RANGES.find((r) => r.days === days)?.label})
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={r.sector} className="flex items-center justify-between text-sm">
                <span className="flex items-center gap-2 truncate">
                  <span className="text-mute text-xs w-4">{i + 1}</span>
                  <span
                    className="inline-block h-2 w-2 rounded-full shrink-0"
                    style={{ background: SECTOR_COLORS[r.sector] }}
                  />
                  <span className="truncate">{r.sector}</span>
                </span>
                <span
                  className="font-medium tabular"
                  style={{ color: r.cumulativePct >= 0 ? "var(--good)" : "var(--bad)" }}
                >
                  {fmtPct(r.cumulativePct)}
                </span>
              </div>
            ))}
            {!rows.length && !isLoading && (
              <div className="text-mute text-sm">No data.</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
