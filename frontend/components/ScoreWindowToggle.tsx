"use client";

/**
 * Lookback-window toggle for the Insider Score board (George 2026-09-21:
 * "a toggle that shows last 90 days and then last 12 months of data … that
 * means last 12 months of insider buying vs selling, recalculating average
 * buying costs, etc applied to all relevant columns").
 *
 * The window is not a filter over one set of scores: the board is SCORED
 * twice, by the same IQS 2.0 model, over two spans of Form 4 history. So
 * switching re-ranks it and moves every windowed column with it — buyers,
 * filings, dollars bought, the average insider cost and the return against
 * that cost. The decay half-life scales with the window, so a 12-month score
 * weighs a year of evidence rather than re-reading the same 90 days.
 */

export type ScoreWindow = 90 | 365;

const OPTIONS: { value: ScoreWindow; label: string; hint: string }[] = [
  { value: 90, label: "90 days", hint: "Scores and columns from the last 90 days of filings" },
  { value: 365, label: "12 months", hint: "Rescored on the last 12 months of filings" },
];

export function ScoreWindowToggle({
  value,
  onChange,
  label = "Lookback",
}: {
  value: ScoreWindow;
  onChange: (v: ScoreWindow) => void;
  label?: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] font-bold uppercase tracking-wider" style={{ color: "var(--text-mute)" }}>
        {label}
      </span>
      <div
        className="inline-flex items-center gap-1 rounded-lg p-1"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
        role="group"
        aria-label="Insider Score lookback window"
      >
        {OPTIONS.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              title={opt.hint}
              aria-pressed={active}
              onClick={() => onChange(opt.value)}
              className="px-3 py-1.5 rounded-md text-[13px] font-semibold transition"
              style={{
                background: active ? "var(--accent)" : "transparent",
                color: active ? "#fff" : "var(--text)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
