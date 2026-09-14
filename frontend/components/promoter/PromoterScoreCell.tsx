"use client";
import { useState } from "react";

/**
 * The Promoter Score badge, with its own breakdown on hover.
 *
 * The number is a percentile, so it is deliberately NOT coloured good-to-bad
 * the way the Insider Score is. Workstream F §2.6 leaves the house position on
 * whether promotion spend is a positive or a caution unsettled, and a red-to-
 * green ramp would answer that question in the UI before George answers it in
 * copy. A single neutral accent ramp says "more" and "less", nothing else.
 */
export function PromoterScoreCell({
  score,
  components,
  weights,
}: {
  score: number | null;
  components?: Record<string, number | null> | null;
  weights?: Record<string, number> | null;
}) {
  const [open, setOpen] = useState(false);
  if (score == null) {
    return <span className="text-faint text-[11px] whitespace-nowrap">Not scored</span>;
  }

  // One hue, varying weight — intensity tracks the percentile.
  const t = Math.max(0, Math.min(100, score)) / 100;
  const bg = `color-mix(in srgb, var(--accent) ${Math.round(12 + t * 68)}%, transparent)`;
  const fg = t > 0.55 ? "#fff" : "var(--text)";

  const LABELS: Record<string, string> = {
    perMcap: "Spend / market cap",
    spend: "Total spend",
    qoq: "Change vs last quarter",
    options: "Options to promoters",
    contracts: "Concurrent providers",
  };

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
    >
      <span
        className="inline-flex items-center justify-center rounded-md tabular font-extrabold text-[13px] cursor-default"
        style={{ minWidth: 42, padding: "3px 7px", background: bg, color: fg, border: "1px solid var(--border)" }}
      >
        {Math.round(score)}
      </span>
      {open && components ? (
        <span
          className="absolute z-30 left-1/2 -translate-x-1/2 mt-1.5 rounded-lg p-2.5 text-left"
          style={{
            top: "100%",
            width: 232,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          }}
        >
          <span className="block text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-mute)" }}>
            Percentile vs sector peers
          </span>
          {Object.entries(LABELS).map(([k, label]) => {
            const v = components?.[k];
            const w = weights?.[k];
            return (
              <span key={k} className="flex items-center justify-between gap-2 py-[2px]">
                <span className="text-[11.5px] truncate" style={{ color: "var(--text-soft)" }}>
                  {label}
                  {w ? <span className="ml-1 text-faint text-[10px]">×{w}</span> : null}
                </span>
                <span className="tabular text-[11.5px] font-bold" style={{ color: v == null ? "var(--text-mute)" : "var(--text)" }}>
                  {v == null ? "n/a" : Math.round(v)}
                </span>
              </span>
            );
          })}
          <span className="block mt-1.5 pt-1.5 text-[10.5px] leading-snug" style={{ borderTop: "1px solid var(--border)", color: "var(--text-mute)" }}>
            Components without data are dropped and the remaining weights rescaled.
          </span>
        </span>
      ) : null}
    </span>
  );
}
