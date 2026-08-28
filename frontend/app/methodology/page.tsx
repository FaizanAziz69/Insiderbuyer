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
          notifications under Article 19 MAR, the EU equivalent of Form 4, read from BaFin&rsquo;s public
          managers&rsquo;-transactions database every two hours on business days (share buys and sells only;
          option exercises, gifts and other natures are excluded). Trade values are converted to U.S.
          dollars at the day&rsquo;s EURUSD rate for thresholds and rankings, while per-share prices stay
          in euros so they compare with the XETRA quote. Sector chips map the
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
    id: "top-insiders",
    title: "Top Insiders — hedge fund and famous-investor performance",
    body: (
      <>
        <p>
          Portfolios come from each manager&rsquo;s quarterly SEC Form 13F-HR, which reports U.S.
          long positions at quarter-end and is filed up to 45 days later; we keep the latest six
          quarters. The <b>trailing-12-month performance</b> is the value-weighted return of those
          disclosed long positions, <b>rebalanced at each filing date</b>: each quarter-to-quarter
          leg weights every position by its value at the start of the leg and measures the change in
          its filing-implied price (reported value ÷ shares); the final leg runs from the latest
          quarter-end to today at live prices. A position that first appears at the end of a leg was
          bought during it, so its purchase price is estimated as the <b>period average</b> of the
          start-of-leg and end-of-leg prices and it is weighted by that estimated cost. Legs compound,
          the earliest is pro-rated to the part of it inside the last 365 days, and the calculation
          uses each filer&rsquo;s 100 largest positions by value (the covered share of the portfolio
          is shown on every leg). Puts, calls and positions that cannot be priced at both ends are
          excluded.
        </p>
        <p>
          <b>Suppression.</b> Concentrated or near-empty portfolios produce meaningless figures, so
          the performance line is blank for portfolios under <b>$100 million</b> or with fewer than{" "}
          <b>4 positions</b>, and for managers with no current 13F filings (defunct or deregistered
          funds are shown with no portfolio rather than an invented one). &ldquo;Insiders agree&rdquo;
          marks holdings where corporate insiders have made open-market Form 4 purchases in the last
          90 days. Category tabs (Growth, Value, Short Sellers, Long-Term) are editorial
          classifications, not measurements.
        </p>
      </>
    ),
  },
  {
    id: "data-articles",
    title: "Data articles — most-bought, most-sold, analyst and hedge-fund leaderboards",
    body: (
      <>
        <p>
          The <b>most-bought</b> and <b>most-sold</b> tables aggregate SEC Form 4 filings by company over a
          calendar window of 30 or 90 days ending on the rebuild date. Buying counts transaction code <b>P</b>
          only — open-market and private purchases paid for by the insider — and excludes anything the filer
          marked as made under a 10b5-1 plan, together with option exercises, stock awards, tax withholding and
          gifts. Selling counts code <b>S</b>; the planned flag comes from the filer&rsquo;s own 10b5-1 footnote,
          so a sale without that footnote is counted as discretionary. Rows are ranked by total dollar value;
          the average price is volume-weighted; &ldquo;% since purchase&rdquo; compares the live price with
          that average; &ldquo;% above 52-week low&rdquo; uses the licensed quote&rsquo;s trailing range; the
          <b> cluster</b> flag means three or more distinct insiders traded on the same side in the window.
        </p>
        <p>
          The <b>analyst leaderboard</b> ranks named analysts by the directional hit rate of their rated calls
          (a target more than 3% from the price at the note is a call; inside that band is a reiteration and is
          not graded), graded only once a call is at least 30 days old. The article admits only analysts with at least
          20 graded calls and ranks them on the 95% Wilson lower bound of the hit rate, so a thin perfect
          record cannot outrank a long good one; average subsequent return breaks ties. The Top Analysts
          table shows a hit rate only after six graded calls and shrinks thin samples toward the field
          average (a prior of ten calls at 55%) inside its star score. The <b>hedge-fund leaderboard</b> takes the trailing-12-month
          figure from the Top Insiders section above, ranked highest first, and inherits every limit of a 13F.
        </p>
        <p>
          Buying and selling tables rebuild every Friday after the close, the analyst table on the first of each
          month, the hedge-fund table the day after each 45-day 13F filing window closes. The &ldquo;Updated&rdquo;
          date on each article is that rebuild timestamp; headlines and URLs never change.
        </p>
      </>
    ),
  },
  {
    id: "ipo-calendar",
    title: "IPO calendar — return since listing and the insider-activity flag",
    body: (
      <>
        <p>
          The table lists every company that began trading in the trailing <b>90 days</b>, sourced from the
          licensed IPO calendar merged with the exchange&rsquo;s public calendar for exact offering prices.
          Rows leave the table automatically on day 91. <b>IPO price</b> is the published offering price;
          where no offering price reached our feeds we show the midpoint of the filed range or, failing that,
          the first session&rsquo;s opening price, and mark the figure with an asterisk. <b>Current price</b> is
          the previous close, refreshed every evening after the U.S. close — including weekends and market
          holidays, when it simply re-confirms the last close. <b>Return since IPO</b> is current ÷ IPO price
          − 1 and is not annualised or adjusted for dividends.
        </p>
        <p>
          The <b>insider activity</b> badge appears when at least one Form 4 open-market purchase (code P, not
          under a 10b5-1 plan) has been filed with a transaction date on or after the listing date; it links
          to the most recent such filing. It says nothing about selling, lock-up expiries or pre-IPO grants.
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
