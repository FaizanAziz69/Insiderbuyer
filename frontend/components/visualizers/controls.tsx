"use client";

/** §3.1 Filter/Search Bar primitives — category chips, toggles, live pill,
 *  legend. Shared by all four products so the controls bar is identical
 *  everywhere and a new vertical composes rather than restyles. */

import type { ReactNode } from "react";

export function Chip({
  on,
  onClick,
  children,
  count,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
  title?: string;
}) {
  return (
    <button type="button" className="viz-chip" data-on={on ? "1" : "0"} onClick={onClick} title={title}>
      {children}
      {count != null && <span className="viz-count">{count}</span>}
    </button>
  );
}

export function Toggle({
  on,
  onClick,
  children,
  title,
}: {
  on: boolean;
  onClick: () => void;
  children: ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      className="viz-toggle"
      data-on={on ? "1" : "0"}
      onClick={onClick}
      aria-pressed={on}
      title={title}
    >
      <span className="viz-switch" aria-hidden />
      {children}
    </button>
  );
}

/** Connection state, in the reader's language: live, or how stale. */
export function LivePill({ live, label }: { live: boolean; label: string }) {
  return (
    <span className="viz-live" data-stale={live ? "0" : "1"}>
      <span className="viz-pulse" aria-hidden />
      {label}
    </span>
  );
}

export function Legend({
  title,
  rows,
  note,
}: {
  title: string;
  rows: { color: string; label: string }[];
  note?: string;
}) {
  return (
    <div className="viz-legend">
      <div className="viz-legend-t">{title}</div>
      {rows.map((r) => (
        <div className="viz-legend-row" key={r.label}>
          <span className="viz-swatch" style={{ background: r.color }} />
          {r.label}
        </div>
      ))}
      {note && <div style={{ marginTop: 2, fontSize: 10.5, color: "var(--text-faint)" }}>{note}</div>}
    </div>
  );
}
