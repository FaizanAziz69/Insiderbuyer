"use client";
/** TipRanks-style price-target cell (client spec): the target price on top in
 *  accent blue, "(X% Upside)" in brackets beneath. Columns using this sort by
 *  the UPSIDE, not the target. */
export function PriceTargetCell({
  target,
  upsidePct,
}: {
  target: number | null | undefined;
  upsidePct: number | null | undefined;
}) {
  if (target == null && upsidePct == null) {
    return <span className="text-faint text-[13px]">—</span>;
  }
  const up = (upsidePct ?? 0) >= 0;
  return (
    <span className="inline-block text-center leading-tight">
      <span className="block tabular font-bold text-[14px] text-accent">
        {target != null ? `$${target.toFixed(2)}` : "—"}
      </span>
      {upsidePct != null && (
        <span
          className="block text-[12px] tabular"
          style={{ color: up ? "var(--text-soft)" : "var(--bad)" }}
        >
          ({upsidePct.toFixed(2)}% {up ? "Upside" : "Downside"})
        </span>
      )}
    </span>
  );
}
