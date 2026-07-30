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
/* TipRanks-style variant: green strategy over a gray index — the industry
   convention for a strategy-vs-benchmark chart. Identity is never colour-alone
   here (legend + end dots + the fill itself). */
const TR_STRATEGY = "var(--good)";
const TR_BENCH = "var(--text-mute)";

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
  tipranks = false,
  strategyLabel = "Insider strategy",
  benchmarkLabel = "S&P 500 (SPY)",
}: {
  curve: EquityPoint[];
  height?: number;
  compact?: boolean;
  /** TipRanks-style rendering: %-change axis, green strategy line with a
   *  gradient area fill, gray benchmark. */
  tipranks?: boolean;
  strategyLabel?: string;
  benchmarkLabel?: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760;
  const H = height;
  const cStrategy = tipranks ? TR_STRATEGY : STRATEGY;
  const cBench = tipranks ? TR_BENCH : BENCHMARK;
  /** Axis/tooltip number: index (100 = start) or % change from start. */
  const fmtVal = (v: number) =>
    tipranks ? `${v - 100 >= 0 ? "+" : ""}${Math.round(v - 100)}%` : `${Math.round(v)}`;

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
    const areaS =
      line("s") +
      ` L${px(curve[curve.length - 1].t).toFixed(1)},${(H - PAD.bottom).toFixed(1)}` +
      ` L${px(curve[0].t).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

    // 4 gridlines, rounded to readable index values.
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) * i) / 4);

    return { x0, x1, lo, hi, px, py, sPath: line("s"), bPath: line("b"), areaS, ticks };
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
          <span className="inline-block h-[3px] w-4 rounded" style={{ background: cStrategy }} />
          <span style={{ color: "var(--text)" }}>{strategyLabel}</span>
        </span>
        <span className="inline-flex items-center gap-1.5 text-[12px] font-semibold">
          <span className="inline-block h-[3px] w-4 rounded" style={{ background: cBench }} />
          <span style={{ color: "var(--text)" }}>{benchmarkLabel}</span>
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
              {fmtVal(v)}
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
        {tipranks && (
          <>
            <defs>
              <linearGradient id="bt-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--good)" stopOpacity="0.28" />
                <stop offset="100%" stopColor="var(--good)" stopOpacity="0.02" />
              </linearGradient>
            </defs>
            <path d={geom.areaS} fill="url(#bt-area)" stroke="none" />
          </>
        )}
        <path d={geom.bPath} fill="none" stroke={cBench} strokeWidth={2} />
        <path d={geom.sPath} fill="none" stroke={cStrategy} strokeWidth={2} />

        {/* End-of-series direct labels (secondary encoding beside the legend) */}
        {!compact && (
          <>
            <circle cx={geom.px(last.t)} cy={geom.py(last.s)} r={4} fill={cStrategy} stroke="var(--bg-1)" strokeWidth={2} />
            <circle cx={geom.px(last.t)} cy={geom.py(last.b)} r={4} fill={cBench} stroke="var(--bg-1)" strokeWidth={2} />
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
            <circle cx={geom.px(active.t)} cy={geom.py(active.s)} r={4.5} fill={cStrategy} stroke="var(--bg-1)" strokeWidth={2} />
            <circle cx={geom.px(active.t)} cy={geom.py(active.b)} r={4.5} fill={cBench} stroke="var(--bg-1)" strokeWidth={2} />
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
              <span className="inline-block h-[3px] w-3 rounded" style={{ background: cStrategy }} />
              Strategy <span className="tabular font-bold" style={{ color: "var(--text)" }}>{tipranks ? fmtVal(active.s) : active.s.toFixed(1)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3 rounded" style={{ background: cBench }} />
              SPY <span className="tabular font-bold" style={{ color: "var(--text)" }}>{tipranks ? fmtVal(active.b) : active.b.toFixed(1)}</span>
            </span>
          </>
        ) : (
          <span>Hover the chart for the value on any week. Both series start at 100.</span>
        )}
      </div>
    </div>
  );
}
