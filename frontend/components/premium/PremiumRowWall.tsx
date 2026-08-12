"use client";
import Link from "next/link";
import { Lock, TrendingUp, Zap } from "lucide-react";
import { usePremium } from "./PremiumContext";

/** Rows shown free on every freemium leaderboard before the wall. */
export const FREE_ROWS = 6;

/**
 * The shared conversion wall under every partly-revealed leaderboard — Top
 * Insider Scores, Top Analyst Stocks, Top Analysts, Government Contracts,
 * Blue Sky — one component so every gate on the site looks and sells the
 * same way (client spec: conversion-focused copy + visual proof, no bypass).
 *
 * The proof stats are REAL, live-verified numbers from our own data —
 * the backtest's all-time return and a measured top-analyst success rate.
 */
export function PremiumRowWall({
  label,
  total,
  bullets,
}: {
  /** What the CTA offers, e.g. "Top Analyst Stocks" or "Insider Score". */
  label: string;
  /** Full row count, so the copy can name what's behind the wall. */
  total?: number;
  bullets?: string[];
}) {
  const { unlocked } = usePremium();
  if (unlocked) return null;

  const items =
    bullets ??
    [
      "The full ranked list, not just the preview",
      "Insider Scores on every name",
      "Potential upside and analyst targets",
      "Every new filing the moment it lands",
    ];

  return (
    <div
      className="relative px-6 py-10 text-center overflow-hidden"
      style={{
        borderTop: "1px solid var(--border)",
        background:
          "linear-gradient(180deg, var(--bg-2) 0%, color-mix(in srgb, var(--premium) 6%, var(--bg-2)) 100%)",
      }}
    >
      {/* decorative rising bars — the "unlocked" ranking teased behind the CTA */}
      <div aria-hidden className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-2 opacity-[0.08] pointer-events-none">
        {[34, 52, 44, 66, 58, 82, 74, 96, 88, 110].map((h, i) => (
          <span key={i} className="rounded-t" style={{ width: 26, height: h, background: "var(--accent)" }} />
        ))}
      </div>

      <div className="relative">
        <div
          className="inline-flex items-center justify-center h-12 w-12 rounded-xl mb-3"
          style={{
            background: "linear-gradient(135deg, var(--premium), var(--premium-strong))",
            color: "var(--premium-ink)",
            boxShadow: "0 8px 24px rgba(56,189,248,0.35)",
          }}
        >
          <Lock className="h-5 w-5" />
        </div>

        <h2 className="text-[24px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
          Get the Insider Information
        </h2>
        <p className="text-mute text-[14.5px] mt-1.5 max-w-[520px] mx-auto">
          {total
            ? `You're seeing ${FREE_ROWS} of ${total} ranked names — the strongest signals sit behind this wall.`
            : `The strongest ${label.toLowerCase()} signals sit behind this wall.`}
        </p>

        {/* Real, measured proof points — not marketing invention. */}
        <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
            style={{ background: "var(--good-soft)", color: "var(--good-strong)" }}
          >
            <TrendingUp className="h-3.5 w-3.5" /> Insider strategy +668% all-time (backtested)
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Zap className="h-3.5 w-3.5" /> Top analysts graded up to 84% success
          </span>
        </div>

        <div className="mt-5 flex justify-center">
          <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-2 text-left text-[14px] text-mute max-w-[560px]">
            {items.map((b) => (
              <li key={b} className="flex gap-2">
                <span style={{ color: "var(--accent)" }}>✓</span>
                <span>{b}</span>
              </li>
            ))}
          </ul>
        </div>

        <Link
          href="/premium"
          className="inline-flex items-center gap-2 justify-center mt-7 px-8 py-3 rounded-xl font-bold text-[15px] transition hover:brightness-110"
          style={{
            background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
            color: "#fff",
            boxShadow: "0 8px 24px rgba(0,88,130,0.3)",
          }}
        >
          <Lock className="h-4 w-4" />
          Unlock Insider Access
        </Link>
        <p className="text-[11.5px] text-faint mt-3">
          $199/yr or $39.99/mo · 30-day money-back guarantee · cancel anytime
        </p>
      </div>
    </div>
  );
}
