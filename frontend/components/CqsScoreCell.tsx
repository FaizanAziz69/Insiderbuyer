"use client";

/**
 * Congress Quality Score in a table cell: the number with its grade badge
 * underneath, the sibling of <IqsScoreCell> so a reader learns one visual
 * language for both scores.
 *
 * Two things this has to get right:
 *
 *  - `cqs` arrives from Postgres through TypeORM, where a `numeric` column is
 *    serialised as a STRING ("63.00"). The first cut tested `typeof cqs !==
 *    "number"` and so rendered the empty state for every row of a working
 *    index. Coerce, then decide.
 *  - A missing score is a real state, not missing data — the score only exists
 *    where members are buying — so say that rather than leaving a dash.
 */

const GRADE_COLOR: Record<string, string> = {
  "A+": "var(--good)",
  A: "var(--good)",
  "B+": "var(--accent)",
  B: "var(--accent)",
  C: "var(--text-mute)",
};

export function gradeOf(cqs: number): string {
  return cqs >= 90 ? "A+" : cqs >= 80 ? "A" : cqs >= 70 ? "B+" : cqs >= 60 ? "B" : "C";
}

export function CqsGradeBadge({
  grade,
  isGoldRing = false,
  size = "sm",
}: {
  grade: string;
  isGoldRing?: boolean;
  size?: "sm" | "md";
}) {
  const dims = size === "md" ? "h-6 px-2.5 text-[11px]" : "h-[18px] px-2 text-[10px]";
  const color = GRADE_COLOR[grade] || "var(--text-mute)";
  return (
    <span
      className={`inline-flex items-center gap-1 ${dims} rounded-full font-bold uppercase tracking-wide whitespace-nowrap`}
      style={{
        color: isGoldRing ? "var(--text)" : color,
        background: isGoldRing ? "var(--gold-soft)" : "transparent",
        // The gold tier is a ring, per the brief — a border, not a fill, so it
        // reads the same on the light and the dark surface.
        border: `1px solid ${isGoldRing ? "var(--gold)" : color}`,
      }}
      title={
        isGoldRing
          ? "Gold tier: grade A or better on the Congress Quality Score."
          : `Congress Quality Score grade ${grade}.`
      }
    >
      {grade}
    </span>
  );
}

export function CqsScoreCell({
  cqs,
  grade,
  isGoldRing = false,
}: {
  cqs?: number | string | null;
  grade?: string | null;
  isGoldRing?: boolean;
}) {
  const n = cqs == null || cqs === "" ? null : Number(cqs);
  if (n == null || !Number.isFinite(n)) {
    return (
      <span
        className="text-mute text-[11px] leading-tight inline-block max-w-[100px]"
        title="No qualifying congressional purchases in the last 90 days — the Congress Quality Score only exists where members are buying."
      >
        No recent congress buying
      </span>
    );
  }
  const shown = Math.round(n);
  return (
    <span className="inline-flex flex-col items-center gap-1 leading-none">
      <span className="tabular text-[15px] font-bold" style={{ color: "var(--accent)" }}>
        {shown}
      </span>
      <CqsGradeBadge grade={grade || gradeOf(shown)} isGoldRing={isGoldRing || shown >= 80} />
    </span>
  );
}
