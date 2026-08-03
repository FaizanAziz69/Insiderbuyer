"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Lock, Sparkles } from "lucide-react";
import { useMemo } from "react";
import { usePremium } from "@/components/premium/PremiumContext";

interface PreviewProps {
  title: string;
  subtitle: string;
  variant?: "line" | "candle" | "sankey";
  features: string[];
  description: string;
}

function seededRandom(seed: number) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateLineSeries(seed: number, points: number, startY = 50) {
  const rand = seededRandom(seed);
  const out: { x: number; y: number }[] = [];
  let y = startY;
  for (let i = 0; i < points; i++) {
    y += (rand() - 0.45) * 8;
    y = Math.max(10, Math.min(90, y));
    out.push({ x: (i / (points - 1)) * 100, y });
  }
  return out;
}

function buildPath(pts: { x: number; y: number }[]) {
  if (!pts.length) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const x1 = pts[i - 1].x;
    const x2 = pts[i].x;
    const y1 = pts[i - 1].y;
    const y2 = pts[i].y;
    const cx = (x1 + x2) / 2;
    d += ` C ${cx} ${y1}, ${cx} ${y2}, ${x2} ${y2}`;
  }
  return d;
}

function LinePreview({ palette }: { palette: { a: string; b: string; c: string } }) {
  const a = useMemo(() => generateLineSeries(11, 32, 55), []);
  const b = useMemo(() => generateLineSeries(42, 32, 35), []);
  const pathA = buildPath(a);
  const pathB = buildPath(b);
  const areaA = `${pathA} L 100 100 L 0 100 Z`;

  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      <defs>
        <linearGradient id="pp-area-a" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={palette.a} stopOpacity="0.35" />
          <stop offset="100%" stopColor={palette.a} stopOpacity="0" />
        </linearGradient>
        <linearGradient id="pp-line" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={palette.a} />
          <stop offset="100%" stopColor={palette.b} />
        </linearGradient>
      </defs>
      {Array.from({ length: 5 }).map((_, i) => (
        <line
          key={i}
          x1="0"
          x2="100"
          y1={(i + 1) * 18}
          y2={(i + 1) * 18}
          stroke="var(--border)"
          strokeWidth="0.2"
          strokeDasharray="0.6 0.6"
        />
      ))}
      <path d={areaA} fill="url(#pp-area-a)" />
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2.2, ease: [0.22, 1, 0.36, 1] }}
        d={pathA}
        fill="none"
        stroke="url(#pp-line)"
        strokeWidth="0.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
      <motion.path
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 2.2, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        d={pathB}
        fill="none"
        stroke={palette.c}
        strokeOpacity={0.7}
        strokeWidth="0.6"
        strokeDasharray="1.2 1.2"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function CandlePreview({ palette }: { palette: { a: string; b: string; c: string } }) {
  const candles = useMemo(() => {
    const rand = seededRandom(99);
    const out: { x: number; open: number; close: number; high: number; low: number }[] = [];
    let price = 50;
    for (let i = 0; i < 40; i++) {
      const change = (rand() - 0.48) * 10;
      const open = price;
      const close = Math.max(10, Math.min(90, open + change));
      const high = Math.max(open, close) + rand() * 4;
      const low = Math.min(open, close) - rand() * 4;
      out.push({ x: (i / 40) * 100 + 1.2, open, close, high, low });
      price = close;
    }
    return out;
  }, []);
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      {candles.map((c, i) => {
        const up = c.close > c.open;
        const color = up ? palette.b : palette.c;
        return (
          <motion.g
            key={i}
            initial={{ opacity: 0, y: 3 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.02 }}
          >
            <line
              x1={c.x}
              x2={c.x}
              y1={c.high}
              y2={c.low}
              stroke={color}
              strokeWidth="0.4"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={c.x - 1}
              y={Math.min(c.open, c.close)}
              width={2}
              height={Math.max(0.5, Math.abs(c.close - c.open))}
              fill={color}
            />
          </motion.g>
        );
      })}
    </svg>
  );
}

function SankeyPreview({ palette }: { palette: { a: string; b: string; c: string } }) {
  const rows = [
    { from: "Energy", to: "Tech", v: 28, color: palette.a },
    { from: "Health", to: "Tech", v: 18, color: palette.b },
    { from: "Finance", to: "Energy", v: 22, color: palette.c },
    { from: "Tech", to: "Health", v: 12, color: palette.a },
    { from: "Consumer", to: "Finance", v: 16, color: palette.b },
  ];
  return (
    <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="w-full h-full">
      {rows.map((r, i) => {
        const y1 = 10 + i * 16;
        const y2 = 10 + ((i + 2) % rows.length) * 16;
        const d = `M 10 ${y1} C 50 ${y1}, 50 ${y2}, 90 ${y2}`;
        return (
          <motion.path
            key={i}
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 0.7 }}
            transition={{ duration: 1.8, delay: i * 0.15, ease: [0.22, 1, 0.36, 1] }}
            d={d}
            stroke={r.color}
            strokeWidth={r.v / 4}
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          />
        );
      })}
    </svg>
  );
}

export function PremiumChartPreview({
  title,
  subtitle,
  variant = "line",
  features,
  description,
}: PreviewProps) {
  const palette = {
    a: "var(--accent)",
    b: "var(--good)",
    c: "var(--bad)",
  };
  const { unlocked } = usePremium();
  const locked = !unlocked;
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          {locked && (
            <div className="flex items-center gap-2 mb-1">
              <span className="badge badge-neutral">
                <Lock className="h-3 w-3" />
                Premium
              </span>
            </div>
          )}
          <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
            {title}
          </h1>
          <p className="text-mute text-sm mt-1">{subtitle}</p>
        </div>
        {locked && (
          <Link href="/premium" className="btn-primary self-start sm:self-auto">
            <Sparkles className="h-4 w-4" />
            Unlock with Premium
          </Link>
        )}
      </header>

      <div className="card p-5 sm:p-6 relative overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2.5">
            <div className="text-[15px] font-semibold">{title}</div>
            {locked && (
              <span className="badge badge-gold">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
          </div>
        </div>
        <div className="relative">
          <div className={`h-80 w-full${locked ? " paywall-blur" : ""}`}>
            {variant === "line" && <LinePreview palette={palette} />}
            {variant === "candle" && <CandlePreview palette={palette} />}
            {variant === "sankey" && <SankeyPreview palette={palette} />}
          </div>
          {locked && (
            <div className="paywall-overlay">
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5 }}
                className="max-w-md"
              >
                <div
                  className="inline-flex h-12 w-12 rounded-2xl items-center justify-center mb-3"
                  style={{
                    background:
                      "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
                    boxShadow: "0 8px 24px rgba(0,102,255,0.3)",
                  }}
                >
                  <Lock className="h-5 w-5 text-white" />
                </div>
                <h2 className="text-xl font-bold tracking-tight mb-1.5">Premium feature</h2>
                <p className="text-soft text-sm mb-4">{description}</p>
                <Link href="/premium" className="btn-primary">
                  Get Premium
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </motion.div>
            </div>
          )}
        </div>
      </div>

      <section className="card p-5 sm:p-6">
        <div className="label-mini mb-4">{locked ? "What's included on Premium" : "What's included"}</div>
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3 text-sm text-soft">
          {features.map((f) => (
            <li key={f} className="flex items-start gap-2.5">
              <span
                className="h-1.5 w-1.5 rounded-full mt-2 flex-shrink-0"
                style={{ background: "var(--accent)" }}
              />
              {f}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
