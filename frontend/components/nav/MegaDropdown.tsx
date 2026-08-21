"use client";
import Link from "next/link";
import { ChevronDown, Lock } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { NavGroup } from "@/lib/nav-config";
import { effectiveZoom } from "@/lib/zoom";

interface Props {
  group: NavGroup;
}

export function MegaDropdown({ group }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);
  const [shift, setShift] = useState(0);

  // The panel sizes to its content so single-line labels can make it wider
  // than the space right of the trigger — pull it left just enough to stay
  // inside the viewport.
  useLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    // Rect is visual px; translateX applies inside body's zoom — divide.
    const zoom = effectiveZoom();
    const overflow = rect.right - (window.innerWidth - 12);
    if (overflow > 0)
      setShift(-Math.min(overflow, Math.max(rect.left - 12, 0)) / zoom);
  }, [open]);

  // Hover-open with grace period so the panel doesn't snap shut crossing the gap.
  function scheduleClose() {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  }
  function cancelClose() {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }

  // Outside-click closes on mobile click-toggle.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  // Mini "live score" preview shown on the premium callouts (client
  // 2026-08-22): fills the right half of the full-width card instead of
  // leaving it empty, and gives the lock something concrete to sell.
  function ScorePreview() {
    return (
      <div
        aria-hidden
        className="hidden sm:flex flex-col items-center flex-shrink-0 rounded-lg px-4 py-2.5"
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border)",
          minWidth: 170,
        }}
      >
        <div
          className="text-[8px] font-mono font-bold uppercase tracking-[0.18em] px-1.5 py-0.5 rounded"
          style={{ background: "var(--brand-surface)", color: "#fff" }}
        >
          Live Score · Sample
        </div>
        <div className="flex items-baseline gap-1 mt-0.5">
          <span
            className="text-[26px] font-extrabold leading-none tabular"
            style={{ color: "var(--good)" }}
          >
            92
          </span>
          <span className="text-[9px] font-mono text-mute uppercase tracking-wider">
            / 99 · Insider Score
          </span>
        </div>
        <div className="w-full mt-1.5 relative">
          <div
            className="h-1.5 rounded-full w-full"
            style={{
              background:
                "linear-gradient(90deg, var(--bad) 0%, #e8b54d 50%, var(--good) 100%)",
            }}
          />
          <div
            className="absolute -top-0.5 h-2.5 w-[3px] rounded-sm"
            style={{ left: "88%", background: "var(--text)" }}
          />
        </div>
        <div className="w-full flex justify-between mt-1 text-[7px] font-mono uppercase tracking-[0.14em] text-faint">
          <span>Weak</span>
          <span>Neutral</span>
          <span style={{ color: "var(--good)" }}>Strong</span>
        </div>
      </div>
    );
  }

  // Callout cards (e.g. the Insider Access upsell). Rendered at the top or
  // bottom of the panel depending on the group's calloutPosition. Each card
  // spans the FULL panel width (client 2026-08-22 — no dead space on the
  // right); premium ones carry the live-score preview on the right.
  function renderCallouts(g: NavGroup, position: "top" | "bottom") {
    if (!g.callouts || g.callouts.length === 0) return null;
    return (
      <div
        className={`flex flex-col gap-3 p-3 ${
          position === "top" ? "border-b" : "border-t"
        }`}
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        {g.callouts.map((c) => {
          const Icon = c.icon;
          return (
            <Link
              key={c.href + c.title}
              href={c.href}
              onClick={() => setOpen(false)}
              className="flex items-center gap-3 p-3 rounded-lg transition w-full"
              style={
                c.premium
                  ? {
                      background:
                        "color-mix(in srgb, var(--premium) 12%, var(--bg-2))",
                      border:
                        "1px solid color-mix(in srgb, var(--premium) 45%, var(--border))",
                    }
                  : {
                      background:
                        "color-mix(in srgb, var(--accent) 8%, var(--bg-2))",
                      border:
                        "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))",
                    }
              }
            >
              <div
                className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: c.premium
                    ? "linear-gradient(135deg, var(--premium), var(--premium-strong))"
                    : "linear-gradient(135deg, var(--accent), var(--accent-2))",
                }}
              >
                <Icon
                  className="h-4 w-4"
                  style={{ color: c.premium ? "var(--premium-ink)" : "#fff" }}
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-bold leading-tight flex items-center gap-1.5" style={{ color: "var(--accent)" }}>
                  {c.title}
                  {c.premium && (
                    <span
                      className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                      style={{ background: "var(--premium)", color: "var(--premium-ink)" }}
                    >
                      <Lock className="h-2.5 w-2.5" /> Insider Access
                    </span>
                  )}
                </div>
                {/* width:0 + min-width:100% keeps this long text from inflating
                    the panel's max-content width — it wraps inside whatever
                    width the link columns produce. */}
                <div
                  className="text-[11px] text-mute leading-snug mt-0.5"
                  style={{ width: 0, minWidth: "100%" }}
                >
                  {c.description}
                </div>
              </div>
              {c.premium && <ScorePreview />}
            </Link>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md transition whitespace-nowrap"
        style={{
          color: open ? "var(--gold)" : "#ffffff",
          background: open ? "rgba(255,255,255,0.12)" : "transparent",
          fontSize: "1.12rem",
          fontWeight: 700,
          letterSpacing: "-0.005em",
        }}
        aria-expanded={open}
      >
        {group.label}
        <ChevronDown
          className="h-4 w-4 transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}
        />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full pt-2 z-40"
          onMouseEnter={cancelClose}
          onMouseLeave={scheduleClose}
        >
          <div
            ref={panelRef}
            className="rounded-xl shadow-xl overflow-hidden"
            style={{
              transform: shift ? `translateX(${shift}px)` : undefined,
              width: "max-content",
              minWidth: 480,
              maxWidth: "calc(100vw - 24px)",
              background: "var(--bg-2)",
              border: "1px solid var(--border-strong)",
              boxShadow:
                "0 16px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.06)",
            }}
          >
            {group.calloutPosition === "top" && renderCallouts(group, "top")}

            <div
              className="grid gap-x-6 gap-y-3 p-4"
              style={{
                gridTemplateColumns: `repeat(${group.columns.length}, minmax(max-content, 1fr))`,
              }}
            >
              {group.columns.map((col, ci) => (
                <div key={col.title ?? `col-${ci}`}>
                  {col.title && (
                    <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent mb-3">
                      {col.title}
                    </div>
                  )}
                  <ul className="space-y-0.5">
                    {col.links.map((link) => {
                      const Icon = link.icon;
                      return (
                        <li key={link.href + link.label}>
                          <Link
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-2.5 px-2.5 py-1.5 rounded-md hover:bg-[var(--accent-soft)] transition group"
                          >
                            {Icon && (
                              <Icon
                                className="h-4 w-4 mt-0.5 flex-shrink-0"
                                style={{ color: "var(--accent)" }}
                              />
                            )}
                            <div>
                              <div className="text-[13px] font-semibold leading-tight group-hover:text-accent transition flex items-center gap-1.5 whitespace-nowrap">
                                {link.label}
                                {link.badge === "premium" && (
                                  <span
                                    className="inline-flex items-center gap-0.5 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      background: "var(--premium)",
                                      color: "var(--premium-ink)",
                                    }}
                                  >
                                    <Lock className="h-2.5 w-2.5" /> Insider Access
                                  </span>
                                )}
                                {link.badge === "new" && (
                                  <span
                                    className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      background: "var(--good-soft)",
                                      color: "var(--good)",
                                    }}
                                  >
                                    New
                                  </span>
                                )}
                                {link.badge === "popular" && (
                                  <span
                                    className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      background:
                                        "color-mix(in srgb, var(--warn) 18%, transparent)",
                                      color: "var(--warn)",
                                    }}
                                  >
                                    Popular
                                  </span>
                                )}
                              </div>
                              {link.description && (
                                <div className="text-[11px] text-mute leading-snug mt-0.5">
                                  {link.description}
                                </div>
                              )}
                            </div>
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            {group.calloutPosition !== "top" && renderCallouts(group, "bottom")}
          </div>
        </div>
      )}
    </div>
  );
}
