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

const ROTATE_MS = 8000;

// Minimal side accents — emerald for buys, rose for sells. No other color.
const SIDE = {
  BUY: { solid: "#10B981", glow: "rgba(16,185,129,0.32)", verb: "Bought" },
  SELL: { solid: "#EF4444", glow: "rgba(239,68,68,0.32)", verb: "Sold" },
} as const;

const SPRING = { type: "spring", stiffness: 260, damping: 26 } as const;

// Lazily-created audio context + a synthesized "cha-ching" cash sound (no asset
// file). Autoplay is gated by the browser until a user gesture, so we resume
// the context on the first interaction.
let audioCtx: AudioContext | null = null;
function ensureAudio() {
  if (typeof window === "undefined") return null;
  try {
    audioCtx =
      audioCtx || new (window.AudioContext || (window as any).webkitAudioContext)();
    if (audioCtx.state === "suspended") void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}
function playCashSound() {
  const ctx = ensureAudio();
  if (!ctx || ctx.state !== "running") return;
  const now = ctx.currentTime;
  // Two bright bell dings → a "cha-ching".
  [
    { f: 1318.5, t: 0 },
    { f: 1975.5, t: 0.09 },
  ].forEach(({ f, t }) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.value = f;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.22, now + t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.38);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.42);
  });
}

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

function LiveDot({ reduce }: { reduce: boolean | null }) {
  return (
    <span className="relative flex h-2 w-2 flex-shrink-0" aria-hidden>
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
  );
}

/**
 * Live insider-activity notification: a compact floating bubble (bottom-left of
 * the homepage) that morphs into a premium Insider Activity card on click and
 * collapses back on close (Intercom/Slack pattern). Cycles through insider
 * buys/sells; accepts `activities` or falls back to the live trades feed.
 */
export function InsiderActivityToast({
  activities: provided,
}: {
  activities?: InsiderActivity[];
}) {
  const reduce = useReducedMotion();
  const [expanded, setExpanded] = useState(false);
  const [idx, setIdx] = useState(0);
  const [hovered, setHovered] = useState(false);
  // Newest trade id the user has acknowledged (by opening the bubble). Trades
  // that arrive above it are counted as "new" until the bubble is opened.
  const [lastSeenId, setLastSeenId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);
  const barRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<HTMLDivElement | null>(null);
  const prevNewRef = useRef(0);

  // Session-scoped dismissal (the × on the bubble removes it for the session).
  useEffect(() => {
    try {
      if (sessionStorage.getItem("ib_insider_toast_dismissed") === "1") setDismissed(true);
    } catch {
      /* ignore */
    }
  }, []);
  function dismiss() {
    setDismissed(true);
    try {
      sessionStorage.setItem("ib_insider_toast_dismissed", "1");
    } catch {
      /* ignore */
    }
  }

  // Prime the audio context on the first user gesture (autoplay policy).
  useEffect(() => {
    const prime = () => ensureAudio();
    window.addEventListener("pointerdown", prime, { once: true });
    window.addEventListener("keydown", prime, { once: true });
    return () => {
      window.removeEventListener("pointerdown", prime);
      window.removeEventListener("keydown", prime);
    };
  }, []);

  // Appear ~10s after landing (not pre-populated) with a cha-ching.
  useEffect(() => {
    const t = setTimeout(() => {
      setVisible(true);
      playCashSound();
    }, 10_000);
    return () => clearTimeout(t);
  }, []);

  const { data } = useSWR<TradesResponse>(
    // Buys only, server-side — the generic trades feed is often dominated by
    // recent sells, which would leave the buy-only bubble empty.
    provided ? null : `${API_BASE}/trades?side=buy&limit=40`,
    fetcher,
    { refreshInterval: 3 * 60_000, revalidateOnFocus: false },
  );
  const activities = useMemo<InsiderActivity[]>(() => {
    if (provided) return provided;
    return (data?.rows || [])
      .filter((t) => {
        const sym = (t.ticker || "").trim().toUpperCase();
        // Buys only — no sells in the popup.
        return (
          t.type !== "SELL" &&
          sym &&
          sym !== "N/A" &&
          sym !== "NONE" &&
          Number(t.totalValue) > 0
        );
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

  // Baseline: on first load, acknowledge the current newest so existing trades
  // aren't counted as "new".
  useEffect(() => {
    if (lastSeenId == null && count > 0) setLastSeenId(activities[0].id);
  }, [lastSeenId, count, activities]);

  // Unseen-arrival count: trades sitting above the last acknowledged one.
  const newCount = useMemo(() => {
    if (!lastSeenId || count === 0) return 0;
    const i = activities.findIndex((x) => x.id === lastSeenId);
    return i === -1 ? Math.min(count, 99) : i;
  }, [activities, lastSeenId, count]);

  // Cha-ching whenever a new insider buy arrives (once visible).
  useEffect(() => {
    if (visible && newCount > prevNewRef.current) playCashSound();
    prevNewRef.current = newCount;
  }, [newCount, visible]);

  // Open the card: acknowledge everything current, jump to the newest.
  function open() {
    setIdx(0);
    if (activities[0]) setLastSeenId(activities[0].id);
    setExpanded(true);
  }

  // Auto-advance (pauses on hover).
  useEffect(() => {
    if (hovered || count <= 1) return;
    const t = setTimeout(() => setIdx((i) => (i + 1) % count), ROTATE_MS);
    return () => clearTimeout(t);
  }, [hovered, count, idx]);

  // Progress bar (expanded only) via rAF — pauses on hover.
  useEffect(() => {
    if (!expanded || hovered || reduce || count <= 1) return;
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
  }, [expanded, hovered, reduce, count, idx]);

  useEffect(() => {
    if (idx >= count && count > 0) setIdx(0);
  }, [count, idx]);

  if (dismissed || !visible) return null;
  if (count === 0) return null;
  const a = activities[idx];
  if (!a) return null;

  const isBuy = a.side === "BUY";
  const s = SIDE[a.side];
  const Icon = isBuy ? TrendingUp : TrendingDown;

  return (
    <>
      {/* Viewport bounds so the widget can be dragged but stays on-screen. */}
      <div ref={dragRef} aria-hidden className="fixed inset-2 z-30 pointer-events-none" />
      <motion.div
        drag
        dragConstraints={dragRef}
        dragMomentum={false}
        dragElastic={0.12}
        whileDrag={reduce ? undefined : { cursor: "grabbing", scale: 1.02 }}
        className="fixed bottom-5 left-4 sm:left-5 z-40"
        style={{ touchAction: "none", cursor: expanded ? "default" : "grab" }}
      >
        <motion.div
          layout
          transition={reduce ? { duration: 0.2 } : SPRING}
          initial={reduce ? { opacity: 0 } : { opacity: 0, x: -44, scale: 0.9 }}
          animate={{ opacity: 1, x: 0, scale: 1 }}
          onMouseEnter={() => setHovered(true)}
          onMouseLeave={() => setHovered(false)}
          className="overflow-hidden"
          style={{
            borderRadius: expanded ? 18 : 9999,
            background: "linear-gradient(160deg, rgba(17,24,39,0.94), rgba(11,18,32,0.96))",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(20px) saturate(1.3)",
            WebkitBackdropFilter: "blur(20px) saturate(1.3)",
            boxShadow:
              expanded && hovered
                ? `0 34px 80px rgba(0,0,0,0.55), 0 0 26px ${s.glow}`
                : "0 18px 50px rgba(0,0,0,0.45)",
            maxWidth: "calc(100vw - 2rem)",
          }}
        >
      {/* faint white glass overlay */}
      <span aria-hidden className="absolute inset-0 pointer-events-none" style={{ background: "rgba(255,255,255,0.05)" }} />

      <AnimatePresence mode="popLayout" initial={false}>
        {!expanded ? (
          /* ── COLLAPSED BUBBLE ─────────────────────────────────────── */
          <motion.div
            key="bubble"
            initial={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, scale: 1, y: [0, -2, 0] }}
            exit={{ opacity: 0 }}
            transition={reduce ? { duration: 0.2 } : { ...SPRING, y: { duration: 3.2, repeat: Infinity, ease: "easeInOut" } }}
            className="relative z-10 flex items-center gap-1 pl-3.5 pr-1.5 py-2.5"
          >
            <button
              type="button"
              onClick={open}
              aria-label={
                newCount > 0
                  ? `${newCount} new insider buy${newCount > 1 ? "s" : ""}. Open details.`
                  : `Live insider activity: ${a.ticker} ${a.role} ${s.verb.toLowerCase()}. Open details.`
              }
              className="flex items-center gap-2.5 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40 rounded-full pr-1"
            >
              <LiveDot reduce={reduce} />
              {newCount > 0 ? (
                /* Unseen arrivals — count badge, re-pops each time it changes */
                <motion.span
                  key={`new-${newCount}`}
                  initial={reduce ? false : { scale: 0.7, opacity: 0 }}
                  animate={reduce ? { opacity: 1 } : { scale: [0.7, 1.12, 1], opacity: 1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 18 }}
                  className="text-[12.5px] font-bold whitespace-nowrap"
                  style={{ color: "#fff" }}
                >
                  {newCount === 1 ? "1 New Insider Buy" : `${newCount} New Buys`}
                </motion.span>
              ) : (
                <>
                  <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "rgba(255,255,255,0.55)" }}>
                    Live
                  </span>
                  <motion.span
                    key={`live-${a.id}-${idx}`}
                    initial={reduce ? false : { scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold whitespace-nowrap"
                    style={{ color: "rgba(255,255,255,0.9)" }}
                  >
                    <span className="font-mono">{a.ticker}</span>
                    <span style={{ color: s.solid }}>{s.verb}</span>
                  </motion.span>
                </>
              )}
            </button>
            {/* Dismiss — remove the widget from the screen for the session */}
            <button
              type="button"
              onClick={dismiss}
              aria-label="Remove notification"
              className="h-6 w-6 rounded-full flex items-center justify-center flex-shrink-0 transition hover:bg-white/10 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              style={{ color: "rgba(255,255,255,0.45)" }}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </motion.div>
        ) : (
          /* ── EXPANDED CARD ────────────────────────────────────────── */
          <motion.div
            key="card"
            initial={reduce ? { opacity: 0 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="relative z-10"
            style={{ width: 420, maxWidth: "calc(100vw - 2rem)" }}
          >
            {/* Close (collapses back to the bubble) */}
            <motion.button
              type="button"
              onClick={() => setExpanded(false)}
              aria-label="Collapse notification"
              whileHover={reduce ? undefined : { rotate: 90 }}
              transition={{ type: "spring", stiffness: 300, damping: 18 }}
              className="absolute top-3 right-3 z-30 h-7 w-7 rounded-lg flex items-center justify-center focus:outline-none focus-visible:ring-2 focus-visible:ring-white/40"
              style={{ color: "rgba(255,255,255,0.5)", background: "rgba(255,255,255,0.06)" }}
            >
              <X className="h-4 w-4" />
            </motion.button>

            <div aria-live="polite" aria-atomic="true">
              <AnimatePresence mode="popLayout">
                <motion.div
                  key={a.id + idx}
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: 30, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={reduce ? { opacity: 0 } : { opacity: 0, y: -30, scale: 0.98 }}
                  transition={SPRING}
                >
                  <Link
                    href="/insiders/hot"
                    aria-label={`${a.role} purchased ${formatCurrency(a.amount)} of ${a.ticker}. View Top Buys.`}
                    className="group block cursor-pointer px-5 pt-4 pb-4 focus:outline-none"
                    style={{
                      transform: hovered && !reduce ? "translateY(-4px)" : "translateY(0)",
                      transition: "transform 0.3s ease",
                    }}
                  >
                    {/* LIVE header */}
                    <div className="flex items-center gap-2 pr-9">
                      <LiveDot reduce={reduce} />
                      <span className="text-[10px] font-semibold uppercase tracking-[0.18em]" style={{ color: "rgba(255,255,255,0.5)" }}>
                        Live insider activity
                      </span>
                    </div>

                    {/* Logo + ticker */}
                    <div className="mt-3.5 flex items-center justify-between">
                      <motion.div
                        animate={reduce ? undefined : { y: [0, -2, 0] }}
                        transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut" }}
                        className="rounded-xl overflow-hidden bg-white flex items-center justify-center flex-shrink-0 transition-transform group-hover:scale-105"
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

                    {/* Amount (biggest element) */}
                    <div className="mt-3 font-bold tracking-tight tabular" style={{ fontSize: 34, lineHeight: 1.02, color: "#fff" }}>
                      {formatCurrency(a.amount)}
                    </div>
                    <div className="mt-1 text-[12.5px]" style={{ color: "rgba(255,255,255,0.62)" }}>
                      {a.role} {isBuy ? "purchased" : "sold"}
                    </div>

                    {/* Shares • price */}
                    <div className="mt-2 text-[12px] tabular" style={{ color: "rgba(255,255,255,0.5)" }}>
                      {formatNumber(a.shares)} shares
                      {a.pricePerShare > 0 && <> • ${a.pricePerShare.toFixed(2)}/share</>}
                    </div>

                    {/* Insider • time */}
                    <div className="mt-2 text-[12px]" style={{ color: "rgba(255,255,255,0.55)" }}>
                      <span className="font-semibold" style={{ color: "rgba(255,255,255,0.85)" }}>{a.insiderName}</span>
                      {" • "}
                      {relTime(a.date)}
                    </div>

                    {/* CTA → stock page */}
                    <span
                      className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold transition-[filter] group-hover:brightness-125"
                      style={{ color: s.solid }}
                    >
                      View Top Buys
                      <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </Link>
                </motion.div>
              </AnimatePresence>
            </div>

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
        )}
      </AnimatePresence>
        </motion.div>
      </motion.div>
    </>
  );
}
