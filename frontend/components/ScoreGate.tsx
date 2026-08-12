"use client";
import { usePremium } from "./premium/PremiumContext";
import { PaywallCta } from "./premium/PaywallCta";

/**
 * Insider Score paygate for stock profiles and article score cards.
 *
 * STRICT enforcement (client spec): when locked, the real children are NEVER
 * rendered — a CSS blur would keep the paid numbers in the DOM where
 * view-source/devtools reads them. A skeleton decoy stands in behind the
 * unlock overlay instead. The old "×" session bypass (pre-Stripe stopgap) is
 * removed — checkout is live, entitlement comes from /billing/status.
 *
 * The overlay itself is <PaywallCta>, the one shared paywall presentation.
 */
export function ScoreGate({
  children,
  label = "Insider Score",
  compact = false,
}: {
  children: React.ReactNode;
  label?: string;
  compact?: boolean;
}) {
  const { unlocked } = usePremium();
  if (unlocked) return <>{children}</>;
  return (
    <div className="relative rounded-lg overflow-hidden">
      {/* Decoy skeleton — same footprint, zero real data in the DOM. */}
      <div
        className="select-none pointer-events-none space-y-2.5 p-4"
        style={{ filter: "blur(6px)" }}
        aria-hidden
      >
        {Array.from({ length: compact ? 2 : 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded"
            style={{
              height: 14,
              width: `${85 - i * 12}%`,
              background: "var(--bg-3)",
            }}
          />
        ))}
        <div
          className="rounded-full"
          style={{ height: compact ? 24 : 40, width: compact ? 24 : 40, background: "var(--bg-3)" }}
        />
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-4"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 45%, transparent) 0%, color-mix(in srgb, var(--bg-2) 82%, transparent) 100%)",
        }}
      >
        <PaywallCta
          size={compact ? "sm" : "md"}
          // Compact gates sit inside small cards where a headline would just
          // repeat the button — the button carries the ask on its own.
          title={compact ? "" : `See what the ${label} says about this stock`}
          subtitle={
            compact
              ? undefined
              : "The four-factor score, the pillar breakdown and the trend — unmasked."
          }
          bullets={[]}
          cta={`Unlock the ${label}`}
        />
      </div>
    </div>
  );
}
