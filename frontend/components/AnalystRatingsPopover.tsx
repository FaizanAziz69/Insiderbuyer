"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import useSWR from "swr";
import { X } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { effectiveZoom } from "@/lib/zoom";

interface RatingRow {
  symbol: string;
  priceTarget: number | null;
  priceWhenPosted: number | null;
  impliedUpsidePct: number | null;
  publishedDate: string;
}

/**
 * Click-to-open ratings history for one analyst (client spec: a popup, not a
 * standalone profile page) — their most recent call on its own strip, then the
 * past ratings under it. Portal-rendered and viewport-clamped like the other
 * tooltips so it never clips inside the table.
 */
export function AnalystRatingsPopover({ name, slug }: { name: string; slug: string }) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement | null>(null);
  const popRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => setMounted(true), []);

  // Place under the name; clamp to the viewport; flip above when cramped.
  useEffect(() => {
    if (!open) return;
    const place = () => {
      const el = btnRef.current;
      if (!el) return;
      // Rects/innerWidth are visual px; style values land in body's zoomed
      // coordinate space — compute visually, write divided by the zoom.
      const zoom = effectiveZoom();
      const r = el.getBoundingClientRect();
      const margin = 8;
      const w = Math.min(340, window.innerWidth - margin * 2);
      let left = Math.max(margin, Math.min(r.left, window.innerWidth - w - margin));
      const h = (popRef.current?.offsetHeight ?? 320) * zoom;
      const top =
        r.bottom + 6 + h > window.innerHeight - margin
          ? Math.max(margin, r.top - 6 - h)
          : r.bottom + 6;
      setPos({ top: top / zoom, left: left / zoom, width: w / zoom });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);

  // Click-away + Esc close.
  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (popRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const key = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  const { data, isLoading } = useSWR<{
    analyst: string | null;
    firm: string | null;
    rows: RatingRow[];
  }>(open ? `${API_BASE}/analysts/${encodeURIComponent(slug)}/ratings?limit=15` : null, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60_000,
  });
  const rows = data?.rows || [];
  // The endpoint orders publishedDate DESC, so row 0 IS the most recent call.
  // It gets its own strip because "what did they just say?" is the first thing
  // asked of an analyst — the table under it is the history.
  const latest = rows[0];

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="font-semibold text-[14px] text-accent hover:underline text-left"
        aria-expanded={open}
        aria-label={`View ${name}'s recent ratings`}
      >
        {name}
      </button>
      {mounted &&
        open &&
        pos &&
        createPortal(
          <div
            ref={popRef}
            role="dialog"
            aria-label={`${name} — recent ratings`}
            className="fixed z-[80] rounded-xl overflow-hidden"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              boxShadow: "0 20px 50px rgba(0,0,0,0.3)",
            }}
          >
            <div
              className="flex items-center justify-between px-3.5 py-2.5"
              style={{ background: "var(--bg-2)", borderBottom: "1px solid var(--border)" }}
            >
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold leading-tight truncate">{name}</div>
                {data?.firm && (
                  <div className="text-[11px] text-mute leading-tight truncate">{data.firm}</div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                className="h-6 w-6 rounded-md inline-flex items-center justify-center hover:bg-[var(--bg-3)] flex-shrink-0"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {latest && (
              <div
                className="px-3.5 py-2 flex items-baseline gap-2"
                style={{
                  background: "color-mix(in srgb, var(--accent) 7%, var(--bg-1))",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span className="text-[9.5px] uppercase tracking-wider font-bold text-mute flex-none">
                  Latest
                </span>
                <span className="text-[12.5px] font-semibold truncate">
                  <Link
                    href={`/companies/${encodeURIComponent(latest.symbol)}`}
                    className="font-mono font-bold text-accent hover:underline"
                  >
                    {latest.symbol}
                  </Link>
                  {latest.priceTarget != null && (
                    <span className="tabular"> ${latest.priceTarget.toFixed(2)} target</span>
                  )}
                </span>
                <span className="text-[11px] text-mute tabular whitespace-nowrap ml-auto flex-none">
                  {new Date(latest.publishedDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </span>
              </div>
            )}
            <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
              {isLoading ? (
                <div className="text-center text-mute text-[12.5px] py-6">Loading ratings…</div>
              ) : rows.length === 0 ? (
                <div className="text-center text-mute text-[12.5px] py-6 px-4">
                  No stored ratings for this analyst yet.
                </div>
              ) : (
                <table className="w-full text-[12.5px]">
                  <thead className="sticky top-0" style={{ background: "var(--bg-2)" }}>
                    <tr className="text-[10px] uppercase tracking-wider text-mute text-left">
                      <th className="font-bold px-3 py-1.5">Stock</th>
                      <th className="font-bold px-2 py-1.5 text-right">Target</th>
                      <th className="font-bold px-2 py-1.5 text-right">Upside*</th>
                      <th className="font-bold px-3 py-1.5 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={`${r.symbol}-${r.publishedDate}-${i}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-1.5">
                          <Link
                            href={`/companies/${encodeURIComponent(r.symbol)}`}
                            className="font-mono font-bold text-accent hover:underline"
                          >
                            {r.symbol}
                          </Link>
                        </td>
                        <td className="px-2 py-1.5 text-right tabular font-semibold">
                          {r.priceTarget != null ? `$${r.priceTarget.toFixed(2)}` : "—"}
                        </td>
                        <td
                          className="px-2 py-1.5 text-right tabular font-semibold"
                          style={{
                            color:
                              r.impliedUpsidePct == null
                                ? "var(--text-faint)"
                                : r.impliedUpsidePct >= 0
                                  ? "var(--good)"
                                  : "var(--bad)",
                          }}
                        >
                          {r.impliedUpsidePct != null
                            ? `${r.impliedUpsidePct >= 0 ? "+" : ""}${r.impliedUpsidePct.toFixed(1)}%`
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-mute whitespace-nowrap">
                          {new Date(r.publishedDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="px-3.5 py-2 text-[10px] text-faint" style={{ borderTop: "1px solid var(--border)" }}>
              *Upside implied vs. the price when the target was posted.
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
