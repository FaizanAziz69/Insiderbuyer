"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { usePremium } from "./PremiumContext";
import { PRODUCT_NAME, UnlockButton } from "./PaywallCta";

/**
 * Gates a single premium value in place — an Insider Score, a potential-upside
 * figure, a top-stocks score — while keeping the column and its header visible
 * so visitors can see the data exists.
 *
 * STRICT enforcement (client spec): when locked, the real value is NEVER
 * rendered — not even blurred. A CSS blur keeps the number in the DOM where
 * view-source/devtools reads it, which leaks paid data. Instead a decoy
 * placeholder is blurred, and the lock links to the subscribe page. The old
 * "×" session bypass (pre-Stripe stopgap) is gone — checkout is live.
 *
 * A table cell is far too small for the shared <PaywallCta> panel, so this one
 * keeps its own inline lock — but it borrows the shared product name, and its
 * sibling banner below borrows the shared unlock button.
 */
export function PremiumValue({
  children,
  label = "Insider Score",
}: {
  children: React.ReactNode;
  /** What the unlock CTA offers, e.g. "Insider Score". */
  label?: string;
}) {
  const { unlocked } = usePremium();
  if (unlocked) return <>{children}</>;
  return (
    <span
      className="relative inline-flex items-center justify-center"
      title={`Unlock ${label}`}
    >
      {/* Decoy stand-in — the real value stays server/side-channel free. */}
      <span
        aria-hidden
        className="select-none pointer-events-none tabular font-bold"
        style={{ filter: "blur(5px)" }}
      >
        88
      </span>
      <span className="sr-only">{label} — included with {PRODUCT_NAME}</span>
      <Link
        href="/premium"
        aria-label={`Unlock ${label}`}
        className="absolute inset-0 flex items-center justify-center"
      >
        <Lock className="h-3.5 w-3.5" style={{ color: "var(--premium)" }} />
      </Link>
    </span>
  );
}

/**
 * Section-level banner for a gated block that has no rows to blur (or where a
 * blurred block needs an explicit call to action underneath). Renders the
 * site's one unlock button so it can never drift from the walls.
 */
export function UnlockCta({
  label = "Insider Score",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  const { unlocked } = usePremium();
  if (unlocked) return null;
  return (
    <UnlockButton compact className={className}>
      Unlock {label}
    </UnlockButton>
  );
}
