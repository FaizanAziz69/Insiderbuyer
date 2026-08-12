"use client";
import { X } from "lucide-react";
import { usePremium } from "./premium/PremiumContext";
import { PaywallCta } from "./premium/PaywallCta";

interface Props {
  children: React.ReactNode;
  label?: string;
  count?: number;
  cta?: string;
  compact?: boolean;
}

/**
 * Blur-and-sell gate for a short block of top-ranked rows. Behaviour (the blur,
 * the session dismissal) lives here; every word and pixel the visitor reads is
 * <PaywallCta>, the one shared paywall presentation.
 */
export function PremiumGate({
  children,
  label = "picks",
  count = 3,
  cta,
  compact = false,
}: Props) {
  // Unlocked (either by the env switch or by dismissing a wall in this view) —
  // render the real content with no blur or overlay.
  const { unlocked, unlock } = usePremium();
  if (unlocked) return <>{children}</>;
  return (
    <div
      className="relative rounded-lg overflow-hidden"
      style={{
        border: "1px solid color-mix(in srgb, var(--premium) 30%, var(--border))",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--premium) 8%, var(--bg-2)) 0%, var(--bg-2) 100%)",
      }}
    >
      <div style={{ filter: "blur(5px)" }} className="select-none pointer-events-none" aria-hidden>
        {children}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 55%, transparent) 0%, color-mix(in srgb, var(--bg-2) 90%, transparent) 100%)",
          backdropFilter: "blur(2px)",
        }}
      >
        {/* Temporary bypass while Stripe is pending — remove with the cross on
            every other wall once checkout is live. */}
        <button
          onClick={unlock}
          aria-label="Close"
          className="absolute top-2 right-2 inline-flex items-center justify-center h-7 w-7 rounded-full"
          style={{
            background: "var(--bg-3)",
            border: "1px solid var(--border-strong)",
            color: "var(--text-soft)",
          }}
        >
          <X className="h-3.5 w-3.5" />
        </button>
        <PaywallCta
          size={compact ? "sm" : "md"}
          title={`See the top ${count} ${label}`}
          subtitle="The highest-ranked signals unlock first — these are the names the wall is hiding."
          bullets={compact ? [] : undefined}
          cta={cta}
        />
      </div>
    </div>
  );
}
