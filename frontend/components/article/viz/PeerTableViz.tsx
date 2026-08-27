"use client";

import { VizFrame } from "./VizFrame";

/**
 * §7 viz 7 — Peer Comparison Table (writer-supplied rows).
 *
 * WHY THIS EXISTS. The six viz types in the manual all read our own data, which
 * means they only work for companies in our SEC Form 4 coverage. An article
 * about a TSXV subject — and its TSXV peer group — has no way to show a table
 * at all, even though a peer comparison is the single most relevant visual that
 * story could carry. The sector-conviction table was standing in, and it was
 * about US-listed insider flows: honest, but off-topic next to a Yukon gold
 * story.
 *
 * So the rows come from the writer. That is a deliberate trade: it is the only
 * option for data we do not hold, and it means the figures are as good as the
 * writer's sourcing rather than guaranteed by a feed. Every number belongs in
 * the article's own source list, and the frame carries a `data-source` line
 * naming where they came from and when.
 *
 * `<div data-viz="peer-table" data-title="…" data-source="…" data-note="…">`
 * with plain `<table>` markup inside. Styling comes from `.viz-table` in
 * globals.css so the supplied markup needs no classes.
 */
export function PeerTableViz({
  html,
  title,
  subtitle,
  source,
  note,
}: {
  html: string;
  title?: string | null;
  subtitle?: string | null;
  source?: string | null;
  note?: string | null;
}) {
  const inner = (html || "").trim();
  if (!inner) return null;
  return (
    <VizFrame
      title={title || "Peer comparison"}
      subtitle={subtitle || null}
      source={source || null}
      footnote={note || null}
    >
      <div className="viz-table" dangerouslySetInnerHTML={{ __html: inner }} />
    </VizFrame>
  );
}
