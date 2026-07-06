"use client";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export type Tier = "Bullish" | "Neutral" | "Bearish";

// The Insider Score is a 0–100 composite. We translate it into a directional
// signal: Bullish (green) for strong insider buying, Neutral (yellow) in the
// middle, Bearish (red) when the signal is weak.
export function tierFor(iqs: number): Tier {
  if (iqs >= 55) return "Bullish";
  if (iqs >= 40) return "Neutral";
  return "Bearish";
}

const STYLE: Record<Tier, { bg: string; fg: string; icon: any }> = {
  Bullish: {
    bg: "var(--good)",
    fg: "#ffffff",
    icon: TrendingUp,
  },
  Neutral: {
    bg: "var(--gold)",
    fg: "#3b2300",
    icon: Minus,
  },
  Bearish: {
    bg: "var(--bad)",
    fg: "#ffffff",
    icon: TrendingDown,
  },
};

export function TierBadge({
  iqs,
  size = "sm",
  showLabel = true,
}: {
  iqs: number;
  size?: "sm" | "md";
  showLabel?: boolean;
}) {
  const tier = tierFor(iqs);
  const s = STYLE[tier];
  const Icon = s.icon;
  const dims =
    size === "md" ? "h-7 px-2.5 text-[12px]" : "h-5 px-2 text-[10px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      className={`inline-flex items-center gap-1 ${dims} rounded-full font-semibold uppercase tracking-wide`}
      style={{ background: s.bg, color: s.fg }}
      title={`${tier} · Insider Score ${iqs.toFixed(1)}/100`}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{tier}</span>}
    </span>
  );
}
