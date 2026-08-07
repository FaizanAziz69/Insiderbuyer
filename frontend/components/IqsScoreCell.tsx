"use client";
import { TierBadge } from "./TierBadge";

/**
 * Table cell that shows the Insider Score with its tier badge underneath.
 * Used on the insider-scored tables (Insider Hot Stocks, Insider Score rankings,
 * insider stock lists, Insider Score Top Picks).
 *
 * v2 only. The legacy v1 score and the v2−v1 delta that used to sit beneath
 * were removed at the client's request — v2 IS the Insider Score.
 */
export function IqsScoreCell({ iqs }: { iqs?: number | null }) {
  // A missing score is a real state, not missing data: the score only exists
  // where there are qualifying insider buys in the window. Say so instead of
  // rendering an ambiguous blank/dash (and never fabricate a number).
  if (typeof iqs !== "number")
    return (
      <span
        className="text-mute text-[11px] leading-tight inline-block max-w-[92px]"
        title="No qualifying open-market insider purchases in the last 90 days — the Insider Score only exists where insiders are buying."
      >
        No recent insider buying
      </span>
    );
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
