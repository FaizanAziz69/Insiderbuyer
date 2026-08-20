"use client";
import { usePremium } from "./PremiumContext";
import { PaywallCta } from "./PaywallCta";

/** Rows shown free on every freemium leaderboard before the wall. */
export const FREE_ROWS = 6;

/**
 * The shared conversion wall under every partly-revealed leaderboard — Top
 * Insider Scores, Top Analyst Stocks, Top Analysts, Government Contracts,
 * Blue Sky. It owns the gating decision and the gradient band it sits in;
 * every word and pixel inside comes from <PaywallCta>, the one paywall
 * presentation shared with the overlay/value gates.
 */
export function PremiumRowWall({
  label,
  total,
  bullets,
}: {
  /** What the CTA offers, e.g. "Top Analyst Stocks" or "Insider Score". */
  label: string;
  /** Full row count, so the copy can name what's behind the wall. */
  total?: number;
  bullets?: string[];
}) {
  const { unlocked } = usePremium();
  if (unlocked) return null;

  return (
    <div
      className="relative px-6 py-10 overflow-hidden"
      style={{
        borderTop: "1px solid var(--border)",
        background:
          "linear-gradient(180deg, var(--bg-2) 0%, color-mix(in srgb, var(--premium) 6%, var(--bg-2)) 100%)",
      }}
    >
      <PaywallCta
        size="lg"
        // Client 2026-08-21: the "You're seeing X of Y ranked names" line is
        // gone — one generic subtitle regardless of row counts.
        subtitle={`The strongest ${label.toLowerCase()} signals sit behind this wall.`}
        bullets={bullets}
      />
    </div>
  );
}
