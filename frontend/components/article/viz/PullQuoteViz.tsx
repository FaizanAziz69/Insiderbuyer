"use client";

/**
 * §7 viz 6 — Data Pull-Quote Box. "Dark navy background, gold text. Place in
 * the body between the context paragraph and the insider angle paragraph."
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
      className="viz-pull-quote my-8 rounded-lg px-5 py-5 sm:px-7 sm:py-6 not-prose"
      style={{
        background: "var(--brand-surface)",
        border: "1px solid var(--brand-surface-border)",
      }}
    >
      <blockquote
        className="text-[18px] sm:text-[22px] font-semibold leading-snug"
        style={{ color: "var(--gold)", fontFamily: "var(--font-heading), var(--font-sans)" }}
        dangerouslySetInnerHTML={{ __html: text }}
      />
      {cite ? (
        <p className="mt-3 text-[11.5px]" style={{ color: "rgba(255,255,255,0.72)" }}>
          {cite}
        </p>
      ) : null}
    </aside>
  );
}
