"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import { RankingRow, formatCurrency } from "@/lib/api";

interface Props {
  rows: RankingRow[];
  height?: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: RankingRow;
}

function sliceTreemap(items: RankingRow[], x: number, y: number, w: number, h: number): Rect[] {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ x, y, w, h, row: items[0] }];
  }
  const value = (r: RankingRow) => Math.max(1, r.marketCap || r.totalPurchaseValue || 1);
  const total = items.reduce((a, r) => a + value(r), 0);
  let cum = 0;
  let splitIdx = 1;
  for (let i = 0; i < items.length; i++) {
    cum += value(items[i]);
    if (cum >= total / 2) {
      splitIdx = i + 1;
      break;
    }
  }
  if (splitIdx >= items.length) splitIdx = items.length - 1;
  if (splitIdx < 1) splitIdx = 1;

  const a = items.slice(0, splitIdx);
  const b = items.slice(splitIdx);
  const aSum = a.reduce((s, r) => s + value(r), 0);
  const ratio = aSum / total;

  if (w >= h) {
    return [
      ...sliceTreemap(a, x, y, w * ratio, h),
      ...sliceTreemap(b, x + w * ratio, y, w * (1 - ratio), h),
    ];
  } else {
    return [
      ...sliceTreemap(a, x, y, w, h * ratio),
      ...sliceTreemap(b, x, y + h * ratio, w, h * (1 - ratio)),
    ];
  }
}

function colorFor(iqs: number, maxIqs: number) {
  const norm = Math.max(0, Math.min(1, iqs / Math.max(0.5, maxIqs)));
  if (norm >= 0.75) {
    return {
      bg: "linear-gradient(135deg, #047857 0%, #10b981 100%)",
      fg: "#ecfdf5",
      label: "Elite",
    };
  }
  if (norm >= 0.5) {
    return {
      bg: "linear-gradient(135deg, #059669 0%, #34d399 100%)",
      fg: "#ecfdf5",
      label: "Strong",
    };
  }
  if (norm >= 0.25) {
    return {
      bg: "linear-gradient(135deg, #0e7490 0%, #06b6d4 100%)",
      fg: "#ecfeff",
      label: "Notable",
    };
  }
  if (norm >= 0.1) {
    return {
      bg: "linear-gradient(135deg, #475569 0%, #64748b 100%)",
      fg: "#f1f5f9",
      label: "Watch",
    };
  }
  return {
    bg: "linear-gradient(135deg, #334155 0%, #475569 100%)",
    fg: "#cbd5e1",
    label: "Quiet",
  };
}

export function StockHeatmap({ rows, height = 520 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => {
    if (!rows.length) return [];
    const sorted = [...rows].sort(
      (a, b) =>
        (b.marketCap || b.totalPurchaseValue || 0) -
        (a.marketCap || a.totalPurchaseValue || 0),
    );
    return sliceTreemap(sorted, 0, 0, Math.max(320, width), height);
  }, [rows, width, height]);

  const maxIqs = Math.max(1, ...rows.map((r) => r.iqs));

  return (
    <div ref={ref} className="relative w-full" style={{ height }}>
      {layout.map((rect, i) => {
        const c = colorFor(rect.row.iqs, maxIqs);
        const area = rect.w * rect.h;
        const tiny = area < 4500;
        const small = area < 9000;
        const medium = area < 16000;
        return (
          <motion.div
            key={rect.row.companyId}
            initial={{ opacity: 0, scale: 0.92 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.45, delay: i * 0.02, ease: [0.22, 1, 0.36, 1] }}
            style={{
              position: "absolute",
              left: rect.x + 2,
              top: rect.y + 2,
              width: Math.max(0, rect.w - 4),
              height: Math.max(0, rect.h - 4),
              background: c.bg,
              color: c.fg,
              borderRadius: 6,
              overflow: "hidden",
              cursor: "pointer",
            }}
            whileHover={{ scale: 1.02, zIndex: 5 }}
          >
            <Link
              href={rect.row.ticker ? `/companies/${encodeURIComponent(rect.row.ticker)}` : "#"}
              className="absolute inset-0 p-2 sm:p-3 flex flex-col"
              title={`${rect.row.ticker || rect.row.name} · IQS ${rect.row.iqs.toFixed(2)} · ${formatCurrency(rect.row.marketCap)}`}
            >
              <svg
                className="absolute inset-0 w-full h-full opacity-10 pointer-events-none"
                preserveAspectRatio="none"
              >
                <defs>
                  <pattern
                    id={`hm-pat-${i}`}
                    x="0"
                    y="0"
                    width="22"
                    height="22"
                    patternUnits="userSpaceOnUse"
                  >
                    <circle cx="2" cy="2" r="1" fill="white" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill={`url(#hm-pat-${i})`} />
              </svg>

              {!tiny && (
                <div
                  className="text-[9px] font-bold uppercase tracking-wider opacity-75 absolute top-2 right-2"
                  style={{ letterSpacing: "0.1em" }}
                >
                  {c.label}
                </div>
              )}

              <div className="relative flex-1 flex flex-col items-start justify-center min-w-0">
                <div
                  className="font-bold tracking-tight leading-none font-mono"
                  style={{
                    fontSize: tiny ? 11 : small ? 14 : medium ? 20 : 28,
                  }}
                >
                  {rect.row.ticker || "—"}
                </div>
                {!tiny && (
                  <div
                    className="opacity-80 leading-tight mt-1 truncate w-full"
                    style={{
                      fontSize: small ? 9 : medium ? 10 : 12,
                    }}
                  >
                    {rect.row.name}
                  </div>
                )}
              </div>

              {!small && (
                <div className="relative flex items-end justify-between gap-2 mt-auto">
                  <div>
                    <div
                      className="opacity-70 leading-tight"
                      style={{ fontSize: medium ? 9 : 10 }}
                    >
                      IQS
                    </div>
                    <div
                      className="font-bold tabular leading-tight"
                      style={{ fontSize: medium ? 14 : 18 }}
                    >
                      {rect.row.iqs.toFixed(2)}
                    </div>
                  </div>
                  <div className="text-right">
                    <div
                      className="opacity-70 leading-tight"
                      style={{ fontSize: medium ? 9 : 10 }}
                    >
                      MKT CAP
                    </div>
                    <div
                      className="font-bold tabular leading-tight"
                      style={{ fontSize: medium ? 12 : 14 }}
                    >
                      {formatCurrency(rect.row.marketCap)}
                    </div>
                  </div>
                </div>
              )}
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
