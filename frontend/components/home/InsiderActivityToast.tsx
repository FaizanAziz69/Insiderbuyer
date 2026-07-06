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
  formatNumber,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

/** A single insider activity the widget cycles through. */
export interface InsiderActivity {
  id: string;
  ticker: string;
  company: string;
  insiderName: string;
  role: string;
  side: "BUY" | "SELL";
  amount: number;
  shares: number;
  pricePerShare: number;
  date: string;
}

const ROTATE_MS = 9000;
const DISMISS_KEY = "ib_insider_toast_dismissed";

// Side theming — emerald for buys, rose for sells.
const SIDE = {
  BUY: { c1: "#34D399", c2: "#059669", glow: "rgba(16,185,129,0.55)", solid: "#10B981" },
  SELL: { c1: "#FB7185", c2: "#E11D48", glow: "rgba(244,63,94,0.55)", solid: "#F43F5E" },
} as const;

const BLUE_GLOW = "rgba(59,130,246,0.42)";

// Deterministic floating particles (fixed so SSR/CSR match).
const PARTICLES = [
  { left: "12%", size: 3, dur: 6.5, delay: 0 },
  { left: "34%", size: 2, dur: 8, delay: 1.6 },
  { left: "58%", size: 3, dur: 7, delay: 0.8 },
  { left: "78%", size: 2, dur: 9, delay: 2.4 },
  { left: "90%", size: 2.5, dur: 6, delay: 3.2 },
];

/** Relative time: "Just now", "4 minutes ago", "3 hours ago", "2 days ago". */
function relTime(dateStr: string): string {
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return "";
  const s = Math.max(0, Math.floor((Date.now() - t) / 1000));
  if (s < 45) return "Just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} minute${m > 1 ? "s" : ""} ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hour${h > 1 ? "s" : ""} ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d} day${d > 1 ? "s" : ""} ago`;
  return new Date(t).toLocaleDateString();
}

/**
 * Futuristic AI-market-intelligence live widget (bottom-left of the homepage).
 * Frosted glass, ambient glow, rotating border light, floating particles, a
 * pulsing LIVE indicator and an auto-advance progress bar. Cycles through
 * insider buys/sells; accepts `activities` or falls back to the trades feed.
 */
export function InsiderActivityToast({
  activities: provided,
}: {
  activities?: InsiderActivity[];
}) {
  const reduce = useReducedMotion();
  const [dismissed, setDismissed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      if (sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);

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
        shares: Number(t.sharesBought) || 0,
        pricePerShare: Number(t.pricePerShare) || 0,
        date: t.transactionDate,
      }));
  }, [provided, data]);

  const count = activities.length;

  // Auto-advance (paused on hover).
  useEffect(() => {
    if (dismissed || hovered || count <= 1) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [dismissed, hovered, count, idx]);

  // Smooth progress bar via rAF (no per-frame React renders); pause on hover.
  useEffect(() => {
    if (dismissed || hovered || reduce || count <= 1) return;
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
  }, [dismissed, hovered, reduce, count, idx]);

  useEffect(() => {
    if (idx >= count && count > 0) setIdx(0);
  }, [count, idx]);

  if (dismissed || count === 0) return null;
  const a = activities[idx];
  if (!a) return null;

  const isBuy = a.side === "BUY";
  const s = SIDE[a.side];
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
    <div className="fixed bottom-5 left-4 sm:left-5 z-40" style={{ width: 360, maxWidth: "calc(100vw - 2rem)" }}>
      <motion.div
        role="region"
        aria-label="Live insider activity"
        initial={reduce ? { opacity: 0 } : { opacity: 0, x: -60, scale: 0.95 }}
        animate={{ opacity: 1, x: 0, scale: 1 }}
        transition={
          reduce ? { duration: 0.25 } : { type: "spring", stiffness: 220, damping: 20, mass: 0.9 }
        }
        whileHover={reduce ? undefined : { y: -6, rotate: 0.5, scale: 1.005 }}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className="relative"
        style={{
          borderRadius: 20,
          padding: 1.2, // gradient-border frame
          background: `linear-gradient(135deg, ${s.glow}, ${BLUE_GLOW} 45%, transparent 70%)`,
          boxShadow: hovered
            ? `0 30px 70px rgba(0,0,0,0.45), 0 0 40px ${s.glow}`
            : `0 20px 50px rgba(0,0,0,0.35), 0 0 22px ${s.glow}`,
          transition: "box-shadow 0.3s ease",
        }}
      >
        <div
          className="relative overflow-hidden"
          style={{
            borderRadius: 19,
            background: hovered ? "rgba(18,23,37,0.72)" : "rgba(16,21,34,0.66)",
            backdropFilter: `blur(${hovered ? 30 : 22}px) saturate(1.5)`,
            WebkitBackdropFilter: `blur(${hovered ? 30 : 22}px) saturate(1.5)`,
            border: "1px solid rgba(255,255,255,0.10)",
            transition: "background 0.3s ease, backdrop-filter 0.3s ease",
          }}
        >
          {/* Rotating ambient border light */}
          {!reduce && (
            <motion.div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                inset: -80,
                background: `conic-gradient(from 0deg, transparent, ${s.glow}, transparent 35%, ${BLUE_GLOW}, transparent 65%, ${s.glow}, transparent)`,
                filter: "blur(26px)",
                opacity: 0.45,
              }}
              animate={{ rotate: 360 }}
              transition={{ duration: 10, repeat: Infinity, ease: "linear" }}
            />
          )}
          {/* Breathing top glow (side colored) */}
          {!reduce && (
            <motion.div
              aria-hidden
              className="absolute pointer-events-none"
              style={{
                top: -50,
                left: "50%",
                width: 260,
                height: 140,
                marginLeft: -130,
                background: `radial-gradient(closest-side, ${s.glow}, transparent)`,
                filter: "blur(18px)",
              }}
              animate={{ opacity: [0.3, 0.6, 0.3], scale: [1, 1.1, 1] }}
              transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          {/* Floating particles */}
          {!reduce &&
            PARTICLES.map((p, i) => (
              <motion.span
                key={i}
                aria-hidden
                className="absolute rounded-full pointer-events-none"
                style={{ left: p.left, bottom: 6, width: p.size, height: p.size, background: "rgba(255,255,255,0.5)" }}
                animate={{ y: [0, -110], opacity: [0, 0.7, 0] }}
                transition={{ duration: p.dur, repeat: Infinity, delay: p.delay, ease: "easeOut" }}
              />
            ))}

          {/* Close (sibling of the link, on top) */}
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss notification"
            className="absolute top-3 right-3 z-30 h-7 w-7 rounded-lg flex items-center justify-center transition focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ color: "rgba(255,255,255,0.55)", background: "rgba(255,255,255,0.06)" }}
          >
            <X className="h-4 w-4" />
          </button>

          {/* Clickable content */}
          <div aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="wait">
              <motion.div
                key={a.id + idx}
                initial={reduce ? { opacity: 0 } : { opacity: 0, x: 22 }}
                animate={{ opacity: 1, x: 0 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, x: -22 }}
                transition={{ type: "spring", stiffness: 300, damping: 26 }}
              >
                <Link
                  href={a.ticker ? `/companies/${encodeURIComponent(a.ticker)}` : "#"}
                  aria-label={`${a.role} ${isBuy ? "purchased" : "sold"} ${formatCurrency(a.amount)} of ${a.ticker}. View details.`}
                  className="group relative z-10 block cursor-pointer px-5 pt-4 pb-4 focus:outline-none"
                >
                  {/* LIVE header */}
                  <div className="flex items-center gap-2 pr-8">
                    <span className="relative flex h-2.5 w-2.5" aria-hidden>
                      {!reduce && (
                        <>
                          <motion.span
                            className="absolute inset-0 rounded-full"
                            style={{ background: "#ef4444" }}
                            animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                          />
                          <motion.span
                            className="absolute inset-0 rounded-full"
                            style={{ background: "#ef4444" }}
                            animate={{ scale: [1, 2.6], opacity: [0.6, 0] }}
                            transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut", delay: 0.9 }}
                          />
                        </>
                      )}
                      <span className="relative h-2.5 w-2.5 rounded-full" style={{ background: "#ef4444", boxShadow: "0 0 10px #ef4444" }} />
                    </span>
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.16em]" style={{ color: "rgba(255,255,255,0.55)" }}>
                      Live insider activity
                    </span>
                  </div>

                  {/* Logo + ticker */}
                  <div className="mt-4 flex items-center justify-between">
                    <motion.div
                      animate={reduce ? undefined : { y: [0, -5, 0] }}
                      transition={{ duration: 3.6, repeat: Infinity, ease: "easeInOut" }}
                      whileHover={reduce ? undefined : { rotate: 6 }}
                      className="rounded-xl overflow-hidden bg-white flex items-center justify-center flex-shrink-0"
                      style={{ width: 46, height: 46, padding: 3, boxShadow: `0 6px 18px ${s.glow}` }}
                    >
                      <CompanyLogo ticker={a.ticker} name={a.company} size={40} />
                    </motion.div>
                    <span className="text-[18px] font-bold font-mono tracking-wide text-white group-hover:opacity-90">
                      {a.ticker}
                    </span>
                  </div>

                  {/* Badge */}
                  <div className="relative mt-3 inline-flex">
                    {!reduce && (
                      <motion.span
                        aria-hidden
                        className="absolute inset-0 rounded-full blur-md"
                        style={{ background: s.glow }}
                        animate={{ opacity: [0.4, 0.8, 0.4], scale: [0.95, 1.12, 0.95] }}
                        transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
                      />
                    )}
                    <span
                      className="relative inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold uppercase tracking-widest text-white transition-transform group-hover:scale-105"
                      style={{ background: `linear-gradient(135deg, ${s.c1}, ${s.c2})`, boxShadow: `0 4px 16px ${s.glow}` }}
                    >
                      <Icon className="h-3.5 w-3.5" strokeWidth={2.6} />
                      {a.side}
                    </span>
                  </div>

                  {/* Headline + amount (visual focus) */}
                  <div className="mt-3 text-[13px]" style={{ color: "rgba(255,255,255,0.7)" }}>
                    {a.role} {isBuy ? "purchased" : "sold"}
                  </div>
                  <div
                    className="mt-0.5 font-bold tracking-tight tabular"
                    style={{ fontSize: 32, lineHeight: 1.05, color: "#fff", textShadow: `0 0 22px ${s.glow}` }}
                  >
                    {formatCurrency(a.amount)}
                  </div>

                  {/* Shares / price */}
                  <div className="mt-2 flex items-center gap-2 text-[12px]" style={{ color: "rgba(255,255,255,0.6)" }}>
                    <span className="tabular">{formatNumber(a.shares)} shares</span>
                    {a.pricePerShare > 0 && (
                      <>
                        <span style={{ color: "rgba(255,255,255,0.25)" }}>•</span>
                        <span className="tabular">${a.pricePerShare.toFixed(2)} / share</span>
                      </>
                    )}
                  </div>

                  {/* Insider + time */}
                  <div className="mt-3 flex items-center gap-2 text-[12px]">
                    <span className="font-semibold text-white truncate">{a.insiderName}</span>
                    <span style={{ color: "rgba(255,255,255,0.35)" }}>•</span>
                    <span style={{ color: "rgba(255,255,255,0.55)" }}>{relTime(a.date)}</span>
                  </div>

                  {/* CTA */}
                  <span
                    className="mt-3 inline-flex items-center gap-1.5 text-[12.5px] font-bold transition-colors"
                    style={{ color: s.c1 }}
                  >
                    <span className="group-hover:brightness-125">View details</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </span>
                </Link>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Glass shimmer sweep (every ~5s) */}
          {!reduce && (
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none z-20"
              style={{ background: "linear-gradient(105deg, transparent 42%, rgba(255,255,255,0.10) 50%, transparent 58%)" }}
              initial={{ x: "-130%" }}
              animate={{ x: "130%" }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 3.5, ease: "easeInOut" }}
            />
          )}

          {/* Progress bar */}
          {count > 1 && (
            <div className="relative z-10 h-[3px] w-full" style={{ background: "rgba(255,255,255,0.08)" }}>
              <div
                ref={barRef}
                style={{
                  height: "100%",
                  width: reduce ? "100%" : "0%",
                  background: `linear-gradient(90deg, ${s.c1}, ${s.c2})`,
                  boxShadow: `0 0 10px ${s.glow}`,
                }}
              />
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
