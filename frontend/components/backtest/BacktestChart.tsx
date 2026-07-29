"use client";
import { useMemo, useState } from "react";

export interface EquityPoint {
  t: number;
  s: number;
  b: number;
}

/* Two-series categorical pair, validated in both modes against the chart
   surface (lightness band, chroma floor, CVD separation, contrast). Light steps
   #2f6f9f/#c1762a, dark steps #4590c6/#b87a22 — do not hand-tweak without
   re-running the palette validator. */
const STRATEGY = "var(--bt-strategy)";
const BENCHMARK = "var(--bt-benchmark)";

const PAD = { top: 14, right: 14, bottom: 26, left: 44 };

/**
 * Indexed equity curve — strategy vs benchmark. Both series share one axis
 * because both are indexed to 100 at the start, so a single scale is honest
 * (never a second y-axis).
 */
export function BacktestChart({
  curve,
  height = 300,
  compact = false,
}: {
  curve: EquityPoint[];
  height?: number;
  compact?: boolean;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = height;

  const geom = useMemo(() => {
    if (curve.length < 2) return null;
    const xs = curve.map((p) => p.t);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const vals = curve.flatMap((p) => [p.s, p.b]);
    let lo = Math.min(...vals);
    let hi = Math.max(...vals);
    const span = hi - lo || 1;
    lo -= span * 0.06;
    hi += span * 0.06;

    const px = (t: number) =>
      PAD.left + ((t - x0) / (x1 - x0 || 1)) * (W - PAD.left - PAD.right);
    const py = (v: number) =>
      PAD.top + (1 - (v - lo) / (hi - lo)) * (H - PAD.top - PAD.bottom);

    const line = (key: "s" | "b") =>
      curve.map((p, i) => `${i ? "L" : "M"}${px(p.t).toFixed(1)},${py(p[key]).toFixed(1)}`).join(" ");

    // 4 gridlines, rounded to readable index values.
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) * i) / 4);

    return { x0, x1, lo, hi, px, py, sPath: line("s"), bPath: line("b"), ticks };
  }, [curve, H]);

  if (!geom) return null;

  const last = curve[curve.length - 1];
  const active = hover != null ? curve[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    // Nearest point by x — a crosshair, not a per-point hit target.
    let best = 0;
    let bestD = Infinity;
    curve.forEach((p, i) => {
      const d = Math.abs(geom.px(p.t) - x);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
  };

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  return (
    <div className="w-full">
      {/* Legend — always present for two series, so identity is never colour-alone. */}
      <div className="flex items-center gap-4 mb-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <span className="inline-block h-[3px] w-4 rounded" style={{ background: STRATEGY }} />
          <span style={{ color: "var(--text)" }}>Insider strategy</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <span className="inline-block h-[3px] w-4 rounded" style={{ background: BENCHMARK }} />
          <span style={{ color: "var(--text)" }}>S&amp;P 500 (SPY)</span>
        </span>
      </div>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full"
        style={{ height: H, display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
        aria-label="Indexed equity curve: insider strategy versus the S&P 500"
      >
        {/* Recessive gridlines + y labels */}
        {geom.ticks.map((v, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={geom.py(v)}
              y2={geom.py(v)}
              stroke="var(--border)"
              strokeWidth={1}
            />
            <text
              x={PAD.left - 7}
              y={geom.py(v) + 3.5}
              textAnchor="end"
              style={{ fontSize: 10, fill: "var(--text-mute)" }}
              className="tabular"
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* x labels — first and last only, so nothing collides */}
        <text
          x={PAD.left}
          y={H - 8}
          style={{ fontSize: 10, fill: "var(--text-mute)" }}
        >
          {fmtDate(geom.x0)}
        </text>
        <text
          x={W - PAD.right}
          y={H - 8}
          textAnchor="end"
          style={{ fontSize: 10, fill: "var(--text-mute)" }}
        >
          {fmtDate(geom.x1)}
        </text>

        {/* Benchmark under the strategy so the headline series reads on top */}
        <path d={geom.bPath} fill="none" stroke={BENCHMARK} strokeWidth={2} />
        <path d={geom.sPath} fill="none" stroke={STRATEGY} strokeWidth={2} />

        {/* End-of-series direct labels (secondary encoding beside the legend) */}
        {!compact && (
          <>
            <circle cx={geom.px(last.t)} cy={geom.py(last.s)} r={4} fill={STRATEGY} stroke="var(--bg-1)" strokeWidth={2} />
            <circle cx={geom.px(last.t)} cy={geom.py(last.b)} r={4} fill={BENCHMARK} stroke="var(--bg-1)" strokeWidth={2} />
          </>
        )}

        {/* Crosshair */}
        {active && (
          <>
            <line
              x1={geom.px(active.t)}
              x2={geom.px(active.t)}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--border-strong)"
              strokeWidth={1}
            />
            <circle cx={geom.px(active.t)} cy={geom.py(active.s)} r={4.5} fill={STRATEGY} stroke="var(--bg-1)" strokeWidth={2} />
            <circle cx={geom.px(active.t)} cy={geom.py(active.b)} r={4.5} fill={BENCHMARK} stroke="var(--bg-1)" strokeWidth={2} />
          </>
        )}
      </svg>

      {/* Tooltip as real DOM under the chart — readable on mobile, no clipping */}
      <div
        className="mt-1 text-[12px] flex items-center gap-4 flex-wrap"
        style={{ minHeight: 20, color: "var(--text-mute)" }}
      >
        {active ? (
          <>
            <span className="font-semibold" style={{ color: "var(--text)" }}>
              {new Date(active.t).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3 rounded" style={{ background: STRATEGY }} />
              Strategy <span className="tabular font-bold" style={{ color: "var(--text)" }}>{active.s.toFixed(1)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3 rounded" style={{ background: BENCHMARK }} />
              SPY <span className="tabular font-bold" style={{ color: "var(--text)" }}>{active.b.toFixed(1)}</span>
            </span>
          </>
        ) : (
          <span>Hover the chart for the value on any week. Both series start at 100.</span>
        )}
      </div>
    </div>
  );
}
