"use client";
import { Award, Medal, Shield } from "lucide-react";

export type Tier = "Gold" | "Silver" | "Bronze" | "Watch";

// IQS is a 0–100 composite (six weighted components).
export function tierFor(iqs: number): Tier {
  if (iqs >= 70) return "Gold";
  if (iqs >= 55) return "Silver";
  if (iqs >= 40) return "Bronze";
  return "Watch";
}

const STYLE: Record<Tier, { bg: string; fg: string; icon: any }> = {
  Gold: {
    bg: "linear-gradient(135deg, #f59e0b, #fbbf24)",
    fg: "#3b2300",
    icon: Award,
  },
  Silver: {
    bg: "linear-gradient(135deg, #94a3b8, #cbd5e1)",
    fg: "#1f2937",
    icon: Medal,
  },
  Bronze: {
    bg: "linear-gradient(135deg, #b45309, #d97706)",
    fg: "#ffffff",
    icon: Medal,
  },
  Watch: {
    bg: "var(--bg-3)",
    fg: "var(--text-soft)",
    icon: Shield,
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
      title={`${tier} tier · IQS ${iqs.toFixed(1)}/100`}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{tier}</span>}
    </span>
  );
}
