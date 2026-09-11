"use client";

/**
 * §3.4 the common panel shell, with a pluggable vertical-module slot (§3.1).
 *
 * Header (name / question, badges, live figure) → About → the vertical module →
 * Insider Intelligence → CTA row → disclaimer. Everything except the module is
 * written once here, which is what lets a new vertical ship a panel by writing
 * one component.
 *
 * Live re-render is a non-feature by construction: the page passes the entity
 * straight from the same store the bubbles read, so a delta that repaints a
 * bubble repaints the open panel in the same React commit (§9.3).
 */

import { X } from "lucide-react";
import { useEffect, type ReactNode } from "react";

export function DetailPanel({
  open,
  onClose,
  title,
  badges,
  headline,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  badges?: ReactNode;
  /** The one number that belongs beside the title — price, odds, dollars. */
  headline?: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <aside className="viz-panel" data-open={open ? "1" : "0"} aria-hidden={!open}>
      <div className="viz-panel-head">
        <div style={{ minWidth: 0, flex: 1 }}>
          <h2>{title}</h2>
          {badges && <div className="viz-badges">{badges}</div>}
        </div>
        {headline}
        <button type="button" className="viz-close" onClick={onClose} aria-label="Close panel">
          <X size={15} />
        </button>
      </div>
      <div className="viz-panel-body">{children}</div>
    </aside>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="viz-sec">
      <div className="viz-sec-t">{title}</div>
      {children}
    </section>
  );
}

export function Cell({
  label,
  value,
  sub,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="viz-cell">
      <div className="viz-lbl">{label}</div>
      <div className="viz-val" style={color ? { color } : undefined}>
        {value}
        {sub && <span className="viz-val-sub">{sub}</span>}
      </div>
    </div>
  );
}

export function Row({ k, v }: { k: ReactNode; v: ReactNode }) {
  return (
    <div className="viz-row">
      <span className="viz-k">{k}</span>
      <span className="viz-v">{v}</span>
    </div>
  );
}

export function Badge({
  kind,
  children,
}: {
  kind?: "ticker" | "private" | "client" | "source" | "good" | "bad";
  children: ReactNode;
}) {
  return (
    <span className="viz-badge" data-kind={kind}>
      {children}
    </span>
  );
}

/** §8 every panel carries one. The text is per-vertical; the placement is not. */
export function Disclaimer({ children }: { children: ReactNode }) {
  return <div className="viz-disc">{children}</div>;
}

/** §8 source + as-of on every figure that came from outside our own filings. */
export function SourceLine({
  name,
  url,
  date,
}: {
  name: string;
  url?: string | null;
  date?: string | null;
}) {
  return (
    <div className="viz-src">
      Source:{" "}
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer nofollow">
          {name}
        </a>
      ) : (
        name
      )}
      {date ? ` · as of ${date}` : ""}
    </div>
  );
}
