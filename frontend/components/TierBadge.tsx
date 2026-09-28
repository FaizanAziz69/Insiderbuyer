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

// Wall Street consensus tier — average analyst price target vs the last price.
// This is what the badge next to a TICKER should say (George, 2026-09-01: a
// Street favourite like NVDA must not read "Bearish" just because insiders
// aren't buying); the insider tier above stays for insider-score contexts.
//
// THE TWO TIERS DISAGREE ROUTINELY, AND THAT IS THE POINT. DKS on 2026-09-27:
// Insider Score 97.18 (six insiders, $5.09M bought) while 34 analysts averaged
// a $110 target against a $136.43 price — a -19.4% Street view. Both readings
// were correct. What was wrong was printing the bare word "BEARISH" beside the
// ticker on a card whose next row says "INSIDER SCORE 97.18": with no source
// on the badge, a reader can only conclude the page contradicts itself.
// Hence SOURCE_LABEL — every directional word on these badges names whose view
// it is. Do not render a tier without one.
export function tierFromUpside(upsidePct: number): Tier {
  if (upsidePct >= 10) return "Bullish";
  if (upsidePct > -10) return "Neutral";
  return "Bearish";
}

/** The prefix that keeps a tier from being read as the page's one verdict. */
const SOURCE_LABEL = { street: "Street", insiders: "Insiders" } as const;

/** Badge for the Street tier: same pill, tooltip explains the consensus. */
export function StreetBadge({
  upsidePct,
  avgTarget,
  size = "sm",
}: {
  upsidePct: number;
  avgTarget?: number | null;
  size?: "sm" | "md";
}) {
  const tier = tierFromUpside(upsidePct);
  const s = STYLE[tier];
  const Icon = s.icon;
  const dims =
    size === "md" ? "h-7 px-2.5 text-[12px]" : "h-5 px-2 text-[10px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  const target = avgTarget ? ` $${avgTarget.toFixed(2)} avg target,` : "";
  return (
    <span
      className={`inline-flex items-center gap-1 ${dims} rounded-full font-semibold uppercase tracking-wide whitespace-nowrap`}
      style={{ background: s.bg, color: s.fg }}
      title={`${tier} · Wall Street consensus:${target} ${upsidePct >= 0 ? "+" : ""}${upsidePct.toFixed(1)}% vs price. This is the analysts' view, not the Insider Score.`}
    >
      <Icon className={iconSize} />
      <span>
        {SOURCE_LABEL.street} {tier}
      </span>
    </span>
  );
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

/**
 * `withSource` prints "Insiders <tier>" instead of the bare tier. Pass it
 * anywhere the badge sits beside a TICKER rather than under a heading that
 * already says Insider Score — next to a ticker the bare word reads as a call
 * on the stock, which is the confusion this whole file exists to prevent.
 */
export function TierBadge({
  iqs,
  size = "sm",
  showLabel = true,
  withSource = false,
}: {
  iqs: number;
  size?: "sm" | "md";
  showLabel?: boolean;
  withSource?: boolean;
}) {
  const tier = tierFor(iqs);
  const s = STYLE[tier];
  const Icon = s.icon;
  // "Bearish" is a stock call, and a low INSIDER score is not one — insiders
  // at Street favourites sell for years while the stock runs (George,
  // 2026-09-01, NVDA). The insider badge says what it measures instead.
  const bare = tier === "Bearish" ? "Low Buying" : tier;
  const label = withSource ? `${SOURCE_LABEL.insiders} ${bare}` : bare;
  const dims =
    size === "md" ? "h-7 px-2.5 text-[12px]" : "h-5 px-2 text-[10px]";
  const iconSize = size === "md" ? "h-3.5 w-3.5" : "h-3 w-3";
  return (
    <span
      className={`inline-flex items-center gap-1 ${dims} rounded-full font-semibold uppercase tracking-wide whitespace-nowrap`}
      style={{ background: s.bg, color: s.fg }}
      title={`${tier === "Bearish" ? "Low insider buying" : tier} · Insider Score ${iqs.toFixed(1)}/100. This is the insider signal, not an analyst call.`}
    >
      <Icon className={iconSize} />
      {showLabel && <span>{label}</span>}
    </span>
  );
}
