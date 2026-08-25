"use client";
import Link from "next/link";
import { Lock, TrendingUp, Zap } from "lucide-react";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

/**
 * ONE paywall presentation for the whole site (client spec: "a single, highly
 * aesthetic, conversion-focused paywall component used consistently across all
 * pay-gated sections").
 *
 * This file owns the LOOK and the WORDS. It owns no gating logic and reads no
 * entitlement — the behavioural gates keep that, because they differ in kind:
 *
 *   PremiumRowWall  — a wall under a partly-revealed leaderboard   (size "lg")
 *   PaywallOverlay  — a full overlay on a height-clipped block     (size "md")
 *   PremiumGate     — a blurred card with an overlay panel         (size "md")
 *   ScoreGate       — a decoy skeleton with an overlay panel       (size "sm")
 *   PremiumValue    — a single masked cell, far too small for this (own inline lock)
 *
 * Each of those renders <PaywallCta> for everything the visitor actually reads,
 * so copy and styling change in one place.
 */

/** The paid product's public name. One constant so the ~dozen surfaces that
 *  sell it can never drift apart again. */
export const PRODUCT_NAME = "Insider Access";

/** Mirrors the /premium checkout exactly — there is no free trial, only the
 *  money-back window, so the copy must not promise one. */
export const PRICING_LINE =
  "$199/yr or $39.99/mo · 30-day money-back guarantee · cancel anytime";

/** The one CTA verb, everywhere. */
export const UNLOCK_CTA = `Unlock ${PRODUCT_NAME}`;

/**
 * Proof points, REAL and measured from our own data — the backtest's all-time
 * return of the insider signal and the graded top-analyst success rate. Do not
 * add a stat here that the product cannot show the visitor.
 */
export const PROOF_CHIPS: { icon: typeof TrendingUp; text: string; tone: "good" | "accent" }[] = [
  { icon: TrendingUp, text: "Insider strategy +668% all-time (backtested)", tone: "good" },
  { icon: Zap, text: "Top analysts graded up to 84% success", tone: "accent" },
];

/** What every gate is actually selling, unless a call site says otherwise. */
export const DEFAULT_BULLETS = [
  "Every Insider Score, on every ticker",
  "The full ranked list, not just the preview",
  "Potential upside and analyst price targets",
  "Every new Form 4 the moment it lands",
];

/** "lg" = section wall, "md" = overlay panel, "sm" = tight in-card overlay. */
export type PaywallSize = "sm" | "md" | "lg";

/**
 * The unlock button, on its own — for the handful of surfaces that need the
 * site's one CTA without a whole panel around it (a masked cell's sibling
 * banner, a section header). Same gradient, same verb, same destination.
 */
export function UnlockButton({
  children = UNLOCK_CTA,
  href = SUBSCRIBE_HREF,
  compact = false,
  className = "",
}: {
  children?: React.ReactNode;
  href?: string;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center gap-2 justify-center rounded-xl font-bold transition hover:brightness-110 ${className}`}
      style={{
        padding: compact ? "7px 15px" : "11px 26px",
        fontSize: compact ? 12.5 : 14.5,
        background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
        color: "#fff",
        boxShadow: "0 8px 24px color-mix(in srgb, var(--accent) 32%, transparent)",
      }}
    >
      <Lock style={{ height: compact ? 13 : 16, width: compact ? 13 : 16 }} />
      {children}
    </Link>
  );
}

interface Props {
  /** Small uppercase kicker above the headline. Omit to hide. */
  eyebrow?: string;
  /** The sell. Keep it a benefit, never "Upgrade to X". Pass "" to drop the
   *  headline entirely, for gates too small to hold one. */
  title?: string;
  /** One line naming what sits behind the wall. */
  subtitle?: string;
  /** Value bullets. Pass `[]` to hide them (tight surfaces). */
  bullets?: string[];
  /** Show the measured proof chips. Defaults on at "lg" only. */
  proof?: boolean;
  /** CTA label. Defaults to the site-wide unlock verb. */
  cta?: string;
  href?: string;
  /** Show the price / guarantee line under the button. Defaults on at "lg"/"md". */
  pricing?: boolean;
  /** Decorative rising bars behind the panel. Defaults on at "lg" only. */
  bars?: boolean;
  size?: PaywallSize;
  className?: string;
}

/** Panel scale only — the CTA button is deliberately ONE size (two, counting
 *  the compact variant) so the same button reads the same everywhere. */
const SIZES = {
  sm: { icon: 32, iconGlyph: 14, title: 13.5, sub: 11.5 },
  md: { icon: 44, iconGlyph: 20, title: 22, sub: 14 },
  lg: { icon: 48, iconGlyph: 22, title: 25, sub: 15 },
} as const;

export function PaywallCta({
  eyebrow,
  title = `Get Insider Intel`,
  subtitle,
  bullets,
  proof,
  cta = UNLOCK_CTA,
  href = SUBSCRIBE_HREF,
  pricing,
  bars,
  size = "md",
  className = "",
}: Props) {
  const s = SIZES[size];
  const showProof = proof ?? size === "lg";
  const showPricing = pricing ?? size !== "sm";
  const showBars = bars ?? size === "lg";
  const items = bullets ?? (size === "sm" ? [] : DEFAULT_BULLETS);

  return (
    <div className={`relative text-center ${className}`}>
      {/* Decorative rising bars — the ranking the visitor can't see yet. */}
      {showBars && (
        <div
          aria-hidden
          className="absolute inset-x-0 bottom-0 flex items-end justify-center gap-2 opacity-[0.08] pointer-events-none"
        >
          {[34, 52, 44, 66, 58, 82, 74, 96, 88, 110].map((h, i) => (
            <span
              key={i}
              className="rounded-t"
              style={{ width: 26, height: h, background: "var(--accent)" }}
            />
          ))}
        </div>
      )}

      <div className="relative">
        {eyebrow && (
          <div
            className="text-[10.5px] font-bold uppercase tracking-[0.18em] mb-2"
            style={{ color: "var(--premium-strong)" }}
          >
            {eyebrow}
          </div>
        )}

        <span
          className="inline-flex items-center justify-center rounded-xl"
          style={{
            height: s.icon,
            width: s.icon,
            marginBottom: size === "sm" ? 6 : 12,
            background: "linear-gradient(135deg, var(--premium), var(--premium-strong))",
            color: "var(--premium-ink)",
            boxShadow: "0 8px 24px rgba(56,189,248,0.35)",
          }}
        >
          <Lock style={{ height: s.iconGlyph, width: s.iconGlyph }} />
        </span>

        {title && (
          <h2
            className="font-bold tracking-tight"
            style={{ fontSize: s.title, lineHeight: 1.2, color: "var(--text)" }}
          >
            {title}
          </h2>
        )}
        {subtitle && (
          <p
            className="text-mute mx-auto"
            style={{ fontSize: s.sub, marginTop: 6, maxWidth: size === "sm" ? 260 : 520 }}
          >
            {subtitle}
          </p>
        )}

        {showProof && (
          <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
            {PROOF_CHIPS.map((c) => {
              const Icon = c.icon;
              return (
                <span
                  key={c.text}
                  className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold"
                  style={
                    c.tone === "good"
                      ? { background: "var(--good-soft)", color: "var(--good-strong)" }
                      : { background: "var(--accent-soft)", color: "var(--accent)" }
                  }
                >
                  <Icon className="h-3.5 w-3.5" /> {c.text}
                </span>
              );
            })}
          </div>
        )}

        {items.length > 0 && (
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
        )}

        <div style={{ marginTop: size === "sm" ? 10 : 26 }}>
          <UnlockButton href={href} compact={size === "sm"}>
            {cta}
          </UnlockButton>
        </div>

        {showPricing && (
          <p className="text-[11.5px] text-faint mt-3">{PRICING_LINE}</p>
        )}
      </div>
    </div>
  );
}
