"use client";
import { usePremium } from "./premium/PremiumContext";
import { PaywallCta } from "./premium/PaywallCta";

interface Props {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  bullets?: string[];
  cta?: string;
  href?: string;
  /** How much of the real content shows through the blur before it's clipped. */
  peekHeight?: number;
}

/**
 * Upgrade wall. The content behind it is height-clipped and blurred as a
 * teaser; entitlement comes from /billing/status (Stripe is live — the old
 * pre-checkout dismissal cross is gone).
 *
 * Everything the visitor reads is <PaywallCta>, the one shared paywall
 * presentation — this component only owns the blurred peek and the fade.
 */
export function PaywallOverlay({
  children,
  title = "Get the insider information on this company",
  subtitle = "The full breakdown is one click away",
  bullets = [
    "Full financials, forecasts and ownership data",
    "Every insider filing the moment it hits EDGAR",
    "Institutional 13F positioning and whale activity",
    "Congress trades, lobbying and government contracts",
  ],
  cta,
  href,
  peekHeight = 560,
}: Props) {
  const { unlocked } = usePremium();
  if (unlocked) return <>{children}</>;

  return (
    <div
      className="relative rounded-xl overflow-hidden"
      style={{
        border: "1px solid color-mix(in srgb, var(--premium) 30%, var(--border))",
      }}
    >
      <div
        aria-hidden
        className="select-none pointer-events-none overflow-hidden"
        style={{ filter: "blur(6px)", maxHeight: peekHeight }}
      >
        {children}
      </div>

      <div
        className="absolute inset-0 flex flex-col items-center justify-center px-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-1) 60%, transparent) 0%, color-mix(in srgb, var(--bg-1) 94%, transparent) 45%, var(--bg-1) 100%)",
        }}
      >
        <PaywallCta
          size="md"
          title={title}
          subtitle={subtitle}
          bullets={bullets}
          cta={cta}
          href={href}
        />
      </div>
    </div>
  );
}
