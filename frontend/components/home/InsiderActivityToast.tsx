"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowUpRight, TrendingDown, TrendingUp, X } from "lucide-react";
import useSWR from "swr";
import {
  API_BASE,
  TradesResponse,
  TradeRow,
  fetcher,
  formatCurrency,
  formatRelative,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

const ROTATE_MS = 7000;

/** Live "social-proof"-style popup, bottom-left of the homepage: rotates
 *  through the day's most recent insider buys/sells with a little animation.
 *  Click a card to open that company. Sits opposite the chat widget. */
export function InsiderActivityToast() {
  const [dismissed, setDismissed] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);

  const { data } = useSWR<TradesResponse>(
    `${API_BASE}/trades?limit=40`,
    fetcher,
    { refreshInterval: 3 * 60_000, revalidateOnFocus: false },
  );

  // Real, tradable-company trades only (skip N/A fund filings), newest first.
  const items = useMemo<TradeRow[]>(() => {
    return (data?.rows || [])
      .filter((t) => {
        const sym = (t.ticker || "").trim().toUpperCase();
        return sym && sym !== "N/A" && sym !== "NONE" && Number(t.totalValue) > 0;
      })
      .slice(0, 25);
  }, [data]);

  // Auto-rotate (paused on hover).
  useEffect(() => {
    if (paused || items.length <= 1) return;
    const t = setInterval(() => setIdx((i) => (i + 1) % items.length), ROTATE_MS);
    return () => clearInterval(t);
  }, [paused, items.length]);

  // Keep the index valid as the list refreshes.
  useEffect(() => {
    if (idx >= items.length) setIdx(0);
  }, [items.length, idx]);

  if (dismissed || items.length === 0) return null;
  const t = items[idx];
  if (!t) return null;

  const isBuy = t.type !== "SELL";
  const accent = isBuy ? "var(--good)" : "var(--bad)";
  const ticker = (t.ticker || "").toUpperCase();
  const role = t.role && t.role !== "Other" ? t.role : t.rawTitle || "Insider";

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="fixed bottom-5 left-5 z-40 hidden sm:block"
      style={{ width: 320 }}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div
        className="relative rounded-xl overflow-hidden"
        style={{
          background: "var(--bg-2)",
          border: "1px solid var(--border-strong)",
          boxShadow: "0 16px 40px rgba(0,0,0,0.22), 0 2px 8px rgba(0,0,0,0.08)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-3.5 py-2 border-b"
          style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
        >
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-mute">
            <span className="relative flex h-2 w-2">
              <span
                className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-70"
                style={{ background: accent }}
              />
              <span className="relative inline-flex h-2 w-2 rounded-full" style={{ background: accent }} />
            </span>
            Live insider activity
          </span>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss"
            className="h-6 w-6 -mr-1 rounded-md flex items-center justify-center text-mute hover:text-[var(--text)] hover:bg-[var(--bg-2)] transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Rotating card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={`${t.id}-${idx}`}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ duration: 0.3, ease: "easeOut" }}
          >
            <Link
              href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
              className="flex items-start gap-3 px-3.5 py-3 group"
            >
              <CompanyLogo ticker={ticker} name={t.companyName} size={38} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded"
                    style={{ background: `color-mix(in srgb, ${accent} 16%, transparent)`, color: accent }}
                  >
                    {isBuy ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {isBuy ? "Buy" : "Sell"}
                  </span>
                  <span className="text-[13px] font-bold font-mono text-accent truncate group-hover:underline">
                    {ticker}
                  </span>
                  <ArrowUpRight className="h-3.5 w-3.5 text-faint ml-auto opacity-0 group-hover:opacity-100 transition" />
                </div>
                <div className="text-[13px] leading-snug mt-1" style={{ color: "var(--text)" }}>
                  <span className="font-semibold">{role}</span>{" "}
                  {isBuy ? "bought" : "sold"}{" "}
                  <span className="font-bold" style={{ color: accent }}>
                    {formatCurrency(Number(t.totalValue))}
                  </span>
                </div>
                <div className="text-[11px] text-mute truncate mt-0.5">
                  {t.insiderName} · {formatRelative(t.transactionDate)}
                </div>
              </div>
            </Link>
          </motion.div>
        </AnimatePresence>

        {/* Auto-advance progress bar */}
        {!paused && items.length > 1 && (
          <motion.div
            key={`bar-${idx}`}
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: ROTATE_MS / 1000, ease: "linear" }}
            style={{ height: 2, background: accent, opacity: 0.5 }}
          />
        )}
      </div>
    </motion.div>
  );
}
