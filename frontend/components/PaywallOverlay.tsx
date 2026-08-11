"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { usePremium } from "./premium/PremiumContext";

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
 */
export function PaywallOverlay({
  children,
  title = "Upgrade to Premium",
  subtitle = "Unlock the full breakdown for this company",
  bullets = [
    "Full financials, forecasts and ownership data",
    "Every insider filing the moment it hits EDGAR",
    "Institutional 13F positioning and whale activity",
    "Congress trades, lobbying and government contracts",
  ],
  cta = "Sign Up Today",
  href = "/premium",
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
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-1) 60%, transparent) 0%, color-mix(in srgb, var(--bg-1) 94%, transparent) 45%, var(--bg-1) 100%)",
        }}
      >
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
          {title}
        </h2>
        <p className="text-mute text-[14px] mt-1.5">{subtitle}</p>

        <ul className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-left text-[14px] text-mute max-w-[560px]">
          {bullets.map((b) => (
            <li key={b} className="flex gap-2">
              <span style={{ color: "var(--accent)" }}>•</span>
              <span>{b}</span>
            </li>
          ))}
        </ul>

        <Link
          href={href}
          className="inline-flex items-center justify-center mt-6 px-6 py-2.5 rounded-lg font-bold text-[14px]"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {cta}
        </Link>
      </div>
    </div>
  );
}
