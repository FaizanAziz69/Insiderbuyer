"use client";
import { BacktestChart } from "@/components/backtest/BacktestChart";
import { formatCurrency } from "@/lib/api";
import { pct } from "./types";
import type { WtStats } from "./types";

/**
 * "Disclosed Portfolio Growth (est.)": the member's time-weighted index
 * against SPY, both starting at 100 on their first disclosed trade. Never
 * called net worth or wealth (Brief v7 §2.1).
 */
export function GrowthChart({
  curve,
  stats,
  trackedSince,
  compact = false,
}: {
  curve: Array<{ t: number; s: number; b: number }>;
  stats: WtStats | null;
  trackedSince: string | null;
  compact?: boolean;
}) {
  if (!curve || curve.length < 2) {
    return <p className="text-mute text-sm py-8 text-center">Not enough priced trades to draw a growth curve yet.</p>;
  }
  return (
    <div>
      {!compact && stats ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <Tile label="Est. value today" value={formatCurrency(stats.value)} />
          <Tile label="Since tracked" value={pct(stats.retAll)} sub={stats.benchAll != null ? `SPY ${pct(stats.benchAll)}` : undefined} tone={tone(stats.retAll)} />
          <Tile label="Last 90 days" value={pct(stats.ret90d)} sub={stats.bench90d != null ? `SPY ${pct(stats.bench90d)}` : undefined} tone={tone(stats.ret90d)} />
          <Tile label="Year to date" value={pct(stats.retYtd)} sub={stats.benchYtd != null ? `SPY ${pct(stats.benchYtd)}` : undefined} tone={tone(stats.retYtd)} />
        </div>
      ) : null}
      <BacktestChart
        curve={curve.map((p) => ({ t: p.t, s: p.s, b: p.b }))}
        height={compact ? 180 : 300}
        compact={compact}
        controls={!compact}
        tipranks
        strategyLabel="Disclosed portfolio (est.)"
        benchmarkLabel="S&P 500 (SPY)"
      />
      <p className="text-[11px] mt-2" style={{ color: "var(--text-faint)" }}>
        Growth of $100 in the disclosed portfolio against $100 in SPY, time-weighted, from disclosed trades{trackedSince ? ` since ${trackedSince}` : ""}.
        Deposits and withdrawals do not move the line; only the prices of what was held do.
      </p>
    </div>
  );
}

function tone(v: number | null): "up" | "down" | undefined {
  if (v == null) return undefined;
  return v >= 0 ? "up" : "down";
}

export function Tile({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "up" | "down" }) {
  return (
    <div className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="text-[10.5px] uppercase tracking-wider font-bold" style={{ color: "var(--text-mute)" }}>
        {label}
      </div>
      <div className="text-[19px] font-bold tabular mt-0.5" style={{ color: tone === "up" ? "#10B981" : tone === "down" ? "#EF4444" : "var(--text)" }}>
        {value}
      </div>
      {sub ? (
        <div className="text-[11px]" style={{ color: "var(--text-mute)" }}>
          {sub}
        </div>
      ) : null}
    </div>
  );
}
