"use client";
import { Award, Flame, Crosshair, Layers, Timer, Medal } from "lucide-react";
import type { BadgeKey, Grade } from "./types";

/**
 * Badges are factual computations (Brief v7 §2.4): each chip names a
 * threshold the member cleared, and the tooltip says which. Gold is reserved
 * for the Gold Grade, which is what "the gold-tier visual system" keys on.
 */
const ICONS: Record<BadgeKey, typeof Award> = {
  TOP_PERFORMER: Award,
  HOT_HAND: Flame,
  SHARPSHOOTER: Crosshair,
  HIGH_VOLUME: Layers,
  FAST_FILER: Timer,
  GOLD_GRADE: Medal,
};

const FALLBACK_LABEL: Record<BadgeKey, string> = {
  TOP_PERFORMER: "Top 10 Performer",
  HOT_HAND: "Hot Hand",
  SHARPSHOOTER: "Sharpshooter",
  HIGH_VOLUME: "High Volume",
  FAST_FILER: "Fast Filer",
  GOLD_GRADE: "Gold Grade",
};

export const GOLD = "#C9A227";

export function BadgeChips({
  badges,
  meta,
  size = "sm",
  max,
}: {
  badges: BadgeKey[];
  meta?: Partial<Record<BadgeKey, { label: string; description: string }>>;
  size?: "sm" | "md";
  max?: number;
}) {
  if (!badges?.length) return null;
  const shown = max ? badges.slice(0, max) : badges;
  const more = badges.length - shown.length;
  const fs = size === "sm" ? 10.5 : 12;
  return (
    <span className="inline-flex flex-wrap gap-1 align-middle">
      {shown.map((b) => {
        const Icon = ICONS[b] || Award;
        const gold = b === "GOLD_GRADE";
        return (
          <span
            key={b}
            title={meta?.[b]?.description || FALLBACK_LABEL[b]}
            className="inline-flex items-center gap-1 rounded-full font-semibold whitespace-nowrap"
            style={{
              fontSize: fs,
              padding: size === "sm" ? "1px 7px" : "3px 9px",
              background: gold ? "rgba(201,162,39,0.16)" : "var(--bg-3)",
              color: gold ? GOLD : "var(--text-soft)",
              border: `1px solid ${gold ? "rgba(201,162,39,0.55)" : "var(--border)"}`,
            }}
          >
            <Icon style={{ width: fs + 1, height: fs + 1 }} />
            {meta?.[b]?.label || FALLBACK_LABEL[b]}
          </span>
        );
      })}
      {more > 0 ? (
        <span className="text-[10.5px] font-semibold" style={{ color: "var(--text-mute)" }}>
          +{more}
        </span>
      ) : null}
    </span>
  );
}

/** The Performance Grade letter (§4.2). A and A+ carry the gold ring. */
export function GradeChip({ grade, size = 30, building = false }: { grade: Grade | null; size?: number; building?: boolean }) {
  if (!grade) {
    return (
      <span
        className="inline-flex items-center rounded-full text-[10.5px] font-semibold px-2 py-0.5 whitespace-nowrap"
        style={{ background: "var(--bg-3)", color: "var(--text-mute)", border: "1px dashed var(--border)" }}
        title="Fewer than 20 priced trades so far. A grade needs a track record."
      >
        {building ? "Building track record" : "Ungraded"}
      </span>
    );
  }
  const gold = grade === "A+" || grade === "A";
  const mid = grade === "B+" || grade === "B";
  return (
    <span
      className="inline-flex items-center justify-center rounded-full font-extrabold tabular"
      title={`Performance Grade ${grade}, percentile-ranked against other members of Congress`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.42),
        background: gold ? GOLD : mid ? "var(--accent)" : "var(--bg-3)",
        color: gold ? "#1a1400" : mid ? "#fff" : "var(--text-soft)",
        boxShadow: gold ? `0 0 0 2px var(--bg-elevated), 0 0 0 4px ${GOLD}` : "none",
        border: gold || mid ? "none" : "1px solid var(--border)",
      }}
    >
      {grade}
    </span>
  );
}
