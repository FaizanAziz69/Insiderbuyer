"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { effectiveZoom } from "@/lib/zoom";

interface Txn {
  insiderName: string;
  role: string;
  type?: "BUY" | "SELL";
  transactionCode: string;
  sharesBought: number;
  totalValue: number;
  transactionDate: string;
}

/**
 * Hover popover for the Insider Signal — a plain-language "signal reason"
 * (who bought, how much, avg cost, latest date) built from real Form 4 data,
 * plus the recent insider transactions (lazily fetched). Rendered in a portal
 * so the table never clips it.
 */
export function InsiderSignalHover({
  ticker,
  signalLabel,
  distinctBuyers,
  totalPurchaseValue,
  avgCost,
  lastBuyDate,
  children,
}: {
  ticker: string;
  signalLabel: string;
  distinctBuyers: number;
  totalPurchaseValue: number;
  avgCost: number | null;
  lastBuyDate: string | null;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data } = useSWR<{ transactions?: Txn[] }>(
    armed && ticker ? `${API_BASE}/companies/${encodeURIComponent(ticker)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const txns = (data?.transactions || []).slice(0, 4);

  function place() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    // Rects are visual px; style values land in body's zoomed space — divide.
    const zoom = effectiveZoom();
    const W = 340 * zoom;
    const left =
      Math.min(Math.max(8, r.left + r.width / 2 - W / 2), window.innerWidth - W - 8) / zoom;
    setPos(
      r.top > 260
        ? { left, bottom: (window.innerHeight - r.top + 8) / zoom }
        : { left, top: (r.bottom + 8) / zoom },
    );
  }
  function show() {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      setArmed(true);
      place();
      setOpen(true);
    }, 120);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  // Data-driven "signal reason" line.
  const parts: string[] = [];
  if (distinctBuyers > 0 && totalPurchaseValue > 0) {
    parts.push(
      `${distinctBuyers} insider${distinctBuyers === 1 ? "" : "s"} bought ${formatCurrency(totalPurchaseValue)}`,
    );
  }
  if (avgCost != null) parts.push(`≈ $${avgCost.toFixed(2)} avg cost`);
  if (lastBuyDate) parts.push(`latest ${formatDate(lastBuyDate)}`);
  const reason = parts.length
    ? parts.join(" · ")
    : "Recent open-market insider buying on this name.";

  return (
    <span
      ref={ref}
      className="relative inline-flex"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      {children}
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            className="rounded-lg overflow-hidden text-left"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: 340,
              zIndex: 60,
              border: "1px solid var(--border)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.30)",
            }}
            role="tooltip"
          >
            <div
              className="px-4 py-2.5"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "#fff",
              }}
            >
              <span className="text-[13.5px] font-bold">
                Insider Signal · {ticker} — {signalLabel}
              </span>
            </div>
            <div className="px-4 py-3" style={{ background: "#ffffff" }}>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1" style={{ color: "#8a98a1" }}>
                Signal reason
              </div>
              <p className="text-[13px] leading-relaxed mb-3" style={{ color: "#2b3a44" }}>
                {reason}
              </p>
              <div className="text-[10px] uppercase tracking-wider font-bold mb-1.5" style={{ color: "#8a98a1" }}>
                Recent activity
              </div>
              {txns.length === 0 ? (
                <p className="text-[12.5px]" style={{ color: "#5b6b75" }}>
                  {armed ? "Loading filings…" : ""}
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {txns.map((t, i) => {
                    const buy = t.type === "BUY" || t.transactionCode === "P";
                    return (
                      <li key={i} className="flex items-center gap-2 text-[12.5px]" style={{ color: "#2b3a44" }}>
                        <span
                          className="px-1.5 py-0.5 rounded text-[10px] font-bold"
                          style={{
                            background: buy ? "rgba(22,168,95,0.15)" : "rgba(221,60,58,0.15)",
                            color: buy ? "#0f7a45" : "#b32a28",
                          }}
                        >
                          {buy ? "BUY" : "SELL"}
                        </span>
                        <Link href={`/insiders/${encodeURIComponent(t.insiderName)}`}
                          className="font-semibold truncate max-w-[130px] hover:text-accent transition">{t.insiderName}</Link>
                        <span className="ml-auto tabular">{formatCurrency(t.totalValue)}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
              <p className="mt-2.5 text-[10.5px]" style={{ color: "#8a98a1" }}>
                From SEC Form 4 filings · informational only.
              </p>
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
