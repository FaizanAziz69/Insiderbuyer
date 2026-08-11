"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { usePremium } from "./premium/PremiumContext";

/**
 * Insider Score paygate for stock profiles and article score cards.
 *
 * STRICT enforcement (client spec): when locked, the real children are NEVER
 * rendered — a CSS blur would keep the paid numbers in the DOM where
 * view-source/devtools reads them. A skeleton decoy stands in behind the
 * unlock overlay instead. The old "×" session bypass (pre-Stripe stopgap) is
 * removed — checkout is live, entitlement comes from /billing/status.
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
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 45%, transparent) 0%, color-mix(in srgb, var(--bg-2) 82%, transparent) 100%)",
        }}
      >
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
