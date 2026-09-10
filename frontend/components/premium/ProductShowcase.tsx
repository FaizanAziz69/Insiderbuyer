"use client";

/**
 * Brief v4 §4 — four custom product visuals, alternating left/right, each with
 * a short benefit caption and feature bullets. The image is the section; the
 * text supports it. Assets live in /public/sales/showcase (composed from the
 * live UI by scripts/showcase-compose.mjs: 1x JPEG fallback, 2x WebP, and a
 * dedicated portrait crop for phones — §6 "dedicated mobile crops rather
 * than shrunken desktop renders"). Below-the-fold images lazy-load with a
 * fixed aspect box, so nothing shifts as they arrive; click opens a lightbox.
 * The layout tolerates two or four visuals (§4 "must tolerate two or four").
 */
export interface ShowcaseVisual {
  id: string;
  /** Section heading — the benefit, not the feature name. */
  title: string;
  /** One-sentence benefit caption. */
  caption: string;
  bullets: string[];
  /** Base filename in /sales/showcase, without extension. */
  file: string;
  alt: string;
  /** Desktop render aspect (w/h) and mobile crop aspect. */
  aspect: number;
  mobileAspect: number;
}

export const SHOWCASE: ShowcaseVisual[] = [
  {
    id: "insider-scores",
    title: "Every insider transaction is scored and ranked.",
    caption:
      "The Insider Score puts a 0–100 number on each company's insider buying, and every buyer behind it carries a live track record.",
    bullets: [
      "0–100 Insider Score on every company with qualifying buys",
      "Buyers ranked by role, buying volume and win rate",
      "Bullish / Neutral / Bearish tier at a glance",
    ],
    file: "insider-scores",
    alt: "Insider Score panel in front of a ranked list of scored insiders with roles and win rates",
    aspect: 16 / 10,
    mobileAspect: 0.8688,
  },
  {
    id: "top-insider-buys",
    title: "The best buys, graded, as they file.",
    caption:
      "Top Insider Buys grades every open-market purchase A+ to F the moment the Form 4 lands, and the email alert reaches you before the market reads it.",
    bullets: [
      "A+ to F grade on size, stake growth, buyer record and timing",
      "Cluster, CEO and first-buy signals flagged on each row",
      "Email alerts sent as each filing is processed",
    ],
    file: "top-insider-buys",
    alt: "Top Insider Buys feed with each open-market purchase graded A+ to F",
    aspect: 16 / 10,
    mobileAspect: 1.147,
  },
  {
    id: "top-analysts-insiders",
    title: "We rank the people, not just the trades.",
    caption:
      "Wall Street analysts ranked by measured success rate and average return, beside the insiders whose buys actually paid off.",
    bullets: [
      "Analyst success rate and average return, measured not claimed",
      "Insider track-record accuracy on every ranked buyer",
      "Filter by CEO, CFO, politician or fund",
    ],
    file: "top-analysts-insiders",
    alt: "Analyst leaderboard beside insider track-record cards",
    aspect: 16 / 10,
    mobileAspect: 0.8458,
  },
];

// New names on purpose: /sales is cached for 30 days, so a replaced file under
// the old name never reaches returning browsers. Bumped e3 -> e4 on 2026-09-10
// when the visuals were recomposed from fresh captures (push-notification mock
// removed, narrower captures so the type is legible). Keep bumping this suffix
// — and the matching one in scripts/showcase-compose.mjs — on every recompose.
//
// Each visual exists as a light and a dark composition; `-dark` is the set
// composed from dark-theme captures (Faizan, 2026-09-10 — a white screenshot
// on the dark page reads as broken). Recompose BOTH when either changes:
//   node scripts/showcase-compose.mjs <caps>       # light
//   node scripts/showcase-compose.mjs <caps-dark> dark
const src1x = (f: string, t: string) => `/sales/showcase/${f}-e4${t}.webp`;
const src2x = (f: string, t: string) => `/sales/showcase/${f}-e4${t}@2x.webp`;
const srcMobile = (f: string, t: string) => `/sales/showcase/${f}-e4${t}-mobile.webp`;

export function ProductShowcase({
  visuals = SHOWCASE,
  theme = "dark",
}: {
  visuals?: ShowcaseVisual[];
  /** Which composition set to serve. Defaults to dark: the page's .biv scope is
   *  dark-first, so that is what renders before a light theme is declared. */
  theme?: "light" | "dark";
}) {
  const t = theme === "dark" ? "-dark" : "";
  // No lightbox and no hover lift: George (call, 2026-09-10) — "when I hover
  // over this photo it makes me click on it, I don't want that."
  return (
    <section className="biv-section" id="showcase" aria-labelledby="showcase-h">
      <p className="biv-eyebrow-center biv-accent-text">The product</p>
      <h2 id="showcase-h" className="biv-h2 biv-center">Get faster insider intelligence.</h2>
      <div className="sc-grid">
        {visuals.map((v, i) => (
          <figure key={v.id} className={`sc-row ${i % 2 ? "sc-row-flip" : ""}`}>
            <div
              className="sc-frame"
              style={{ ["--sc-aspect" as string]: v.aspect, ["--sc-aspect-m" as string]: v.mobileAspect }}
            >
              <picture>
                <source media="(max-width: 640px)" srcSet={srcMobile(v.file, t)} type="image/webp" />
                <source srcSet={`${src2x(v.file, t)} 2x, ${src1x(v.file, t)} 1x`} type="image/webp" />
                <img
                  src={src2x(v.file, t)}
                  alt={v.alt}
                  loading="lazy"
                  decoding="async"
                  width={1200}
                  height={750}
                />
              </picture>
            </div>
            <figcaption className="sc-cap">
              <h3>{v.title}</h3>
              <p>{v.caption}</p>
              <ul>
                {v.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            </figcaption>
          </figure>
        ))}
      </div>

    </section>
  );
}

export const SHOWCASE_CSS = `
.sc-grid { display: grid; gap: 96px; margin-top: 56px; }
.sc-row { margin: 0; display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(280px, 0.85fr); gap: 44px; align-items: center; }
.sc-row-flip { grid-template-columns: minmax(280px, 0.85fr) minmax(0, 1.55fr); }
.sc-row-flip .sc-frame { order: 2; }
.sc-row-flip .sc-cap { order: 1; }
/* Embedded, not a screenshot (client 2026-09-09): the composition is a
   transparent render, so its browser frames and cards float directly on the
   page — no picture box, border, backdrop or clipping around it. */
.sc-frame {
  display: block; width: 100%; padding: 0; border: 0; background: transparent; cursor: default;
  aspect-ratio: var(--sc-aspect, 1.6); overflow: visible;
}
.sc-frame picture, .sc-frame img { display: block; width: 100%; height: 100%; object-fit: contain; background: transparent; }
.sc-cap h3 { font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: clamp(24px, 2.4vw, 32px); line-height: 1.1; letter-spacing: -0.015em; color: var(--ink); margin: 0 0 12px; }
.sc-cap p { font-size: 16.5px; line-height: 1.6; color: var(--dim); margin: 0 0 16px; }
.sc-cap ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 9px; }
.sc-cap li { position: relative; padding-left: 22px; font-size: 14.5px; line-height: 1.45; color: var(--ink); }
.sc-cap li::before { content: ""; position: absolute; left: 0; top: 7px; width: 10px; height: 10px; border-radius: 50%; background: var(--green-hi); box-shadow: 0 0 0 3px rgba(76,195,138,0.18); }
.sc-lightbox { position: fixed; inset: 0; z-index: 120; background: rgba(4,10,20,0.92); display: grid; place-content: center; padding: 24px; gap: 14px; cursor: zoom-out; }
.sc-lightbox img { max-width: min(1600px, 96vw); max-height: 84vh; width: auto; height: auto; cursor: default; }
.sc-lightbox-cap { color: var(--dim); text-align: center; font-size: 14px; margin: 0; max-width: 820px; }
.sc-close { position: fixed; top: 18px; right: 18px; width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--line); background: rgba(19,33,55,0.9); color: var(--ink); display: grid; place-items: center; cursor: pointer; }
@media (max-width: 960px) {
  .sc-row, .sc-row-flip { grid-template-columns: 1fr; gap: 22px; }
  .sc-row-flip .sc-frame { order: 1; } .sc-row-flip .sc-cap { order: 2; }
  .sc-grid { gap: 64px; }
}
@media (max-width: 640px) {
  .sc-frame { aspect-ratio: var(--sc-aspect-m, 0.8); }
}
`;
