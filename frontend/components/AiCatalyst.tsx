"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import useSWR from "swr";
import { Sparkles } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

/**
 * "Movement Explainer" hover popover — hover (or focus) the ✨ icon to open an
 * AI-generated explanation of why the ticker is moving (Claude-backed
 * /content/explain, cached server-side). Rendered in a portal with fixed
 * positioning so the table's overflow never clips it. Shows only AI analysis
 * (no data repeated from the table).
 */
export function AiCatalyst({
  ticker,
  name,
  changePct,
}: {
  ticker: string;
  name: string;
  changePct: number;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState(false);
  const [pos, setPos] = useState<{
    left: number;
    bottom?: number;
    top?: number;
    width: number;
    maxHeight: number;
  } | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  const { data, isLoading } = useSWR<{ title: string; explainer: string }>(
    armed && ticker
      ? `${API_BASE}/content/explain?symbol=${encodeURIComponent(ticker)}&name=${encodeURIComponent(
          name,
        )}&change=${changePct}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  function place() {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    // Responsive width: full 360 on desktop, but never wider than the viewport
    // (minus 8px gutters) on mobile.
    const W = Math.min(360, vw - 16);
    // Anchor the right edge under the icon, then clamp inside the viewport.
    const left = Math.min(Math.max(8, r.right - W), vw - W - 8);
    // Open on whichever side has more room, and cap the height to that room so
    // tall AI text scrolls inside the popover instead of overflowing off-screen.
    const spaceBelow = vh - r.bottom - 8;
    const spaceAbove = r.top - 8;
    if (spaceBelow >= spaceAbove) {
      setPos({ left, top: r.bottom + 8, width: W, maxHeight: Math.max(160, spaceBelow) });
    } else {
      setPos({
        left,
        bottom: vh - r.top + 8,
        width: W,
        maxHeight: Math.max(160, spaceAbove),
      });
    }
  }

  function show() {
    if (timer.current) clearTimeout(timer.current);
    // Open immediately; a tiny delay only guards against firing an AI request
    // on a quick mouse pass. Pre-warmed rows resolve from cache instantly.
    timer.current = setTimeout(() => {
      setArmed(true);
      place();
      setOpen(true);
    }, 60);
  }
  function hide() {
    if (timer.current) clearTimeout(timer.current);
    setOpen(false);
  }

  const explainer = data?.explainer || "";
  const title = data?.title || "";

  return (
    <span
      className="relative inline-flex items-center justify-center"
      onMouseEnter={show}
      onMouseLeave={hide}
    >
      <button
        ref={ref}
        type="button"
        onFocus={show}
        onBlur={hide}
        className="inline-flex items-center justify-center h-7 w-7 rounded-full cursor-help focus:outline-none"
        style={{
          background: "color-mix(in srgb, var(--accent) 14%, transparent)",
          color: "var(--accent)",
        }}
        aria-label={`Movement explainer for ${name}`}
      >
        <Sparkles className="h-4 w-4" />
      </button>

      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            className="pointer-events-none rounded-lg overflow-y-auto text-left"
            style={{
              position: "fixed",
              left: pos.left,
              top: pos.top,
              bottom: pos.bottom,
              width: pos.width,
              maxHeight: pos.maxHeight,
              zIndex: 60,
              border: "1px solid var(--border)",
              boxShadow: "0 18px 44px rgba(0,0,0,0.30)",
            }}
            role="tooltip"
          >
            {/* Header band — our accent scheme */}
            <div
              className="px-4 py-2.5 flex items-center gap-2"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                color: "#ffffff",
              }}
            >
              <Sparkles className="h-4 w-4 flex-shrink-0" />
              <span className="text-[13.5px] font-bold leading-tight">
                Movement Explainer · {name}
              </span>
            </div>
            {/* Body — AI analysis only */}
            <div className="px-4 py-3.5" style={{ background: "#ffffff" }}>
              {isLoading || !data ? (
                <p className="text-[13.5px] leading-relaxed" style={{ color: "#5b6b75" }}>
                  Generating the latest AI analysis…
                </p>
              ) : explainer ? (
                <>
                  {title && (
                    <div className="text-[13.5px] font-bold mb-1.5" style={{ color: "#0b1f2a" }}>
                      {title}
                    </div>
                  )}
                  <p className="text-[13.5px] leading-relaxed" style={{ color: "#2b3a44" }}>
                    {explainer}
                  </p>
                  <p className="mt-2.5 text-[11px]" style={{ color: "#8a98a1" }}>
                    AI-generated · informational only, not investment advice.
                  </p>
                </>
              ) : (
                <p className="text-[13.5px] leading-relaxed" style={{ color: "#5b6b75" }}>
                  A detailed AI analysis isn&rsquo;t available for {ticker} right now.
                </p>
              )}
            </div>
          </div>,
          document.body,
        )}
    </span>
  );
}
