"use client";

/**
 * §7 viz 6 — Data Pull-Quote. Placed in the body between the context paragraph
 * and the insider angle paragraph.
 *
 * THE NAVY BOX AND GOLD TEXT ARE GONE (client, 2026-09-24: "the quotes in the
 * blue box and yellow text. I don't like that. Let's stop doing that for all
 * articles"). The §7 spec said "dark navy background, gold text"; it now reads
 * as a newspaper pull-quote instead — body ink, heading face, a single brand
 * rule down the left, nothing behind it. Changing it here changes it on every
 * article at once, live ones included, since the treatment is presentational
 * and the stored body only carries the embed.
 *
 * The only viz whose content the writer supplies: the text inside the embed is
 * the quote. It arrives as already-sanitised article HTML (the publish path
 * strips scripts and unknown links), so it is rendered as HTML to keep any
 * inline emphasis the writer used.
 *
 * `<div data-viz="pull-quote">In the 30 days before the announcement,
 *  executives filed zero open-market purchases.</div>`
 */
export function PullQuoteViz({ html, cite }: { html: string; cite?: string | null }) {
  const text = (html || "").trim();
  if (!text) return null;
  return (
    <aside
      className="viz-pull-quote my-8 pl-5 sm:pl-6 py-1 not-prose"
      style={{ borderLeft: "3px solid var(--accent)" }}
    >
      <blockquote
        className="text-[18px] sm:text-[22px] font-semibold leading-snug"
        style={{ color: "var(--text)", fontFamily: "var(--font-heading), var(--font-sans)" }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
      {cite ? (
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-mute)" }}>
          {cite}
        </p>
      ) : null}
    </aside>
  );
}
