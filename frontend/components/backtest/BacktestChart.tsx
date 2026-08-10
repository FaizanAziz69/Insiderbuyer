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
  controls = false,
}: {
  curve: EquityPoint[];
  height?: number;
  compact?: boolean;
  /** QuiverQuant-style timeframe buttons + Start/Market toggles. */
  controls?: boolean;
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

  // Timeframe + series toggles (QuiverQuant layout).
  const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "MAX"] as const;
  const [range, setRange] = useState<(typeof RANGES)[number]>("MAX");
  const [showStrategy, setShowStrategy] = useState(true);
  const [showMarket, setShowMarket] = useState(true);
  const view = useMemo(() => {
    if (!curve.length || range === "MAX") return curve;
    const lastT = curve[curve.length - 1].t;
    let fromT: number;
    if (range === "YTD") {
      fromT = new Date(new Date(lastT).getFullYear(), 0, 1).getTime();
    } else {
      const days: Record<string, number> = { "1M": 30, "3M": 91, "6M": 182, "1Y": 365, "2Y": 730, "5Y": 1825 };
      fromT = lastT - (days[range] || 0) * 86400000;
    }
    const sliced = curve.filter((p) => p.t >= fromT);
    return sliced.length >= 2 ? sliced : curve.slice(-2);
  }, [curve, range]);

  const geom = useMemo(() => {
    if (view.length < 2) return null;
    const xs = view.map((p) => p.t);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const vals = view.flatMap((p) => [
      ...(showStrategy ? [p.s] : []),
      ...(showMarket ? [p.b] : []),
    ]);
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
      view.map((p, i) => `${i ? "L" : "M"}${px(p.t).toFixed(1)},${py(p[key]).toFixed(1)}`).join(" ");
    const areaS =
      line("s") +
      ` L${px(view[view.length - 1].t).toFixed(1)},${(H - PAD.bottom).toFixed(1)}` +
      ` L${px(view[0].t).toFixed(1)},${(H - PAD.bottom).toFixed(1)} Z`;

    // 4 gridlines, rounded to readable index values.
    const ticks: number[] = [];
    for (let i = 0; i <= 4; i++) ticks.push(lo + ((hi - lo) * i) / 4);

    // Evenly spaced time ticks across the axis (reference style), endpoints
    // included; interior count adapts to the window length.
    const xTicks: number[] = [];
    const N = 5;
    for (let i = 0; i <= N; i++) xTicks.push(x0 + ((x1 - x0) * i) / N);

    return { x0, x1, lo, hi, px, py, sPath: line("s"), bPath: line("b"), areaS, ticks, xTicks };
  }, [view, H, showStrategy, showMarket]);

  if (!geom) return null;

  const last = view[view.length - 1];
  const active = hover != null ? view[hover] : null;

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * W;
    // Nearest point by x — a crosshair, not a per-point hit target.
    let best = 0;
    let bestD = Infinity;
    view.forEach((p, i) => {
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
      <div
        className={`flex items-center flex-wrap ${tipranks ? "gap-6 mb-1.5" : "gap-4 mb-2"}`}
      >
        <span className={`inline-flex items-center gap-1.5 ${tipranks ? "text-[11.5px]" : "text-[12px]"} font-semibold`}>
          <span className="inline-block h-[3px] w-4 rounded" style={{ background: cStrategy }} />
          <span style={{ color: tipranks ? "var(--text-soft)" : "var(--text)" }}>{strategyLabel}</span>
        </span>
        <span className={`inline-flex items-center gap-1.5 ${tipranks ? "text-[11.5px]" : "text-[12px]"} font-semibold`}>
          <span className="inline-block h-[3px] w-4 rounded" style={{ background: cBench }} />
          <span style={{ color: tipranks ? "var(--text-soft)" : "var(--text)" }}>{benchmarkLabel}</span>
        </span>
      </div>

      {controls && (
        <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
          <div className="inline-flex flex-wrap gap-1">
            {RANGES.map((r) => {
              const on = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRange(r); setHover(null); }}
                  className="px-2.5 py-1 rounded-md text-[12px] font-bold transition"
                  style={{
                    background: on ? "var(--accent)" : "transparent",
                    color: on ? "var(--on-accent)" : "var(--text-mute)",
                  }}
                >
                  {r}
                </button>
              );
            })}
          </div>
          <div className="inline-flex items-center gap-4 text-[12px] font-semibold">
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showStrategy} onChange={(e) => setShowStrategy(e.target.checked)} />
              <span style={{ color: "var(--text-soft)" }}>Strategy</span>
            </label>
            <label className="inline-flex items-center gap-1.5 cursor-pointer">
              <input type="checkbox" checked={showMarket} onChange={(e) => setShowMarket(e.target.checked)} />
              <span style={{ color: "var(--text-soft)" }}>Market</span>
            </label>
          </div>
        </div>
      )}

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

        {/* x labels — evenly spaced, anchored so the ends stay inside */}
        {geom.xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={geom.px(t)}
            y={H - 8}
            textAnchor={i === 0 ? "start" : i === geom.xTicks.length - 1 ? "end" : "middle"}
            style={{ fontSize: 10, fill: "var(--text-mute)" }}
          >
            {fmtDate(t)}
          </text>
        ))}

        {/* Benchmark under the strategy so the headline series reads on top */}
        {tipranks && showStrategy && (
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
        {showMarket && <path d={geom.bPath} fill="none" stroke={cBench} strokeWidth={2} />}
        {showStrategy && <path d={geom.sPath} fill="none" stroke={cStrategy} strokeWidth={2} />}

        {/* End-of-series direct labels (secondary encoding beside the legend) */}
        {!compact && (
          <>
            {showStrategy && (
              <circle cx={geom.px(last.t)} cy={geom.py(last.s)} r={4} fill={cStrategy} stroke="var(--bg-1)" strokeWidth={2} />
            )}
            {showMarket && (
              <circle cx={geom.px(last.t)} cy={geom.py(last.b)} r={4} fill={cBench} stroke="var(--bg-1)" strokeWidth={2} />
            )}
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
              Strategy <span className="tabular font-bold" style={{ color: active.s >= 100 ? "var(--good)" : "var(--bad)" }}>{tipranks ? fmtVal(active.s) : active.s.toFixed(1)}</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-[3px] w-3 rounded" style={{ background: cBench }} />
              SPY <span className="tabular font-bold" style={{ color: active.b >= 100 ? "var(--good)" : "var(--bad)" }}>{tipranks ? fmtVal(active.b) : active.b.toFixed(1)}</span>
            </span>
          </>
        ) : (
          <span>Hover the chart for the value on any week. Both series start at 100.</span>
        )}
      </div>
    </div>
  );
}
