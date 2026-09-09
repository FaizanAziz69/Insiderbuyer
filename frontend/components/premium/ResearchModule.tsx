"use client";

/**
 * Brief v4 §5 — the Harvard study as a standalone trust module directly
 * under the fold: a wide card, a large SERIF "Harvard" wordmark (typographic
 * treatment only — never the crest, which would imply an endorsement we do
 * not have), the study's headline finding as the biggest text in the module,
 * and the full citation beneath.
 *
 * Accuracy (§5 "this module will draw scrutiny"): the old page paraphrased
 * "a peer-reviewed Harvard study found that insiders consistently beat the
 * S&P 500", which no paper says. The study we cite is Cohen, Malloy and
 * Pomorski (Harvard Business School), "Decoding Inside Information", Journal
 * of Finance 67(3), 2012. Its abstract reports that a portfolio of
 * "opportunistic" insider trades (as opposed to routine, calendar-scheduled
 * ones) earned value-weighted abnormal returns of 82 basis points per month,
 * while routine trades earned none — quoted here verbatim. Verified against
 * the NBER working paper page (w16454) on 2026-09-08.
 *
 * The optional second row (§5 "optional strengthener") cites Jeng, Metrick
 * and Zeckhauser, Review of Economics and Statistics 2003 — insider PURCHASES
 * earned abnormal returns of more than 6% a year, sales did not. George owns
 * the study list; drop `SECOND_STUDY` to remove the row.
 */
const SECOND_STUDY: { finding: string; citation: string } | null = {
  finding:
    "Insider purchases earned abnormal returns of more than 6% per year; insider sales earned none.",
  citation:
    "Leslie A. Jeng, Andrew Metrick and Richard Zeckhauser, “Estimating the Returns to Insider Trading: A Performance-Evaluation Perspective,” The Review of Economics and Statistics 85(2), 2003.",
};

export function ResearchModule() {
  return (
    <section className="biv-section biv-research-wrap" aria-labelledby="research-h">
      {/* Brief v4 §3.2 — the section header George asked for above the study
          (call, 2026-09-10). */}
      <h2 id="research-h" className="biv-h2 biv-center">When it comes to investing, insider data matters.</h2>
      {/* George (call, 2026-09-10): "too much text — before we had one line,
          which was good"; the Harvard attribution sits UNDER the line as the
          source. One line, still accurate to the paper (the old "consistently
          beat the S&P 500" paraphrase is not something the study says). */}
      <div className="biv-research biv-research-one">
        <p className="biv-research-finding">
          Harvard Business School research found that insiders&rsquo; opportunistic trades beat the market by{" "}
          <span className="biv-accent">82 basis points a month</span>.
        </p>
        <div className="biv-research-mark biv-research-mark-under" aria-hidden="true">
          <span className="biv-research-serif">Harvard</span>
          <span className="biv-research-sub">Business School research</span>
        </div>
        <p className="biv-research-cite">
          Cohen, Malloy and Pomorski, “Decoding Inside Information,” <em>The Journal of Finance</em> 67(3), 2012.
          Historical averages, not a forecast. Insider Buying is not affiliated with or endorsed by Harvard University.
        </p>
      </div>
    </section>
  );
}

export const RESEARCH_CSS = `
.biv-research-wrap { padding-top: 8px !important; }
.biv-research.biv-research-one { display: grid; grid-template-columns: 1fr; gap: 18px; justify-items: center; text-align: center; max-width: 980px; margin: 36px auto 0; }
.biv-research-one .biv-research-finding { font-size: clamp(22px, 2.4vw, 32px); max-width: 860px; }
.biv-research-mark-under { border-right: 0 !important; padding-right: 0 !important; justify-items: center !important; gap: 2px !important; }
.biv-research-one .biv-research-serif { font-size: clamp(40px, 4vw, 56px); }
.biv-research-one .biv-research-cite { margin-top: 4px; text-align: center; max-width: 760px; }
.biv-research {
  display: grid; grid-template-columns: 300px 1fr; gap: 40px; align-items: center;
  /* Theme-aware glass surfaces (the hero panels' tokens) — the module was
     first shipped on a hardcoded navy gradient, which put dark text on a dark
     card in the site's light theme. */
  background: linear-gradient(135deg, var(--panel-a), var(--panel-b));
  border: 1px solid var(--panel-line-c); border-radius: 22px; padding: 44px 48px;
  box-shadow: 0 30px 80px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,0.04);
  position: relative; overflow: hidden;
}
.biv-research::before {
  content: ""; position: absolute; inset: -40% auto auto -10%; width: 520px; height: 520px;
  background: radial-gradient(closest-side, rgba(201,162,39,0.16), transparent 70%); pointer-events: none;
}
.biv-research-mark { display: grid; gap: 6px; justify-items: start; border-right: 1px solid var(--line); padding-right: 34px; }
.biv-research-serif {
  font-family: Georgia, "Times New Roman", "Iowan Old Style", serif; font-weight: 700;
  font-size: clamp(54px, 5.6vw, 80px); letter-spacing: -0.02em; line-height: 0.95; color: var(--research-serif, #F2E6C9);
}
.biv-research-sub { font-size: 12.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--faint); font-weight: 700; }
.biv-research-eyebrow { text-align: left !important; margin-bottom: 10px; }
.biv-research-finding {
  font-family: var(--font-heading), sans-serif; font-weight: 900; text-transform: none; letter-spacing: -0.02em;
  font-size: clamp(26px, 3vw, 40px); line-height: 1.08; color: var(--ink); margin: 0;
}
.biv-research-cite { font-size: 14px; line-height: 1.6; color: var(--dim); margin: 16px 0 0; }
.biv-research-second { margin-top: 22px; padding-top: 18px; border-top: 1px solid var(--line); }
.biv-research-second-finding { font-size: 17px; font-weight: 700; color: var(--ink); margin: 0; line-height: 1.4; }
.biv-research-second .biv-research-cite { margin-top: 8px; font-size: 13px; }
@media (max-width: 860px) {
  .biv-research { grid-template-columns: 1fr; gap: 24px; padding: 30px 24px; }
  .biv-research-mark { border-right: 0; padding-right: 0; border-bottom: 1px solid var(--line); padding-bottom: 20px; }
}
`;
