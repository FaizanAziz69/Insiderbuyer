"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/** Plain-language explanation of each Form 4 transaction nature — the context
 *  the client asked for (an open-market buy is very different from IPO/PIPE
 *  financing, a grant, an option exercise or a tax withholding). */
const EXPLAIN: Record<string, { label: string; color: string; why: string }> = {
  open_market: {
    label: "Open Market",
    color: "var(--good)",
    why: "An open-market purchase or sale (Form 4 code P/S) — the insider chose to trade at the prevailing share price. This is the strongest conviction signal.",
  },
  financing: {
    label: "Financing",
    color: "var(--gold)",
    why: "Looks like a capital-raise / private placement, not an open-market buy: multiple insiders acquired the identical share count at the same fixed price on the same day. Real buying, but they were subscribing to a financing round at a set offer price — not buying in the open market.",
  },
  grant: {
    label: "Grant / Award",
    color: "var(--text-mute)",
    why: "Shares granted as compensation (Form 4 code A) — awarded, not bought. Not a conviction signal.",
  },
  option: {
    label: "Option Exercise",
    color: "var(--text-mute)",
    why: "Shares acquired by exercising options (code M/X) — a compensation mechanic, not an open-market purchase.",
  },
  tax: {
    label: "Tax Withholding",
    color: "var(--bad)",
    why: "Shares surrendered to cover taxes on vesting equity (code F) — an automatic disposal, not a discretionary sale.",
  },
  gift: {
    label: "Gift",
    color: "var(--text-mute)",
    why: "Shares given or received as a gift (code G) — not a market transaction.",
  },
  conversion: {
    label: "Conversion",
    color: "var(--text-mute)",
    why: "Shares from converting another security (code C) — not an open-market trade.",
  },
  other: {
    label: "Other",
    color: "var(--text-mute)",
    why: "A Form 4 transaction that isn't a standard open-market buy or sale (code J or similar). See the filing for detail.",
  },
};

/** Small type pill with a tap/hover explainer, viewport-clamped via a portal. */
export function TxTypeBadge({ txType, txLabel }: { txType?: string; txLabel?: string }) {
  const info = EXPLAIN[txType || "open_market"] || EXPLAIN.other;
  const label = txLabel || info.label;
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const place = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const w = Math.min(300, window.innerWidth - margin * 2);
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      const h = tipRef.current?.offsetHeight ?? 0;
      const top = r.bottom + 6 + h > window.innerHeight - margin ? Math.max(margin, r.top - 6 - h) : r.bottom + 6;
      setPos((p) => (p && p.top === top && p.left === left ? p : { top, left }));
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  return (
    <>
      <button
        ref={ref}
        type="button"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold whitespace-nowrap transition"
        style={{
          background: `color-mix(in srgb, ${info.color} 14%, transparent)`,
          color: info.color,
        }}
      >
        {label}
        <Info className="h-3 w-3 opacity-70" />
      </button>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="fixed rounded-lg px-3.5 py-3 pointer-events-none z-[70]"
            style={{
              top: pos.top,
              left: pos.left,
              width: Math.min(300, typeof window !== "undefined" ? window.innerWidth - 16 : 300),
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            }}
          >
            <div className="text-[11px] uppercase tracking-wider font-bold mb-1" style={{ color: info.color }}>
              {label}
            </div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text)" }}>
              {info.why}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
