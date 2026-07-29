"use client";
import Link from "next/link";
import { Lock, X } from "lucide-react";
import { usePremium } from "./premium/PremiumContext";

/**
 * Insider Score paygate for stock profiles (client spec): score content is
 * blurred with an Unlock CTA pointing at the sales page. Purely visual until
 * Stripe lands.
 * TODO: Stripe paywall — replace the always-locked state with a real
 * entitlement check once Stripe keys are provided.
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
  const { unlocked, unlock } = usePremium();
  if (unlocked) return <>{children}</>;
  return (
    <div className="relative rounded-lg overflow-hidden">
      <div style={{ filter: "blur(7px)" }} className="select-none pointer-events-none" aria-hidden>
        {children}
      </div>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 45%, transparent) 0%, color-mix(in srgb, var(--bg-2) 82%, transparent) 100%)",
        }}
      >
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
        <span
          className={`inline-flex rounded-xl items-center justify-center ${compact ? "h-8 w-8 mb-1.5" : "h-11 w-11 mb-3"}`}
          style={{
            background: "linear-gradient(135deg, var(--premium), var(--premium-strong))",
            boxShadow: "0 6px 18px rgba(56,189,248,0.3)",
          }}
        >
          <Lock className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} style={{ color: "var(--premium-ink)" }} />
        </span>
        {!compact && (
          <div className="font-bold text-[14px] mb-0.5">The {label} is a premium feature</div>
        )}
        <Link
          href="/premium"
          className="btn-primary inline-flex items-center gap-1.5"
          style={{ padding: compact ? "6px 14px" : "9px 18px", fontSize: compact ? 12 : 13.5 }}
        >
          <Lock className="h-3.5 w-3.5" />
          Unlock the {label}
        </Link>
      </div>
    </div>
  );
}
