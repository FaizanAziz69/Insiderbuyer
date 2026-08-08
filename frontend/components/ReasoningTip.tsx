"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MessageSquareText } from "lucide-react";

/**
 * "Why this score" cell: a small icon that reveals the stock's reasoning
 * one-liner in a floating tip — hover on desktop, tap-to-toggle on touch.
 * Rendered through a portal with viewport clamping (never clipped by the
 * table's overflow container, never off-screen on mobile).
 */
export function ReasoningTip({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Position: tight under the icon (4px), clamped to the viewport; flips
  // above when the bottom edge would overflow. Re-pinned every frame while
  // open so hover-highlight/layout shifts can't leave the tip floating away
  // from its icon.
  useEffect(() => {
    if (!open) return;
    const GAP = 4;
    const margin = 8;
    let raf = 0;
    const place = () => {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(320, window.innerWidth - margin * 2);
      let left = r.left + r.width / 2 - width / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - width - margin));
      const h = tipRef.current?.offsetHeight ?? 0;
      const below = r.bottom + GAP;
      const top =
        h && below + h > window.innerHeight - margin
          ? Math.max(margin, r.top - GAP - h)
          : below;
      setPos((prev) =>
        prev && prev.top === top && prev.left === left && prev.width === width
          ? prev
          : { top, left, width },
      );
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Tap-toggle needs outside-tap + scroll to close (mobile has no mouseleave).
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (triggerRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (!text) return <span className="text-faint text-[13px]">—</span>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Why this score"
        aria-expanded={open}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center justify-center h-7 w-7 rounded-full transition focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]"
        style={{
          color: open ? "var(--on-accent)" : "var(--accent)",
          background: open ? "var(--accent)" : "var(--accent-soft)",
        }}
      >
        <MessageSquareText className="h-3.5 w-3.5" strokeWidth={2.2} />
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
              width: pos.width,
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
            }}
          >
            <div className="text-[10px] uppercase tracking-wider font-bold text-mute mb-1">
              Why this score
            </div>
            <div className="text-[12.5px] leading-relaxed" style={{ color: "var(--text)" }}>
              {text}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
