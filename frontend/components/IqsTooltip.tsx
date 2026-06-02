"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  className?: string;
  children?: React.ReactNode;
}

export function IqsTooltip({ className = "", children }: Props) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const triggerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const TIP_W = 300;
    const margin = 8;
    let left = r.left + r.width / 2 - TIP_W / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - TIP_W - margin));
    const top = r.bottom + 8;
    setPos({ top, left });
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`relative inline-flex items-center gap-1 cursor-help ${className}`}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        tabIndex={0}
      >
        {children ?? <span className="font-mono font-bold">IQS</span>}
      </span>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            role="tooltip"
            className="fixed rounded-lg p-3.5 pointer-events-none"
            style={{
              top: pos.top,
              left: pos.left,
              width: 300,
              zIndex: 99999,
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              boxShadow:
                "0 12px 32px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.08), 0 0 0 1px var(--border)",
              textTransform: "none",
              letterSpacing: "normal",
              fontWeight: 400,
            }}
          >
            <div className="text-[11px] font-bold mb-1.5 text-accent uppercase tracking-wider">
              Insider Buying Quality Score
            </div>
            <p
              className="text-[12.5px] leading-relaxed normal-case tracking-normal"
              style={{ color: "var(--text)", fontWeight: 400 }}
            >
              <span className="font-bold">IQS</span> blends four signals from SEC Form 4 buys:
              purchase volume, cluster effect (multiple insiders within days), role weighting
              (CEO/CFO/Director), and holding-change magnitude. Higher = stronger insider
              conviction.
            </p>
          </div>,
          document.body,
        )}
    </>
  );
}
