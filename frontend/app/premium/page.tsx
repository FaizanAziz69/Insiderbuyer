"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Check, CheckCircle2 } from "lucide-react";
import { API_BASE } from "@/lib/api";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/* ────────────────────────────────────────────────────────────
   Premium / subscribe page — short by design.
   Hero → plan rack → signup → sources → FAQ.

   PRICES live in PLANS below; edit them in one place.
   The global Footer is rendered by AppShell — no footer here.
   ──────────────────────────────────────────────────────────── */

const PLANS = [
  {
    id: "pro",
    name: "Pro",
    monthly: 29,
    accent: "var(--sig)",
    badge: "Most popular",
    features: [
      "The complete ranking and full screener",
      "Insider & politician profiles with track records",
      "Institutional 13F owners, whale activity, treemaps",
      "Unlimited watchlists · 100 alerts · daily CSV export",
      "No ads",
    ],
  },
  {
    id: "unlimited",
    name: "Unlimited",
    monthly: 59,
    accent: "var(--gold)",
    badge: null as string | null,
    features: [
      "Everything in Pro, every limit removed",
      "Unlimited alerts and watchlist size",
      "Unlimited exports",
      "Priority email support",
    ],
  },
] as const;

/* The five real score components and their weights (scoring-config.ts). */
const COMPOSITION = [
  { w: 50, name: "Insider buying" },
  { w: 25, name: "Sector" },
  { w: 10, name: "Filing tone" },
  { w: 10, name: "Momentum" },
  { w: 5, name: "Dilution" },
];



const FAQS = [
    {
    q: "What separates Pro from Unlimited?",
    a: "Only the limits. Pro includes every dataset and tool on the site with generous caps — 100 alerts, 100 stocks per watchlist, one export a day. Unlimited removes the caps and adds priority support. Nothing is withheld from Pro.",
  },
  {
    q: "What is the Insider Score?",
    a: "A 0–100 composite that begins with open-market insider buying, then weighs sector strength, trading momentum, the tone of the company's own filings, and a dilution penalty. Every component and its weight is visible on the stock page — you can check the arithmetic yourself.",
  },
  {
    q: "Where does the data come from?",
    a: "Public filings and official government databases, listed above. Each card on the site names its own source, and where a figure can't be sourced we leave it empty rather than estimate it.",
  },
  {
    q: "Can I cancel whenever I want?",
    a: "Yes, in one click from your account. You keep access until the end of the period you've already paid for.",
  },
];

const CSS = `
/* Signal colour: the navbar petrol on light grounds (the bright cyan is too
   pale on white), the cyan on dark grounds where it reads correctly. */
.prm-scope { --sig: var(--accent); }
@media (prefers-color-scheme: dark) { .prm-scope { --sig: var(--premium); } }
:root[data-theme="dark"] .prm-scope { --sig: var(--premium); }
:root[data-theme="light"] .prm-scope { --sig: var(--accent); }
.prm-grid {
  position: absolute; inset: 0; pointer-events: none;
  background-image:
    linear-gradient(to right, color-mix(in srgb, var(--accent) 11%, transparent) 1px, transparent 1px),
    linear-gradient(to bottom, color-mix(in srgb, var(--accent) 11%, transparent) 1px, transparent 1px);
  background-size: 52px 52px;
  mask-image: radial-gradient(110% 80% at 30% 0%, #000 20%, transparent 75%);
  -webkit-mask-image: radial-gradient(110% 80% at 30% 0%, #000 20%, transparent 75%);
}
.prm-panel { position: relative; }
.prm-panel::before, .prm-panel::after {
  content: ""; position: absolute; width: 11px; height: 11px;
  pointer-events: none; border-color: var(--tick, var(--border-strong));
}
.prm-panel::before { top: -1px; left: -1px; border-top: 2px solid; border-left: 2px solid; }
.prm-panel::after { bottom: -1px; right: -1px; border-bottom: 2px solid; border-right: 2px solid; }
.prm-eyebrow {
  font-family: var(--font-mono); font-size: 11px; letter-spacing: .12em;
  text-transform: uppercase; color: var(--sig);
}
.prm-h {
  font-family: var(--font-display); font-weight: 800; letter-spacing: -.03em;
  line-height: 1.08; text-wrap: balance; margin: 0;
}
.prm-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }
.prm-faq summary { cursor: pointer; list-style: none; }
.prm-faq summary::-webkit-details-marker { display: none; }
.prm-faq details[open] .prm-chev { transform: rotate(45deg); }
.prm-chev { transition: transform .18s; }
@media (prefers-reduced-motion: reduce) { .prm-chev { transition: none; } }
`;

/* Email capture — POSTs to the existing /subscribers endpoint. */
function SignupForm({ plan, stacked = false, cta }: { plan: string; stacked?: boolean; cta?: string }) {
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
        body: JSON.stringify({ email, source: `premium-${plan}` }),
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
      <div className="inline-flex items-center gap-2 text-[15px] font-semibold text-good">
        <CheckCircle2 className="h-5 w-5" />
        Thanks — check your inbox to finish setting up your account.
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className={stacked ? "w-full" : "w-full max-w-lg mx-auto"}>
      <div className={stacked ? "flex flex-col gap-2.5" : "flex flex-col sm:flex-row gap-2.5"}>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          aria-label="Email address"
          aria-invalid={!!err}
          className="flex-1 px-4 py-3 rounded-lg text-[14px]"
          style={{
            background: "var(--bg-1)",
            border: err ? "1px solid var(--bad)" : "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          disabled={submitting}
          className={`btn-primary whitespace-nowrap ${stacked ? "w-full justify-center" : ""}`}
          style={{ padding: stacked ? "13px 22px" : "12px 22px", fontSize: stacked ? 15 : 14, fontWeight: 700 }}
        >
          {submitting
            ? "Submitting…"
            : cta || (plan === "free" ? "Create free account" : `Continue with ${plan === "pro" ? "Pro" : "Unlimited"}`)}
        </button>
      </div>
      {err && <p className="text-[12px] mt-1.5" style={{ color: "var(--bad)" }}>{err}</p>}
    </form>
  );
}

/* Paid-plan button. No email field — checkout collects everything.
   TO WIRE STRIPE: replace the body of startCheckout() with a POST to your
   /checkout endpoint and `window.location.href = session.url`. */
function PlanCta({ planId, planName, accent }: { planId: string; planName: string; accent: string }) {
  const [note, setNote] = useState(false);

  function startCheckout() {
    // Stripe Checkout goes here — until then, tell the visitor the truth.
    setNote(true);
  }

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        className="w-full inline-flex items-center justify-center rounded-lg py-3.5 text-[15px] font-bold transition"
        style={{
          background: accent,
          color: "var(--on-accent, #fff)",
          border: `1px solid ${accent}`,
        }}
      >
        Subscribe to {planName}
      </button>
      {note && (
        <p className="text-[12px] mt-2.5 text-center leading-relaxed" style={{ color: "var(--text-soft)" }}>
          Card payments open shortly. Create a free account above and we&rsquo;ll email you the
          moment {planName} goes live.
        </p>
      )}
      <p className="text-[11.5px] mt-3 text-center" style={{ color: "var(--text-mute)" }}>
        Cancel anytime · billed monthly
      </p>
    </div>
  );
}

export default function PremiumPage() {

  return (
    <div className="w-full pb-10 prm-scope">
      <style>{CSS}</style>

      {/* ─── Hero ─── */}
      <section className="relative pt-8 sm:pt-12 pb-12">
        <div className="prm-grid" aria-hidden />
        <div className="relative max-w-3xl">
          <p className="prm-eyebrow">InsiderBuying Premium</p>
          <h1 className="prm-h text-[34px] sm:text-[46px] mt-3.5">
            Follow the people who know
            <br />
            <span style={{ color: "var(--sig)" }}>the business best.</span>
          </h1>
          <p className="text-[16.5px] leading-relaxed mt-5" style={{ color: "var(--text-soft)" }}>
            Every SEC Form 4 is read the moment it lands, scored against sector strength, trading
            momentum, filing tone and dilution, then ranked across the market — so conviction buying
            is impossible to miss.
          </p>

          {/* score composition — the whole engine in one bar */}
          <div className="mt-8">
            <div className="flex h-2.5 rounded-full overflow-hidden gap-[2px]">
              {COMPOSITION.map((c, i) => (
                <div
                  key={c.name}
                  style={{ width: `${c.w}%`, background: "var(--sig)", opacity: 1 - i * 0.16 }}
                />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3">
              {COMPOSITION.map((c) => (
                <span key={c.name} className="text-[11.5px]" style={{ color: "var(--text-mute)" }}>
                  <span className="prm-num font-bold" style={{ color: "var(--text-soft)" }}>{c.w}%</span> {c.name}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── Free to get started ─── */}
      <section
        className="rounded-xl px-6 sm:px-10 py-9 sm:py-12"
        style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
      >
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_340px] gap-8 lg:gap-14 items-center">
          <div>
            <h2 className="prm-h text-[30px] sm:text-[40px]">Free to get started</h2>
            <p className="text-[16px] leading-relaxed mt-4 max-w-md" style={{ color: "var(--text-soft)" }}>
              Create an account and keep the essentials for as long as you like — the top of the
              Insider Score ranking, every stock profile, the congress feed and the daily briefings.
            </p>
          </div>

          <div
            className="prm-panel card p-6"
            style={{ ["--tick" as string]: "var(--sig)", background: "var(--bg-2)" }}
          >
            <div className="flex items-baseline justify-center gap-2">
              <span className="prm-num text-[50px] font-bold leading-none" style={{ letterSpacing: "-.035em" }}>$0</span>
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-mute)" }}>forever</span>
            </div>
            <div className="mt-5">
              <SignupForm plan="free" stacked cta="Sign up" />
            </div>
            <p className="text-[11.5px] mt-3 text-center" style={{ color: "var(--text-mute)" }}>
              No payment details required.
            </p>
          </div>
        </div>
      </section>

      {/* ─── Paid plans — each card subscribes on its own ─── */}
      <section id="plans" className="mt-16 scroll-mt-6">
        <h2 className="prm-h text-[26px] sm:text-[32px]">Go further with Premium</h2>
        <p className="text-[15px] mt-3 max-w-xl" style={{ color: "var(--text-soft)" }}>
          Both plans include every dataset and tool on the site. The only difference is how much of
          it you can hold at once.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-8 items-stretch">
          {PLANS.map((p, i) => {
            const featured = p.id === "pro";
            return (
              <motion.div
                key={p.id}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.38, delay: i * 0.06 }}
                className="prm-panel card p-7 sm:p-8 h-full flex flex-col"
                style={{
                  ["--tick" as string]: p.accent,
                  background: "var(--bg-2)",
                  borderColor: featured
                    ? `color-mix(in srgb, ${p.accent} 50%, var(--border))`
                    : "var(--border)",
                  boxShadow: featured
                    ? `0 14px 42px color-mix(in srgb, ${p.accent} 15%, transparent)`
                    : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-[22px] font-bold tracking-tight">{p.name}</span>
                  {p.badge && (
                    <span
                      className="prm-num text-[10px] font-bold uppercase px-2.5 py-1 rounded"
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

                <div className="flex items-baseline gap-2 mt-5">
                  <span
                    className="prm-num text-[46px] font-bold leading-none"
                    style={{ letterSpacing: "-.035em" }}
                  >
                    ${p.monthly}
                  </span>
                  <span className="text-[14.5px] font-semibold" style={{ color: "var(--text-mute)" }}>
                    / month
                  </span>
                </div>

                <div className="h-px my-6" style={{ background: "var(--border)" }} />

                <ul className="flex flex-col gap-3 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2.5 text-[14px]">
                      <Check
                        className="h-4 w-4 flex-shrink-0 mt-[3px]"
                        strokeWidth={3}
                        style={{ color: p.accent }}
                      />
                      <span style={{ color: "var(--text-soft)" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                {/* this card's own subscribe control */}
                <div className="mt-7">
                  <PlanCta planId={p.id} planName={p.name} accent={p.accent} />
                </div>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="mt-16 prm-faq max-w-3xl">
        <h2 className="prm-h text-[26px] sm:text-[30px]">Common questions</h2>
        <div className="flex flex-col gap-2 mt-6">
          {FAQS.map((f) => (
            <details key={f.q} className="card px-5 py-3.5" style={{ background: "var(--bg-2)" }}>
              <summary className="flex items-center justify-between gap-4">
                <span className="text-[14.5px] font-bold">{f.q}</span>
                <span className="prm-chev flex-shrink-0" style={{ color: "var(--sig)", fontSize: 17, lineHeight: 1 }} aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-[13.5px] leading-relaxed mt-2.5" style={{ color: "var(--text-soft)" }}>
                {f.a}
              </p>
            </details>
          ))}
        </div>

        <p className="text-[11.5px] mt-8 leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Informational only — not investment advice. Insider transaction data comes from public
          regulatory filings and may be delayed. The Insider Score is a research signal and does not
          predict future performance.{" "}
          <Link href="/stocks" className="text-accent">Browse the live ranking</Link>.
        </p>
      </section>
    </div>
  );
}
