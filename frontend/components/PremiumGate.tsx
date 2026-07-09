"use client";
import Link from "next/link";
import { Lock, Sparkles } from "lucide-react";
import { PREMIUM_UNLOCKED } from "@/lib/premium";

interface Props {
  children: React.ReactNode;
  label?: string;
  count?: number;
  cta?: string;
  compact?: boolean;
}

export function PremiumGate({
  children,
  label = "picks",
  count = 3,
  cta = "Unlock top picks",
  compact = false,
}: Props) {
  // Testing/unlocked mode — render the real content with no blur or overlay.
  if (PREMIUM_UNLOCKED) return <>{children}</>;
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
        className="absolute inset-0 flex flex-col items-center justify-center text-center px-6"
        style={{
          background:
            "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 55%, transparent) 0%, color-mix(in srgb, var(--bg-2) 90%, transparent) 100%)",
          backdropFilter: "blur(2px)",
        }}
      >
        <div
          className={`inline-flex rounded-xl items-center justify-center ${
            compact ? "h-8 w-8 mb-2" : "h-11 w-11 mb-3"
          }`}
          style={{
            background: "linear-gradient(135deg, var(--premium), var(--premium-strong))",
            boxShadow: "0 6px 18px rgba(56,189,248,0.3)",
          }}
        >
          <Sparkles className={compact ? "h-3.5 w-3.5 text-white" : "h-5 w-5 text-white"} />
        </div>
        <div className={`font-bold ${compact ? "text-[12px]" : "text-[14px]"} mb-0.5`}>
          Top {count} {label} are premium
        </div>
        <div
          className={`text-mute mb-3 max-w-[280px] ${
            compact ? "text-[10px]" : "text-[12px]"
          }`}
        >
          Unlock the highest-ranked signals first.
        </div>
        <Link
          href="/premium"
          className="btn-primary inline-flex items-center gap-1.5"
          style={{ padding: compact ? "6px 12px" : "8px 16px", fontSize: compact ? 12 : 13 }}
        >
          <Lock className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
          {cta}
        </Link>
      </div>
    </div>
  );
}
