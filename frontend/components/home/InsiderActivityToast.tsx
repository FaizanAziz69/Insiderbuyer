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

/** A single insider activity the bubble cycles through. */
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
  filingUrl?: string | null;
}

const ROTATE_MS = 8000;
const DISMISS_KEY = "ib_insider_toast_dismissed";

// Minimal side accents — emerald for buys, rose for sells. No other color.
const SIDE = {
  BUY: { solid: "#10B981", glow: "rgba(16,185,129,0.35)" },
  SELL: { solid: "#EF4444", glow: "rgba(239,68,68,0.35)" },
} as const;

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
 * Premium live insider-activity notification bubble (bottom-left of the
 * homepage). Clean navy glass, a queued-stack peek, spring transitions, a
 * pulsing LIVE dot and an auto-advance bar. Cycles through insider buys/sells;
 * accepts `activities` or falls back to the live trades feed.
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
        filingUrl: t.filingUrl || null,
      }));
  }, [provided, data]);

  const count = activities.length;

  useEffect(() => {
    if (dismissed || hovered || count <= 1) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [dismissed, hovered, count, idx]);

  // Progress bar via rAF — smooth, no per-frame re-renders; pauses on hover.
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
  const href = a.filingUrl || (a.ticker ? `/companies/${encodeURIComponent(a.ticker)}` : "#");
  const external = !!a.filingUrl;

  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  }

  const cardBg = hovered
    ? "linear-gradient(160deg, rgba(20,28,45,0.94), rgba(13,20,35,0.96))"
    : "linear-gradient(160deg, rgba(17,24,39,0.92), rgba(11,18,32,0.94))";

  const inner = (
    <>
      {/* LIVE header */}
      <div className="flex items-center gap-2 pr-9">
        <span className="relative flex h-2 w-2" aria-hidden>
          {!reduce && (
            <>
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: "#EF4444" }}
                animate={{ scale: [1, 2.8], opacity: [0.55, 0] }}
                transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut" }}
              />
              <motion.span
                className="absolute inset-0 rounded-full"
                style={{ background: "#EF4444" }}
                animate={{ scale: [1, 2.8], opacity: [0.55, 0] }}
                transition={{ duration: 1.9, repeat: Infinity, ease: "easeOut", delay: 0.95 }}
              />
            </>
          )}
          <span className="relative h-2 w-2 rounded-full" style={{ background: "#EF4444", boxShadow: "0 0 8px #EF4444" }} />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.5)" }}>
          Live insider activity
        </span>
      </div>

      {/* Logo + ticker */}
      <div className="mt-3.5 flex items-center justify-between">
        <motion.div
          animate={reduce ? undefined : { y: [0, -2, 0] }}
          transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
          whileHover={reduce ? undefined : { rotate: 5 }}
          className="rounded-xl overflow-hidden bg-white flex items-center justify-center flex-shrink-0"
          style={{ width: 40, height: 40, padding: 3 }}
        >
          <CompanyLogo ticker={a.ticker} name={a.company} size={34} />
        </motion.div>
        <span className="text-[15px] font-bold font-mono tracking-wide" style={{ color: "rgba(255,255,255,0.92)" }}>
          {a.ticker}
        </span>
      </div>

      {/* Badge */}
      <div className="relative mt-3 inline-flex">
        {!reduce && (
          <motion.span
            aria-hidden
            className="absolute inset-0 rounded-md blur-md"
            style={{ background: s.glow }}
            animate={{ opacity: [0.35, 0.65, 0.35] }}
            transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
        <span
          className="relative inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-widest text-white"
          style={{ background: s.solid, boxShadow: `0 2px 12px ${s.glow}` }}
        >
          <Icon className="h-3 w-3" strokeWidth={2.6} />
          {a.side}
        </span>
      </div>

      {/* Headline + amount (biggest element) */}
      <div className="mt-3 text-[12.5px]" style={{ color: "rgba(255,255,255,0.62)" }}>
        {a.role} {isBuy ? "purchased" : "sold"}
      </div>
      <div className="mt-1 font-bold tracking-tight tabular" style={{ fontSize: 34, lineHeight: 1.02, color: "#fff" }}>
        {formatCurrency(a.amount)}
      </div>

      {/* Shares • price */}
      <div className="mt-2 text-[12px] tabular" style={{ color: "rgba(255,255,255,0.5)" }}>
        {formatNumber(a.shares)} shares
        {a.pricePerShare > 0 && <> • ${a.pricePerShare.toFixed(2)}/share</>}
      </div>

      {/* Insider + time */}
      <div className="mt-3 leading-tight">
        <div className="text-[12.5px] font-semibold truncate" style={{ color: "rgba(255,255,255,0.88)" }}>
          {a.insiderName}
        </div>
        <div className="text-[11.5px]" style={{ color: "rgba(255,255,255,0.45)" }}>
          {relTime(a.date)}
        </div>
      </div>

      {/* CTA */}
      <span
        className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold transition-[filter] group-hover:brightness-125"
        style={{ color: s.solid }}
      >
        View filing
        <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
      </span>
    </>
  );

  const cardClass =
    "group relative z-10 block cursor-pointer px-5 pt-4 pb-4 focus:outline-none";
  const cardAria = `${a.role} ${isBuy ? "purchased" : "sold"} ${formatCurrency(a.amount)} of ${a.ticker}. View filing.`;

  return (
    <div className="fixed bottom-5 left-4 sm:left-5 z-40" style={{ width: 430, maxWidth: "calc(100vw - 2rem)" }}>
      <div className="relative">
        {/* Stacked-queue peek — a sliver of the "next" card behind */}
        {count > 1 && (
          <div
            aria-hidden
            className="absolute left-3 right-3 rounded-2xl"
            style={{
              bottom: -9,
              height: 40,
              background: "linear-gradient(160deg, rgba(17,24,39,0.9), rgba(11,18,32,0.92))",
              border: "1px solid rgba(255,255,255,0.08)",
              boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            }}
          />
        )}

        <motion.div
          role="region"
          aria-label="Live insider activity"
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -56, scale: 0.96 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          transition={reduce ? { duration: 0.25 } : { type: "spring", stiffness: 240, damping: 22, mass: 0.9 }}
          whileHover={reduce ? undefined : { y: -6, rotate: 1.5 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="relative overflow-hidden"
          style={{
            borderRadius: 18,
            background: cardBg,
            backdropFilter: "blur(24px) saturate(1.3)",
            WebkitBackdropFilter: "blur(24px) saturate(1.3)",
            border: "1px solid rgba(255,255,255,0.12)",
            boxShadow: hovered
              ? `0 34px 80px rgba(0,0,0,0.55), 0 0 26px ${s.glow}`
              : "0 22px 60px rgba(0,0,0,0.45)",
            transition: "box-shadow 0.3s ease, background 0.3s ease",
          }}
        >
          {/* faint white glass overlay */}
          <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "rgba(255,255,255,0.05)" }} />

          {/* Close (sibling of the link) */}
          <motion.button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss notification"
            whileHover={reduce ? undefined : { rotate: 90 }}
            transition={{ type: "spring", stiffness: 300, damping: 18 }}
            className="absolute top-3 right-3 z-30 h-7 w-7 rounded-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
            style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)" }}
          >
            <X className="h-4 w-4" />
          </motion.button>

          {/* Rotating content — current slides up, next slides in underneath */}
          <div aria-live="polite" aria-atomic="true">
            <AnimatePresence mode="popLayout">
              <motion.div
                key={a.id + idx}
                initial={reduce ? { opacity: 0 } : { opacity: 0, y: 34, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={reduce ? { opacity: 0 } : { opacity: 0, y: -34, scale: 0.98 }}
                transition={{ type: "spring", stiffness: 260, damping: 26 }}
              >
                {external ? (
                  <a href={href} target="_blank" rel="noopener noreferrer" className={cardClass} aria-label={cardAria}>
                    {inner}
                  </a>
                ) : (
                  <Link href={href} className={cardClass} aria-label={cardAria}>
                    {inner}
                  </Link>
                )}
              </motion.div>
            </AnimatePresence>
          </div>

          {/* Shimmer sweep (~every 6s) */}
          {!reduce && (
            <motion.div
              aria-hidden
              className="absolute inset-0 pointer-events-none z-20"
              style={{ background: "linear-gradient(105deg, transparent 43%, rgba(255,255,255,0.07) 50%, transparent 57%)" }}
              initial={{ x: "-130%" }}
              animate={{ x: "130%" }}
              transition={{ duration: 1.5, repeat: Infinity, repeatDelay: 4.5, ease: "easeInOut" }}
            />
          )}

          {/* Progress bar */}
          {count > 1 && (
            <div className="relative z-10 h-[3px] w-full" style={{ background: "rgba(255,255,255,0.07)" }}>
              <div
                ref={barRef}
                style={{
                  height: "100%",
                  width: reduce ? "100%" : "0%",
                  background: `linear-gradient(90deg, ${s.solid}, color-mix(in srgb, ${s.solid} 55%, #fff))`,
                }}
              />
            </div>
          )}
        </motion.div>
      </div>
    </div>
  );
}
