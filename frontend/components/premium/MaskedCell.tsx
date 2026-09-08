"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { PRODUCT_NAME } from "./PaywallCta";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

/**
 * Blurred DECOY for a paygated table cell whose real content is text (a
 * ticker, a company, an insider, a sector name) rather than a number.
 *
 * STRICT enforcement, same rule as PremiumValue/ScoreGate: the caller passes a
 * fixed decoy as children — never the real value, not even blurred, because a
 * CSS blur leaves the text in the DOM for view-source. The whole cell links to
 * the subscribe page; `lock` overlays the gold lock glyph.
 *
 * The caller decides the lock state (usually `!usePremium().unlocked`) so the
 * unlocked branch can render the real, interactive cell.
 */
export function MaskedCell({
  children,
  label,
  lock = false,
  className = "",
}: {
  children: React.ReactNode;
  /** What the unlock offers, e.g. "sector names" or "insider names". */
  label: string;
  lock?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={SUBSCRIBE_HREF}
      aria-label={`Unlock ${label}`}
      title={`Unlock ${label} — included with ${PRODUCT_NAME}`}
      className={`relative block ${className}`}
    >
      <span
        aria-hidden
        className="block select-none pointer-events-none"
        style={{ filter: "blur(5px)" }}
      >
        {children}
      </span>
      <span className="sr-only">
        {label} — included with {PRODUCT_NAME}
      </span>
      {lock && (
        <span className="absolute inset-0 flex items-center justify-center">
          <Lock className="h-3.5 w-3.5" style={{ color: "var(--premium)" }} />
        </span>
      )}
    </Link>
  );
}
