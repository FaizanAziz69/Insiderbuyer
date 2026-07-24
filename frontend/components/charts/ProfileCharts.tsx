"use client";
import { useMemo, useRef, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/api";

/** Shared profile charts (politician + insider pages), all with interactive
 *  hover tooltips: hover a bar/slice/point to read its exact values. */

export interface YearVol { year: number; buyValue: number; sellValue: number }
export interface SectorSlice { sector: string; trades: number }
export interface HoldingSlice { ticker: string; estValue: number }

export const DONUT_COLORS = ["#6366F1", "#EC4899", "#F97316", "#22C55E", "#EAB308", "#06B6D4", "#A855F7", "#F43F5E"];

/** Compact $ axis label (e.g. 40M, 1.2M, 250K). */
export function axisMoney(n: number): string {
  if (n >= 1e9) return `${+(n / 1e9).toFixed(1)}B`;
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n >= 1e7 ? 0 : 1)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}K`;
  return `${Math.round(n)}`;
}

function Tooltip({ children, leftPct }: { children: React.ReactNode; leftPct: number }) {
  return (
    <div className="absolute z-10 text-[11.5px] rounded px-2 py-1 pointer-events-none whitespace-nowrap font-semibold"
      style={{
        left: `${Math.min(88, Math.max(12, leftPct))}%`, top: -4, transform: "translateX(-50%)",
        background: "var(--text)", color: "var(--bg-1)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)",
      }}>
      {children}
    </div>
  );
}

/** Grouped buy/sell bars per year with Y-axis and hover readout. */
export function VolumeByYear({ data }: { data: YearVol[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-mute text-sm">No trade history.</p>;
  const rawMax = Math.max(1, ...data.map((d) => Math.max(d.buyValue, d.sellValue)));
  const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / pow) * pow;
  const W = 760, H = 260, mL = 52, mR = 10, mT = 10, mB = 48;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const x0 = mL, y0 = mT, yBase = mT + plotH;
  const n = data.length;
  const groupW = plotW / n;
  const barW = Math.min(11, groupW * 0.32);
  const y = (v: number) => yBase - (v / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  return (
    <div className="relative">
      {hover != null && data[hover] && (
        <Tooltip leftPct={((x0 + groupW * (hover + 0.5)) / W) * 100}>
          {data[hover].year} · <span style={{ color: "#10B981" }}>Buy {formatCurrency(data[hover].buyValue)}</span>
          {" · "}
          <span style={{ color: "#EF4444" }}>Sell {formatCurrency(data[hover].sellValue)}</span>
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Trade volume by year"
        style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={x0 - 5} x2={x0} y1={y(t)} y2={y(t)} stroke="var(--border-strong)" strokeWidth="1" />
            <text x={x0 - 9} y={y(t) + 3.5} textAnchor="end" fontSize="12" fill="var(--text-mute)">{axisMoney(t)}</text>
          </g>
        ))}
        <line x1={x0} x2={x0} y1={y0} y2={yBase} stroke="var(--border-strong)" strokeWidth="1.5" />
        <line x1={x0} x2={W - mR} y1={yBase} y2={yBase} stroke="var(--border-strong)" strokeWidth="1.5" />
        {data.map((d, i) => {
          const cx = x0 + groupW * (i + 0.5);
          const bH = Math.max(d.buyValue > 0 ? 2 : 0, (d.buyValue / max) * plotH);
          const sH = Math.max(d.sellValue > 0 ? 2 : 0, (d.sellValue / max) * plotH);
          const dim = hover != null && hover !== i;
          return (
            <g key={d.year} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={x0 + groupW * i} y={y0} width={groupW} height={plotH} fill="transparent" />
              <rect x={cx - barW - 1.5} y={yBase - bH} width={barW} height={bH} rx="2" fill="#10B981" opacity={dim ? 0.45 : 1} />
              <rect x={cx + 1.5} y={yBase - sH} width={barW} height={sH} rx="2" fill="#EF4444" opacity={dim ? 0.45 : 1} />
              <text x={cx} y={yBase + 16} textAnchor="end" fontSize="12" fill="var(--text-mute)"
                transform={`rotate(-40 ${cx} ${yBase + 16})`}>{d.year}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Single-series bar chart (outside spending etc.) with hover readout. */
export function SingleBarChart({ data, color }: { data: { label: string; amount: number }[]; color: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const rawMax = Math.max(1, ...data.map((d) => d.amount));
  const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const max = Math.ceil(rawMax / pow) * pow;
  const W = 760, H = 240, mL = 52, mR = 10, mT = 10, mB = 48;
  const plotW = W - mL - mR, plotH = H - mT - mB;
  const yBase = mT + plotH;
  const n = data.length;
  const groupW = plotW / n;
  const barW = Math.min(16, groupW * 0.6);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => max * f);
  return (
    <div className="relative">
      {hover != null && data[hover] && (
        <Tooltip leftPct={((mL + groupW * (hover + 0.5)) / W) * 100}>
          {data[hover].label} · {formatCurrency(data[hover].amount)}
        </Tooltip>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" style={{ display: "block", fontFamily: "var(--font-mono, monospace)" }}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={mL - 5} x2={mL} y1={yBase - (t / max) * plotH} y2={yBase - (t / max) * plotH} stroke="var(--border-strong)" strokeWidth="1" />
            <text x={mL - 9} y={yBase - (t / max) * plotH + 3.5} textAnchor="end" fontSize="12" fill="var(--text-mute)">{axisMoney(t)}</text>
          </g>
        ))}
        <line x1={mL} x2={mL} y1={mT} y2={yBase} stroke="var(--border-strong)" strokeWidth="1.5" />
        <line x1={mL} x2={W - mR} y1={yBase} y2={yBase} stroke="var(--border-strong)" strokeWidth="1.5" />
        {data.map((d, i) => {
          const cx = mL + groupW * (i + 0.5);
          const h = Math.max(d.amount > 0 ? 2 : 0, (d.amount / max) * plotH);
          return (
            <g key={d.label} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ cursor: "pointer" }}>
              <rect x={mL + groupW * i} y={mT} width={groupW} height={plotH} fill="transparent" />
              <rect x={cx - barW / 2} y={yBase - h} width={barW} height={h} rx="2" fill={color} opacity={hover == null || hover === i ? 1 : 0.5} />
              <text x={cx} y={yBase + 16} textAnchor="end" fontSize="11" fill="var(--text-mute)" transform={`rotate(-40 ${cx} ${yBase + 16})`}>{d.label}</text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/** Generic donut with hover: slice grows + others dim + tooltip shows value. */
function Donut({ slices, format }: {
  slices: { label: string; value: number; sub?: string }[];
  format: (v: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((a, s) => a + s.value, 0) || 1;
  let acc = 0;
  const R = 42, C = 50, sw = 16, circ = 2 * Math.PI * R;
  const arcs = slices.map((s, i) => {
    const frac = s.value / total;
    const el = { ...s, i, frac, offset: acc };
    acc += frac;
    return el;
  });
  const h = hover != null ? arcs[hover] : null;
  return (
    <div className="flex items-center gap-4 relative">
      {h && (
        <Tooltip leftPct={20}>
          {h.label} · {format(h.value)} ({(h.frac * 100).toFixed(1)}%)
        </Tooltip>
      )}
      <svg viewBox="0 0 100 100" width="104" height="104" className="flex-shrink-0 -rotate-90">
        {arcs.map((s) => (
          <circle key={s.label} cx={C} cy={C} r={R} fill="none"
            stroke={DONUT_COLORS[s.i % DONUT_COLORS.length]}
            strokeWidth={hover === s.i ? sw + 3 : sw}
            strokeDasharray={`${s.frac * circ} ${circ - s.frac * circ}`}
            strokeDashoffset={-s.offset * circ}
            opacity={hover == null || hover === s.i ? 1 : 0.4}
            style={{ cursor: "pointer", transition: "opacity 120ms, stroke-width 120ms" }}
            onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)} />
        ))}
      </svg>
      <div className="min-w-0 flex-1 space-y-1">
        {arcs.map((s) => (
          <div key={s.label} className="flex items-center gap-2 text-[12px] cursor-pointer rounded px-1 -mx-1 transition"
            style={{ background: hover === s.i ? "var(--bg-2)" : undefined }}
            onMouseEnter={() => setHover(s.i)} onMouseLeave={() => setHover(null)}>
            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ background: DONUT_COLORS[s.i % DONUT_COLORS.length] }} />
            <span className="truncate flex-1" style={{ color: DONUT_COLORS[s.i % DONUT_COLORS.length] }}>{s.label}</span>
            <span className="font-mono font-semibold tabular flex-shrink-0">{s.sub ?? format(s.value)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Donut of top traded sectors (by trade count). */
export function SectorDonut({ data }: { data: SectorSlice[] }) {
  const slices = data.slice(0, 8).map((s) => ({ label: s.sector, value: s.trades, sub: String(s.trades) }));
  if (!slices.length) return <p className="text-mute text-sm">No sector data.</p>;
  return <Donut slices={slices} format={(v) => `${v} trades`} />;
}

/** Donut of top stock holdings (by $ value). */
export function HoldingsDonut({ data }: { data: HoldingSlice[] }) {
  const slices = data.slice(0, 8).map((h) => ({ label: h.ticker, value: h.estValue }));
  if (!slices.length) return <p className="text-mute text-sm">No holdings.</p>;
  return <Donut slices={slices} format={formatCurrency} />;
}

/** Area/line chart with Y-axis, gridlines, and a hover crosshair that reads
 *  out the exact date + value under the cursor. */
export function AreaChart({ data }: { data: { date: string; value: number }[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const W = 900, H = 220, pad = 8;
  const { path, area, axisMax, xy } = useMemo(() => {
    const rawMax = Math.max(1, ...data.map((d) => d.value));
    const pow = Math.pow(10, Math.floor(Math.log10(rawMax)));
    const axisMax = Math.ceil(rawMax / pow) * pow;
    const n = data.length;
    const x = (i: number) => pad + (i / Math.max(1, n - 1)) * (W - pad * 2);
    const y = (v: number) => H - pad - (v / axisMax) * (H - pad * 2);
    const pts = data.map((d, i) => `${x(i).toFixed(1)},${y(d.value).toFixed(1)}`);
    return {
      path: `M ${pts.join(" L ")}`,
      area: `M ${x(0).toFixed(1)},${(H - pad).toFixed(1)} L ${pts.join(" L ")} L ${x(n - 1).toFixed(1)},${(H - pad).toFixed(1)} Z`,
      axisMax,
      xy: data.map((d, i) => ({ x: x(i), y: y(d.value) })),
    };
  }, [data]);
  const ticks = [1, 0.75, 0.5, 0.25, 0].map((f) => axisMax * f);
  const step = Math.max(1, Math.ceil(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);
  const onMove = (e: React.MouseEvent) => {
    const box = boxRef.current?.getBoundingClientRect();
    if (!box || data.length < 2) return;
    const frac = (e.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };
  const hPt = hover != null ? xy[hover] : null;
  return (
    <div className="flex gap-2">
      <div className="flex flex-col justify-between text-[10px] text-mute font-mono text-right" style={{ height: H, paddingBottom: 16 }}>
        {ticks.map((t) => <span key={t}>{axisMoney(t)}</span>)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="relative" ref={boxRef} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
          {hover != null && data[hover] && (
            <Tooltip leftPct={(xy[hover].x / W) * 100}>
              {formatDate(data[hover].date)} · {formatCurrency(data[hover].value)}
            </Tooltip>
          )}
          <div className="absolute inset-0 flex flex-col justify-between" aria-hidden>
            {ticks.map((t) => <div key={t} style={{ borderTop: "1px solid var(--border)", opacity: 0.5 }} />)}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" className="relative" role="img" aria-label="Value over time">
            <defs>
              <linearGradient id="pv" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="var(--accent)" stopOpacity="0.35" />
                <stop offset="1" stopColor="var(--accent)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={area} fill="url(#pv)" />
            <path d={path} fill="none" stroke="var(--accent)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            {hPt && (
              <>
                <line x1={hPt.x} x2={hPt.x} y1={pad} y2={H - pad} stroke="var(--text-mute)" strokeWidth="1" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
                <circle cx={hPt.x} cy={hPt.y} r="4" fill="var(--accent)" stroke="var(--bg-1)" strokeWidth="1.5" />
              </>
            )}
          </svg>
        </div>
        <div className="flex justify-between text-[10px] text-mute font-mono mt-1">
          {xLabels.map((d) => <span key={d.date}>{formatDate(d.date)}</span>)}
        </div>
      </div>
    </div>
  );
}
