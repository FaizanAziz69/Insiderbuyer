"use client";
import Link from "next/link";
import { ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavGroup } from "@/lib/nav-config";

interface Props {
  group: NavGroup;
}

export function MegaDropdown({ group }: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const closeTimer = useRef<number | null>(null);

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
            className="rounded-xl shadow-xl overflow-hidden"
            style={{
              minWidth: 640,
              background: "var(--bg-2)",
              border: "1px solid var(--border-strong)",
              boxShadow:
                "0 16px 40px rgba(0,0,0,0.18), 0 4px 12px rgba(0,0,0,0.06)",
            }}
          >
            <div className="grid grid-cols-3 gap-6 p-5">
              {group.columns.map((col) => (
                <div key={col.title} className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-accent mb-3">
                    {col.title}
                  </div>
                  <ul className="space-y-1">
                    {col.links.map((link) => {
                      const Icon = link.icon;
                      return (
                        <li key={link.href + link.label}>
                          <Link
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className="flex items-start gap-2.5 px-2.5 py-2 rounded-md hover:bg-[var(--accent-soft)] transition group"
                          >
                            {Icon && (
                              <Icon
                                className="h-4 w-4 mt-0.5 flex-shrink-0"
                                style={{ color: "var(--accent)" }}
                              />
                            )}
                            <div className="min-w-0">
                              <div className="text-[13px] font-semibold leading-tight group-hover:text-accent transition flex items-center gap-1.5">
                                {link.label}
                                {link.badge === "premium" && (
                                  <span
                                    className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                                    style={{
                                      background: "var(--accent-soft)",
                                      color: "var(--accent)",
                                    }}
                                  >
                                    Premium
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

            {group.callouts && group.callouts.length > 0 && (
              <div
                className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 border-t"
                style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
              >
                {group.callouts.map((c) => {
                  const Icon = c.icon;
                  return (
                    <Link
                      key={c.href + c.title}
                      href={c.href}
                      onClick={() => setOpen(false)}
                      className="flex items-start gap-3 p-3 rounded-lg hover:bg-[var(--bg-2)] transition"
                      style={{
                        background:
                          "color-mix(in srgb, var(--accent) 8%, var(--bg-2))",
                        border:
                          "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))",
                      }}
                    >
                      <div
                        className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{
                          background:
                            "linear-gradient(135deg, var(--accent), var(--accent-2))",
                        }}
                      >
                        <Icon className="h-4 w-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <div className="text-[13px] font-bold text-accent leading-tight">
                          {c.title}
                        </div>
                        <div className="text-[11px] text-mute leading-snug mt-0.5">
                          {c.description}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
