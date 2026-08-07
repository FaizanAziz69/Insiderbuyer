"use client";
import { useMemo, useRef, useState } from "react";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { track } from "@/lib/analytics";

export interface Bar {
  date: string;
  close: number;
  t?: number; // ms epoch (for intraday time labels)
}

export const CHART_RANGES: { key: string; label: string }[] = [
  { key: "1d", label: "1D" },
  { key: "5d", label: "5D" },
  { key: "1mo", label: "1M" },
  { key: "3mo", label: "3M" },
  { key: "6mo", label: "6M" },
  { key: "1y", label: "1Y" },
  { key: "5y", label: "5Y" },
];

/** Interactive close-price area chart (crosshair + tooltip), shared between
 *  the company profile and the standalone /chart/[ticker] page. */
export function PriceChart({
  ticker,
  bare = false,
  height = 200,
}: {
  ticker: string;
  bare?: boolean;
  height?: number;
}) {
  const [range, setRange] = useState<string>("1d");
  const [hover, setHover] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const { data, isLoading } = useSWR<{
    history: { bars: Bar[]; intraday?: boolean } | null;
  }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const bars = useMemo(() => data?.history?.bars || [], [data]);
  const intraday = !!data?.history?.intraday || range === "1d" || range === "5d";

  const W = 1000;
  const H = height;
  const geo = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const rng = max - min || 1;
    const pts = closes.map((c, i) => ({
      x: (i / (closes.length - 1)) * W,
      y: H - ((c - min) / rng) * H,
    }));
    return {
      pts,
      min,
      max,
      d: "M " + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L "),
      area:
        "M " +
        pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ") +
        ` L ${W},${H} L 0,${H} Z`,
    };
  }, [bars, H]);

  const first = bars[0]?.close ?? 0;
  const last = bars[bars.length - 1]?.close ?? 0;
  const chgPct = first ? ((last - first) / first) * 100 : 0;
  const up = last >= first;
  const stroke = up ? "var(--good)" : "var(--bad)";

  const fmtLabel = (b: Bar) => {
    const d = new Date(b.t ?? b.date);
    return intraday
      ? d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  };

  const onMove = (e: React.MouseEvent) => {
    const el = wrapRef.current;
    if (!el || bars.length < 2) return;
    const rect = el.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    setHover(Math.round(frac * (bars.length - 1)));
  };

  const hb = hover != null ? bars[hover] : null;
  const hp = hover != null && geo ? geo.pts[hover] : null;

  return (
    <div className={bare ? "" : "card p-5"}>
      {/* Header: price + timeframe tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div className="flex items-baseline gap-3">
          <span className="text-[22px] font-bold tabular">${last.toFixed(2)}</span>
          <span
            className="text-[14px] font-bold tabular"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {chgPct >= 0 ? "▲ +" : "▼ "}
            {chgPct.toFixed(2)}%
          </span>
        </div>
        <div className="flex items-center gap-1">
          {CHART_RANGES.map((r) => {
            const on = r.key === range;
            return (
              <button
                key={r.key}
                onClick={() => {
                  setRange(r.key);
                  setHover(null);
                  track("web_chart_timeframe_change", { ticker, range: r.key });
                }}
                className="px-2.5 py-1 rounded-md text-[12px] font-bold transition"
                style={{
                  background: on ? "var(--accent)" : "transparent",
                  color: on ? "var(--on-accent)" : "var(--text-mute)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>

      {isLoading && !geo ? (
        <div className="shimmer rounded-lg" style={{ height: H }} />
      ) : !geo ? (
        <div className="flex items-center justify-center text-mute text-sm" style={{ height: H }}>
          No price history available.
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="relative"
          style={{ height: H }}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full h-full">
            <defs>
              <linearGradient id="cp-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
                <stop offset="100%" stopColor={stroke} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={geo.area} fill="url(#cp-area)" />
            <path d={geo.d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hp && (
              <line
                x1={hp.x}
                y1={0}
                x2={hp.x}
                y2={H}
                stroke="var(--text-mute)"
                strokeWidth="1"
                strokeDasharray="4 3"
                vectorEffect="non-scaling-stroke"
              />
            )}
          </svg>

          {/* Crosshair dot (HTML, so it isn't stretched by the SVG) */}
          {hp && hover != null && (
            <div
              className="absolute h-2.5 w-2.5 rounded-full pointer-events-none"
              style={{
                left: `${(hover / (bars.length - 1)) * 100}%`,
                top: `${(hp.y / H) * 100}%`,
                transform: "translate(-50%, -50%)",
                background: stroke,
                boxShadow: "0 0 0 3px var(--bg-2)",
              }}
            />
          )}

          {/* Tooltip */}
          {hb && hover != null && (
            <div
              className="absolute pointer-events-none rounded-md px-2.5 py-1.5 text-[12px] shadow-lg"
              style={{
                left: `${(hover / (bars.length - 1)) * 100}%`,
                top: 4,
                transform:
                  hover / (bars.length - 1) > 0.5
                    ? "translateX(calc(-100% - 10px))"
                    : "translateX(10px)",
                background: "var(--bg-1)",
                border: "1px solid var(--border-strong)",
                whiteSpace: "nowrap",
              }}
            >
              <div className="font-bold tabular">${hb.close.toFixed(2)}</div>
              <div className="text-mute">{fmtLabel(hb)}</div>
            </div>
          )}
        </div>
      )}

      {/* Axis footer */}
      {geo && bars.length > 1 && (
        <div className="flex justify-between text-[11px] text-mute mt-2 tabular">
          <span>{fmtLabel(bars[0])}</span>
          <span>
            Hi ${geo.max.toFixed(2)} · Lo ${geo.min.toFixed(2)}
          </span>
          <span>{fmtLabel(bars[bars.length - 1])}</span>
        </div>
      )}
    </div>
  );
}
