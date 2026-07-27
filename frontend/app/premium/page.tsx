"use client";
import Link from "next/link";
import { Fragment, useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Building2,
  Check,
  CheckCircle2,
  Download,
  FileText,
  Gauge,
  Landmark,
  Minus,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/* ────────────────────────────────────────────────────────────
   Premium / subscribe page.

   Structure follows the pricing-page conventions investors expect
   (free tier → plan rack → comparison matrix → FAQ), but the
   treatment is our own: an instrument-console look built entirely
   from existing theme tokens, with --premium (cyan) as the signal
   accent and --font-mono carrying every figure.

   PRICES live in PLANS below — edit them in one place.
   The global Footer is rendered by AppShell — no footer here.
   ──────────────────────────────────────────────────────────── */

// ─── Shared email-capture CTA (POSTs to the existing /subscribers endpoint) ───
function TrialCapture({
  source,
  cta = "Start your free 30-day trial",
  align = "center",
}: {
  source: string;
  cta?: string;
  align?: "center" | "left";
}) {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);

  function validateEmail() {
    if (!isValidEmail(email)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError(null);
    return true;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!validateEmail()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/subscribers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, source }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div
        className={`inline-flex items-center gap-2 text-[15px] font-semibold text-good ${
          align === "center" ? "mx-auto" : ""
        }`}
      >
        <CheckCircle2 className="h-5 w-5" />
        You&rsquo;re in — check your inbox to activate your trial.
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      noValidate
      className={`flex flex-col gap-1.5 w-full max-w-md ${
        align === "center" ? "mx-auto" : ""
      }`}
    >
      <label
        className={`text-[12px] font-semibold ${
          align === "center" ? "text-center sm:text-left" : "text-left"
        }`}
        style={{ color: "var(--text-soft)" }}
      >
        Email address <span style={{ color: "var(--bad)" }}>*</span>
      </label>
      <div className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={validateEmail}
          placeholder="Enter your email address"
          aria-invalid={!!emailError}
          className="flex-1 px-4 py-3 rounded-lg text-[14px]"
          style={{
            background: "var(--bg-1)",
            border: emailError
              ? "1px solid var(--bad)"
              : "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={submitting}
          className="btn-primary whitespace-nowrap"
          style={{ padding: "12px 20px", fontSize: 14, fontWeight: 600 }}
        >
          {submitting ? "Submitting…" : cta}
        </button>
      </div>
      {(emailError || error) && (
        <p className="text-left text-[12px]" style={{ color: "var(--bad)" }}>
          {emailError || error}
        </p>
      )}
    </form>
  );
}

/* ─── Plans ──────────────────────────────────────────────────
   Edit prices here only. `annual` is the total billed per year;
   the card shows the per-month equivalent automatically.        */
const PLANS = [
  {
    id: "free",
    name: "Free",
    tagline: "See the signal",
    monthly: 0,
    annual: 0,
    accent: "var(--text-mute)",
    badge: null as string | null,
    features: [
      "Top 25 of the Insider Score ranking",
      "Every stock profile — all nine tabs",
      "Congress trades & politician profiles",
      "AI insight articles and daily briefings",
      "One watchlist, up to 10 stocks",
    ],
    cta: "Create free account",
  },
  {
    id: "pro",
    name: "Pro",
    tagline: "The full research desk",
    monthly: 29,
    annual: 279,
    accent: "var(--premium)",
    badge: "Most popular",
    features: [
      "The complete Insider Score ranking — no cap",
      "Screener: score, sector, exchange, market cap, cluster buys",
      "Old vs new score side by side on every table",
      "Insider & politician profiles with excess-return metrics",
      "Institutional 13F owners, whale activity & treemaps",
      "Unlimited watchlists, 100 stocks each",
      "100 active price & filing alerts",
      "Daily CSV export of any table",
      "No ads, anywhere",
    ],
    cta: "Start 30-day free trial",
  },
  {
    id: "unlimited",
    name: "Unlimited",
    tagline: "No ceilings",
    monthly: 79,
    annual: 759,
    accent: "var(--gold)",
    badge: "Power users",
    features: [
      "Everything in Pro, with every limit removed",
      "Unlimited alerts",
      "Unlimited stocks per watchlist",
      "Unlimited CSV exports",
      "Priority email support",
    ],
    cta: "Start 30-day free trial",
  },
] as const;

/* Comparison matrix — true / false / string per plan. */
const MATRIX: { group: string; rows: { label: string; free: boolean | string; pro: boolean | string; unl: boolean | string }[] }[] = [
  {
    group: "Insider Score engine",
    rows: [
      { label: "Ranked stocks visible", free: "Top 25", pro: "All", unl: "All" },
      { label: "Five-component score breakdown", free: false, pro: true, unl: true },
      { label: "Old score vs new score comparison", free: false, pro: true, unl: true },
      { label: "Score history trend per stock", free: false, pro: true, unl: true },
    ],
  },
  {
    group: "Filings & disclosure data",
    rows: [
      { label: "SEC Form 4 insider trades", free: true, pro: true, unl: true },
      { label: "Insider profiles & track records", free: false, pro: true, unl: true },
      { label: "Institutional 13F owners & treemap", free: false, pro: true, unl: true },
      { label: "Executive compensation (DEF 14A)", free: false, pro: true, unl: true },
      { label: "Revenue by segment & geography", free: true, pro: true, unl: true },
    ],
  },
  {
    group: "Government & political",
    rows: [
      { label: "Congress trading feed", free: true, pro: true, unl: true },
      { label: "Politician profiles, donors, legislation", free: false, pro: true, unl: true },
      { label: "Corporate lobbying & federal contracts", free: false, pro: true, unl: true },
    ],
  },
  {
    group: "Tools & limits",
    rows: [
      { label: "Screener filters", free: "Basic", pro: "All", unl: "All" },
      { label: "Watchlists", free: "1 list · 10 stocks", pro: "Unlimited · 100 each", unl: "Unlimited · no cap" },
      { label: "Active alerts", free: "3", pro: "100", unl: "Unlimited" },
      { label: "CSV export", free: false, pro: "1 / day", unl: "Unlimited" },
      { label: "Ad-free experience", free: false, pro: true, unl: true },
      { label: "Priority support", free: false, pro: false, unl: true },
    ],
  },
];

/* The five score components — real weights from scoring-config.ts. */
const COMPONENTS = [
  { w: 50, name: "Insider buying", desc: "Purchase size against market cap, buying clusters, seniority of the buyer, cost basis vs today's price, and stake growth — six sub-factors.", icon: TrendingUp },
  { w: 25, name: "Sector sentiment", desc: "Whether the money is flowing into this corner of the market or out of it.", icon: Landmark },
  { w: 10, name: "Filing tone", desc: "How management writes about its own business in the MD&A section of its filings.", icon: FileText },
  { w: 10, name: "Volume momentum", desc: "Recent trading demand measured against the stock's own 90-day baseline.", icon: Gauge },
  { w: 5, name: "Dilution", desc: "A penalty when the share count is quietly growing underneath you.", icon: ShieldCheck },
];

/* Provenance — every one of these is a live source in production. */
const SOURCES = [
  { name: "SEC EDGAR", detail: "Form 4 insider filings" },
  { name: "SEC 13F", detail: "Institutional holdings" },
  { name: "SEC 10-Q / 10-K", detail: "Segment revenue" },
  { name: "SEC DEF 14A", detail: "Executive pay" },
  { name: "Congress.gov", detail: "Members & legislation" },
  { name: "FEC", detail: "Campaign finance" },
  { name: "Senate LDA", detail: "Lobbying spend" },
  { name: "USAspending", detail: "Federal contracts" },
  { name: "BaFin", detail: "German directors' dealings" },
];

const FAQS = [
  {
    q: "Is there an annual option?",
    a: "Yes — choose annual at checkout. Pro is $279 a year and Unlimited is $759 a year, which works out to two months free on either plan compared with paying monthly.",
  },
  {
    q: "What is the difference between Pro and Unlimited?",
    a: "Only the limits. Pro gives you every dataset and tool on the site with generous caps — 100 alerts, 100 stocks per watchlist, one export a day. Unlimited removes those caps and adds priority support. Nothing is hidden from Pro users.",
  },
  {
    q: "What exactly is the Insider Score?",
    a: "A 0–100 composite that starts with open-market insider buying and blends in sector strength, trading momentum, the tone of the company's own filings, and a dilution penalty. Every input is inspectable on the stock page — you can see each component and its weight, not just the headline number.",
  },
  {
    q: "Where does the data come from?",
    a: "Official filings and government sources, not a black-box vendor: SEC EDGAR for insider and institutional filings, Congress.gov and the FEC for political data, the Senate lobbying database, USAspending for federal contracts, and BaFin for German disclosures. Every card on the site names its source.",
  },
  {
    q: "Which markets are covered?",
    a: "US listings (NYSE, Nasdaq) and German exchanges today, with more markets added as reliable disclosure feeds become available. Coverage is labelled per stock, so you always know what stands behind a score.",
  },
  {
    q: "Do I need a card to try it?",
    a: "No. Start the 30-day trial with an email address. We will only ask for payment details if you decide to stay.",
  },
  {
    q: "Can I cancel whenever I want?",
    a: "Yes, in one click from your account, and you keep access until the end of the period you have already paid for.",
  },
  {
    q: "Is any of this investment advice?",
    a: "No. The Insider Score is a research signal built from public filings, and past insider behaviour does not predict future returns. Every number is there to inform your own decision, not to replace it.",
  },
];

const CSS = `
.prm-wrap { position: relative; }
.prm-grid {
  position: absolute; inset: 0; pointer-events: none; overflow: hidden;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--accent) 12%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--accent) 12%, transparent) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 78%);
  -webkit-mask-image: radial-gradient(120% 90% at 50% 0%, #000 25%, transparent 78%);
}
.prm-sweep {
  position: absolute; left: 0; right: 0; height: 220px; pointer-events: none;
  background: linear-gradient(to bottom, transparent, color-mix(in srgb, var(--premium) 10%, transparent), transparent);
  animation: prm-sweep 9s linear infinite;
}
@keyframes prm-sweep { 0% { top: -220px; } 100% { top: 100%; } }
@media (prefers-reduced-motion: reduce) { .prm-sweep { display: none; } }

/* instrument corner ticks */
.prm-panel { position: relative; }
.prm-panel::before, .prm-panel::after {
  content: ""; position: absolute; width: 12px; height: 12px; pointer-events: none;
  border-color: var(--tick, var(--border-strong));
}
.prm-panel::before { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
.prm-panel::after { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }

.prm-eyebrow {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--premium);
}
.prm-h {
  font-family: var(--font-display); font-weight: 800; letter-spacing: -.03em;
  line-height: 1.08; text-wrap: balance; margin: 0;
}
.prm-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

.prm-matrix { width: 100%; border-collapse: collapse; }
.prm-matrix th, .prm-matrix td { padding: 11px 14px; border-bottom: 1px solid var(--border); font-size: 13.5px; }
.prm-matrix thead th {
  position: sticky; top: 0; z-index: 2; background: var(--bg-2);
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .09em;
  text-transform: uppercase; color: var(--text-mute); font-weight: 500; text-align: center;
}
.prm-matrix thead th:first-child { text-align: left; }
.prm-matrix td:not(:first-child) { text-align: center; }
.prm-matrix tbody th {
  text-align: left; font-weight: 500; color: var(--text-soft);
  position: sticky; left: 0; background: var(--bg-2); z-index: 1;
}
.prm-matrix tr.prm-grouprow th {
  font-family: var(--font-mono); font-size: 10.5px; letter-spacing: .1em;
  text-transform: uppercase; color: var(--premium); font-weight: 600;
  background: var(--bg-3); border-bottom: 1px solid var(--border-strong);
}
.prm-matrix tr.prm-grouprow td { background: var(--bg-3); border-bottom: 1px solid var(--border-strong); }

.prm-faq summary { cursor: pointer; list-style: none; }
.prm-faq summary::-webkit-details-marker { display: none; }
.prm-faq details[open] .prm-chev { transform: rotate(45deg); }
`;

/* Counts up to `to` once on mount (skipped when reduced-motion is set). */
function useCountUp(to: number, ms = 1100) {
  const reduce = useReducedMotion();
  const [v, setV] = useState(reduce ? to : 0);
  const started = useRef(false);
  useEffect(() => {
    if (reduce || started.current) return;
    started.current = true;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      // easeOutCubic
      setV(Math.round(to * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms, reduce]);
  return v;
}

function ScoreRing({ value }: { value: number }) {
  const shown = useCountUp(value);
  const R = 74;
  const circ = 2 * Math.PI * R;
  return (
    <div className="relative flex-shrink-0" style={{ width: 190, height: 190 }}>
      <svg viewBox="0 0 190 190" width="190" height="190" className="-rotate-90">
        <circle cx="95" cy="95" r={R} fill="none" stroke="var(--bg-3)" strokeWidth="12" />
        <circle
          cx="95"
          cy="95"
          r={R}
          fill="none"
          stroke="var(--premium)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={`${(shown / 100) * circ} ${circ}`}
          style={{ filter: "drop-shadow(0 0 10px color-mix(in srgb, var(--premium) 55%, transparent))" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="prm-num text-[46px] font-bold leading-none" style={{ letterSpacing: "-.03em" }}>
          {shown}
        </span>
        <span className="prm-eyebrow mt-1.5">Insider Score</span>
      </div>
    </div>
  );
}

function Cell({ v }: { v: boolean | string }) {
  if (v === true)
    return (
      <span className="inline-flex h-5 w-5 items-center justify-center rounded-full" style={{ background: "color-mix(in srgb, var(--premium) 18%, transparent)" }}>
        <Check className="h-3 w-3" strokeWidth={3} style={{ color: "var(--premium)" }} />
      </span>
    );
  if (v === false) return <Minus className="h-4 w-4 mx-auto" style={{ color: "var(--text-faint)" }} />;
  return <span className="prm-num text-[12.5px]" style={{ color: "var(--text-soft)" }}>{v}</span>;
}

export default function PremiumPage() {
  const [annual, setAnnual] = useState(true);

  return (
    <div className="w-full space-y-24 sm:space-y-32 pb-8">
      <style>{CSS}</style>

      {/* ─────────────── 1. HERO ─────────────── */}
      <section className="prm-wrap -mt-2 pt-10 sm:pt-16">
        <div className="prm-grid" aria-hidden />
        <div className="prm-sweep" aria-hidden />
        <div className="relative max-w-6xl mx-auto px-2">
          <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_auto] gap-12 lg:gap-16 items-center">
            <div>
              <p className="prm-eyebrow">InsiderBuying Premium</p>
              <h1 className="prm-h text-[38px] sm:text-[54px] mt-4">
                Follow the people who
                <br />
                <span style={{ color: "var(--premium)" }}>know the business best.</span>
              </h1>
              <p className="text-[17px] leading-relaxed mt-6 max-w-xl" style={{ color: "var(--text-soft)" }}>
                Executives sell for a hundred reasons and buy for one. We read every SEC Form 4 the
                moment it lands, score it against sector strength, trading momentum, filing tone and
                dilution, and rank the whole market so conviction buying is impossible to miss.
              </p>

              <div className="flex flex-wrap items-center gap-3 mt-8">
                <Link href="#plans" className="btn-primary" style={{ padding: "13px 24px", fontSize: 14.5, fontWeight: 700 }}>
                  See the plans <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/stocks"
                  className="inline-flex items-center gap-2 rounded-lg px-5 py-3 text-[14.5px] font-bold transition hover:text-accent"
                  style={{ border: "1px solid var(--border-strong)", background: "var(--bg-2)" }}
                >
                  Browse the live ranking
                </Link>
              </div>

              <div className="flex flex-wrap gap-x-8 gap-y-3 mt-9">
                {[
                  { n: "8,500+", l: "Form 4 filings parsed" },
                  { n: "400+", l: "Companies scored daily" },
                  { n: "9", l: "Official data sources" },
                ].map((s) => (
                  <div key={s.l}>
                    <div className="prm-num text-[21px] font-bold" style={{ color: "var(--premium)" }}>{s.n}</div>
                    <div className="text-[12px]" style={{ color: "var(--text-mute)" }}>{s.l}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* free-tier console card */}
            <div
              className="prm-panel card p-7 w-full lg:w-[330px]"
              style={{ ["--tick" as string]: "var(--premium)", background: "var(--bg-2)" }}
            >
              <div className="flex items-baseline gap-2">
                <span className="prm-num text-[52px] font-bold leading-none" style={{ letterSpacing: "-.035em" }}>$0</span>
                <span className="prm-eyebrow" style={{ color: "var(--text-mute)" }}>forever</span>
              </div>
              <p className="text-[13.5px] mt-3 mb-5" style={{ color: "var(--text-soft)" }}>
                Create an account and keep the essentials free for as long as you like — the ranking,
                every stock profile, and the congress feed.
              </p>
              <TrialCapture source="premium-hero-free" cta="Get started free" align="left" />
              <p className="text-[11.5px] mt-4" style={{ color: "var(--text-mute)" }}>
                No payment details required.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ─────────────── 2. THE SCORE ENGINE ─────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <p className="prm-eyebrow">Under the hood</p>
        <h2 className="prm-h text-[30px] sm:text-[38px] mt-3">Five signals, one number</h2>
        <p className="text-[16px] leading-relaxed mt-4 max-w-2xl" style={{ color: "var(--text-soft)" }}>
          Most scores are a black box. Ours shows its work: each component is measured on its own
          0&ndash;100 scale, then weighted. Missing data counts as neutral rather than zero, and no
          stock is ever awarded a perfect 100.
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-12 items-center mt-12">
          <ScoreRing value={78} />
          <div className="flex flex-col gap-3 w-full">
            {COMPONENTS.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.name}
                  className="card p-4 flex items-start gap-4"
                  style={{ background: "var(--bg-2)" }}
                >
                  <span
                    className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                    style={{ background: "color-mix(in srgb, var(--premium) 14%, transparent)", color: "var(--premium)" }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[15px] font-bold">{c.name}</span>
                      <span className="prm-num text-[13px] font-bold" style={{ color: "var(--premium)" }}>{c.w}%</span>
                    </div>
                    <p className="text-[13px] leading-relaxed mt-1" style={{ color: "var(--text-mute)" }}>{c.desc}</p>
                    <div className="h-[3px] rounded-full mt-2.5" style={{ background: "var(--bg-3)" }}>
                      <div className="h-full rounded-full" style={{ width: `${c.w}%`, background: "var(--premium)" }} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ─────────────── 3. PLANS ─────────────── */}
      <section id="plans" className="prm-wrap max-w-6xl mx-auto px-2 scroll-mt-8">
        <div className="text-center">
          <p className="prm-eyebrow">Plans</p>
          <h2 className="prm-h text-[30px] sm:text-[40px] mt-3">Pick your altitude</h2>
          <p className="text-[16px] mt-4 mx-auto max-w-xl" style={{ color: "var(--text-soft)" }}>
            Every paid plan includes every dataset on the site. The only thing that changes is how
            much of it you can hold at once.
          </p>

          {/* billing toggle */}
          <div
            className="inline-flex items-center gap-1 rounded-full p-1 mt-8"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
            role="group"
            aria-label="Billing period"
          >
            {([
              ["Monthly", false],
              ["Annual · save 2 months", true],
            ] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setAnnual(val)}
                aria-pressed={annual === val}
                className="px-4 py-2 rounded-full text-[13px] font-bold transition"
                style={
                  annual === val
                    ? { background: "var(--premium)", color: "var(--premium-ink, #04202f)" }
                    : { color: "var(--text-mute)" }
                }
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-12 items-start">
          {PLANS.map((p, i) => {
            const paid = p.monthly > 0;
            const perMonth = annual && paid ? Math.round((p.annual / 12) * 100) / 100 : p.monthly;
            const featured = p.id === "pro";
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className="prm-panel card p-6 h-full flex flex-col"
                style={{
                  ["--tick" as string]: p.accent,
                  background: "var(--bg-2)",
                  borderColor: featured ? "color-mix(in srgb, var(--premium) 45%, var(--border))" : "var(--border)",
                  boxShadow: featured
                    ? "0 14px 44px color-mix(in srgb, var(--premium) 16%, transparent)"
                    : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[19px] font-bold tracking-tight">{p.name}</span>
                  {p.badge && (
                    <span
                      className="prm-num text-[10px] font-bold uppercase px-2 py-1 rounded"
                      style={{
                        letterSpacing: ".08em",
                        background: `color-mix(in srgb, ${p.accent} 16%, transparent)`,
                        color: p.accent,
                      }}
                    >
                      {p.badge}
                    </span>
                  )}
                </div>
                <p className="text-[13px] mt-1" style={{ color: "var(--text-mute)" }}>{p.tagline}</p>

                <div className="flex items-baseline gap-1.5 mt-5">
                  <span className="prm-num text-[40px] font-bold leading-none" style={{ letterSpacing: "-.03em" }}>
                    ${paid ? perMonth : 0}
                  </span>
                  <span className="text-[13.5px] font-semibold" style={{ color: "var(--text-mute)" }}>
                    {paid ? "/ month" : "forever"}
                  </span>
                </div>
                <p className="prm-num text-[11.5px] mt-2" style={{ color: annual && paid ? "var(--good)" : "var(--text-mute)" }}>
                  {paid
                    ? annual
                      ? `$${p.annual} billed yearly — two months free`
                      : `$${p.monthly} billed monthly · or $${p.annual}/yr`
                    : "No card, no expiry"}
                </p>

                <div className="h-px my-5" style={{ background: "var(--border)" }} />

                <ul className="flex flex-col gap-2.5 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                      <Check
                        className="h-4 w-4 flex-shrink-0 mt-[3px]"
                        strokeWidth={3}
                        style={{ color: paid ? p.accent : "var(--text-mute)" }}
                      />
                      <span style={{ color: "var(--text-soft)" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <div className="mt-6">
                  {featured ? (
                    <TrialCapture source={`premium-plan-${p.id}`} cta={p.cta} align="left" />
                  ) : (
                    <Link
                      href="#final"
                      className="w-full inline-flex items-center justify-center gap-2 rounded-lg py-3 text-[14px] font-bold transition"
                      style={
                        p.id === "unlimited"
                          ? { background: "var(--bg-3)", border: `1px solid ${p.accent}`, color: "var(--text)" }
                          : { background: "var(--bg-3)", border: "1px solid var(--border-strong)", color: "var(--text)" }
                      }
                    >
                      {p.cta} <ArrowRight className="h-4 w-4" />
                    </Link>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>

        <p className="text-center text-[12.5px] mt-7 inline-flex items-center gap-2 justify-center w-full" style={{ color: "var(--text-mute)" }}>
          <ShieldCheck className="h-4 w-4" style={{ color: "var(--good)" }} />
          30-day money-back guarantee · cancel in one click · prices in USD
        </p>
      </section>

      {/* ─────────────── 4. COMPARISON MATRIX ─────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <p className="prm-eyebrow">Side by side</p>
        <h2 className="prm-h text-[30px] sm:text-[38px] mt-3">Everything, compared</h2>

        <div className="card mt-9 overflow-x-auto" style={{ background: "var(--bg-2)" }}>
          <table className="prm-matrix" style={{ minWidth: 660 }}>
            <thead>
              <tr>
                <th>Capability</th>
                <th>Free</th>
                <th style={{ color: "var(--premium)" }}>Pro</th>
                <th style={{ color: "var(--gold)" }}>Unlimited</th>
              </tr>
            </thead>
            <tbody>
              {MATRIX.map((g) => (
                <Fragment key={g.group}>
                  <tr className="prm-grouprow">
                    <th scope="row">{g.group}</th>
                    <td /><td /><td />
                  </tr>
                  {g.rows.map((r) => (
                    <tr key={r.label}>
                      <th scope="row">{r.label}</th>
                      <td><Cell v={r.free} /></td>
                      <td><Cell v={r.pro} /></td>
                      <td><Cell v={r.unl} /></td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* ─────────────── 5. PROVENANCE ─────────────── */}
      <section className="prm-wrap max-w-6xl mx-auto px-2">
        <div className="text-center">
          <p className="prm-eyebrow">Provenance</p>
          <h2 className="prm-h text-[30px] sm:text-[38px] mt-3">Sourced from filings, not opinions</h2>
          <p className="text-[16px] mt-4 mx-auto max-w-2xl" style={{ color: "var(--text-soft)" }}>
            Every figure on the site traces back to a public filing or an official government
            database, and each card names the source it came from. Where a number cannot be sourced,
            we say so instead of estimating it.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mt-10">
          {SOURCES.map((s) => (
            <div
              key={s.name}
              className="prm-panel card p-4"
              style={{ background: "var(--bg-2)", ["--tick" as string]: "var(--border-strong)" }}
            >
              <div className="prm-num text-[13px] font-bold">{s.name}</div>
              <div className="text-[11.5px] mt-1" style={{ color: "var(--text-mute)" }}>{s.detail}</div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-10">
          {[
            { icon: Users, t: "Insider profiles", d: "Every filer gets a page: what they bought, when, and how those buys performed against the S&P." },
            { icon: Building2, t: "Institutional flow", d: "13F filings diffed quarter over quarter, so you see who added, trimmed, opened or closed." },
            { icon: Bell, t: "Alerts that matter", d: "Get told when a CEO buys, a cluster forms, or a score crosses your threshold." },
          ].map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.t} className="card p-5" style={{ background: "var(--bg-2)" }}>
                <Icon className="h-5 w-5" style={{ color: "var(--premium)" }} />
                <div className="text-[15.5px] font-bold mt-3">{f.t}</div>
                <p className="text-[13px] leading-relaxed mt-1.5" style={{ color: "var(--text-mute)" }}>{f.d}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─────────────── 6. FAQ ─────────────── */}
      <section className="max-w-4xl mx-auto px-2 prm-faq">
        <p className="prm-eyebrow">Common questions</p>
        <h2 className="prm-h text-[30px] sm:text-[38px] mt-3">Before you subscribe</h2>

        <div className="flex flex-col gap-2.5 mt-9">
          {FAQS.map((f) => (
            <details key={f.q} className="card px-5 py-4" style={{ background: "var(--bg-2)" }}>
              <summary className="flex items-center justify-between gap-4">
                <span className="text-[15.5px] font-bold">{f.q}</span>
                <span
                  className="prm-chev flex-shrink-0 transition-transform"
                  style={{ color: "var(--premium)", fontSize: 18, lineHeight: 1 }}
                  aria-hidden
                >
                  +
                </span>
              </summary>
              <p className="text-[14px] leading-relaxed mt-3" style={{ color: "var(--text-soft)" }}>{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* ─────────────── 7. FINAL CTA ─────────────── */}
      <section id="final" className="prm-wrap max-w-4xl mx-auto px-2 scroll-mt-8">
        <div
          className="prm-panel card p-8 sm:p-12 text-center"
          style={{
            ["--tick" as string]: "var(--premium)",
            background: "var(--bg-2)",
            borderColor: "color-mix(in srgb, var(--premium) 40%, var(--border))",
            boxShadow: "0 16px 50px color-mix(in srgb, var(--premium) 14%, transparent)",
          }}
        >
          <Sparkles className="h-6 w-6 mx-auto" style={{ color: "var(--premium)" }} />
          <h2 className="prm-h text-[28px] sm:text-[36px] mt-4">Try it for 30 days, risk free</h2>
          <p className="text-[15.5px] mt-4 mx-auto max-w-lg" style={{ color: "var(--text-soft)" }}>
            Full access from the first minute. No card up front, and a 30-day money-back guarantee
            if you decide it is not for you.
          </p>
          <div className="mt-7">
            <TrialCapture source="premium-final" cta="Start your free trial" />
          </div>
          <div className="flex flex-wrap items-center justify-center gap-x-7 gap-y-2 mt-7 text-[12.5px]" style={{ color: "var(--text-mute)" }}>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> No card required</span>
            <span className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> Cancel in one click</span>
            <span className="inline-flex items-center gap-1.5"><Download className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> Export your data anytime</span>
          </div>
        </div>

        <p className="text-center text-[12px] mt-8 mx-auto max-w-2xl leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Informational only — not investment advice. Insider transaction data is sourced from public
          regulatory filings and may be delayed. The Insider Score is a research signal and does not
          predict future performance.
        </p>
      </section>
    </div>
  );
}
