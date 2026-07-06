"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowRight, TrendingDown, TrendingUp, X } from "lucide-react";
import useSWR from "swr";
import {
  API_BASE,
  TradesResponse,
  fetcher,
  formatCurrency,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

/** A single insider activity the notification cycles through. */
export interface InsiderActivity {
  id: string;
  ticker: string;
  company: string;
  insiderName: string;
  role: string;
  side: "BUY" | "SELL";
  amount: number;
  date: string; // ISO / date string
}

const ROTATE_MS = 9000;
const DISMISS_KEY = "ib_insider_toast_dismissed";

/** Relative time: "Just now", "2 min ago", "8 min ago", "3 hr ago", "2 days ago". */
function relTime(dateStr: string): string {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Premium, glassmorphic live-activity notification (bottom-left of the
 * homepage). Cycles through insider buys/sells with smooth transitions, a
 * pulsing LIVE indicator, a glow behind the Buy/Sell badge, and an auto-advance
 * progress bar. Accepts `activities` or falls back to the live trades feed.
 */
export function InsiderActivityToast({
  activities: provided,
}: {
  activities?: InsiderActivity[];
}) {
  const reduce = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  // Session-scoped dismissal.
  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

  // Fall back to the live trades feed when no activities are passed in.
  const { data } = useSWR<TradesResponse>(
    provided ? null : `${API_BASE}/trades?limit=40`,
    fetcher,
    { refreshInterval: 3 * 60_000, revalidateOnFocus: false },
  );
  const activities = useMemo<InsiderActivity[]>(() => {
    if (provided) return provided;
    return (data?.rows || [])
      .filter((t) => {
        const sym = (t.ticker || "").trim().toUpperCase();
        return sym && sym !== "N/A" && sym !== "NONE" && Number(t.totalValue) > 0;
      })
      .slice(0, 25)
      .map((t) => ({
        id: t.id,
        ticker: (t.ticker || "").toUpperCase(),
        company: t.companyName,
        insiderName: t.insiderName,
        role: t.role && t.role !== "Other" ? t.role : t.rawTitle || "Insider",
        side: t.type === "SELL" ? "SELL" : "BUY",
        amount: Number(t.totalValue),
        date: t.transactionDate,
      }));
  }, [provided, data]);

  const count = activities.length;

  // Auto-advance timer (paused on hover / when only one item).
  useEffect(() => {
    if (dismissed || paused || count <= 1) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [dismissed, paused, count, idx]);

  // Smooth progress bar via rAF (no per-frame React renders). Paused on hover;
  // skipped when reduced motion is preferred.
  useEffect(() => {
    if (dismissed || paused || reduce || count <= 1) return;
    let raf = 0;
    let start: number | null = null;
    if (barRef.current) barRef.current.style.width = "0%";
    const step = (ts: number) => {
      if (start == null) start = ts;
      const p = Math.min(1, (ts - start) / ROTATE_MS);
      if (barRef.current) barRef.current.style.width = `${p * 100}%`;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [dismissed, paused, reduce, count, idx]);

  // Keep index valid as the feed refreshes.
  useEffect(() => {
    if (idx >= count && count > 0) setIdx(0);
  }, [count, idx]);

  if (dismissed || count === 0) return null;
  const a = activities[idx];
  if (!a) return null;

  const isBuy = a.side === "BUY";
  const accent = isBuy ? "var(--good)" : "var(--bad)";
  const Icon = isBuy ? TrendingUp : TrendingDown;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  return (
    <motion.div
      role="region"
      aria-label="Live insider activity"
      initial={reduce ? { opacity: 0 } : { opacity: 0, x: -48 }}
      animate={{ opacity: 1, x: 0 }}
      transition={
        reduce
          ? { duration: 0.2 }
          : { type: "spring", stiffness: 260, damping: 16, mass: 0.9 }
      }
      whileHover={reduce ? undefined : { scale: 1.02 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="fixed bottom-5 left-4 sm:left-5 z-40"
      style={{ width: 340, maxWidth: "calc(100vw - 2rem)" }}
    >
      <div
        className="relative rounded-2xl overflow-hidden"
        style={{
          borderRadius: 16,
          // Glassmorphism — translucent, blurred, theme-aware.
          background: "color-mix(in srgb, var(--bg-2) 74%, transparent)",
          backdropFilter: "blur(14px) saturate(1.4)",
          WebkitBackdropFilter: "blur(14px) saturate(1.4)",
          border: "1px solid color-mix(in srgb, var(--border-strong) 55%, transparent)",
          boxShadow: paused
            ? "0 24px 60px rgba(0,0,0,0.28), 0 4px 14px rgba(0,0,0,0.12)"
            : "0 16px 44px rgba(0,0,0,0.20), 0 2px 8px rgba(0,0,0,0.08)",
          transition: "box-shadow 0.25s ease",
        }}
      >
        {/* Header: LIVE indicator + close */}
        <div className="flex items-center justify-between px-4 pt-3 pb-1.5">
          <span className="inline-flex items-center gap-2 text-[10.5px] font-bold uppercase tracking-[0.14em] text-mute">
            <span className="relative flex h-2.5 w-2.5" aria-hidden>
              {!reduce && (
                <span
                  className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75"
                  style={{ background: accent }}
                />
              )}
              <span
                className="relative inline-flex h-2.5 w-2.5 rounded-full"
                style={{ background: accent, boxShadow: `0 0 8px ${accent}` }}
              />
            </span>
            Live insider activity
          </span>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss notification"
            className="h-7 w-7 -mr-1.5 rounded-lg flex items-center justify-center text-mute hover:text-[var(--text)] hover:bg-[color-mix(in_srgb,var(--bg-3)_70%,transparent)] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Rotating activity */}
        <div aria-live="polite" aria-atomic="true">
          <AnimatePresence mode="wait">
            <motion.div
              key={a.id + idx}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, x: -24 }}
              transition={{ duration: 0.34, ease: [0.22, 1, 0.36, 1] }}
            >
              <Link
                href={a.ticker ? `/companies/${encodeURIComponent(a.ticker)}` : "#"}
                aria-label={`${a.role} ${isBuy ? "purchased" : "sold"} ${formatCurrency(a.amount)} of ${a.ticker}. View details.`}
                className="block px-4 pb-3.5 pt-1 group focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] rounded-b-2xl"
              >
                {/* Row 1: logo + badge + ticker */}
                <div className="flex items-center gap-2.5">
                  <CompanyLogo ticker={a.ticker} name={a.company} size={38} />
                  <div className="relative">
                    {/* Animated glow behind the badge */}
                    {!reduce && (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full blur-md"
                        style={{ background: accent }}
                        initial={{ opacity: 0.25, scale: 0.9 }}
                        animate={{ opacity: [0.25, 0.55, 0.25], scale: [0.9, 1.15, 0.9] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    <span
                      className="relative inline-flex items-center gap-1 text-[10.5px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
                      style={{
                        background: `color-mix(in srgb, ${accent} 20%, transparent)`,
                        color: accent,
                        border: `1px solid color-mix(in srgb, ${accent} 45%, transparent)`,
                      }}
                    >
                      <Icon className="h-3 w-3" strokeWidth={2.5} />
                      {isBuy ? "Buy" : "Sell"}
                    </span>
                  </div>
                  <span className="ml-auto text-[14px] font-bold font-mono text-accent group-hover:underline">
                    {a.ticker}
                  </span>
                </div>

                {/* Row 2: headline */}
                <div className="mt-2.5 text-[15px] font-semibold leading-snug" style={{ color: "var(--text)" }}>
                  {a.role} {isBuy ? "purchased" : "sold"}{" "}
                  <span style={{ color: accent }}>{formatCurrency(a.amount)}</span>
                </div>

                {/* Row 3: insider + time */}
                <div className="mt-0.5 text-[12px] text-mute truncate">
                  {a.insiderName} • {relTime(a.date)}
                </div>

                {/* Row 4: CTA */}
                <span className="mt-2 inline-flex items-center gap-1 text-[12px] font-bold text-accent">
                  View details
                  <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
                </span>
              </Link>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Auto-advance progress bar */}
        {count > 1 && (
          <div className="h-[3px] w-full" style={{ background: "color-mix(in srgb, var(--border) 60%, transparent)" }}>
            <div
              ref={barRef}
              style={{
                height: "100%",
                width: reduce ? "100%" : "0%",
                background: `linear-gradient(90deg, ${accent}, color-mix(in srgb, ${accent} 55%, var(--accent)))`,
                boxShadow: `0 0 8px ${accent}`,
              }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
}
