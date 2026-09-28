"use client";
import { Minus, TrendingDown, TrendingUp } from "lucide-react";

export type Tier = "Bullish" | "Neutral" | "Bearish";

// The Insider Score is a 0–100 composite, and it is the ONLY thing that sets
// the direction shown anywhere on the site. We translate it into a directional
// signal: Bullish (green) for strong insider buying, Neutral (yellow) in the
// middle, Bearish (red) when the signal is weak.
//
// There used to be a second tier here — Wall Street consensus, from the
// analyst average target against the price — and a badge that rendered it
// beside the ticker. It is gone on Faizan's instruction (2026-09-28): one
// direction per stock, taken from insiders, because two badges disagreeing on
// the same card ("Street Bearish" over an Insider Score of 97) reads as a page
// arguing with itself rather than as two different measurements.
//
// That also reverses the "Low Buying" wording George asked for on 2026-09-01,
// which existed to keep a low insider score from printing as a call on the
// stock. One directional word was the explicit instruction, so a weak insider
// signal now reads Bearish again. The tooltip still says what it measures.
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
  const label = tier;
  const dims =
    size === "md" ? "h-7 px-2.5 text-[12px]" : "h-5 px-2 text-[10px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      className={`inline-flex items-center gap-1 ${dims} rounded-full font-semibold uppercase tracking-wide whitespace-nowrap`}
      style={{ background: s.bg, color: s.fg }}
      title={`${tier} · Insider Score ${iqs.toFixed(1)}/100 — how strong the insider buying signal is, not an analyst price call.`}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
