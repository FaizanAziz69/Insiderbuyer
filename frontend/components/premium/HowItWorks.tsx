"use client";
import { SITE_STATS } from "@/lib/site-stats";

/**
 * Brief v4 §3.3 — three steps, copy verbatim, each with a small supporting
 * graphic (inline SVG, brand palette, no external assets). The two figures in
 * step 1 come from the canonical stats config (§7) so they can never drift
 * from the rest of the site.
 */
const STEPS = [
  {
    n: 1,
    text: `We scan over ${SITE_STATS.filingsScanned} insider filings and ${SITE_STATS.fundamentalsTracked} stock fundamentals`,
    art: (
      <svg viewBox="0 0 120 80" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <rect key={i} x={10 + i * 26} y={22 - i * 4} width="22" height="46" rx="4" fill="rgba(157,176,199,0.16)" stroke="rgba(157,176,199,0.35)" />
        ))}
        {[0, 1, 2, 3].map((i) => (
          <g key={`l${i}`} stroke="rgba(157,176,199,0.5)" strokeWidth="2" strokeLinecap="round">
            <line x1={15 + i * 26} y1={32 - i * 4} x2={27 + i * 26} y2={32 - i * 4} />
            <line x1={15 + i * 26} y1={40 - i * 4} x2={25 + i * 26} y2={40 - i * 4} />
          </g>
        ))}
        <circle cx="96" cy="58" r="14" fill="#0E1A2E" stroke="var(--brand)" strokeWidth="3" />
        <line x1="106" y1="68" x2="116" y2="78" stroke="var(--brand)" strokeWidth="4" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    n: 2,
    text: "All data passes through our proprietary filter",
    art: (
      <svg viewBox="0 0 120 80" aria-hidden="true">
        <path d="M10 10 H110 L70 44 V72 L50 64 V44 Z" fill="rgba(62,155,95,0.16)" stroke="var(--green-hi)" strokeWidth="2.5" strokeLinejoin="round" />
        {[22, 40, 58, 76, 94].map((x, i) => (
          <circle key={x} cx={x} cy={i % 2 ? 20 : 26} r="3.5" fill={i === 2 ? "var(--brand)" : "rgba(157,176,199,0.6)"} />
        ))}
        <circle cx="60" cy="66" r="4" fill="var(--brand)" />
      </svg>
    ),
  },
  {
    n: 3,
    text: "You get summarized, real-time alerts you can actually digest",
    art: (
      <svg viewBox="0 0 120 80" aria-hidden="true">
        <rect x="14" y="14" width="92" height="52" rx="12" fill="rgba(19,33,55,0.9)" stroke="rgba(157,176,199,0.35)" />
        <circle cx="32" cy="34" r="8" fill="var(--green)" />
        <line x1="48" y1="30" x2="94" y2="30" stroke="rgba(245,247,250,0.85)" strokeWidth="4" strokeLinecap="round" />
        <line x1="48" y1="40" x2="80" y2="40" stroke="rgba(157,176,199,0.6)" strokeWidth="3" strokeLinecap="round" />
        <line x1="26" y1="54" x2="94" y2="54" stroke="rgba(157,176,199,0.4)" strokeWidth="3" strokeLinecap="round" />
        <circle cx="104" cy="16" r="7" fill="#C9A227" />
      </svg>
    ),
  },
];

export function HowItWorks() {
  return (
    <section className="biv-section" id="how-it-works" aria-labelledby="how-h">
      <p className="biv-eyebrow-center biv-accent-text">How it works</p>
      <h2 id="how-h" className="biv-h2 biv-center">From filing to alert.</h2>
      <ol className="biv-steps">
        {STEPS.map((s) => (
          <li key={s.n} className="biv-step">
            <div className="biv-step-art">{s.art}</div>
            <div className="biv-step-n">{s.n}</div>
            <p className="biv-step-text">{s.text}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

export const HOW_CSS = `
.biv-steps { list-style: none; margin: 44px 0 0; padding: 0; display: grid; grid-template-columns: repeat(3, 1fr); gap: 22px; }
.biv-step { position: relative; background: var(--bg2); border: 1px solid var(--line); border-radius: 18px; padding: 26px 24px 28px; display: grid; gap: 14px; }
.biv-step-art { height: 96px; display: grid; place-items: center; background: rgba(9,17,31,0.55); border-radius: 12px; border: 1px solid var(--line); }
.biv-step-art svg { width: 150px; height: 100px; }
.biv-step-n { font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: 34px; color: var(--brand); line-height: 1; }
.biv-step-text { font-size: 17px; line-height: 1.5; color: var(--ink); font-weight: 600; margin: 0; }
@media (max-width: 860px) { .biv-steps { grid-template-columns: 1fr; } }
`;
