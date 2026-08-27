import Link from "next/link";
import { pageMetadata } from "@/lib/seo-meta";

/**
 * /methodology — Developer Project Brief (Aug 24 2026), §2.4: "Where a page
 * displays a fund's or politician's returns, the methodology note must be
 * one click away", and §4.4 / §5.3 which ask for the method to be published.
 * Every performance or dollar figure on the data pages links here.
 */

export const metadata = pageMetadata("/methodology", {
  title: "Methodology — How Insider Buying Measures Things | Insider Buying",
  description:
    "How every figure on Insider Buying is computed: insider return on disclosed buys, the Bubbles maps, congressional trade sizing from PTR ranges, and what each number can and cannot tell you.",
});

const SECTIONS: Array<{ id: string; title: string; body: React.ReactNode }> = [
  {
    id: "insider-returns",
    title: "Return on disclosed buys (insider cards and profiles)",
    body: (
      <>
        <p>
          For each insider we take every open-market purchase disclosed on SEC Form 4 (transaction
          code P) that carries a per-share price, and measure the change from that price to the
          live share price. The card figure is the simple average of those changes over the
          purchases filed in the <b>trailing 12 months</b>; when an insider has no priced purchase
          in that window we fall back to all disclosed purchases on record and label the figure
          &ldquo;all time&rdquo;. &ldquo;In profit&rdquo; counts purchases whose live price is above
          the purchase price.
        </p>
        <p>
          Excluded: sales, option exercises, stock awards, 10b5-1 plan transactions, gifts, and
          filings without a per-share price. Purchases in foreign ordinary shares quoted as ADS
          are a known distortion and are being corrected at the data layer.
        </p>
      </>
    ),
  },
  {
    id: "insider-bubbles",
    title: "Insider Bubbles map",
    body: (
      <>
        <p>
          A stock qualifies for a bubble when a single insider&rsquo;s open-market purchases on a
          single day total <b>$250,000 or more</b> (Form 4 code P, unplanned). Bubble size scales
          with the total dollars bought in the selected window. Colour compares the current
          price with the <b>VWAIP</b> — the volume-weighted average price the insiders paid over
          the window: green when the stock trades above what insiders paid, red when it trades
          below (i.e. cheaper than the insiders paid). A gold ring marks a filing that appeared
          since your last refresh.
        </p>
        <p>
          The exchange filter classifies a listing by its exchange (NYSE, NASDAQ, AMEX and OTC
          as U.S.; TSX, TSX-V, CSE and NEO as Canada; XETRA and the Frankfurt, Stuttgart and
          Munich floors as Germany). German rows come from Directors&rsquo; Dealings
          notifications under Article 19 MAR, the EU equivalent of Form 4. Sector chips map the
          market-data sector and industry onto six groups: Energy; Mining (Basic Materials
          companies in metals, mining and coal); Biotech &amp; Pharmaceuticals (Healthcare
          companies in biotechnology and drug manufacturing); Technology; Consumer Staples
          (Consumer Defensive); Financials (Financial Services).
        </p>
      </>
    ),
  },
  {
    id: "congress-bubbles",
    title: "Congress Bubbles map and congressional trades",
    body: (
      <>
        <p>
          Members of Congress disclose trades on Periodic Transaction Reports (PTRs) under the
          STOCK Act. PTRs report amounts as <b>ranges</b> — for example $15,001–$50,000 — not
          exact figures. Everywhere we size or sum congressional trades we use the{" "}
          <b>midpoint of the reported range</b> ($32,500.50 for that example). Bubble size is the
          sum of midpoints for the member&rsquo;s trades in the period; colour is net buying
          (green) or net selling (red) on the same basis. &ldquo;Days to disclosure&rdquo; is the
          average gap between a trade&rsquo;s transaction date and the date the PTR was filed.
        </p>
        <p>
          Source data is the House and Senate clerks&rsquo; disclosures via our market-data
          provider, refreshed nightly. Portraits are the official congressional photographs
          (public domain) keyed by Bioguide ID. Party and state come from the public
          @unitedstates legislator roster.
        </p>
      </>
    ),
  },
  {
    id: "insider-score",
    title: "Insider Score (IQS)",
    body: (
      <p>
        A 0–99 composite of the buying itself (size versus market cap, cluster, seniority, stake
        growth, aggregate insider ownership), sector strength, management tone, trading momentum,
        insider calibre and share dilution, less a litigation deduction; recomputed daily. Green
        badges mark scores of 75 and above, gold 50–74. Full definition on the{" "}
        <Link href="/score-explainer">score explainer</Link>.
      </p>
    ),
  },
  {
    id: "compliance",
    title: "What these figures are — and are not",
    body: (
      <p>
        Insider Buying is a publisher, not an investment adviser. Every figure is historical and
        factual, traceable to a public filing or a licensed market-data feed, and provided for
        informational purposes only. Historical patterns do not predict future results, and
        nothing on this site is a recommendation to buy or sell any security.
      </p>
    ),
  },
];

export default function MethodologyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <p className="text-[12px] uppercase tracking-[2px] font-semibold" style={{ color: "var(--text-mute)" }}>
        Methodology
      </p>
      <h1 className="text-[30px] sm:text-[36px] font-bold tracking-tight leading-tight mt-1">
        How we measure things
      </h1>
      <p className="mt-3 text-[15.5px] leading-relaxed" style={{ color: "var(--text-mute)" }}>
        Every performance figure and dollar total on the data pages links here. If a number on
        the site cannot be explained by a section below, that is a bug — tell us.
      </p>
      <nav aria-label="Sections" className="mt-6 flex flex-wrap gap-2">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-full px-3 py-1 text-[12.5px] font-semibold"
            style={{ border: "1px solid var(--border)", color: "var(--text)" }}
          >
            {s.title.split(" (")[0]}
          </a>
        ))}
      </nav>
      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.id} id={s.id} className="card p-5 sm:p-6">
            <h2 className="text-[19px] font-bold mb-2">{s.title}</h2>
            <div className="space-y-3 text-[15px] leading-relaxed" style={{ color: "var(--text-dim, var(--text))" }}>
              {s.body}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
