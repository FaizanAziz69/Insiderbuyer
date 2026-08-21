"use client";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";

/**
 * Shown when an already-subscribed member hits a Stripe checkout trigger —
 * instead of a redundant checkout (or the old static green banner on
 * /premium), a celebratory "you're already in" moment.
 *
 * Portalled to <body>, so on /premium it escapes the page's light-pinned
 * `.sub3` token scope and picks up the SITE theme tokens — it follows
 * dark/light automatically everywhere.
 */
export function AlreadySubscribedModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !open) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label="You are already subscribed"
      onClick={onClose}
      style={{
        background: "color-mix(in srgb, var(--brand-surface, #0a1626) 55%, transparent)",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        animation: "asub-fade .18s ease-out",
      }}
    >
      <style>{`
        @keyframes asub-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes asub-pop {
          from { opacity: 0; transform: translateY(14px) scale(.96) }
          to   { opacity: 1; transform: translateY(0) scale(1) }
        }
        @keyframes asub-float {
          0%,100% { transform: translateY(0) }
          50%     { transform: translateY(-6px) }
        }
        @media (prefers-reduced-motion: reduce) {
          .asub-card, .asub-emoji { animation: none !important }
        }
      `}</style>

      {/* Gradient shell — a 1px conic ring around the card reads as a subtle
          neon edge in dark mode and a crisp accent ring in light. */}
      <div
        className="asub-card relative w-full max-w-[420px] rounded-2xl p-[1.5px]"
        onClick={(e) => e.stopPropagation()}
        style={{
          background:
            "linear-gradient(135deg, var(--accent) 0%, color-mix(in srgb, var(--premium, #4aa8ff) 80%, var(--accent)) 45%, var(--good) 100%)",
          boxShadow:
            "0 24px 80px rgba(0,0,0,.35), 0 0 46px color-mix(in srgb, var(--accent) 28%, transparent)",
          animation: "asub-pop .28s cubic-bezier(.21,1.02,.55,1.01)",
        }}
      >
        <div
          className="relative rounded-2xl px-7 pt-9 pb-7 text-center overflow-hidden"
          style={{ background: "var(--bg-1)", color: "var(--text)" }}
        >
          {/* soft radial glow behind the emoji */}
          <div
            aria-hidden
            className="absolute inset-x-0 -top-16 h-48 pointer-events-none"
            style={{
              background:
                "radial-gradient(closest-side, color-mix(in srgb, var(--accent) 22%, transparent), transparent 75%)",
            }}
          />

          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="absolute top-3 right-3 h-8 w-8 rounded-full flex items-center justify-center transition hover:opacity-70"
            style={{ color: "var(--text-mute)", background: "var(--bg-3)" }}
          >
            <X className="h-4 w-4" />
          </button>

          <div
            className="asub-emoji text-[44px] leading-none select-none"
            style={{ animation: "asub-float 3.2s ease-in-out infinite" }}
          >
            🎉
          </div>

          <h2
            className="mt-3 text-[26px] font-extrabold tracking-tight"
            style={{ letterSpacing: "-0.5px" }}
          >
            Thank you!
          </h2>

          <div
            className="mt-2 inline-flex items-center gap-1.5 text-[10.5px] uppercase tracking-[0.16em] font-bold px-2.5 py-1 rounded-full"
            style={{
              color: "var(--good)",
              background: "var(--good-soft, color-mix(in srgb, var(--good) 12%, transparent))",
              border: "1px solid color-mix(in srgb, var(--good) 45%, transparent)",
            }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--good)", boxShadow: "0 0 8px var(--good)" }}
            />
            Insider Access · Active
          </div>

          <p className="mt-3 text-[14px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
            You&rsquo;re already subscribed — everything is unlocked for you,
            with real-time alerts and all special reports included. ✨
          </p>

          <Link
            href="/insiders/hot"
            onClick={onClose}
            className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-bold transition hover:opacity-90"
            style={{
              background: "linear-gradient(135deg, var(--accent), var(--accent-hover, var(--accent)))",
              color: "var(--on-accent, #fff)",
              boxShadow: "0 10px 26px color-mix(in srgb, var(--accent) 35%, transparent)",
            }}
          >
            Explore your Top Insider Scores →
          </Link>

          <button
            type="button"
            onClick={onClose}
            className="mt-2.5 w-full rounded-lg py-2.5 text-[13px] font-semibold transition hover:opacity-80"
            style={{ color: "var(--text-mute)" }}
          >
            Keep browsing
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
