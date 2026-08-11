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
  // Cursor position (as % of the chart box) so the tooltip follows the pointer
  // and only shows while the pointer is genuinely over the plot area.
  const [hoverPos, setHoverPos] = useState<{ xPct: number; yPct: number } | null>(null);
  const W = 760;
  const H = height;
  const cStrategy = tipranks ? TR_STRATEGY : STRATEGY;
  const cBench = tipranks ? TR_BENCH : BENCHMARK;
  /** Axis/tooltip number: index (100 = start) or % change from start. */
  const fmtVal = (v: number) =>
    tipranks ? `${v - 100 >= 0 ? "+" : ""}${Math.round(v - 100)}%` : `${Math.round(v)}`;
  // Compact $-value for the Y axis (growth of $100), e.g. $100 · $1.5K · $2B —
  // the money scale shown in the reference layout.
  const fmtMoney = (v: number) => {
    const a = Math.abs(v);
    if (a >= 1e9) return `$${(v / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
    if (a >= 1e6) return `$${(v / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
    if (a >= 1e3) return `$${(v / 1e3).toFixed(a >= 1e4 ? 0 : 1)}K`;
    return `$${Math.round(v)}`;
  };

  // Timeframe + series toggles (QuiverQuant layout).
  const RANGES = ["1M", "3M", "6M", "YTD", "1Y", "2Y", "5Y", "MAX"] as const;
  const [range, setRange] = useState<(typeof RANGES)[number]>("MAX");
  // QuiverQuant toggles: "Start" re-indexes the visible window to 100 at its
  // first point; "Market" shows/hides the SPY benchmark. Strategy is always on.
  const [rebase, setRebase] = useState(true);
  const [showMarket, setShowMarket] = useState(true);
  const view = useMemo(() => {
    let sliced = curve;
    if (curve.length && range !== "MAX") {
      const lastT = curve[curve.length - 1].t;
      let fromT: number;
      if (range === "YTD") {
        fromT = new Date(new Date(lastT).getFullYear(), 0, 1).getTime();
      } else {
        const days: Record<string, number> = { "1M": 30, "3M": 91, "6M": 182, "1Y": 365, "2Y": 730, "5Y": 1825 };
        fromT = lastT - (days[range] || 0) * 86400000;
      }
      sliced = curve.filter((p) => p.t >= fromT);
      if (sliced.length < 2) sliced = curve.slice(-2);
    }
    if (rebase && sliced.length) {
      const s0 = sliced[0].s || 1;
      const b0 = sliced[0].b || 1;
      return sliced.map((p) => ({ t: p.t, s: (p.s / s0) * 100, b: (p.b / b0) * 100 }));
    }
    return sliced;
  }, [curve, range, rebase]);

  const geom = useMemo(() => {
    if (view.length < 2) return null;
    const xs = view.map((p) => p.t);
    const x0 = Math.min(...xs);
    const x1 = Math.max(...xs);
    const vals = view.flatMap((p) => [p.s, ...(showMarket ? [p.b] : [])]);
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

    // Time ticks. For long (multi-year) windows use clean calendar-year marks
    // (2014, 2016 … like the reference); for short windows fall back to evenly
    // spaced points.
    const spanYears = (x1 - x0) / (365.25 * 86400000);
    let xTicks: number[] = [];
    let xYearOnly = false;
    if (spanYears >= 3) {
      xYearOnly = true;
      const y0 = new Date(x0).getUTCFullYear();
      const y1 = new Date(x1).getUTCFullYear();
      const step = spanYears >= 9 ? 2 : 1;
      // First aligned year strictly inside the window, then every `step` years.
      const startYear = Math.ceil(y0 / step) * step;
      for (let y = startYear; y <= y1; y += step) {
        const t = Date.UTC(y, 0, 1);
        if (t >= x0 && t <= x1) xTicks.push(t);
      }
    } else {
      const N = 5;
      for (let i = 0; i <= N; i++) xTicks.push(x0 + ((x1 - x0) * i) / N);
    }

    return { x0, x1, lo, hi, px, py, sPath: line("s"), bPath: line("b"), areaS, ticks, xTicks, xYearOnly };
  }, [view, H, showMarket]);

  if (!geom) return null;

  const last = view[view.length - 1];
  const active = hover != null ? view[hover] : null;

  const clearHover = () => {
    setHover(null);
    setHoverPos(null);
  };

  const onMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const xPct = (e.clientX - rect.left) / rect.width;
    const yPct = (e.clientY - rect.top) / rect.height;
    // Viewbox coords of the cursor. Only engage the crosshair while the pointer
    // is actually inside the plotted area — not over the axis padding, and
    // never when it has drifted off the chart (e.g. bottom-left of the page).
    const vx = xPct * W;
    const vy = yPct * H;
    if (vx < PAD.left || vx > W - PAD.right || vy < PAD.top || vy > H - PAD.bottom) {
      clearHover();
      return;
    }
    // Nearest point by x — a crosshair, not a per-point hit target.
    let best = 0;
    let bestD = Infinity;
    view.forEach((p, i) => {
      const d = Math.abs(geom.px(p.t) - vx);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    setHover(best);
    setHoverPos({ xPct: xPct * 100, yPct: yPct * 100 });
  };

  const fmtDate = (ms: number) =>
    new Date(ms).toLocaleDateString("en-US", { month: "short", year: "numeric" });

  // Floating tooltip follows the cursor — flip left of the pointer past the
  // right half, and sit above the pointer in the lower half, so it never runs
  // off the chart and never sits under the cursor.
  const tipFlipX = (hoverPos?.xPct ?? 0) > 55;
  const tipFlipY = (hoverPos?.yPct ?? 0) > 50;
  // Hypothetical growth of $100 — the honest $-value form of the index.
  const money = (idx: number) =>
    `$${(idx).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
  const chg = (idx: number) => {
    const d = idx - 100;
    return `${d >= 0 ? "+$" : "-$"}${Math.abs(d).toLocaleString(undefined, { maximumFractionDigits: 2 })} (${d >= 0 ? "+" : ""}${d.toFixed(2)}%)`;
  };

  return (
    <div className="w-full">
      {/* Legend only outside controls-mode (there the bottom toggles are the legend). */}
      {!controls && (
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
      )}

      <div className="relative">
      {controls && active && hoverPos && (
        <div
          className="absolute z-20 pointer-events-none rounded-lg px-3.5 py-2.5"
          style={{
            left: `${hoverPos.xPct}%`,
            top: `${hoverPos.yPct}%`,
            transform: `translate(${tipFlipX ? "calc(-100% - 14px)" : "14px"}, ${tipFlipY ? "calc(-100% - 14px)" : "14px"})`,
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            boxShadow: "0 12px 32px rgba(0,0,0,0.25)",
            minWidth: 210,
          }}
        >
          <div className="text-[11px] font-semibold mb-1.5" style={{ color: "var(--text-mute)" }}>
            {fmtDate(geom.x0)} - {new Date(active.t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div className="flex items-center justify-between gap-4 text-[12.5px]">
            <span className="inline-flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cStrategy }} />
              <span style={{ color: "var(--text)" }}>Strategy</span>
            </span>
            <span className="tabular font-bold" style={{ color: "var(--text)" }}>{money(active.s)}</span>
          </div>
          <div className="text-right text-[11.5px] tabular font-semibold mb-1" style={{ color: active.s >= 100 ? "var(--good)" : "var(--bad)" }}>
            {chg(active.s)}
          </div>
          {showMarket && (
            <div className="flex items-center justify-between gap-4 text-[12.5px]">
              <span className="inline-flex items-center gap-1.5">
                <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: cBench }} />
                <span style={{ color: "var(--text)" }}>Market (SPY)</span>
              </span>
              <span className="tabular font-bold" style={{ color: "var(--text)" }}>{money(active.b)}</span>
            </div>
          )}
          {showMarket && (
            <div className="text-right text-[11.5px] tabular font-semibold" style={{ color: active.b >= 100 ? "var(--good)" : "var(--bad)" }}>
              {chg(active.b)}
            </div>
          )}
        </div>
      )}

      <svg
        viewBox={`0 0 ${W} ${H}`}
        // Stretch the viewBox to exactly fill the rendered box (no letterbox),
        // so the cursor's screen position maps 1:1 to viewBox/tooltip coords —
        // otherwise the default "meet" centres the drawing and the hover box
        // drifts away from the pointer.
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: H, display: "block" }}
        onMouseMove={onMove}
        onMouseLeave={clearHover}
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
              style={{ fontSize: 10.5, fill: "var(--text)", fontWeight: 700 }}
              className="tabular"
            >
              {tipranks ? fmtMoney(v) : fmtVal(v)}
            </text>
          </g>
        ))}

        {/* x labels — calendar-year marks on long windows, else evenly spaced */}
        {geom.xTicks.map((t, i) => (
          <text
            key={`x${i}`}
            x={geom.px(t)}
            y={H - 8}
            textAnchor={
              geom.xYearOnly
                ? "middle"
                : i === 0
                  ? "start"
                  : i === geom.xTicks.length - 1
                    ? "end"
                    : "middle"
            }
            style={{ fontSize: 10.5, fill: "var(--text)", fontWeight: 700 }}
          >
            {geom.xYearOnly ? new Date(t).getUTCFullYear() : fmtDate(t)}
          </text>
        ))}

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
        {showMarket && <path d={geom.bPath} fill="none" stroke={cBench} strokeWidth={2} />}
        <path d={geom.sPath} fill="none" stroke={cStrategy} strokeWidth={2} />

        {/* End-of-series direct labels (secondary encoding beside the legend) */}
        {!compact && (
          <>
            <circle cx={geom.px(last.t)} cy={geom.py(last.s)} r={4} fill={cStrategy} stroke="var(--bg-1)" strokeWidth={2} />
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
      </div>

      {/* Controls at the BOTTOM (QuiverQuant layout): timeframe buttons left,
          Start/Market toggles right. */}
      {controls ? (
        <div className="flex flex-wrap items-center justify-between gap-3 mt-3">
          <div className="inline-flex flex-wrap gap-1">
            {RANGES.map((r) => {
              const on = r === range;
              return (
                <button
                  key={r}
                  type="button"
                  onClick={() => { setRange(r); setHover(null); }}
                  className="px-3 py-1.5 rounded-md text-[12px] font-bold transition"
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
          <div className="inline-flex items-center gap-2 text-[12px] font-semibold">
            <button
              type="button"
              onClick={() => setRebase((v) => !v)}
              aria-pressed={rebase}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition"
              style={{
                background: rebase ? "var(--accent-soft)" : "transparent",
                color: rebase ? "var(--accent)" : "var(--text-mute)",
                border: `1px solid ${rebase ? "var(--accent)" : "var(--border-strong)"}`,
              }}
            >
              Start
            </button>
            <button
              type="button"
              onClick={() => setShowMarket((v) => !v)}
              aria-pressed={showMarket}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition"
              style={{
                background: showMarket ? "var(--accent-soft)" : "transparent",
                color: showMarket ? "var(--text)" : "var(--text-mute)",
                border: `1px solid ${showMarket ? cBench : "var(--border-strong)"}`,
              }}
            >
              <span
                className="inline-block h-2.5 w-2.5 rounded-sm"
                style={{ background: showMarket ? cBench : "transparent", border: `1px solid ${cBench}` }}
              />
              Market
            </button>
          </div>
        </div>
      ) : (
        <div
          className="mt-1 text-[12px] flex items-center gap-4 flex-wrap"
          style={{ minHeight: 20, color: "var(--text-mute)" }}
        >
          {active ? (
            <>
              <span className="font-semibold" style={{ color: "var(--text)" }}>
                {new Date(active.t).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
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
      )}
    </div>
  );
}
