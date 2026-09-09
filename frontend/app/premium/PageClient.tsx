"use client";

/**
 * SUBSCRIBE PAGE — the beehiiv-style layout George approved at
 * /premium-preview, promoted to /premium on 2026-08-24 (his words: "premium
 * preview ko ab replace karo /premium se, we are using new layout, and also
 * button per stripe checkout bhi lagao").
 *
 * Styling is scoped under .biv (same pattern as the old page's .sub3): a dark
 * navy take on beehiiv's near-black look, using the site's own font stack —
 * Libre Franklin 900 for the mega headlines, Barlow for body, Barlow
 * Condensed for eyebrows — and the brand colour where beehiiv uses pink.
 *
 * Live commerce, carried over from the page this replaces:
 *   · plan prices come from /billing/plans (the LIVE Stripe amounts, so the
 *     page can never advertise a figure checkout would not charge)
 *   · the Monthly/Annual buttons open Stripe Checkout via /billing/checkout
 *   · signed-out visitors get the login modal first; already-subscribed
 *     visitors get the thank-you modal instead of a second subscription
 *   · the ?checkout=success|cancelled return from Stripe is handled here
 */

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { getAuthToken, useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";
import { LoginModal } from "@/components/LoginModal";
import { AlreadySubscribedModal } from "@/components/premium/AlreadySubscribedModal";
import { getFunnelEntry, setFunnelEntry } from "@/lib/funnel";
import { track } from "@/lib/analytics";
import { InsiderCard, INSIDER_CARD_CSS } from "@/components/premium/InsiderCard";
import { ResearchModule, RESEARCH_CSS } from "@/components/premium/ResearchModule";
import { HowItWorks, HOW_CSS } from "@/components/premium/HowItWorks";
import { ProductShowcase, SHOWCASE_CSS } from "@/components/premium/ProductShowcase";
import { investorsLine } from "@/lib/site-stats";
import { getCheckoutAttribution } from "@/lib/analytics";
import { ComplianceFooter } from "@/components/ComplianceFooter";

/* ------------------------------------------------------------------ data */


/** §6.2 product mockup slots (Developer Project Brief, Workstream D).
 *  "Minimum 4 mockups (IQS screener, insider report page, SMS alert on a
 *  phone frame, Bubbles map)". Each `src` is the 1x light capture; the 2x
 *  retina asset is `<name>@2x.jpg` and the dark-theme pair is `<name>-dark.jpg`
 *  / `<name>-dark@2x.jpg` — the design team's final compositions replace the
 *  files at these paths and nothing else changes. Captions link to the real
 *  feature (§2.4: nothing here may claim what the product does not do). */

/** §6.1 insider performance cards (Developer Project Brief, Workstream D),
 *  alternating with platform stats in the two marquee rows.
 *
 *  Roster rule (client decision 2026-08-28): every card must carry a LIVE
 *  Insider ROI Leaderboard stat, so the insiders here are ones with disclosed
 *  open-market buys on our tape. The six household names that used to sit
 *  here (Buffett, Pelosi, Huang, Bezos, Dalio, Trump Jr.) have no Form 4
 *  buys on record and could not print a figure. `filerName` is the exact
 *  stored Form 4 name — the /insiders/profile lookup key — and `photo` may be
 *  missing until a portrait is dropped into /public/sales/people (the card
 *  shows initials, never a broken image). */
type MarqueeItem =
  | {
      kind: "insider";
      filerName: string;
      name: string;
      title: string;
      company: string;
      photo?: string;
    }
  | { kind: "stat"; big: string; caption: string; label: string };

const ROW_A: MarqueeItem[] = [
  { kind: "insider", filerName: "CASCADE INVESTMENT, L.L.C.", name: "Cascade Investment", title: "Bill Gates' investment company", company: "Republic Services", photo: "/sales/people/cascade.jpg" },
  { kind: "stat", big: "142K+", caption: "open-market insider buys on file", label: "SEC Form 4" },
  { kind: "insider", filerName: "WARREN KELCY L", name: "Kelcy Warren", title: "Executive Chairman", company: "Energy Transfer", photo: "/sales/people/kelcy-warren.jpg" },
  { kind: "stat", big: "+2,924%", caption: "Insider Purchases Strategy, all-time backtest", label: "Backtested" },
  { kind: "stat", big: "435", caption: "insiders ranked by track record", label: "Track records" },
];

// Every card here ships with a portrait (§6.1 says "photo"): Gates and Warren
// from Wikimedia Commons, Frost and Foran from their companies' own leadership
// pages. Frangou (NMM) and Courtis (AMR) have live stats but no obtainable
// photo — Navios, Alpha Met, Wikipedia and Wikidata all have none — so they
// are not carded rather than shown as initials.
const ROW_B: MarqueeItem[] = [
  { kind: "insider", filerName: "FROST PHILLIP MD ET AL", name: "Phillip Frost", title: "Director", company: "Cocrystal Pharma", photo: "/sales/people/phillip-frost.jpg" },
  { kind: "stat", big: "4,300+", caption: "U.S. companies covered", label: "Coverage" },
  { kind: "insider", filerName: "Foran Joseph Wm", name: "Joseph Foran", title: "Founder, Chairman & CEO", company: "Matador Resources", photo: "/sales/people/joseph-foran.jpg" },
  { kind: "stat", big: "+31%", caption: "backtest CAGR since 2014", label: "Since 2014" },
  { kind: "stat", big: "39", caption: "live alerts in the last 30 days", label: "Past 30 days" },
];

const MARQUEE_PEOPLE = [...ROW_A, ...ROW_B].filter(
  (c): c is Extract<MarqueeItem, { kind: "insider" }> => c.kind === "insider",
);


/** The three columns. Prices are NOT hardcoded — `plan` names the Stripe
 *  plan and the live amount is fetched from /billing/plans, so the figure on
 *  the card is always the figure Stripe will charge. */
const PLANS: Array<{
  name: string;
  plan: "free" | "monthly" | "annual";
  per: string;
  tagline: string;
  cta: string;
  featured: boolean;
  feats: string[];
}> = [
  {
    name: "Free",
    plan: "free",
    per: "forever",
    tagline: "Start exploring the tape.",
    cta: "Start free",
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
    plan: "monthly",
    per: "per month",
    tagline: "Full access, month to month.",
    cta: "Get Monthly",
    featured: false,
    feats: [
      "Everything in Free",
      "Full Insider Scores & Insider ROI",
      "Top Analysts + upside ratings",
      "Congress trades & gov contracts",
      "Ranked lists counted down to #1",
      "Weekly insider intelligence brief",
      "Real-time insider alerts",
    ],
  },
  {
    name: "Annual",
    plan: "annual",
    per: "per year",
    tagline: "Best value — pay for a year, save the rest.",
    cta: "Get All-In Access",
    featured: true,
    // George (call, 2026-09-10): the same subscription — nothing may appear
    // on Annual that is not on Monthly, or people get confused. Only the
    // billing differs.
    feats: [
      "Everything in Free",
      "Full Insider Scores & Insider ROI",
      "Top Analysts + upside ratings",
      "Congress trades & gov contracts",
      "Ranked lists counted down to #1",
      "Weekly insider intelligence brief",
      "Real-time insider alerts",
    ],
  },
];

/** §2 row 6 — the benefits grid under the new section header. Feature
 *  language only; no outcome promises (§6 compliance). */
const BENEFITS = [
  { title: "Insider Scores", text: "A 0–100 score on every company with qualifying open-market buys, with the pillars behind it." },
  { title: "Top Insider Buys", text: "Every purchase graded A+ to F as the Form 4 lands — size, stake growth, buyer record, timing." },
  { title: "Top Analysts & Insiders", text: "People ranked by measured results: analyst success rates and insider track-record accuracy." },
  { title: "Insider alerts", text: "Summarized email alerts on the CEO, CFO and $1M+ buys that matter, sent as each filing is processed." },
  { title: "Congress & contracts", text: "House and Senate trades and government contract awards, side by side with the insiders." },
  { title: "Bubbles & heat maps", text: "The whole tape in one picture — insider bubbles, congress bubbles and sector flow." },
];

const NUMBERS = [
  { big: "+2,924%", caption: "all-time return of the Insider Purchases Strategy backtest" },
  { big: "+31%", caption: "compound annual growth rate since 2014" },
  { big: "142K+", caption: "open-market insider buys tracked from SEC Form 4" },
  { big: "4,300+", caption: "U.S. companies scored and covered daily" },
];

const TOOLS = [
  { label: "Stock profiles", href: "/companies/AAPL" },
  { label: "Insider rankings", href: "/insiders" },
  { label: "Premium alerts", href: "/alerts" },
  { label: "Insider profiles", href: "/insiders" },
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

/** The site's theme, live. The product screenshots exist in both light and
 *  dark captures (client 2026-08-24: "dark mode mein dark ss honi chaiye"),
 *  and this page is dark-first, so the dark set is the default until the
 *  attribute says otherwise. */
function useSiteTheme(): "light" | "dark" {
  const [theme, setTheme] = useState<"light" | "dark">("dark");
  useEffect(() => {
    const read = () =>
      setTheme(
        document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
      );
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return theme;
}

/* -------------------------------------------------------------- commerce */

interface BillingPlans {
  configured: boolean;
  live: boolean;
  /** Stripe mode the server is keyed for. */
  mode?: "test" | "live" | "unset";
  plans: Array<{ plan: "monthly" | "annual"; amount: number; currency: string; interval: string }>;
}

/** Cents → "$199" / "$39.99" (whole amounts lose the trailing .00). */
function money(amount: number, currency: string): string {
  const symbol = currency?.toLowerCase() === "usd" ? "$" : "";
  const value = amount / 100;
  const text = Number.isInteger(value) ? String(value) : value.toFixed(2);
  return `${symbol}${text}`;
}

/**
 * The Stripe return leg. `?checkout=success` triggers a /billing/sync so
 * premium flips without waiting for the webhook, then opens the thank-you
 * modal once; the outcome is consumed from the URL immediately so a refresh
 * or a bookmarked link never replays it (behaviour carried over from the
 * page this replaces, commit 3905cde).
 */
function CheckoutOutcome({ onSuccess }: { onSuccess: () => void }) {
  const { refreshPremium } = usePremium();
  const [state, setState] = useState<"none" | "syncing" | "success" | "cancelled" | "error">("none");
  const firedRef = useRef(false);
  useEffect(() => {
    if (state !== "success" || firedRef.current) return;
    firedRef.current = true;
    track("web_purchase", { product: "premium", entry: getFunnelEntry() });
    onSuccess();
  }, [state, onSuccess]);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    const sessionId = params.get("session_id");
    params.delete("checkout");
    params.delete("session_id");
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      window.location.pathname + (qs ? `?${qs}` : "") + window.location.hash,
    );
    if (outcome === "cancelled") {
      setState("cancelled");
      return;
    }
    if (outcome !== "success") return;
    setState("syncing");
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/billing/sync`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${getAuthToken() ?? ""}`,
          },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error("sync failed");
        await refreshPremium();
        setState(data?.premium ? "success" : "syncing");
        if (!data?.premium) {
          setTimeout(async () => {
            await refreshPremium();
            setState("success");
          }, 4000);
        }
      } catch {
        setState("error");
      }
    })();
  }, [refreshPremium]);
  if (state === "none" || state === "success") return null;
  const msg: Record<string, string> = {
    syncing: "Finalizing your subscription…",
    cancelled: "Checkout cancelled — no charge was made.",
    error:
      "We couldn't confirm the payment automatically. If you were charged, refresh in a minute or contact support.",
  };
  return (
    <div className={`biv-note biv-note-${state}`} role="status">
      {msg[state]}
    </div>
  );
}

/* ------------------------------------------------------------------ page */

export default function PremiumPage() {
  const theme = useSiteTheme();
  const { user } = useAuth();
  const { premium } = usePremium();
  const router = useRouter();
  const [busy, setBusy] = useState<"monthly" | "annual" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);
  const [thanksOpen, setThanksOpen] = useState(false);

  // Live Stripe amounts — the card prints these, never a hardcoded figure.
  const { data: billing } = useSWR<BillingPlans>(`${API_BASE}/billing/plans`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60_000,
  });
  const priceOf = (plan: "free" | "monthly" | "annual"): string | null => {
    if (plan === "free") return "$0";
    const p = billing?.plans?.find((x) => x.plan === plan);
    return p ? money(p.amount, p.currency) : null;
  };
  // The annual saving is computed from the two live amounts rather than being
  // written into the copy, so it can never drift from the Stripe prices.
  const monthlyAmt = billing?.plans?.find((x) => x.plan === "monthly")?.amount;
  const annualAmt = billing?.plans?.find((x) => x.plan === "annual")?.amount;
  const annualSaving =
    monthlyAmt && annualAmt && monthlyAmt * 12 > annualAmt
      ? {
          pct: Math.round((1 - annualAmt / (monthlyAmt * 12)) * 100),
          months: Math.round(annualAmt / monthlyAmt),
        }
      : null;

  // Returning from Stripe via the Back button restores this page from the
  // back/forward cache with `busy` still set, which would leave the button
  // stuck on "Opening checkout…".
  useEffect(() => {
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) setBusy(null);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, []);

  // Brief v4 §3.4 / §7: the social-proof line is wired to the real subscriber
  // count (rounded down to the hundred) behind a config floor — see
  // lib/site-stats.ts for why the floor exists.
  const { data: subCount } = useSWR<{ exact: number; roundedDown: number }>(
    `${API_BASE}/subscribers/count`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const investors = investorsLine(subCount?.roundedDown);

  // Step 3 of the funnel: log the sales-page view with its entry point, so
  // /join → /premium → purchase can be read as one conversion path.
  useEffect(() => {
    track("web_premium_view", { entry: getFunnelEntry(), premium });
    // Once per mount — `premium` flipping after a sync is not a new view.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // The exit-intent monthly downsell is REMOVED (George, 2026-09-02: "remove
  // all pop ups on that page"). The Round-2 brief asked for it here, but the
  // sales page is now the place a visitor lands ready to buy, and an
  // interrupt on the way out was the one thing on it nobody chose to see.
  // The login and already-subscribed modals stay: those open from a click,
  // not on their own, and removing them would break subscribing.

  const checkout = async (plan: "monthly" | "annual") => {
    if (busy) return;
    if (!user) {
      setLoginOpen(true);
      return;
    }
    // Already subscribed → celebrate instead of double-billing (client rule).
    if (premium) {
      setThanksOpen(true);
      return;
    }
    setBusy(plan);
    // §6: every checkout event carries the funnel entry AND the UTM set, and
    // the same set rides into the Stripe session metadata via the API body.
    const attribution = { entry: getFunnelEntry(), ...getCheckoutAttribution() };
    track("web_checkout_start", { plan, ...attribution });
    setErr(null);
    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getAuthToken() ?? ""}`,
        },
        body: JSON.stringify({ plan, attribution }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.url) {
        throw new Error(
          (Array.isArray(data?.message) ? data.message[0] : data?.message) ||
            "Checkout is unavailable right now — please try again.",
        );
      }
      window.location.href = data.url as string;
    } catch (e) {
      setBusy(null);
      setErr(e instanceof Error ? e.message : "Something went wrong — try again.");
    }
  };

  return (
    <div className="biv">
      <CheckoutOutcome onSuccess={() => setThanksOpen(true)} />
      {/* ---------------------------------------------------------- hero */}
      <section className="biv-hero">
        <div className="biv-hero-copy">
          <h1>
            <span>Stock analysis.</span>
            <span>Insider rankings.</span>
            <span>Premium alerts.</span>
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
          {/* George (call, 2026-09-10): the five stars sit under the hero copy,
              not in their own strip below the fold. */}
          <div className="biv-stars" role="img" aria-label="Rated five stars">
            {Array.from({ length: 5 }).map((_, i) => (
              <svg key={i} viewBox="0 0 24 24" aria-hidden="true">
                <path d="M12 2.6l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.4l-5.9 3.3 1.3-6.6L2.5 9.5l6.6-.8z" />
              </svg>
            ))}
          </div>
          <p className="biv-eyebrow-center biv-trust-line">Trusted by real investors</p>
        </div>
        <div className="biv-hero-art" aria-hidden="true">
          {/* Both panels are designed UI, not screenshots: they stay crisp at
              any size, weigh nothing, and follow the site theme. */}
          <div className="biv-panel biv-panel-perf">
            <div className="biv-panel-head">
              <span className="biv-eyebrow-sm">Insider Purchases Strategy</span>
              <span className="biv-tagpill">Backtested</span>
            </div>
            <div className="biv-bigstat">
              +2,924.4%
              <em>all time vs market</em>
            </div>
            <div className="biv-panel-stats">
              <div><b>+31.00%</b><span>CAGR</span></div>
              <div><b>+72.48%</b><span>1-year</span></div>
              <div><b>2014</b><span>since</span></div>
              <div><b>142K+</b><span>buys tracked</span></div>
            </div>
            <svg className="biv-chart" viewBox="0 0 100 42" preserveAspectRatio="none">
              <defs>
                <linearGradient id="bivFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4CC38A" stopOpacity="0.42" />
                  <stop offset="100%" stopColor="#4CC38A" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 39 L8 38.4 L16 37.8 L24 36.6 L32 35 L40 32.4 L48 29.6 L56 26.4 L64 21.6 L72 18.4 L80 12.6 L88 8.4 L94 6.6 L100 2 L100 42 L0 42 Z"
                fill="url(#bivFill)"
              />
              <path
                d="M0 39 L8 38.4 L16 37.8 L24 36.6 L32 35 L40 32.4 L48 29.6 L56 26.4 L64 21.6 L72 18.4 L80 12.6 L88 8.4 L94 6.6 L100 2"
                fill="none" stroke="#4CC38A" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"
                vectorEffect="non-scaling-stroke"
              />
              <path
                d="M0 39.6 L25 39 L50 38.2 L75 37.2 L100 35.8"
                fill="none" stroke="currentColor" strokeWidth="1.1" strokeDasharray="3 3"
                opacity="0.4" vectorEffect="non-scaling-stroke"
              />
            </svg>
          </div>

          <div className="biv-panel biv-panel-tape">
            <div className="biv-panel-head">
              <span className="biv-eyebrow-sm biv-livelabel">
                <span className="biv-dot" /> Live tape
              </span>
              <span className="biv-tagpill">39 alerts</span>
            </div>
            <div className="biv-taperow">
              <b className="biv-chip">IMPP</b>
              <div className="biv-tapewho">
                <b>CEO buy</b>
                <span className="biv-grade biv-grade-a">Trade Grade A+</span>
              </div>
              <span className="biv-amt">$450K</span>
            </div>
            <div className="biv-taperow">
              <b className="biv-chip">GWRS</b>
              <div className="biv-tapewho">
                <b>Director buy</b>
                <span className="biv-grade biv-grade-a">Trade Grade A-</span>
              </div>
              <span className="biv-amt">$5.77M</span>
            </div>
            <div className="biv-taperow">
              <b className="biv-chip">AAT</b>
              <div className="biv-tapewho">
                <b>Big buy</b>
                <span className="biv-grade biv-grade-b">Trade Grade B+</span>
              </div>
              <span className="biv-amt">$1.14M</span>
            </div>
          </div>
        </div>
      </section>

      {/* Brief v4 §2: everything above this line (hero + five stars) is
          frozen — "keep the copy and layout that is above the fold". The
          revision starts here: research module → how it works → showcase. */}
      <ResearchModule />
      <HowItWorks />
      <ProductShowcase />
      {/* §6: the primary CTA repeats after the showcase. */}
      <section className="biv-section biv-mid-cta">
        <button
          type="button"
          onClick={() => checkout("annual")}
          disabled={busy !== null}
          className="biv-btn biv-btn-solid biv-btn-big"
        >
          {premium
            ? "You're subscribed"
            : busy === "annual"
              ? "Opening checkout…"
              : priceOf("annual")
                ? `Get Annual Access — ${priceOf("annual")}/year`
                : "Get Annual Access"}
        </button>
        <p className="biv-fine biv-center">Join {investors} investors getting faster insider intelligence</p>
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
        {/* Both rows carry every portrait (row two reversed) — with the stat
            tiles gone a two-person row repeated too visibly. */}
        {[MARQUEE_PEOPLE, [...MARQUEE_PEOPLE].reverse()].map((row, ri) => (
          <div className={`biv-marquee ${ri === 1 ? "biv-marquee-rev" : ""}`} key={ri}>
            <div className="biv-marquee-track">
              {/* Pictures only (Faizan, 2026-09-10): the stat tiles are filtered
                  out and each card is portrait + name — no figures, no tooltip. */}
              {[...row, ...row]
                .filter((c): c is Extract<MarqueeItem, { kind: "insider" }> => c.kind === "insider")
                .map((c, i) => (
                  <InsiderCard
                    key={i}
                    filerName={c.filerName}
                    name={c.name}
                    title={c.title}
                    company={c.company}
                    photo={c.photo}
                    variant="photo"
                  />
                ))}
            </div>
          </div>
        ))}
        <p className="biv-fine biv-center" style={{ marginTop: 18 }}>
          Photos: Wikimedia Commons (CC BY 4.0 / CC BY-SA 4.0) and company leadership pages.
          Each card links to the insider&rsquo;s profile, where every disclosed trade is listed.
        </p>
      </section>

      {/* -------------------------------------------------------- pricing */}
      <section className="biv-section" id="pricing">
        <p className="biv-eyebrow-center biv-accent-text">Pricing</p>
        <h2 className="biv-h2 biv-center">Become an insider.</h2>
        <p className="biv-fine biv-center biv-proof-line">Join {investors} investors getting faster insider intelligence</p>
        <div className="biv-plans">
          {/* Featured (Annual) card sits in the CENTER column (Faizan, 2026-09-10). */}
          {[
            ...PLANS.filter((p) => p.plan === "free"),
            ...PLANS.filter((p) => p.featured),
            ...PLANS.filter((p) => p.plan !== "free" && !p.featured),
          ].map((p) => {
            const price = priceOf(p.plan);
            const paid = p.plan !== "free";
            // Brief, Step 3: the annual CTA names the plan and its price, and
            // is the loudest button on the page. The figure is the live Stripe
            // amount, never a hardcoded one.
            const annualCta = price ? `Get Annual Access — ${price}/year` : p.cta;
            const label = premium && paid
              ? "You're subscribed"
              : busy === p.plan
                ? "Opening checkout…"
                : p.plan === "annual"
                  ? annualCta
                  : p.cta;
            return (
              <div key={p.name} className={`biv-plan ${p.featured ? "biv-plan-hot" : ""}`}>
                {p.featured && <div className="biv-plan-badge">Best value</div>}
                <h3>{p.name}</h3>
                <div className="biv-price">
                  {/* Dash until the live Stripe amount lands — better than
                      printing a number that might not be the charged one. */}
                  {price ?? "—"}
                  <span> {p.per}</span>
                </div>
                <p className="biv-plan-tag">
                  {p.plan === "annual" && annualSaving
                    ? `Best value — save ${annualSaving.pct}% versus monthly (pay for ${annualSaving.months} months, get 12).`
                    : p.tagline}
                </p>
                {paid ? (
                  <button
                    type="button"
                    onClick={() => checkout(p.plan as "monthly" | "annual")}
                    disabled={busy !== null}
                    className={`biv-btn ${p.featured ? "biv-btn-solid biv-btn-loud" : "biv-btn-ghost"} biv-btn-block`}
                  >
                    {label}
                  </button>
                ) : user ? (
                  <Link href="/alerts" className="biv-btn biv-btn-ghost biv-btn-block">
                    {p.cta}
                  </Link>
                ) : (
                  <button
                    type="button"
                    onClick={() => setLoginOpen(true)}
                    className="biv-btn biv-btn-ghost biv-btn-block"
                  >
                    {p.cta}
                  </button>
                )}
                <ul>
                  {p.feats.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
        {err && (
          <div className="biv-note biv-note-error" role="alert">
            {err}
          </div>
        )}
        <p className="biv-fine biv-center" style={{ marginTop: 18 }}>
          Secure payment through Stripe. Cancel anytime from your account — access runs to the end of
          the paid period. 30-day money-back guarantee on your first payment.{" "}
          <Link href="/terms" className="biv-fine-link">Terms</Link> ·{" "}
          <Link href="/privacy" className="biv-fine-link">Privacy</Link> ·{" "}
          <Link href="/disclaimer" className="biv-fine-link">Disclaimer</Link>
        </p>
      </section>

      {/* -------------------------------------- §3.2 header + benefits grid */}
      <section className="biv-section" id="features">
        <p className="biv-eyebrow-center biv-accent-text">Why insiders</p>
        <h2 className="biv-h2 biv-center">What&rsquo;s included.</h2>
        <div className="biv-benefits">
          {BENEFITS.map((b) => (
            <div key={b.title} className="biv-benefit">
              <h3>{b.title}</h3>
              <p>{b.text}</p>
            </div>
          ))}
        </div>
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
        <p className="biv-eyebrow-center biv-accent-text">Join {investors} professional investors</p>
        <h2 className="biv-h2">Get faster insider intelligence.</h2>
        <button
          type="button"
          onClick={() => checkout("annual")}
          disabled={busy !== null}
          className="biv-btn biv-btn-solid biv-btn-big"
        >
          {premium
            ? "You're subscribed"
            : busy === "annual"
              ? "Opening checkout…"
              : priceOf("annual")
                ? `Get Annual Access — ${priceOf("annual")}/year`
                : "Get Annual Access"}
        </button>
      </section>

      {/* §2 row 8 / §6: the standard compliance footer, on the sales page too. */}
      <section className="biv-section biv-compliance">
        <ComplianceFooter
          extra={
            <>
              Subscriptions are billed by Stripe and can be cancelled anytime; see the{" "}
              <Link href="/terms" className="font-semibold text-accent">Terms</Link>,{" "}
              <Link href="/privacy" className="font-semibold text-accent">Privacy Policy</Link> and{" "}
              <Link href="/disclaimer" className="font-semibold text-accent">Disclaimer</Link>.{" "}
            </>
          }
        />
      </section>

      <style>{CSS + RESEARCH_CSS + HOW_CSS + SHOWCASE_CSS + BENEFITS_CSS}</style>

      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
      <AlreadySubscribedModal open={thanksOpen} onClose={() => setThanksOpen(false)} />
    </div>
  );
}

/* ------------------------------------------------------------------ css */

const CSS = `
.biv {
  --ink: #F5F7FA; --dim: #9DB0C7; --faint: #5D7189;
  --bg: #0A1220; --bg2: #0E1A2E; --line: rgba(157,176,199,0.14);
  --green: #3E9B5F; --green-hi: #4CC38A;
  /* Site brand accent — the navbar colour, per theme (globals.css tokens:
     light --brand-surface #005882, dark --accent #20d0ff). Used for the
     primary CTA, the hero's final line and the big stat numbers. */
  --brand: #20d0ff; --brand-ink: #04141c;
  /* Hover fill for every CTA: the navbar colour with white text, identical in
     light and dark (client 2026-08-24). */
  --hover-fill: #005882; --hover-ink: #FFFFFF;
  /* Research module's serif "Harvard" wordmark: cream on the dark page. */
  --research-serif: #F2E6C9;
  /* Hero glass-panel surfaces (theme-aware so neither panel reads heavy). */
  --panel-a: rgba(19,33,55,0.92); --panel-b: rgba(9,17,31,0.86);
  --panel-line-c: rgba(157,176,199,0.18);
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
.biv-accent { color: var(--brand); }
.biv-accent-text { color: var(--brand) !important; }
.biv-dim { color: var(--faint); }

/* hero */
.biv-hero { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 44px; align-items: center; padding-top: 84px !important; }
/* George (call, 2026-09-10): "move this entire section over a little bit, not a lot". */
.biv-hero-copy { padding-left: 28px; }
.biv-hero h1 { font-size: clamp(34px, 3.9vw, 56px); display: grid; }
.biv-hero h1 span { white-space: nowrap; }
.biv-sub { font-size: 18px; line-height: 1.6; color: var(--dim); margin: 22px 0 26px; max-width: 460px; }
.biv-sub b { color: var(--ink); }
.biv-ctas { display: flex; gap: 12px; flex-wrap: wrap; }
.biv-btn {
  display: inline-block; text-decoration: none; border-radius: 10px;
  font-weight: 700; font-size: 15px; padding: 13px 22px; transition: filter .15s, background .15s;
}
/* Brand (navbar-colour) buttons.
   Everything here is forced, for two different reasons:
   · the site's global a:hover rule wins the label colour on the anchor CTAs;
   · the button reset further down needs an element selector
     (.biv button.biv-btn-ghost), which outranks a plain :hover class rule —
     that is why the hover fill silently stopped applying when the checkout CTAs
     became real buttons, leaving white text on a white card. */
.biv .biv-btn-solid { background: var(--brand) !important; color: var(--brand-ink) !important; }
.biv .biv-btn-ghost {
  background: transparent !important; border: 1px solid var(--brand);
  color: var(--brand) !important;
}
.biv .biv-btn-solid:hover, .biv .biv-btn-ghost:hover {
  background: var(--hover-fill) !important; border-color: var(--hover-fill) !important;
  color: var(--hover-ink) !important; filter: none;
}
.biv-btn-block { display: block; width: 100%; text-align: center; margin: 18px 0; }
.biv-btn-big { font-size: 17px; padding: 16px 34px; }
/* Primary conversion button (annual plan) — deliberately the loudest control
   in the pricing block, per the Round-2 brief. */
.biv-btn-loud { font-size: 15.5px; padding: 16px 20px; letter-spacing: 0.2px; box-shadow: 0 12px 30px rgba(76,195,138,0.28); }
/* The checkout CTAs are real <button>s (they POST /billing/checkout), so they
   need the anchor styling above plus a button reset and a disabled state. */
.biv button.biv-btn { font-family: inherit; border-width: 0; cursor: pointer; -webkit-appearance: none; appearance: none; }
.biv button.biv-btn-ghost { border-width: 1px; border-style: solid; }
.biv .biv-btn:disabled { opacity: 0.62; cursor: default; filter: none; }
/* Checkout status / error line (Stripe return leg + failed checkout). */
.biv-note {
  max-width: 720px; margin: 18px auto 0; padding: 12px 18px; border-radius: 12px;
  font-size: 14px; font-weight: 600; text-align: center; border: 1px solid var(--line);
  background: var(--bg2); color: var(--dim);
}
.biv-note-syncing { border-color: var(--brand); color: var(--brand); }
.biv-note-error { border-color: #E0574B; color: #F0938A; }
.biv-fine { font-size: 12.5px; color: var(--faint); margin-top: 14px; }

/* Two matched glass panels — a performance card and the live tape — layered
   for depth. Both are real markup (crisp at any size, no image weight) and
   both carry live figures. */
.biv-hero-art { position: relative; min-height: 480px; }
.biv-panel {
  position: absolute; border-radius: 18px; padding: 20px 22px;
  background: linear-gradient(155deg, var(--panel-a), var(--panel-b));
  border: 1px solid var(--panel-line-c);
  box-shadow: 0 26px 70px rgba(3,10,22,0.42), 0 0 0 1px rgba(255,255,255,0.02) inset;
  backdrop-filter: blur(12px);
  animation: biv-hover 8s ease-in-out infinite;
}
.biv-panel-perf { top: 0; right: 0; width: 90%; z-index: 1; }
.biv-panel-tape { bottom: 0; left: 0; width: 64%; z-index: 2; animation-delay: 2.2s; }
@keyframes biv-hover {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-8px); }
}
@media (prefers-reduced-motion: reduce) { .biv-panel { animation: none; } }

.biv-panel-head { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
.biv-eyebrow-sm {
  font-family: var(--font-display), sans-serif; font-weight: 600; font-size: 11px;
  letter-spacing: 2px; text-transform: uppercase; color: var(--dim);
}
.biv-livelabel { display: inline-flex; align-items: center; gap: 7px; color: #E8B54D; }
.biv-tagpill {
  margin-left: auto; font-family: var(--font-display), sans-serif; font-size: 10px;
  font-weight: 600; letter-spacing: 1.4px; text-transform: uppercase; color: var(--faint);
  border: 1px solid var(--panel-line-c); border-radius: 999px; padding: 3px 9px;
}
.biv-dot {
  width: 8px; height: 8px; border-radius: 50%; background: #E8B54D;
  box-shadow: 0 0 10px rgba(232,181,77,0.85); animation: biv-pulse 2s ease-in-out infinite;
}
@keyframes biv-pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.35; } }

.biv-bigstat {
  font-family: var(--font-heading), sans-serif; font-weight: 900;
  font-size: clamp(30px, 3.1vw, 42px); letter-spacing: -0.02em; color: var(--green-hi);
  display: flex; align-items: baseline; gap: 10px;
}
.biv-bigstat em {
  font-family: var(--font-sans), sans-serif; font-style: normal; font-weight: 500;
  font-size: 12.5px; letter-spacing: 0; color: var(--dim);
}
.biv-chart { width: 100%; height: 148px; margin: 6px 0 0; color: var(--faint); display: block; }
/* Stats sit ABOVE the chart: the tape panel overlaps this card's lower edge,
   so nothing readable may live down there. */
.biv-panel-stats {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
  border-top: 1px solid var(--panel-line-c); padding-top: 13px; margin-top: 14px;
}
.biv-panel-stats b {
  display: block; font-family: var(--font-display), monospace; font-size: 15px;
  font-weight: 700; color: var(--ink);
}
.biv-panel-stats span {
  font-size: 10.5px; letter-spacing: 1.1px; text-transform: uppercase; color: var(--faint);
}

.biv-taperow {
  display: flex; align-items: center; gap: 11px; padding: 9px 0;
  border-top: 1px solid var(--panel-line-c);
}
.biv-taperow:first-of-type { border-top: 0; }
.biv-chip {
  font-family: var(--font-display), monospace; font-weight: 700; font-size: 13.5px;
  letter-spacing: 0.8px; color: var(--green-hi); background: rgba(76,195,138,0.14);
  border: 1px solid rgba(76,195,138,0.34); border-radius: 8px; padding: 4px 9px;
  flex: 0 0 auto;
}
.biv-tapewho { min-width: 0; }
.biv-tapewho b { display: block; font-size: 12.5px; font-weight: 700; color: var(--ink); }
.biv-tapewho span {
  display: block; font-size: 11px; color: var(--faint);
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.biv-amt {
  margin-left: auto; font-family: var(--font-heading), sans-serif;
  font-weight: 900; font-size: 17px; color: var(--ink); flex: 0 0 auto;
}

/* trust */
.biv-hero-copy .biv-stars { justify-content: flex-start; margin: 26px 0 8px; }
.biv-hero-copy .biv-trust-line { text-align: left; }
.biv-grade { display: inline-block; font-family: var(--font-mono), monospace; font-size: 12px; font-weight: 700; letter-spacing: 0.04em; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--panel-line-c); }
.biv-grade-a { color: var(--green-hi); background: rgba(76,195,138,0.12); }
.biv-grade-b { color: #C9A227; background: rgba(201,162,39,0.14); }
.biv-eyebrow-center {
  font-family: var(--font-display), sans-serif; font-weight: 600; font-size: 13px;
  letter-spacing: 2.5px; text-transform: uppercase; color: var(--dim); text-align: center; margin: 0 0 22px;
}
.biv-stars { display: flex; justify-content: center; gap: 6px; margin: 0 0 14px; }
.biv-stars svg { width: 26px; height: 26px; fill: #C9A227; filter: drop-shadow(0 1px 2px rgba(0,0,0,0.18)); }
.biv-trust-line { margin: 0; }

/* features */
.biv-h2 { font-size: clamp(32px, 4.2vw, 54px); }
.biv-center { text-align: center; }
.biv-lead { font-size: 17px; line-height: 1.65; color: var(--dim); margin: 18px 0 0; max-width: 620px; }
.biv-lead.biv-center { margin-left: auto; margin-right: auto; text-align: center; }
/* marquee */
.biv-names { padding-bottom: 40px !important; }
.biv-names .biv-h2 { margin-bottom: 0; }
.biv-marquee { overflow: hidden; margin-top: 34px; -webkit-mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); mask-image: linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent); }
.biv-marquee-track { display: flex; gap: 18px; width: max-content; animation: biv-scroll 42s linear infinite; }
.biv-marquee-rev .biv-marquee-track { animation-direction: reverse; }
@keyframes biv-scroll { to { transform: translateX(-50%); } }
@media (prefers-reduced-motion: reduce) { .biv-marquee-track { animation: none; } }
.biv-mcard {
  width: 260px; min-height: 320px; border-radius: 16px; border: 1px solid var(--line);
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
  background: var(--brand); color: var(--brand-ink); font-size: 11.5px; font-weight: 800;
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
.biv-num-big { font-family: var(--font-heading), sans-serif; font-weight: 900; font-size: clamp(34px, 3.4vw, 48px); color: var(--brand); letter-spacing: -0.02em; }
.biv-num-cap { font-size: 13.5px; color: var(--dim); line-height: 1.55; margin-top: 10px; }
.biv-fine.biv-center { text-align: center; margin-top: 22px; }

/* tools — chips */
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
  --research-serif: #0E1F35;
  --ink: #0E1F35; --dim: #4A5D75; --faint: #7C90A8;
  --bg: #F5F7FA; --bg2: #FFFFFF; --line: rgba(14,31,53,0.12);
  background:
    radial-gradient(1000px 600px at 80% -10%, rgba(62,155,95,0.10), transparent 60%),
    radial-gradient(900px 500px at 10% 30%, rgba(30,64,120,0.08), transparent 60%),
    var(--bg);
}
:root[data-theme="light"] .biv {
  --brand: #005882; --brand-ink: #FFFFFF;
  --panel-a: rgba(255,255,255,0.97); --panel-b: rgba(246,249,252,0.92);
  --panel-line-c: rgba(14,31,53,0.12);
}
:root[data-theme="light"] .biv-panel {
  box-shadow: 0 26px 60px rgba(14,31,53,0.16), 0 0 0 1px rgba(14,31,53,0.02) inset;
}
:root[data-theme="light"] .biv-bigstat { color: var(--green); }
:root[data-theme="light"] .biv-chip { color: #2c7a51; }
:root[data-theme="light"] .biv-mstat { color: var(--green); }
:root[data-theme="light"] .biv-plus { background: rgba(62,155,95,0.12); color: var(--green); }
:root[data-theme="light"] .biv-tool { background: #FFFFFF; }
:root[data-theme="light"] .biv-plan-hot { box-shadow: 0 0 0 1px rgba(0,88,130,0.3), 0 24px 50px rgba(14,31,53,0.12); }
:root[data-theme="light"] .biv-faq summary span { color: var(--green); }
:root[data-theme="light"] .biv-plan li::before { color: var(--green); }

/* responsive */
@media (max-width: 960px) {
  .biv section { padding: 52px 18px; }
  .biv-hero { grid-template-columns: 1fr; padding-top: 48px !important; }
  .biv-hero-copy { padding-left: 0; }
  .biv-hero h1 { font-size: clamp(30px, 8.6vw, 44px); }
  .biv-hero h1 span { white-space: normal; }
  .biv-hero-art { min-height: 300px; }
  .biv-plans, .biv-numbers { grid-template-columns: 1fr; }
  .biv-plan-hot { order: -1; }
}
@media (max-width: 640px) {
  .biv section { padding: 44px 14px; }
  .biv-hero-art { min-height: 0; display: grid; gap: 14px; }
  .biv-panel { position: static; width: 100%; animation: none; }
  .biv-panel-tape .biv-taperow:nth-of-type(3) { display: none; }
  .biv-chart { height: 104px; }
  .biv-btn { padding: 12px 18px; font-size: 14px; }
  .biv-mcard { width: 205px; min-height: 255px; }
  .biv-mstat { font-size: 34px; }
  .biv-faq summary { font-size: 15.5px; }
}
` + INSIDER_CARD_CSS;

const BENEFITS_CSS = `
.biv-benefits { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 44px; }
.biv-benefit { background: var(--bg2); border: 1px solid var(--line); border-radius: 16px; padding: 24px 22px; }
.biv-benefit h3 { font-size: 17px; font-weight: 800; margin: 0 0 8px; color: var(--ink); }
.biv-benefit p { font-size: 14px; line-height: 1.55; color: var(--dim); margin: 0; }
.biv-mid-cta { text-align: center; padding-top: 0 !important; }
.biv-fine-link { color: var(--dim); text-decoration: underline; }
.biv-fine-link:hover { color: var(--brand); }
.biv-compliance { padding-top: 0 !important; padding-bottom: 40px !important; }
.biv-compliance footer { margin-top: 0; }

.biv-proof-line { margin-top: 10px !important; font-size: 13.5px !important; color: var(--dim) !important; }
@media (max-width: 860px) { .biv-benefits { grid-template-columns: 1fr; } }
`;
