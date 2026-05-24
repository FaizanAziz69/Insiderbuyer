"use client";
import { motion } from "framer-motion";
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
    <motion.div
      initial={{ opacity: 0, x: 16 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.55, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="card p-5 sm:p-6"
    >
      <div className="flex items-center justify-between mb-1">
        <div className="text-[15px] font-semibold">Market signals</div>
        <span className="live-dot live-dot-good text-faint">live</span>
      </div>
      <div className="text-xs text-mute mb-6">Derived from IQS aggregates</div>

      <div className="mb-5">
        <div className="flex items-baseline justify-between mb-2">
          <span className="label-mini">Confidence index</span>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="text-2xl font-bold tabular"
          >
            {confidence.toFixed(1)}<span className="text-mute text-base">/10</span>
          </motion.span>
        </div>
        <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--bg-3)" }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, (confidence / 10) * 100)}%` }}
            transition={{ duration: 1.1, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
            className="h-full rounded-full"
            style={{
              background: bullish
                ? "linear-gradient(90deg, var(--good), var(--accent))"
                : "linear-gradient(90deg, var(--bad), var(--warn))",
              boxShadow: bullish
                ? "0 0 12px var(--good-soft)"
                : "0 0 12px var(--bad-soft)",
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

      <dl className="space-y-3 text-sm">
        <div className="flex items-center justify-between">
          <dt className="text-mute">Buys (24h)</dt>
          <dd className="font-bold tabular">{insiderBuys24h}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-mute">7d volume</dt>
          <dd className="font-bold tabular text-good">{formatCurrency(totalRecentValue)}</dd>
        </div>
        <div className="flex items-center justify-between">
          <dt className="text-mute">Top sector</dt>
          <dd className="font-semibold truncate ml-3 max-w-[160px]" title={topSector.name}>
            {topSector.name === "Other" ? "—" : topSector.name}
          </dd>
        </div>
      </dl>
    </motion.div>
  );
}
