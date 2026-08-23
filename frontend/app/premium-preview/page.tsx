"use client";

/**
 * NEW SALES PAGE — DESIGN DRAFT (beehiiv.com style, George's copy, 2026-08-24).
 * Lives at /premium-preview for client review only (noindex, unlinked).
 * On approval this content replaces app/premium.
 *
 * Styling is scoped under .biv (same pattern as /premium's .sub3): a dark
 * navy take on beehiiv's near-black look, using the site's own font stack —
 * Libre Franklin 900 for the mega headlines, Barlow for body, Barlow
 * Condensed for eyebrows — and the brand green where beehiiv uses pink.
 */

import Link from "next/link";

/* ------------------------------------------------------------------ data */

const FIRMS = [
  "Morgan Stanley",
  "Goldman Sachs",
  "RBC Capital",
  "Piper Sandler",
  "Deutsche Bank",
  "Scotiabank",
  "Guggenheim",
  "Melius Research",
];

const FEATURES: Array<{
  title: string;
  blurb: string;
  img: string;
  href: string;
  wide?: boolean;
}> = [
  {
    title: "Top Insider Scores & indicators",
    blurb: "Every open-market insider buy, scored 0–100 — with the signals behind it.",
    img: "/sales/shot-scores.jpg",
    href: "/insiders/hot",
    wide: true,
  },
  {
    title: "Real-time insider alerts",
    blurb: "CEO/CFO purchases and $1M+ buys, straight off SEC Form 4 filings.",
    img: "/sales/shot-alerts.jpg",
    href: "/alerts",
    wide: true,
  },
  {
    title: "Top Analysts",
    blurb: "Ranked by real track record — success rate and average return.",
    img: "/sales/shot-analysts.jpg",
    href: "/analyst-ratings",
  },
  {
    title: "Analyst upside ratings",
    blurb: "Strong-buy names with the biggest gap to consensus targets.",
    img: "/sales/shot-upside.jpg",
    href: "/analyst-stocks",
  },
  {
    title: "Congress trading",
    blurb: "Every disclosed House and Senate trade, matched to tickers.",
    img: "/sales/shot-congress.jpg",
    href: "/congressional-trades",
  },
  {
    title: "Government contracts",
    blurb: "Federal awards mapped to public companies — before the headlines.",
    img: "/sales/shot-gov.jpg",
    href: "/government-contracts",
  },
];

/** Marquee cards: people (Wikimedia Commons photos, CC BY / CC BY-SA / PD —
 *  credit line under the section) alternating with platform stats,
 *  beehiiv "names you know" style. */
const ROW_A: Array<
  | { kind: "person"; name: string; sub: string; img: string }
  | { kind: "stat"; big: string; caption: string; label: string }
> = [
  { kind: "person", name: "Warren Buffett", sub: "Berkshire Hathaway · 13F holdings", img: "/sales/people/buffett.jpg" },
  { kind: "stat", big: "142K+", caption: "open-market insider buys on file", label: "SEC Form 4" },
  { kind: "person", name: "Nancy Pelosi", sub: "U.S. House · disclosed trades", img: "/sales/people/pelosi.jpg" },
  { kind: "stat", big: "+2,924%", caption: "Insider Purchases Strategy, all-time backtest", label: "Backtested" },
  { kind: "person", name: "Jensen Huang", sub: "NVIDIA · Form 4 filings", img: "/sales/people/jensen.jpg" },
  { kind: "stat", big: "435", caption: "insiders ranked by track record", label: "Track records" },
];

const ROW_B: typeof ROW_A = [
  { kind: "person", name: "Jeff Bezos", sub: "Amazon · insider tape", img: "/sales/people/bezos.jpg" },
  { kind: "stat", big: "4,300+", caption: "U.S. companies covered", label: "Coverage" },
  { kind: "person", name: "Ray Dalio", sub: "Bridgewater · 13F holdings", img: "/sales/people/dalio.jpg" },
  { kind: "stat", big: "+31%", caption: "backtest CAGR since 2014", label: "Since 2014" },
  { kind: "person", name: "Donald Trump Jr.", sub: "Board seats · insider buys", img: "/sales/people/trumpjr.jpg" },
  { kind: "stat", big: "39", caption: "live alerts in the last 30 days", label: "Past 30 days" },
];

const PLANS = [
  {
    name: "Free",
    price: "$0",
    per: "forever",
    tagline: "Start exploring the tape.",
    cta: "Start free",
    href: "/alerts",
    featured: false,
    feats: [
      "Market data, movers & heatmaps",
      "Stock pages & charts",
      "Rankings preview",
      "Insider alerts newsletter",
    ],
  },
  {
    name: "Monthly",
    price: "$29",
    per: "per month",
    tagline: "Full access, month to month.",
    cta: "Get Monthly",
    href: "/premium",
    featured: false,
    feats: [
      "Everything in Free",
      "Full Insider Scores & Insider ROI",
      "Top Analysts + upside ratings",
      "Congress trades & gov contracts",
      "Real-time insider alerts",
    ],
  },
  {
    name: "Annual",
    price: "$199",
    per: "per year",
    tagline: "Best value — 5 months free.",
    cta: "Get All-In Access",
    href: "/premium",
    featured: true,
    feats: [
      "Everything in Monthly",
      "Founding-member price, locked in",
      "Ranked lists counted down to #1",
      "Weekly insider intelligence brief",
      "Priority support",
    ],
  },
];

const NUMBERS = [
  { big: "+2,924%", caption: "all-time return of the Insider Purchases Strategy backtest" },
  { big: "+31%", caption: "compound annual growth rate since 2014" },
  { big: "142K+", caption: "open-market insider buys tracked from SEC Form 4" },
  { big: "4,300+", caption: "U.S. companies scored and covered daily" },
];

const TOOLS = [
  { label: "Market Heatmaps", href: "/heatmaps/market" },
  { label: "Top Insider Scores", href: "/insiders/hot" },
  { label: "Earnings Calendar", href: "/earnings" },
  { label: "Watchlists", href: "/watchlist" },
  { label: "IPO Tracker", href: "/ipos" },
  { label: "Short Interest", href: "/short-interest" },
  { label: "Dividends", href: "/dividends" },
];

const FAQS = [
  {
    q: "What is All-In Access?",
    a: "One membership that unlocks everything on Insider Buying: full Insider Scores and Insider ROI, the ranked lists counted down to #1, top-analyst track records and upside ratings, congressional trades, government contracts, and real-time insider alerts.",
  },
  {
    q: "Where does the data come from?",
    a: "Insider activity is parsed first-hand from SEC Form 4 filings. Market data, analyst ratings and fundamentals come from licensed market-data providers. Congressional trades come from official House and Senate disclosures.",
  },
  {
    q: "How fresh are the alerts?",
    a: "Filings are ingested continuously throughout the trading day, and qualifying buys — CEO/CFO purchases and $1M+ open-market buys — hit the alerts feed as they are processed.",
  },
  {
    q: "Can I cancel anytime?",
    a: "Yes. Subscriptions are handled by Stripe and can be cancelled in one click from your account — you keep access until the end of the paid period.",
  },
  {
    q: "Is this financial advice?",
    a: "No. Insider Buying is a research platform. Every figure traces to a public filing or licensed data feed, and nothing on the site is a recommendation to buy or sell any security.",
  },
];

/* ------------------------------------------------------------------ page */

export default function PremiumPreviewPage() {
  return (
    <div className="biv">
      {/* ---------------------------------------------------------- hero */}
      <section className="biv-hero">
        <div className="biv-hero-copy">
          <h1>
            <span>Stock analysis.</span>
            <span>Insider rankings.</span>
            <span>Breaking news.</span>
            <span className="biv-accent">One platform.</span>
          </h1>
          <p className="biv-sub">
            Insider Buying <b>&ldquo;All-In Access&rdquo;</b> is the only
            membership that brings you closer to insiders.
          </p>
          <div className="biv-ctas">
            <a href="#pricing" className="biv-btn biv-btn-solid">
              Get All-In Access
            </a>
            <a href="#features" className="biv-btn biv-btn-ghost">
              Explore the platform
            </a>
          </div>
          <p className="biv-fine">Start free. No credit card required.</p>
        </div>
        <div className="biv-hero-art" aria-hidden="true">
          <img src="/sales/hero-chart.jpg" alt="" className="biv-art-a" />
          <img src="/sales/hero-alerts.jpg" alt="" className="biv-art-b" />
        </div>
      </section>

      {/* ------------------------------------------------------ trust bar */}
      <section className="biv-trust">
        <p className="biv-eyebrow-center">
          Trusted by top investors, researchers, and money managers
        </p>
        <div className="biv-firms">
          {FIRMS.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
        <p className="biv-trust-fine">
          Firms whose analysts and public filings are tracked on the platform.
        </p>
      </section>

      {/* ------------------------------------------------------- features */}
      <section className="biv-section" id="features">
        <h2 className="biv-h2">
          Everything you need
          <br />
          to get to the truth.
        </h2>
        <p className="biv-lead">
          Insiders tell the story. A peer-reviewed Harvard study found that
          corporate insiders consistently beat the S&amp;P&nbsp;500 &amp; SPY.
        </p>
        <div className="biv-bento">
          {FEATURES.map((f) => (
            <Link
              key={f.title}
              href={f.href}
              className={`biv-card ${f.wide ? "biv-card-wide" : ""}`}
            >
              <div className="biv-card-head">
                <div>
                  <h3>{f.title}</h3>
                  <p>{f.blurb}</p>
                </div>
                <span className="biv-plus" aria-hidden="true">
                  +
                </span>
              </div>
              <div className="biv-shot">
                <img src={f.img} alt={f.title} loading="lazy" />
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- marquee */}
      <section className="biv-section biv-names">
        <p className="biv-eyebrow-center biv-accent-text">Coverage</p>
        <h2 className="biv-h2 biv-center">
          Tracking names you know&hellip;
          <br />
          <span className="biv-dim">&hellip;and don&rsquo;t.</span>
        </h2>
        <p className="biv-lead biv-center">
          From household-name executives and funds to the quiet filers nobody
          is watching — if it hits a filing, it&rsquo;s on the tape.
        </p>
        {[ROW_A, ROW_B].map((row, ri) => (
          <div className={`biv-marquee ${ri === 1 ? "biv-marquee-rev" : ""}`} key={ri}>
            <div className="biv-marquee-track">
              {[...row, ...row].map((c, i) =>
                c.kind === "person" ? (
                  <div className="biv-mcard biv-mcard-person" key={i}>
                    <img src={c.img} alt={c.name} loading="lazy" />
                    <div className="biv-mcard-foot">
                      <b>{c.name}</b>
                      <span>{c.sub}</span>
                    </div>
                  </div>
                ) : (
                  <div className="biv-mcard biv-mcard-stat" key={i}>
                    <span className="biv-mtag">{c.label}</span>
                    <svg className="biv-mspark" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true">
                      <path d="M0 34 L13 29 L25 31 L39 22 L53 25 L67 13 L81 17 L100 4" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
                      <circle cx="100" cy="4" r="4" fill="currentColor" />
                    </svg>
                    <div className="biv-mstat">{c.big}</div>
                    <div className="biv-mcap">{c.caption}</div>
                  </div>
                ),
              )}
            </div>
          </div>
        ))}
        <p className="biv-fine biv-center" style={{ marginTop: 18 }}>
          Photos: Wikimedia Commons (public domain / CC BY / CC BY-SA).
        </p>
      </section>

      {/* -------------------------------------------------------- pricing */}
      <section className="biv-section" id="pricing">
        <p className="biv-eyebrow-center biv-accent-text">Pricing</p>
        <h2 className="biv-h2 biv-center">Become an insider.</h2>
        <div className="biv-plans">
          {PLANS.map((p) => (
            <div key={p.name} className={`biv-plan ${p.featured ? "biv-plan-hot" : ""}`}>
              {p.featured && <div className="biv-plan-badge">Best value</div>}
              <h3>{p.name}</h3>
              <div className="biv-price">
                {p.price}
                <span> {p.per}</span>
              </div>
              <p className="biv-plan-tag">{p.tagline}</p>
              <Link href={p.href} className={`biv-btn ${p.featured ? "biv-btn-solid" : "biv-btn-ghost"} biv-btn-block`}>
                {p.cta}
              </Link>
              <ul>
                {p.feats.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* -------------------------------------------------------- numbers */}
      <section className="biv-section">
        <h2 className="biv-h2 biv-center">The numbers tell the story.</h2>
        <div className="biv-numbers">
          {NUMBERS.map((n) => (
            <div key={n.big} className="biv-num">
              <div className="biv-num-big">{n.big}</div>
              <div className="biv-num-cap">{n.caption}</div>
            </div>
          ))}
        </div>
        <p className="biv-fine biv-center">
          Backtest figures are historical, gross of costs, and do not predict
          future results.
        </p>
      </section>

      {/* ---------------------------------------------------------- tools */}
      <section className="biv-section">
        <h2 className="biv-h2 biv-center">Powerful stock tools.</h2>
        <div className="biv-tools">
          {TOOLS.map((t) => (
            <Link key={t.label} href={t.href} className="biv-tool">
              {t.label}
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------------ faq */}
      <section className="biv-section biv-faq-wrap">
        <h2 className="biv-h2 biv-center">Have a question?</h2>
        <div className="biv-faq">
          {FAQS.map((f) => (
            <details key={f.q}>
              <summary>
                {f.q}
                <span aria-hidden="true">+</span>
              </summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ final cta */}
      <section className="biv-final">
        <h2 className="biv-h2">What are you waiting for?</h2>
        <a href="#pricing" className="biv-btn biv-btn-solid biv-btn-big">
          Get All-In Access
        </a>
      </section>

      <style>{CSS}</style>
    </div>
  );
}

/* ------------------------------------------------------------------ css */

const CSS = `
.biv {
  --ink: #F5F7FA; --dim: #9DB0C7; --faint: #5D7189;
  --bg: #0A1220; --bg2: #0E1A2E; --line: rgba(157,176,199,0.14);
  --green: #3E9B5F; --green-hi: #4CC38A;
  background:
    radial-gradient(1000px 600px at 80% -10%, rgba(62,155,95,0.14), transparent 60%),
    radial-gradient(900px 500px at 10% 30%, rgba(30,64,120,0.25), transparent 60%),
    var(--bg);
  color: var(--ink);
  margin: 0 calc(50% - 50vw);
  padding: 0 0 24px;
  font-family: var(--font-sans), system-ui, sans-serif;
}
.biv section { max-width: 1460px; margin: 0 auto; padding: 72px 28px; }

.biv h1, .biv .biv-h2 {
  font-family: var(--font-heading), sans-serif; font-weight: 900;
  text-transform: uppercase; letter-spacing: -0.015em; line-height: 0.98;
  color: var(--ink); margin: 0;
}
.biv-accent { color: var(--green-hi); }
.biv-accent-text { color: var(--green-hi) !important; }
.biv-dim { color: var(--faint); }

/* hero */
.biv-hero { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 44px; align-items: center; padding-top: 84px !important; }
.biv-hero h1 { font-size: clamp(34px, 3.9vw, 56px); display: grid; }
.biv-hero h1 span { white-space: nowrap; }
.biv-sub { font-size: 18px; line-height: 1.6; color: var(--dim); margin: 22px 0 26px; max-width: 460px; }
.biv-sub b { color: var(--ink); }
.biv-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.biv-btn {
  display: inline-block; text-decoration: none; border-radius: 10px;
  font-weight: 700; font-size: 15px; padding: 13px 22px; transition: filter .15s, background .15s;
}
.biv-btn-solid { background: var(--green); color: #06131f; }
.biv-btn-solid:hover { filter: brightness(1.1); }
.biv-btn-ghost { border: 1px solid rgba(157,176,199,0.4); color: var(--ink); }
.biv-btn-ghost:hover { background: rgba(157,176,199,0.1); }
.biv-btn-block { display: block; text-align: center; margin: 18px 0; }
.biv-btn-big { font-size: 17px; padding: 16px 34px; }
.biv-fine { font-size: 12.5px; color: var(--faint); margin-top: 14px; }

.biv-hero-art { position: relative; min-height: 470px; }
.biv-hero-art img {
  position: absolute; border-radius: 14px; border: 1px solid var(--line);
  box-shadow: 0 30px 80px rgba(0,0,0,0.55);
}
/* Chart is the star: full width at the top; the alerts card sits IN FRONT,
   offset low-left, so both stay fully readable. */
.biv-art-a { top: 0; right: 0; width: 100%; transform: rotate(1.5deg); z-index: 1; }
.biv-art-b { bottom: 0; left: -14px; width: 68%; transform: rotate(-2.5deg); z-index: 2; }

/* trust */
.biv-trust { padding-top: 8px !important; padding-bottom: 40px !important; text-align: center; }
.biv-eyebrow-center {
  font-family: var(--font-display), sans-serif; font-weight: 600; font-size: 13px;
  letter-spacing: 2.5px; text-transform: uppercase; color: var(--dim); text-align: center; margin: 0 0 22px;
}
.biv-firms { display: flex; flex-wrap: wrap; gap: 18px 40px; justify-content: center; align-items: center; }
.biv-firms span {
  font-family: var(--font-heading), sans-serif; font-weight: 800; font-size: 19px;
  color: rgba(245,247,250,0.82); white-space: nowrap;
}
.biv-trust-fine { font-size: 11.5px; color: var(--faint); margin-top: 18px; }

/* features */
.biv-h2 { font-size: clamp(32px, 4.2vw, 54px); }
.biv-center { text-align: center; }
.biv-lead { font-size: 17px; line-height: 1.65; color: var(--dim); margin: 18px 0 0; max-width: 620px; }
.biv-lead.biv-center { margin-left: auto; margin-right: auto; text-align: center; }
.biv-bento { display: grid; grid-template-columns: repeat(6, 1fr); gap: 18px; margin-top: 40px; }
.biv-card {
  grid-column: span 3; display: flex; flex-direction: column; gap: 16px;
  background: var(--bg2); border: 1px solid var(--line); border-radius: 18px;
  padding: 22px 22px 0; overflow: hidden; text-decoration: none; color: inherit;
  transition: border-color .15s, transform .15s;
}
.biv-card:hover { border-color: rgba(76,195,138,0.45); transform: translateY(-2px); }
.biv-card-wide { grid-column: span 3; }
.biv-card h3 { font-size: 20px; font-weight: 700; margin: 0 0 6px; color: var(--ink); }
.biv-card p { font-size: 14px; line-height: 1.55; color: var(--dim); margin: 0; }
.biv-card-head { display: flex; justify-content: space-between; gap: 14px; align-items: flex-start; }
.biv-plus {
  flex: 0 0 auto; width: 30px; height: 30px; border-radius: 8px; display: grid; place-items: center;
  background: rgba(76,195,138,0.14); color: var(--green-hi); font-size: 20px; font-weight: 600;
}
.biv-shot { border-radius: 10px 10px 0 0; overflow: hidden; border: 1px solid var(--line); border-bottom: 0; }
.biv-shot img { width: 100%; display: block; }

/* marquee */
.biv-names { padding-bottom: 40px !important; }
.biv-names .biv-h2 { margin-bottom: 0; }
.biv-marquee { overflow: hidden; margin-top: 34px; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
.biv-marquee-track { display: flex; gap: 18px; width: max-content; animation: biv-scroll 42s linear infinite; }
.biv-marquee-rev .biv-marquee-track { animation-direction: reverse; }
@keyframes biv-scroll { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .biv-marquee-track { animation: none; } }
.biv-mcard {
  width: 260px; height: 320px; border-radius: 16px; border: 1px solid var(--line);
  flex: 0 0 auto; display: flex; flex-direction: column; justify-content: flex-end; padding: 20px; position: relative;
}
.biv-mcard-stat {
  background:
    radial-gradient(220px 180px at 85% 0%, rgba(76,195,138,0.10), transparent 70%),
    var(--bg2);
  justify-content: flex-end;
}
.biv-mtag {
  position: absolute; top: 16px; left: 18px;
  font-family: var(--font-display), sans-serif; font-weight: 600; font-size: 11px;
  letter-spacing: 2px; text-transform: uppercase; color: var(--faint);
  border: 1px solid var(--line); border-radius: 999px; padding: 4px 10px;
}
.biv-mspark {
  position: absolute; top: 62px; left: 18px; right: 18px; width: calc(100% - 36px);
  height: 72px; color: rgba(76,195,138,0.45);
}
.biv-mcard-person { color: #F5F7FA; padding: 0; overflow: hidden; }
.biv-mcard-person > img {
  position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover;
}
.biv-mcard-person .biv-mcard-foot {
  position: relative; z-index: 1; padding: 44px 18px 16px;
  background: linear-gradient(180deg, transparent, rgba(5,10,20,0.88) 60%);
}
.biv-mcard-foot b { display: block; font-size: 17px; }
.biv-mcard-foot span { font-size: 12.5px; color: var(--dim); }
.biv-mcard-person .biv-mcard-foot span { color: rgba(245,247,250,0.72); }
.biv-mstat {
  font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: 44px;
  color: var(--green-hi); letter-spacing: -0.02em;
}
.biv-mcap { font-size: 13px; color: var(--dim); line-height: 1.5; margin-top: 6px; }

/* pricing */
.biv-plans { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 42px; }
.biv-plan {
  background: var(--bg2); border: 1px solid var(--line); border-radius: 18px;
  padding: 26px; position: relative;
}
.biv-plan-hot { border-color: rgba(76,195,138,0.55); box-shadow: 0 0 0 1px rgba(76,195,138,0.35), 0 24px 60px rgba(0,0,0,0.35); }
.biv-plan-badge {
  position: absolute; top: -12px; left: 50%; transform: translateX(-50%);
  background: var(--green); color: #06131f; font-size: 11.5px; font-weight: 800;
  letter-spacing: 1px; text-transform: uppercase; border-radius: 999px; padding: 5px 14px;
}
.biv-plan h3 { margin: 0; font-size: 18px; font-weight: 700; color: var(--dim); }
.biv-price { font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: 44px; margin-top: 10px; }
.biv-price span { font-family: var(--font-sans), sans-serif; font-weight: 500; font-size: 14px; color: var(--faint); }
.biv-plan-tag { font-size: 13.5px; color: var(--dim); margin: 6px 0 0; }
.biv-plan ul { list-style: none; margin: 6px 0 0; padding: 0; }
.biv-plan li { font-size: 14px; color: var(--dim); padding: 7px 0 7px 26px; position: relative; border-top: 1px solid rgba(157,176,199,0.08); }
.biv-plan li::before { content: "✓"; position: absolute; left: 2px; color: var(--green-hi); font-weight: 700; }

/* numbers */
.biv-numbers { display: grid; grid-template-columns: repeat(4, 1fr); gap: 18px; margin-top: 40px; }
.biv-num { background: var(--bg2); border: 1px solid var(--line); border-radius: 16px; padding: 26px 22px; }
.biv-num-big { font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: clamp(34px, 3.4vw, 48px); color: var(--green-hi); letter-spacing: -0.02em; }
.biv-num-cap { font-size: 13.5px; color: var(--dim); line-height: 1.55; margin-top: 10px; }
.biv-fine.biv-center { text-align: center; margin-top: 22px; }

/* tools */
.biv-tools { display: flex; flex-wrap: wrap; gap: 12px; justify-content: center; margin-top: 34px; }
.biv-tool {
  border: 1px solid var(--line); border-radius: 999px; padding: 11px 20px;
  color: var(--ink); text-decoration: none; font-size: 14.5px; font-weight: 600;
  background: rgba(14,26,46,0.6); transition: border-color .15s, background .15s;
}
.biv-tool:hover { border-color: rgba(76,195,138,0.5); background: rgba(76,195,138,0.08); }

/* faq */
.biv-faq { max-width: 760px; margin: 36px auto 0; }
.biv-faq details { border-bottom: 1px solid var(--line); }
.biv-faq summary {
  cursor: pointer; list-style: none; display: flex; justify-content: space-between; gap: 16px;
  align-items: center; padding: 20px 4px; font-size: 17px; font-weight: 700;
}
.biv-faq summary::-webkit-details-marker { display: none; }
.biv-faq summary span { color: var(--green-hi); font-size: 22px; transition: transform .2s; }
.biv-faq details[open] summary span { transform: rotate(45deg); }
.biv-faq details p { margin: 0; padding: 0 4px 22px; font-size: 15px; line-height: 1.65; color: var(--dim); max-width: 640px; }

/* final */
.biv-final { text-align: center; padding: 90px 24px 110px !important; }
.biv-final .biv-h2 { margin-bottom: 30px; }

/* ── Light theme (site data-theme="light") ── */
:root[data-theme="light"] .biv {
  --ink: #0E1F35; --dim: #4A5D75; --faint: #7C90A8;
  --bg: #F5F7FA; --bg2: #FFFFFF; --line: rgba(14,31,53,0.12);
  background:
    radial-gradient(1000px 600px at 80% -10%, rgba(62,155,95,0.10), transparent 60%),
    radial-gradient(900px 500px at 10% 30%, rgba(30,64,120,0.08), transparent 60%),
    var(--bg);
}
:root[data-theme="light"] .biv-accent, :root[data-theme="light"] .biv-accent-text { color: var(--green) !important; }
:root[data-theme="light"] .biv-btn-ghost { border-color: rgba(14,31,53,0.3); }
:root[data-theme="light"] .biv-btn-ghost:hover { background: rgba(14,31,53,0.06); }
:root[data-theme="light"] .biv-firms span { color: rgba(14,31,53,0.72); }
:root[data-theme="light"] .biv-hero-art img { box-shadow: 0 30px 70px rgba(14,31,53,0.28); }
:root[data-theme="light"] .biv-mstat, :root[data-theme="light"] .biv-num-big { color: var(--green); }
:root[data-theme="light"] .biv-plus { background: rgba(62,155,95,0.12); color: var(--green); }
:root[data-theme="light"] .biv-tool { background: #FFFFFF; }
:root[data-theme="light"] .biv-plan-hot { box-shadow: 0 0 0 1px rgba(62,155,95,0.35), 0 24px 50px rgba(14,31,53,0.12); }
:root[data-theme="light"] .biv-faq summary span { color: var(--green); }
:root[data-theme="light"] .biv-plan li::before { color: var(--green); }

/* responsive */
@media (max-width: 960px) {
  .biv section { padding: 52px 18px; }
  .biv-hero { grid-template-columns: 1fr; padding-top: 48px !important; }
  .biv-hero h1 { font-size: clamp(30px, 8.6vw, 44px); }
  .biv-hero h1 span { white-space: normal; }
  .biv-hero-art { min-height: 300px; }
  .biv-bento { grid-template-columns: 1fr; }
  .biv-card, .biv-card-wide { grid-column: span 1; }
  .biv-plans, .biv-numbers { grid-template-columns: 1fr; }
  .biv-plan-hot { order: -1; }
}
@media (max-width: 640px) {
  .biv section { padding: 44px 14px; }
  .biv-hero-art { min-height: 230px; }
  .biv-hero-art img { width: 92%; }
  .biv-btn { padding: 12px 18px; font-size: 14px; }
  .biv-mcard { width: 205px; height: 255px; }
  .biv-mstat { font-size: 34px; }
  .biv-firms { gap: 12px 22px; }
  .biv-firms span { font-size: 15px; }
  .biv-faq summary { font-size: 15.5px; }
}
`;
