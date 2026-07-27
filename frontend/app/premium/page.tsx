"use client";
import { useState } from "react";
import Link from "next/link";
import {
  Bell, Building2, Check, CheckCircle2, Gauge, Landmark,
  SlidersHorizontal, Users,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/* ────────────────────────────────────────────────────────────
   Premium / subscribe page.
   Free band → plan cards → guarantee → what's included → FAQ.

   PRICES live in PLANS; the reassurance line is GUARANTEE below.
   The global Footer is rendered by AppShell — no footer here.
   ──────────────────────────────────────────────────────────── */

/** Edit or blank this to match the policy you actually offer. */
const GUARANTEE = "Cancel anytime — no long-term contract";

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    monthly: 29,
    badge: "Most Popular",
    features: [
      "Unlimited access to the complete Insider Score ranking and the full screener.",
      "Nine-tab stock profiles: financials, forecast, insiders, institutions, compensation, government, ownership.",
      "Insider profiles with buy track records and return against the S&P.",
      "Politician profiles: trades, corporate donors, legislation and disclosed holdings.",
      "Institutional 13F owners, whale activity and ownership treemaps.",
      "Revenue breakdown by segment and geography.",
      "Heatmaps, sector rotation, volume and sentiment charts.",
      "Short interest, squeeze candidates, dividends, earnings and IPO calendars.",
      "AI insight articles and monthly research reports.",
      "Unlimited watchlists with 100 stocks each, 100 active alerts, and one CSV export per day.",
    ],
    priceNote: "$29 a month, billed monthly.",
    cta: "Get Started Now",
  },
  {
    id: "unlimited",
    name: "Unlimited",
    monthly: 59,
    badge: null as string | null,
    features: [
      "Everything in Pro, plus…",
      "Unlimited CSV exports.",
      "Unlimited stocks per watchlist.",
      "Unlimited alerts across stocks, insiders and politicians.",
      "Priority email support.",
      "First access to new datasets as they ship.",
    ],
    priceNote: "$59 a month, billed monthly.",
    cta: "Choose Plan",
  },
] as const;

/* What a subscription opens up — every card maps to live sections. */
const BENEFITS = [
  {
    icon: Gauge,
    title: "Insider Score Rankings",
    desc: "Every company we cover scored 0–100 from its own filings and re-ranked daily. Open any score to see its five components and the arithmetic behind them.",
  },
  {
    icon: Users,
    title: "Insider Track Records",
    desc: "Every Form 4 filer gets a profile — what they bought, at what price, and how those buys performed against the S&P since.",
  },
  {
    icon: Landmark,
    title: "Congress & Political Money",
    desc: "Congressional trades with filing delays, plus politician profiles carrying legislation, corporate PAC donors, outside spending and disclosed holdings.",
  },
  {
    icon: Building2,
    title: "Institutional Ownership",
    desc: "13F filings diffed quarter over quarter so you see who added, trimmed, opened or closed — owners table, options owners and an ownership treemap.",
  },
  {
    icon: SlidersHorizontal,
    title: "Screener, Lists & Heatmaps",
    desc: "Filter by score, sector, exchange, market cap and cluster buying. Curated lists, rotation and volume charts, squeeze candidates and earnings calendars.",
  },
  {
    icon: Bell,
    title: "Alerts & Watchlists",
    desc: "Track the tickers, insiders and politicians you care about, and get told when a CEO buys, a cluster forms or a score crosses your threshold.",
  },
];

const FAQS = [
  {
    q: "What's the difference between Pro and Unlimited?",
    a: "The only differences are the limits. Pro allows one CSV export per day, 100 stocks per watchlist and 100 active alerts, while the Unlimited plan has no such limits and adds priority support. Every dataset and tool on the site is included in both.",
  },
  {
    q: "How to sign up",
    a: "Click “Get Started Now” above and enter your details. Then you will get access right away.",
  },
  {
    q: "What is the Insider Score?",
    a: "A 0–100 composite that begins with open-market insider buying, then weighs sector strength, trading momentum, the tone of the company’s own filings, and a dilution penalty. Every component and its weight is shown on the stock page, so you can check the arithmetic yourself.",
  },
  {
    q: "Where does the data come from?",
    a: "Public filings and official government databases — SEC EDGAR for insider and institutional filings, Congress.gov and the FEC for political data, the Senate lobbying database, USAspending for federal contracts, and BaFin for German disclosures. Each card on the site names its own source.",
  },
  {
    q: "How to get support?",
    a: "Send an email directly to support@insiderbuying.com. You can also go to the contact page and send a message via the form.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Of course. There is a cancel button in your account area that you get access to after signing up. You can also send us a message and we will cancel it for you — you keep access until the end of the period you have already paid for.",
  },
];

const CSS = `
/* Signal colour: the navbar petrol on light grounds, the brighter cyan on
   dark grounds where the petrol would disappear. */
.prm-scope { --sig: var(--accent); }
@media (prefers-color-scheme: dark) { .prm-scope { --sig: var(--premium); } }
:root[data-theme="dark"] .prm-scope { --sig: var(--premium); }
:root[data-theme="light"] .prm-scope { --sig: var(--accent); }

.prm-h {
  font-family: var(--font-display); font-weight: 800; letter-spacing: -.03em;
  line-height: 1.1; text-wrap: balance; margin: 0;
}
.prm-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

/* Plan card built as stacked rows, like the reference. */
.prm-card {
  border: 1px solid var(--border); border-radius: 10px;
  overflow: hidden; background: var(--bg-2);
}
.prm-card--featured { border-color: color-mix(in srgb, var(--sig) 45%, var(--border)); }
.prm-row {
  padding: 14px 20px; border-top: 1px solid var(--border);
  font-size: 14px; line-height: 1.55; margin: 0;
}
.prm-row:first-child { border-top: none; }
`;

/* Email capture for the free plan — POSTs to the existing /subscribers endpoint. */
function SignupForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!isValidEmail(email)) {
      setErr("Please enter a valid email address.");
      return;
    }
    setErr(null);
    setSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source: "premium-free" }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setDone(true);
    } catch {
      setErr("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="flex items-center justify-center gap-2 text-[14px] font-semibold text-good py-2">
        <CheckCircle2 className="h-5 w-5" />
        Check your inbox to finish setting up.
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="w-full flex flex-col gap-2.5">
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        aria-invalid={!!err}
        className="w-full px-4 py-3 rounded-lg text-[14px]"
        style={{
          background: "var(--bg-1)",
          border: err ? "1px solid var(--bad)" : "1px solid var(--border-strong)",
          color: "var(--text)",
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center rounded-lg py-3 text-[15px] font-bold transition"
        style={{ background: "var(--sig)", color: "var(--on-accent, #fff)" }}
      >
        {submitting ? "Submitting…" : "Sign Up"}
      </button>
      {err && <p className="text-[12px]" style={{ color: "var(--bad)" }}>{err}</p>}
    </form>
  );
}

/* Paid-plan button — no email field, checkout collects everything.
   TO WIRE STRIPE: replace the onClick body with a POST to your /checkout
   endpoint and `window.location.href = session.url`. */
function PlanButton({ planName, label }: { planName: string; label: string }) {
  const [note, setNote] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setNote(true)}
        className="w-full inline-flex items-center justify-center py-3.5 text-[15px] font-bold transition"
        style={{ background: "var(--sig)", color: "var(--on-accent, #fff)" }}
      >
        {label}
      </button>
      {note && (
        <p className="text-[12.5px] px-5 py-3 text-center leading-relaxed" style={{ color: "var(--text-soft)" }}>
          Card payments open shortly. Sign up free above and we&rsquo;ll email you the moment{" "}
          {planName} goes live.
        </p>
      )}
    </div>
  );
}

export default function PremiumPage() {
  return (
    <div className="w-full pb-14 prm-scope">
      <style>{CSS}</style>

      {/* ─── Free to get started ─── */}
      <section className="pt-6 sm:pt-10">
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-8 lg:gap-16 items-center">
          <div>
            <h1 className="prm-h text-[34px] sm:text-[46px]">Free to get started</h1>
            <p className="text-[16.5px] leading-relaxed mt-4 max-w-md" style={{ color: "var(--text-soft)" }}>
              Join the insider-buying platform built entirely on SEC filings and official government
              disclosure — no vendor black boxes.
            </p>
          </div>

          <div className="prm-card p-6">
            <div className="flex items-baseline justify-center gap-2 mb-4">
              <span className="prm-num text-[48px] font-bold leading-none" style={{ letterSpacing: "-.035em" }}>
                $0
              </span>
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-mute)" }}>forever</span>
            </div>
            <SignupForm />
            <p className="text-[12px] mt-3 text-center" style={{ color: "var(--text-mute)" }}>
              No payment details required
            </p>
          </div>
        </div>
      </section>

      {/* ─── Plans ─── */}
      <section id="plans" className="mt-20 scroll-mt-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="prm-h text-[34px] sm:text-[46px]">InsiderBuying Premium</h2>
          <p className="text-[16px] leading-relaxed mt-4" style={{ color: "var(--text-soft)" }}>
            Get unlimited access to every dataset and tool on the site, and help fund the work of
            turning raw filings into a signal you can actually use.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10 max-w-4xl mx-auto items-start">
          {PLANS.map((p) => {
            const featured = p.id === "pro";
            return (
              <div key={p.id} className={`prm-card ${featured ? "prm-card--featured" : ""}`}>
                <div className="prm-row flex items-center justify-between gap-3">
                  <span className="text-[17px] font-bold tracking-tight">{p.name}</span>
                  {p.badge && (
                    <span
                      className="text-[11.5px] font-bold px-2.5 py-1 rounded-full whitespace-nowrap"
                      style={{
                        background: "color-mix(in srgb, var(--sig) 13%, transparent)",
                        color: "var(--sig)",
                      }}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>

                {p.features.map((f) => (
                  <p key={f} className="prm-row" style={{ color: "var(--text-soft)" }}>
                    {f}
                  </p>
                ))}

                <p className="prm-row font-semibold">{p.priceNote}</p>

                <PlanButton planName={p.name} label={p.cta} />
              </div>
            );
          })}
        </div>

        {GUARANTEE && (
          <p
            className="flex items-center justify-center gap-2 text-[13px] font-bold mt-6"
            style={{ color: "var(--text-soft)" }}
          >
            <Check className="h-4 w-4" strokeWidth={3} style={{ color: "var(--good)" }} />
            {GUARANTEE}
          </p>
        )}
      </section>

      {/* ─── What's included ─── */}
      <section className="mt-20">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="prm-h text-[28px] sm:text-[34px]">What&rsquo;s included</h2>
          <p className="text-[15.5px] mt-3" style={{ color: "var(--text-soft)" }}>
            Whether you trade professionally or check in once a week, these are the tools that turn
            raw filings into something you can act on.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-9">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="prm-card p-6 text-center flex flex-col items-center h-full">
                <span
                  className="h-12 w-12 rounded-xl flex items-center justify-center"
                  style={{
                    background: "color-mix(in srgb, var(--sig) 12%, transparent)",
                    color: "var(--sig)",
                  }}
                >
                  <Icon className="h-6 w-6" strokeWidth={1.75} />
                </span>
                <h3 className="text-[17px] font-bold tracking-tight mt-4">{b.title}</h3>
                <p className="text-[13.5px] leading-relaxed mt-2.5" style={{ color: "var(--text-soft)" }}>
                  {b.desc}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── Common Questions ─── */}
      <section className="mt-20 max-w-3xl">
        <h2 className="prm-h text-[30px] sm:text-[38px]">Common Questions</h2>
        <div className="mt-8 flex flex-col gap-7">
          {FAQS.map((f) => (
            <div key={f.q}>
              <h3 className="text-[17px] font-bold tracking-tight">{f.q}</h3>
              <p className="text-[15px] leading-relaxed mt-2" style={{ color: "var(--text-soft)" }}>
                {f.a}
              </p>
            </div>
          ))}
        </div>

        <p className="text-[12px] mt-12 leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Informational only — not investment advice. Insider transaction data comes from public
          regulatory filings and may be delayed. The Insider Score is a research signal and does not
          predict future performance.{" "}
          <Link href="/stocks" className="text-accent">Browse the live ranking</Link>.
        </p>
      </section>
    </div>
  );
}
