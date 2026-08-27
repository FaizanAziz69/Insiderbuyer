"use client";
import { ReactNode } from "react";

/**
 * Shared shell for every editorial data visualization (Editorial Playbook v2
 * §7). One frame for all six types, so an article that carries two of them
 * reads as one system rather than two widgets: a navy eyebrow band with the
 * viz title, the content, and the source line the manual requires
 * ("Source: SEC EDGAR Form 4 filings, reviewed by InsiderBuying.com").
 *
 * Rendered as a <figure>: this is a figure with a caption, and screen readers
 * and Google both benefit from it being marked as one.
 */
export function VizFrame({
  title,
  subtitle,
  source = "SEC EDGAR Form 4 filings, reviewed by InsiderBuying.com",
  children,
  footnote,
}: {
  title: string;
  subtitle?: string | null;
  source?: string | null;
  children: ReactNode;
  footnote?: ReactNode;
}) {
  return (
    <figure
      className="my-8 rounded-lg overflow-hidden not-prose"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="px-4 py-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1"
        style={{ background: "var(--brand-surface)" }}
      >
        <span
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: "var(--gold)" }}
        >
          {title}
        </span>
        {subtitle ? (
          <span
            className="text-[11.5px]"
            style={{ color: "rgba(255,255,255,0.82)" }}
          >
            {subtitle}
          </span>
        ) : null}
      </div>

      {/* Tables and stat rows overflow on a phone; they scroll inside the
          figure rather than pushing the article body sideways. */}
      <div className="overflow-x-auto">{children}</div>

      {(source || footnote) && (
        <figcaption
          className="px-4 py-2.5 text-[11px] leading-relaxed"
          style={{ borderTop: "1px solid var(--border)", color: "var(--text-mute)" }}
        >
          {footnote ? <span className="block mb-1">{footnote}</span> : null}
          {source ? <span>Source: {source}</span> : null}
        </figcaption>
      )}
    </figure>
  );
}

/** Uniform loading footprint, so a viz does not shift the article as it loads. */
export function VizSkeleton({ height = 190 }: { height?: number }) {
  return <div className="shimmer rounded-lg my-8" style={{ height }} />;
}
