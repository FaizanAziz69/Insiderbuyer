"use client";

/**
 * Trade Grade and Signal Badge presentation (follow-up IQS 2.0 brief).
 *
 * Letters only, never the 0–100 underneath: a number here would be read as the
 * company Insider Score, which is a different measurement of a different
 * thing. The raw score stays in the API and the explainer.
 */
export type TradeGradeLetter = "A+" | "A" | "B" | "C" | "D" | "F";

const GRADE_COLOR: Record<TradeGradeLetter, { bg: string; fg: string }> = {
  "A+": { bg: "var(--good)", fg: "#fff" },
  A: { bg: "color-mix(in srgb, var(--good) 80%, var(--bg-1))", fg: "#fff" },
  B: { bg: "var(--gold)", fg: "#3b2300" },
  C: { bg: "color-mix(in srgb, var(--gold) 55%, var(--bg-2))", fg: "var(--text)" },
  D: { bg: "color-mix(in srgb, var(--bad) 45%, var(--bg-2))", fg: "var(--text)" },
  F: { bg: "var(--bad)", fg: "#fff" },
};

export function TradeGradeChip({
  grade,
  size = "md",
}: {
  grade: TradeGradeLetter | string | null;
  size?: "sm" | "md";
}) {
  if (!grade) return <span className="text-faint text-[12px]">—</span>;
  const c = GRADE_COLOR[grade as TradeGradeLetter] ?? {
    bg: "var(--bg-3)",
    fg: "var(--text)",
  };
  const dims = size === "sm" ? "h-5 min-w-[24px] text-[11px]" : "h-7 min-w-[32px] text-[13.5px]";
  return (
    <span
      className={`inline-flex items-center justify-center ${dims} px-1.5 rounded-md font-extrabold tabular`}
      style={{ background: c.bg, color: c.fg }}
      title={`Trade Grade ${grade}`}
    >
      {grade}
    </span>
  );
}

/** Label and styling per badge key. Mirrors backend/src/iqs2/trade-grade.ts. */
export const BADGE_META: Record<string, { label: string; warning?: true }> = {
  CLUSTER_BUY: { label: "Cluster Buy" },
  FIRST_BUY: { label: "First Buy" },
  STAKE_DOUBLER: { label: "Stake Doubler" },
  CFO_BUY: { label: "CFO Buy" },
  CEO_BUY: { label: "CEO Buy" },
  EXEC_BUY: { label: "Exec Buy" },
  BIG_BUY: { label: "Big Buy" },
  BUYING_WEAKNESS: { label: "Buying Weakness" },
  DILUTION_FLAG: { label: "Dilution", warning: true },
};

/** Display order for positives; warnings are appended and never truncated. */
const PRIORITY = [
  "CLUSTER_BUY",
  "FIRST_BUY",
  "STAKE_DOUBLER",
  "CFO_BUY",
  "CEO_BUY",
  "EXEC_BUY",
  "BIG_BUY",
  "BUYING_WEAKNESS",
];

export function BadgeRow({ badges, max = 3 }: { badges?: string[] | null; max?: number }) {
  const all = badges || [];
  // The cap applies to positives only — a dilution warning beside a high grade
  // is the whole point of having it, so it is never crowded out.
  const positives = all
    .filter((b) => !BADGE_META[b]?.warning)
    .sort((a, b) => PRIORITY.indexOf(a) - PRIORITY.indexOf(b))
    .slice(0, max);
  const warnings = all.filter((b) => BADGE_META[b]?.warning);
  const shown = [...positives, ...warnings];
  if (!shown.length) return null;
  return (
    <span className="inline-flex flex-wrap gap-1">
      {shown.map((b) => {
        const meta = BADGE_META[b] || { label: b };
        return (
          <span
            key={b}
            className="inline-flex items-center h-5 px-1.5 rounded text-[10.5px] font-bold uppercase tracking-wide whitespace-nowrap"
            style={
              meta.warning
                ? { background: "color-mix(in srgb, var(--bad) 16%, transparent)", color: "var(--bad)" }
                : { background: "var(--bg-3)", color: "var(--text-mute)" }
            }
          >
            {meta.label}
          </span>
        );
      })}
    </span>
  );
}

/** Required wherever a grade is shown. */
export const TRADE_GRADE_DISCLAIMER =
  "The Trade Grade measures characteristics of the filing — size, role, pattern and timing. It is not a prediction, a rating, or a recommendation.";
