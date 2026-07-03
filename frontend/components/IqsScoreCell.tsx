"use client";
import { TierBadge } from "./TierBadge";

/**
 * Table cell that shows the IQS score with its tier badge underneath.
 * Used on the insider-scored tables (Insider Hot Stocks, IQS rankings,
 * insider stock lists, IQS Top Picks).
 */
export function IqsScoreCell({ iqs }: { iqs?: number | null }) {
  if (typeof iqs !== "number") return <span className="text-mute">—</span>;
  return (
    <span className="inline-flex flex-col items-center gap-1 leading-none">
      <span className="tabular text-[15px] font-bold" style={{ color: "var(--accent)" }}>
        {iqs.toFixed(1)}
      </span>
      <TierBadge iqs={iqs} size="sm" />
    </span>
  );
}
