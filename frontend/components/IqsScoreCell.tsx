"use client";
import { TierBadge } from "./TierBadge";

/**
 * Table cell that shows the Insider Score with its tier badge underneath.
 * Used on the insider-scored tables (Insider Hot Stocks, Insider Score rankings,
 * insider stock lists, Insider Score Top Picks).
 */
export function IqsScoreCell({ iqs }: { iqs?: number | null }) {
  if (typeof iqs !== "number") return <span className="text-mute">—</span>;
  // No stock ever shows a perfect 100 (scores cap at 99 — also enforced at
  // the scoring layer; this guards older stored values).
  const capped = Math.min(99, iqs);
  return (
    <span className="inline-flex flex-col items-center gap-1 leading-none">
      <span className="tabular text-[15px] font-bold" style={{ color: "var(--accent)" }}>
        {capped.toFixed(1)}
      </span>
      <TierBadge iqs={capped} size="sm" />
    </span>
  );
}
