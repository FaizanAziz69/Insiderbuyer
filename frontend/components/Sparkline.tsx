"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Tiny inline 7-day price sparkline — green if up over the window, red if
 * down. Hover (or tap on touch) shows the day-by-day values in a floating
 * tip rendered through a portal: pinned ABOVE the chart with a small gap,
 * viewport-clamped so it never clips against the table or the screen edge,
 * flipping below only when there is no room above.
 */
export function Sparkline({
  data,
  width = 68,
  height = 22,
}: {
  data?: number[] | null;
  width?: number;
  height?: number;
}) {
  const [open, setOpen] = useState(false);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement | null>(null);
  const tipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Pin the tip just above the sparkline every frame while open (2px gap);
  // clamp to the viewport and flip below only if the top edge would clip.
  useEffect(() => {
    if (!open) return;
    const GAP = 2;
    const margin = 8;
    let raf = 0;
    const place = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const w = tipRef.current?.offsetWidth ?? 150;
      const h = tipRef.current?.offsetHeight ?? 56;
      let left = r.left + r.width / 2 - w / 2;
      left = Math.max(margin, Math.min(left, window.innerWidth - w - margin));
      const above = r.top - GAP - h;
      const top = above >= margin ? above : r.bottom + GAP;
      setPos((prev) =>
        prev && prev.top === top && prev.left === left ? prev : { top, left },
      );
      raf = requestAnimationFrame(place);
    };
    raf = requestAnimationFrame(place);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Touch: tap toggles; outside tap or scroll closes.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (wrapRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [open]);

  if (!data || data.length < 2) return <span className="text-faint text-[12px]">—</span>;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const xy = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * height,
  }));
  const pts = xy.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const up = data[data.length - 1] >= data[0];
  const color = up ? "var(--good)" : "var(--bad)";
  const chgPct = data[0] > 0 ? ((data[data.length - 1] - data[0]) / data[0]) * 100 : 0;

  const idxFromX = (clientX: number) => {
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return null;
    const frac = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
    return Math.round(frac * (data.length - 1));
  };

  const active = hoverIdx != null ? Math.min(hoverIdx, data.length - 1) : data.length - 1;
  const daysAgo = data.length - 1 - active;

  return (
    <>
      <span
        ref={wrapRef}
        className="inline-block align-middle cursor-crosshair"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => {
          setOpen(false);
          setHoverIdx(null);
        }}
        onMouseMove={(e) => setHoverIdx(idxFromX(e.clientX))}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setHoverIdx(idxFromX(e.clientX));
          setOpen((v) => !v);
        }}
      >
        <svg
          width={width}
          height={height}
          viewBox={`0 0 ${width} ${height}`}
          className="block"
          aria-hidden
        >
          <polyline
            points={pts}
            fill="none"
            stroke={color}
            strokeWidth={1.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
          {open && (
            <circle cx={xy[active].x} cy={xy[active].y} r={2.4} fill={color} />
          )}
        </svg>
      </span>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            className="fixed rounded-md px-2.5 py-1.5 pointer-events-none z-[70] text-[11.5px] leading-snug"
            style={{
              top: pos.top,
              left: pos.left,
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 10px 28px rgba(0,0,0,0.25)",
              whiteSpace: "nowrap",
            }}
          >
            <div className="font-bold tabular" style={{ color: "var(--text)" }}>
              ${data[active].toFixed(2)}
              <span className="font-medium text-mute">
                {" "}
                · {daysAgo === 0 ? "today" : daysAgo === 1 ? "1 day ago" : `${daysAgo} days ago`}
              </span>
            </div>
            <div className="tabular" style={{ color }}>
              7D {chgPct >= 0 ? "+" : ""}
              {chgPct.toFixed(2)}%
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
