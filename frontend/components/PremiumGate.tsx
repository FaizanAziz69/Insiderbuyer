"use client";
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
  // A live subscription (or the test env switch) is the only thing that renders
  // the real content — there is no in-session dismissal any more.
  const { unlocked } = usePremium();
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
        {/* No dismissal control: this wall is only lifted by a real
            entitlement from /billing/status. The old cross called unlock() and
            opened the gated rows to anyone who clicked it. */}
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
