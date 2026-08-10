"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Info } from "lucide-react";

/** Small "PRO" pill for paygated columns. */
export function ProTag() {
  return (
    <span
      className="text-[8.5px] font-extrabold uppercase tracking-wider px-1 py-0.5 rounded"
      style={{ background: "var(--premium, #b8860b)", color: "#fff", lineHeight: 1 }}
    >
      Pro
    </span>
  );
}

/**
 * Info bubble for a column header — an (i) that reveals a "what it means / how
 * it's calculated" explanation on hover (desktop) or tap (touch). Portal-
 * rendered and viewport-clamped so it never clips against the table or edge.
 */
export function HeaderInfo({ text }: { text: string }) {
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
      const w = Math.min(280, window.innerWidth - margin * 2);
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
        aria-label="What this column means"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); }}
        className="inline-flex items-center justify-center h-4 w-4 rounded-full align-middle"
        style={{ color: "var(--text-mute)" }}
      >
        <Info className="h-3 w-3" />
      </button>
      {mounted && open && pos &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="fixed rounded-lg px-3 py-2.5 pointer-events-none z-[80]"
            style={{
              top: pos.top,
              left: pos.left,
              width: Math.min(280, typeof window !== "undefined" ? window.innerWidth - 16 : 280),
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
              whiteSpace: "normal",
              textTransform: "none",
              letterSpacing: "normal",
              font: "normal",
            }}
          >
            <span className="block text-[12px] leading-relaxed font-normal" style={{ color: "var(--text)" }}>
              {text}
            </span>
          </div>,
          document.body,
        )}
    </>
  );
}
