"use client";

/**
 * Workstream F §2.5 — the "spend history sparkline" on the per-issuer module.
 *
 * Change over time, one series, small multiples of one: a bar per quarter
 * rather than a line, because the underlying quantity is a discrete quarterly
 * total rather than a continuous series, and a gap quarter means "nothing
 * disclosed" rather than "interpolate through it".
 */
export function SpendSparkline({
  history,
}: {
  history: Array<{ quarter: string; spend: number; score: number | null; active_contracts: number }>;
}) {
  if (!history?.length) return null;
  const max = Math.max(...history.map((h) => h.spend || 0), 1);
  const H = 54;

  return (
    <figure className="rounded-lg p-3.5 m-0" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
      <figcaption className="text-[11px] font-bold uppercase tracking-wide mb-2" style={{ color: "var(--text-mute)" }}>
        Disclosed spend by quarter
      </figcaption>
      <div className="flex items-end gap-1.5" style={{ height: H }}>
        {history.map((h) => (
          <div key={h.quarter} className="flex-1 flex flex-col justify-end items-center h-full" title={`${h.quarter}: C$${Math.round(h.spend).toLocaleString()} · ${h.active_contracts} provider(s)`}>
            <div
              style={{
                width: "100%",
                height: `${Math.max(2, ((h.spend || 0) / max) * (H - 4))}px`,
                background: "var(--accent)",
                opacity: 0.85,
                borderRadius: "4px 4px 0 0",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-1.5 mt-1">
        {history.map((h) => (
          <span key={h.quarter} className="flex-1 text-center text-[9.5px]" style={{ color: "var(--text-mute)" }}>
            {h.quarter.replace("-", " ")}
          </span>
        ))}
      </div>
    </figure>
  );
}
