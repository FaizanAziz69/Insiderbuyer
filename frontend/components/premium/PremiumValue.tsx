"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { usePremium } from "./PremiumContext";

/**
 * Blurs a single premium value in place — an Insider Score, a potential-upside
 * figure, a top-stocks score — while keeping the column and its header visible
 * so visitors can see the data exists. Used on the stock lists that aren't full
 * freemium leaderboards; those use PaywallOverlay / PremiumRowWall instead.
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
      <span
        aria-hidden
        className="select-none pointer-events-none"
        style={{ filter: "blur(5px)" }}
      >
        {children}
      </span>
      <span className="sr-only">{label} — premium</span>
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
 * blurred block needs an explicit call to action underneath).
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
    <Link
      href="/premium"
      className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg font-bold text-[13px] ${className}`}
      style={{ background: "var(--accent)", color: "#fff" }}
    >
      <Lock className="h-3.5 w-3.5" />
      Unlock {label}
    </Link>
  );
}
