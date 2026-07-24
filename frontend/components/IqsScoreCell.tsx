"use client";
import { TierBadge } from "./TierBadge";

/**
 * Table cell that shows the Insider Score with its tier badge underneath.
 * Used on the insider-scored tables (Insider Hot Stocks, Insider Score rankings,
 * insider stock lists, Insider Score Top Picks).
 *
 * When `iqsV1` is supplied it also shows the previous (v1) score and the v2−v1
 * delta beneath, so old and new scores appear side by side for comparison.
 */
export function IqsScoreCell({
  iqs,
  iqsV1,
}: {
  iqs?: number | null;
  iqsV1?: number | null;
}) {
  if (typeof iqs !== "number") return <span className="text-mute">—</span>;
  // No stock ever shows a perfect 100 (scores cap at 99 — also enforced at
  // the scoring layer; this guards older stored values).
  const capped = Math.min(99, iqs);
  const hasV1 = typeof iqsV1 === "number";
  const oldCap = hasV1 ? Math.min(99, iqsV1 as number) : null;
  const delta = oldCap != null ? Math.round(capped) - Math.round(oldCap) : null;
  return (
    <span className="inline-flex flex-col items-center gap-1 leading-none">
      <span className="tabular text-[15px] font-bold" style={{ color: "var(--accent)" }}>
        {capped.toFixed(1)}
      </span>
      <TierBadge iqs={capped} size="sm" />
      {oldCap != null && (
        <span className="tabular text-[10px] mt-0.5" style={{ color: "var(--text-mute)" }}>
          v1 {Math.round(oldCap)}
          {delta != null && (
            <span style={{ color: delta > 0 ? "#10B981" : delta < 0 ? "#EF4444" : "var(--text-mute)" }}>
              {" "}({delta > 0 ? "+" : ""}{delta})
            </span>
          )}
        </span>
      )}
    </span>
  );
}
