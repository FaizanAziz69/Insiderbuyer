"use client";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import { usePremium } from "./PremiumContext";

/** Rows shown free on every freemium leaderboard before the wall. */
export const FREE_ROWS = 6;

/**
 * The shared freemium wall that sits under a partly-revealed leaderboard —
 * Top Insider Scores, Top Stocks, Top Analysts, Top Insiders, Top Congress
 * Buying all use this so the five interfaces look and behave identically.
 *
 * The cross opens the page for the current view only (nothing is persisted, so
 * a refresh restores the wall). Once Stripe is live, drop the cross and send
 * the CTA to checkout.
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
  const { unlocked, unlock } = usePremium();
  if (unlocked) return null;

  const items =
    bullets ??
    [
      "The full ranked list, not just the preview",
      "Insider Scores on every name",
      "Potential upside and analyst targets",
      "Every new filing the moment it lands",
    ];

  return (
    <div
      className="relative px-6 py-10 text-center"
      style={{ background: "var(--bg-2)", borderTop: "1px solid var(--border)" }}
    >
      <button
        onClick={unlock}
        aria-label="Close"
        className="absolute top-3 right-3 inline-flex items-center justify-center h-8 w-8 rounded-full"
        style={{
          background: "var(--bg-3)",
          border: "1px solid var(--border-strong)",
          color: "var(--text-soft)",
        }}
      >
        <X className="h-4 w-4" />
      </button>

      <div
        className="inline-flex items-center justify-center h-11 w-11 rounded-xl mb-3"
        style={{
          background: "color-mix(in srgb, var(--premium) 18%, transparent)",
          color: "var(--premium)",
        }}
      >
        <Lock className="h-5 w-5" />
      </div>

      <h2 className="text-[22px] font-bold" style={{ color: "var(--text)" }}>
        Unlock {label}
      </h2>
      <p className="text-mute text-[14px] mt-1.5">
        {total
          ? `You're seeing ${FREE_ROWS} of ${total} ranked rows`
          : "You're seeing a preview of the full ranking"}
      </p>

      <div className="mt-5 flex justify-center">
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-left text-[14px] text-mute max-w-[560px]">
          {items.map((b) => (
            <li key={b} className="flex gap-2">
              <span style={{ color: "var(--accent)" }}>•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>
      </div>

      <Link
        href="/premium"
        className="inline-flex items-center gap-1.5 justify-center mt-7 px-6 py-2.5 rounded-lg font-bold text-[14px]"
        style={{ background: "var(--accent)", color: "#fff" }}
      >
        <Lock className="h-4 w-4" />
        Unlock {label}
      </Link>
    </div>
  );
}
