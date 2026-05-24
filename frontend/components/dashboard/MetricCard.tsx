"use client";
import { TrendingDown, TrendingUp } from "lucide-react";

interface Props {
  label: string;
  value: string;
  delta?: { value: string; positive: boolean };
  hint?: string;
}

export function MetricCard({ label, value, delta, hint }: Props) {
  return (
    <div className="card p-5">
      <div className="label-mini">{label}</div>
      <div className="mt-2 text-[28px] font-semibold tracking-tight leading-none tabular">
        {value}
      </div>
      <div className="mt-2 text-xs text-mute flex items-center gap-1.5">
        {delta && (
          <span
            className="inline-flex items-center gap-0.5 font-medium"
            style={{ color: delta.positive ? "var(--good)" : "var(--bad)" }}
          >
            {delta.positive ? (
              <TrendingUp className="h-3 w-3" />
            ) : (
              <TrendingDown className="h-3 w-3" />
            )}
            {delta.value}
          </span>
        )}
        {hint && <span>{hint}</span>}
      </div>
    </div>
  );
}
