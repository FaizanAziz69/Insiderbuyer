"use client";
import { useState } from "react";

/**
 * The Congress Trade Score badge — Brief v5 §3.
 *
 * §3: "The CTS measures documented proximity between disclosed facts. It is
 * explicitly NOT a corruption probability, and no surface may describe it as
 * one." A red-to-green ramp would describe it as one without a word of copy,
 * so the badge is a single neutral hue whose weight tracks the percentile and
 * whose breakdown names each factor in plain language.
 */
const LABELS: Record<string, string> = {
  committeeRole: "Committee role",
  timing: "Trade vs. award timing",
  positionSize: "Position size",
  awardMateriality: "Award materiality",
};

export function CtsScoreCell({
  score,
  components,
  weights,
}: {
  score: number | null;
  components?: Record<string, number | null> | null;
  weights?: Record<string, number> | null;
}) {
  const [open, setOpen] = useState(false);
  if (score == null) return <span className="text-faint text-[11px]">—</span>;

  const t = Math.max(0, Math.min(100, score)) / 100;
  const bg = `color-mix(in srgb, var(--accent) ${Math.round(58 + t * 42)}%, var(--bg-elevated))`;

  return (
    <span
      className="relative inline-block"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={() => setOpen((v) => !v)}
    >
      <span
        className="inline-flex items-center justify-center rounded-md tabular font-extrabold text-[13px] cursor-default"
        style={{ minWidth: 42, padding: "3px 7px", background: bg, color: "var(--on-accent)", border: "1px solid var(--border)" }}
      >
        {Math.round(score)}
      </span>
      {open && components ? (
        <span
          className="absolute z-30 left-1/2 -translate-x-1/2 mt-1.5 rounded-lg p-2.5 text-left"
          style={{
            top: "100%", width: 250, background: "var(--bg-elevated)",
            border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,.18)",
          }}
        >
          <span className="block text-[10.5px] font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--text-mute)" }}>
            How this score is made up
          </span>
          {Object.entries(LABELS).map(([k, label]) => {
            const v = components?.[k];
            const w = weights?.[k];
            return (
              <span key={k} className="flex items-center justify-between gap-2 py-[2px]">
                <span className="text-[11.5px] truncate" style={{ color: "var(--text-soft)" }}>
                  {label}
                  {w ? <span className="ml-1 text-faint text-[10px]">{w}%</span> : null}
                </span>
                <span className="tabular text-[11.5px] font-bold" style={{ color: v == null ? "var(--text-mute)" : "var(--text)" }}>
                  {v == null ? "n/a" : Math.round(v)}
                </span>
              </span>
            );
          })}
          <span className="block mt-1.5 pt-1.5 text-[10.5px] leading-snug" style={{ borderTop: "1px solid var(--border)", color: "var(--text-mute)" }}>
            A measure of how close these public records sit to one another. Not an allegation of wrongdoing.
          </span>
        </span>
      ) : null}
    </span>
  );
}
