import Link from "next/link";
import type { Metadata } from "next";

/**
 * §9.8 the suite hub. One page that explains the family, links the four
 * products, and states the shared rules (sources, as-of dates, no advice) in
 * one place so each visualizer's own disclaimer can stay short.
 */

export const metadata: Metadata = {
  title: "Bubble Visualizers — Markets, Contracts, Gold and Biotech | Insider Buying",
  description:
    "Four interactive bubble visualizers: live prediction markets, federal contract awards, global gold projects and biotech catalysts — each one wired to our insider data.",
  alternates: { canonical: "https://insiderbuying.com/visualizers" },
};

const PRODUCTS = [
  {
    href: "/visualizers/prediction-markets",
    kicker: "Visualizer 01",
    name: "Prediction Market Bubbles",
    live: true,
    blurb:
      "Every bubble is one event contract, sized by dollars traded and coloured by which way the money leans. Prices move live: politics, the Fed, crypto, sports and tech.",
    stat: "Live prices",
  },
  {
    href: "/visualizers/government-contracts",
    kicker: "Visualizer 02",
    name: "Government Contracts",
    blurb:
      "Every bubble is one company, sized by the federal dollars it was awarded in the window. Switch between the United States and Canada, then see who was buying their own stock after the win.",
    stat: "USAspending + Canada",
  },
  {
    href: "/visualizers/goldminer",
    kicker: "Visualizer 03",
    name: "Goldminer AI",
    blurb:
      "Every major gold project on Earth, anchored to where it actually is and sized by what the economics say it is worth. Each figure carries the study it came from and its date.",
    stat: "NI 43-101 / S-K 1300",
  },
  {
    href: "/visualizers/biotech",
    kicker: "Visualizer 04",
    name: "Biotech Catalysts",
    blurb:
      "Companies on the map by headquarters, sized by market cap, pulsing when an FDA decision or a data readout is inside ninety days — with the insider buying that ran ahead of it.",
    stat: "ClinicalTrials.gov",
  },
];

export default function VisualizersHub() {
  return (
    <main
      style={{
        maxWidth: 1080,
        margin: "0 auto",
        padding: "36px 20px 60px",
      }}
    >
      <p
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          letterSpacing: ".18em",
          textTransform: "uppercase",
          color: "var(--accent)",
          margin: "0 0 10px",
        }}
      >
        Interactive product suite
      </p>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "clamp(28px, 4vw, 42px)",
          lineHeight: 1.1,
          letterSpacing: "-0.02em",
          margin: "0 0 14px",
        }}
      >
        Four datasets you can actually look at
      </h1>
      <p style={{ fontSize: 16, lineHeight: 1.6, color: "var(--text-soft)", maxWidth: 760, margin: "0 0 32px" }}>
        Each visualizer takes a dense financial dataset and turns it into a field of bubbles you can
        explore: size carries the money, colour carries the direction, and one click opens the
        detail — including who has been buying their own stock, which is the part nobody else shows
        you.
      </p>

      <div
        style={{
          display: "grid",
          gap: 16,
          gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
        }}
      >
        {PRODUCTS.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            style={{
              display: "block",
              padding: "20px 20px 18px",
              borderRadius: 14,
              border: "1px solid var(--border)",
              background: "var(--bg-elevated)",
              textDecoration: "none",
              color: "inherit",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontFamily: "var(--font-mono)",
                fontSize: 10,
                letterSpacing: ".16em",
                textTransform: "uppercase",
                color: "var(--text-faint)",
                marginBottom: 10,
              }}
            >
              {p.kicker}
              {p.live && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 5,
                    padding: "2px 7px",
                    borderRadius: 999,
                    background: "var(--good-soft)",
                    color: "var(--good)",
                    letterSpacing: ".1em",
                  }}
                >
                  <span
                    style={{ width: 5, height: 5, borderRadius: "50%", background: "currentColor" }}
                  />
                  Live
                </span>
              )}
            </div>
            <h2
              style={{
                fontFamily: "var(--font-display)",
                fontSize: 20,
                fontWeight: 800,
                margin: "0 0 8px",
                letterSpacing: "-0.01em",
              }}
            >
              {p.name}
            </h2>
            <p style={{ fontSize: 13.5, lineHeight: 1.55, color: "var(--text-soft)", margin: "0 0 12px" }}>
              {p.blurb}
            </p>
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--accent)",
              }}
            >
              {p.stat} →
            </span>
          </Link>
        ))}
      </div>

      {/* The "Put one on your own site" embed block (iframe snippet + path
          instructions) was removed on 2026-09-21 (George: "remove the code and
          embed instructions on this page"). The /visualizers/embed/* routes
          themselves still work for anyone who already has the snippet. */}

      <section
        style={{
          marginTop: 20,
          padding: "18px 20px",
          borderRadius: 12,
          border: "1px solid var(--border)",
          fontSize: 12.5,
          lineHeight: 1.6,
          color: "var(--text-mute)",
        }}
      >
        <b style={{ color: "var(--text)" }}>The rules these tools follow.</b> Every resource,
        economic and odds figure carries its source and an as-of date. Valuation views are
        peer-comparison data, never advice. Any company that is a paid client of ours carries a disclosure badge on its
        panel. Prediction market prices are shown as information: we do not take bets, route orders
        or link to trading venues.
      </section>
    </main>
  );
}
