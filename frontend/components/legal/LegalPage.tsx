export type LegalSection = { h: string; p: string };

/** Shared shell for the footer legal/policy pages (privacy, terms, cookies,
 *  disclosures, corrections) — same visual structure as /disclaimer. */
export function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  updated: string;
  sections: LegalSection[];
}) {
  return (
    <div className="w-full max-w-3xl mx-auto space-y-6 py-2">
      <header>
        <div className="text-mute text-sm mb-1 font-mono uppercase tracking-wider text-[11px]">
          {eyebrow}
        </div>
        <h1
          className="text-[30px] sm:text-[38px] font-bold tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          {title}
        </h1>
        <p className="text-mute text-[14px] mt-2">{intro}</p>
        <p className="text-mute text-[12px] mt-1 font-mono">Last updated: {updated}</p>
      </header>

      <div className="space-y-6">
        {sections.map((s) => (
          <section key={s.h}>
            <h2
              className="text-[18px] font-bold tracking-tight mb-1.5"
              style={{ color: "var(--text)" }}
            >
              {s.h}
            </h2>
            <p className="text-[14.5px] leading-relaxed text-soft">{s.p}</p>
          </section>
        ))}
      </div>
    </div>
  );
}
