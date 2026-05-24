"use client";
import { useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";

export interface ChartPoint {
  date: string;
  count: number;
  value: number;
}

interface Props {
  data: ChartPoint[];
  height?: number;
  metric?: "count" | "value";
  formatValue?: (n: number) => string;
}

const PAD = { top: 20, right: 24, bottom: 28, left: 56 };

export function LineChart({ data, height = 320, metric = "value", formatValue }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [hover, setHover] = useState<{ x: number; i: number } | null>(null);

  useMemo(() => {
    if (typeof window === "undefined") return;
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setWidth(el.clientWidth);
    });
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const W = Math.max(320, width);
  const H = height;
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;

  const values = data.map((d) => (metric === "value" ? d.value : d.count));
  const maxV = Math.max(1, ...values);
  const minV = 0;

  const xFor = (i: number) =>
    PAD.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yFor = (v: number) =>
    PAD.top + innerH - ((v - minV) / (maxV - minV)) * innerH;

  const path = useMemo(() => {
    if (!data.length) return "";
    let d = `M ${xFor(0)} ${yFor(values[0])}`;
    for (let i = 1; i < data.length; i++) {
      const x1 = xFor(i - 1);
      const x2 = xFor(i);
      const y1 = yFor(values[i - 1]);
      const y2 = yFor(values[i]);
      const cx = (x1 + x2) / 2;
      d += ` C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
    }
    return d;
  }, [data, width, height, metric]);

  const areaPath = useMemo(() => {
    if (!data.length) return "";
    return `${path} L ${xFor(data.length - 1)} ${PAD.top + innerH} L ${xFor(0)} ${
      PAD.top + innerH
    } Z`;
  }, [path, data, width, height]);

  const yTicks = useMemo(() => {
    const n = 4;
    return Array.from({ length: n + 1 }, (_, k) => {
      const v = (maxV / n) * k;
      return { v, y: yFor(v) };
    });
  }, [maxV, height]);

  function onMove(e: React.MouseEvent<SVGSVGElement>) {
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = e.clientX - rect.left;
    const local = Math.max(0, Math.min(innerW, px - PAD.left));
    const i =
      data.length <= 1
        ? 0
        : Math.round((local / innerW) * (data.length - 1));
    setHover({ x: xFor(i), i });
  }

  const fmt = formatValue || ((n: number) => n.toLocaleString());

  return (
    <div ref={wrapRef} className="w-full" style={{ height }}>
      <svg
        width={W}
        height={H}
        viewBox={`0 0 ${W} ${H}`}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        style={{ display: "block" }}
      >
        <defs>
          <linearGradient id="lc-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.4" />
            <stop offset="50%" stopColor="var(--accent)" stopOpacity="0.12" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="lc-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--accent)" />
            <stop offset="50%" stopColor="var(--accent-2)" />
            <stop offset="100%" stopColor="var(--good)" />
          </linearGradient>
          <filter id="lc-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD.left}
              x2={W - PAD.right}
              y1={t.y}
              y2={t.y}
              stroke="var(--border)"
              strokeDasharray="2 4"
            />
            <text
              x={PAD.left - 10}
              y={t.y + 4}
              textAnchor="end"
              fontSize="10"
              fill="var(--text-faint)"
              fontFamily="var(--font-mono)"
            >
              {fmt(t.v)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          if (i % Math.max(1, Math.floor(data.length / 8)) !== 0 && i !== data.length - 1) return null;
          const date = new Date(d.date);
          const label =
            data.length <= 14
              ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
          return (
            <text
              key={d.date + i}
              x={xFor(i)}
              y={H - PAD.bottom + 18}
              textAnchor="middle"
              fontSize="10"
              fill="var(--text-faint)"
              fontFamily="var(--font-mono)"
            >
              {label}
            </text>
          );
        })}

        <motion.path
          d={areaPath}
          fill="url(#lc-area)"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.9, delay: 0.6 }}
        />

        <motion.path
          d={path}
          fill="none"
          stroke="url(#lc-line)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
          filter="url(#lc-glow)"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.6, ease: [0.22, 1, 0.36, 1] }}
        />

        {data.map((d, i) => {
          const v = metric === "value" ? d.value : d.count;
          if (v === 0) return null;
          return (
            <motion.circle
              key={`pt-${i}`}
              cx={xFor(i)}
              cy={yFor(v)}
              r={3}
              fill="var(--bg-2)"
              stroke="var(--accent)"
              strokeWidth={2}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.3, delay: 1.0 + i * 0.02 }}
            />
          );
        })}

        {hover && (
          <g pointerEvents="none">
            <line
              x1={hover.x}
              x2={hover.x}
              y1={PAD.top}
              y2={H - PAD.bottom}
              stroke="var(--accent)"
              strokeWidth={1}
              strokeDasharray="3 3"
              opacity={0.7}
            />
            <circle
              cx={hover.x}
              cy={yFor(values[hover.i])}
              r={6}
              fill="var(--accent)"
              opacity={0.25}
            />
            <circle
              cx={hover.x}
              cy={yFor(values[hover.i])}
              r={3.5}
              fill="var(--bg-2)"
              stroke="var(--accent)"
              strokeWidth={2}
            />
          </g>
        )}
      </svg>

      {hover && (
        <div
          className="pointer-events-none absolute mt-[-280px] px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap"
          style={{
            transform: `translateX(${Math.min(W - 160, Math.max(8, hover.x - 60))}px)`,
            background: "var(--text)",
            color: "var(--bg-2)",
            boxShadow: "var(--shadow-lg)",
          }}
        >
          <div className="text-[10px] font-mono opacity-60 uppercase tracking-wider mb-0.5">
            {new Date(data[hover.i].date).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>
          <div className="tabular">
            {metric === "value"
              ? fmt(data[hover.i].value)
              : `${data[hover.i].count} trade${data[hover.i].count === 1 ? "" : "s"}`}
          </div>
        </div>
      )}
    </div>
  );
}
