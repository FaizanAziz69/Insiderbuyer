"use client";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export function PremiumCTA() {
  return (
    <div
      className="card p-6 sm:p-8 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 14%, var(--bg-2)) 100%)",
        borderColor: "color-mix(in srgb, var(--accent) 30%, var(--border))",
      }}
    >
      <div
        aria-hidden
        className="absolute -right-12 -top-12 h-48 w-48 rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--accent) 35%, transparent)" }}
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-6">
        <div className="flex-1">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider text-white"
               style={{ background: "var(--accent)" }}>
            <Sparkles className="h-3 w-3" />
            Premium
          </div>
          <div className="mt-3 text-xl sm:text-2xl font-bold tracking-tight">
            Get premium access
          </div>
          <div className="mt-1.5 text-sm text-soft max-w-xl">
            Unlock the screener, real-time alerts, full insider rankings, and AI-generated market
            analysis.
          </div>
        </div>
        <Link
          href="/premium"
          className="btn-primary self-start sm:self-auto whitespace-nowrap"
        >
          Explore premium
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
