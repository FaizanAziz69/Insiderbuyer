"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Lock, Sparkles } from "lucide-react";
import { API_BASE, RankingsResponse, fetcher, formatCurrency } from "@/lib/api";

function hashStr(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

function Sparkline({ seed, positive }: { seed: number; positive: boolean }) {
  const rand = (n: number) => {
    const x = Math.sin(seed * 9.3 + n * 1.7) * 10000;
    return x - Math.floor(x);
  };
  const pts: number[] = [];
  let y = 50;
  for (let i = 0; i < 14; i++) {
    y += (rand(i) - (positive ? 0.4 : 0.6)) * 11;
    y = Math.max(10, Math.min(90, y));
    pts.push(y);
  }
  const w = 80;
  const xStep = w / (pts.length - 1);
  const path = pts.map((p, i) => `${i === 0 ? "M" : "L"} ${i * xStep} ${p}`).join(" ");
  const area = `${path} L ${w} 100 L 0 100 Z`;
  return (
    <svg viewBox={`0 0 ${w} 100`} preserveAspectRatio="none" className="w-full h-9">
      <path d={area} fill={positive ? "var(--good)" : "var(--bad)"} opacity="0.12" />
      <path
        d={path}
        fill="none"
        stroke={positive ? "var(--good)" : "var(--bad)"}
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Row({
  r,
  rank,
  blurred,
  idx,
}: {
  r: import("@/lib/api").RankingRow;
  rank: number;
  blurred: boolean;
  idx: number;
}) {
  const positive = r.iqs >= 50;
  return (
    <motion.li
      initial={{ opacity: 0, x: 8 }}
      whileInView={{ opacity: 1, x: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.3, delay: 0.025 * idx }}
      className={blurred ? "select-none pointer-events-none" : ""}
      style={blurred ? { filter: "blur(5px)" } : undefined}
      aria-hidden={blurred}
    >
      <Link
        href={blurred ? "#" : r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
        className="grid grid-cols-[24px_60px_1fr] gap-2 items-center py-2.5 hover:bg-[var(--accent-soft)] rounded-md px-2 -mx-2 transition"
      >
        <span className="text-[10px] font-mono font-bold text-faint tabular text-center">
          {String(rank).padStart(2, "0")}
        </span>
        <div className="flex items-center justify-center h-10">
          <Sparkline seed={hashStr(r.companyId)} positive={positive} />
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-bold text-[12px] truncate" title={r.name}>
              {r.name.length > 14 ? r.name.slice(0, 14) + "…" : r.name}
            </span>
            <span className="text-[11px] font-bold tabular text-soft">
              {formatCurrency(r.totalPurchaseValue)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <span
              className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded"
              style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
            >
              {r.ticker || "—"}
            </span>
            <span
              className="text-[10px] font-bold tabular"
              style={{ color: positive ? "var(--good)" : "var(--bad)" }}
            >
              {positive ? "+" : ""}IQS {r.iqs.toFixed(1)}
            </span>
          </div>
        </div>
      </Link>
    </motion.li>
  );
}

export function MostActiveStocks() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=20`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];
  const blurredTop = rows.slice(0, 3);
  const visibleRest = rows.slice(3, 7);

  return (
    <aside>
      <div className="flex items-baseline justify-between mb-1">
        <h3 className="text-[14px] font-bold tracking-tight">Most Active Stocks</h3>
        <Link href="/companies" className="text-[12px] font-semibold text-accent hover:underline">
          All
        </Link>
      </div>
      <div className="text-[11px] text-mute mb-3">Ranked by IQS · descending</div>

      {isLoading ? (
        <ul className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <li key={i} className="h-14 shimmer rounded" />
          ))}
        </ul>
      ) : (
        <>
          {/* Top 5 — premium gated */}
          {blurredTop.length > 0 && (
            <div
              className="relative rounded-lg p-2 mb-3"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--accent) 8%, var(--bg-2)) 0%, var(--bg-2) 100%)",
                border: "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))",
              }}
            >
              <div className="flex items-center gap-1.5 mb-1 px-1">
                <Lock className="h-3 w-3 text-accent" />
                <span
                  className="text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: "var(--accent)" }}
                >
                  Top 3 picks · Premium
                </span>
              </div>
              <ul className="divide-y divide-[var(--border)]">
                {blurredTop.map((r, i) => (
                  <Row key={r.companyId} r={r} rank={i + 1} blurred idx={i} />
                ))}
              </ul>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-4 rounded-lg"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 60%, transparent) 0%, color-mix(in srgb, var(--bg-2) 92%, transparent) 100%)",
                  backdropFilter: "blur(2px)",
                }}
              >
                <div
                  className="inline-flex h-10 w-10 rounded-xl items-center justify-center mb-2"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    boxShadow: "0 6px 18px rgba(0,102,255,0.25)",
                  }}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="text-[12px] font-bold mb-0.5">Top 3 are premium</div>
                <div className="text-[11px] text-mute mb-3 max-w-[200px]">
                  Unlock the highest-IQS signals first.
                </div>
                <Link
                  href="/premium"
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  Unlock top picks
                </Link>
              </div>
            </div>
          )}

          {/* 4-7 — free */}
          {visibleRest.length > 0 && (
            <>
              <ul className="divide-y divide-[var(--border)]">
                {visibleRest.map((r, i) => (
                  <Row key={r.companyId} r={r} rank={i + 4} blurred={false} idx={i} />
                ))}
              </ul>
              <Link
                href="/companies"
                className="mt-3 inline-flex items-center gap-1 text-[12px] font-semibold text-accent hover:underline"
              >
                See more
                <ChevronRight className="h-3.5 w-3.5" />
              </Link>
            </>
          )}
        </>
      )}

      <div className="text-[10px] text-mute mt-3 font-mono">
        {new Date().toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        {" · "}
        {new Date().toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}
      </div>
    </aside>
  );
}
