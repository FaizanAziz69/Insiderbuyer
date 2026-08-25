/**
 * Brand positioning block for the tool pages (Round-2 brief, Section 5).
 *
 * The brief's instruction, verbatim: "Directly below that heading, add: (1) a
 * tagline in a slightly smaller, italic or colored text style, and (2) a
 * 2-sentence description. This content should be visible above the tool data,
 * not buried below it."
 *
 * Copy lives at each call site so every page's wording is the document's, and
 * a change there is a change to one page only.
 */
export function ToolIntro({
  tagline,
  children,
}: {
  tagline: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 max-w-3xl">
      <p
        className="text-[15px] sm:text-[16px] italic font-medium leading-snug"
        style={{ color: "var(--gold)" }}
      >
        {tagline}
      </p>
      <p className="text-soft text-[14px] sm:text-[14.5px] mt-2.5 leading-relaxed">
        {children}
      </p>
    </div>
  );
}
