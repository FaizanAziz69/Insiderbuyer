"use client";
import { formatCurrency } from "@/lib/api";

interface Props {
  confidence: number;
  totalRecentValue: number;
  insiderBuys24h: number;
  topSector: { name: string; value: number };
}

export function MarketSignals({
  confidence,
  totalRecentValue,
  insiderBuys24h,
  topSector,
}: Props) {
  const bullish = confidence >= 5;
  return (
    <div className="card p-5">
      <div className="text-[15px] font-semibold mb-1">Market signals</div>
      <div className="text-xs text-mute mb-5">Derived from IQS aggregates</div>

      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="label-mini">Confidence index</span>
          <span className="text-2xl font-bold tabular">{confidence.toFixed(1)}/10</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{
              width: `${Math.min(100, (confidence / 10) * 100)}%`,
              background: bullish
                ? "linear-gradient(90deg, var(--good), var(--accent))"
                : "linear-gradient(90deg, var(--bad), var(--warn))",
            }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="label-mini">Sentiment</span>
        <span className={`badge ${bullish ? "badge-buy" : "badge-sell"}`}>
          {bullish ? "Bullish" : "Cautious"}
        </span>
      </div>
      <div className="flex items-center justify-between mb-5">
        <span className="label-mini">Trend</span>
        <span className="badge badge-neutral">Accumulation</span>
      </div>

      <div className="h-px my-5" style={{ background: "var(--border)" }} />

      <dl className="space-y-2.5 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-mute">Buys (24h)</dt>
          <dd className="font-semibold tabular">{insiderBuys24h}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-mute">7d volume</dt>
          <dd className="font-semibold tabular">{formatCurrency(totalRecentValue)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-mute">Top sector</dt>
          <dd className="font-semibold truncate ml-3 max-w-[160px]" title={topSector.name}>
            {topSector.name === "Other" ? "—" : topSector.name}
          </dd>
        </div>
      </dl>
    </div>
  );
}
