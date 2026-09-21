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
  ctaHref,
  ctaLabel,
  forceShow = false,
}: {
  /** What the CTA offers, e.g. "Top Analyst Stocks" or "Insider Score". */
  label: string;
  /** Full row count, so the copy can name what's behind the wall. */
  total?: number;
  bullets?: string[];
  /** Send the reader somewhere other than the subscribe page — the B2B
   *  promoter datasets point at their Request Access form, because no
   *  subscription opens them (George 2026-09-21). */
  ctaHref?: string;
  ctaLabel?: string;
  /** Render even for a subscriber: the caller owns the lock, not `premium`. */
  forceShow?: boolean;
}) {
  const { unlocked } = usePremium();
  if (unlocked && !forceShow) return null;

  return (
    <div
      className="relative px-6 py-10 overflow-hidden"
      style={{
        borderTop: "1px solid var(--border)",
        background:
          "linear-gradient(180deg, var(--bg-2) 0%, color-mix(in srgb, var(--premium) 6%, var(--bg-2)) 100%)",
      }}
    >
      {ctaHref ? (
        <div className="text-center">
          <div className="text-[17px] font-bold" style={{ color: "var(--text)" }}>
            {label} is available on request
          </div>
          <p className="text-[13px] mt-1.5 max-w-[520px] mx-auto" style={{ color: "var(--text-mute)" }}>
            This dataset is not part of a subscription. Tell us who you are and we will review your request.
          </p>
          <a
            href={ctaHref}
            className="inline-flex items-center justify-center h-11 px-6 rounded-md text-[14px] font-extrabold mt-4"
            style={{ background: "var(--accent)", color: "#fff" }}
          >
            {ctaLabel || "Request access"}
          </a>
        </div>
      ) : (
      <PaywallCta
        size="lg"
        // Client 2026-08-21: the "You're seeing X of Y ranked names" line is
        // gone — one generic subtitle regardless of row counts. Reworded same
        // day per client: lead with "not every insider is worth following".
        subtitle="Not every insider is worth following — unlock the signals that show which ones are."
        bullets={bullets}
      />
      )}
    </div>
  );
}
