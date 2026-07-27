"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ArrowRight, Check, CheckCircle2 } from "lucide-react";
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
    id: "free",
    name: "Free",
    monthly: 0,
    annual: 0,
    accent: "var(--text-mute)",
    badge: null as string | null,
    features: [
      "Top 25 of the Insider Score ranking",
      "Every stock profile — all nine tabs",
      "Congress trades & daily AI briefings",
      "One watchlist, 10 stocks",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    monthly: 29,
    annual: 279,
    accent: "var(--premium)",
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
    annual: 569,
    accent: "var(--gold)",
    badge: null,
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

const SOURCES = [
  "SEC Form 4",
  "SEC 13F",
  "10-Q / 10-K",
  "DEF 14A",
  "Congress.gov",
  "FEC",
  "Senate LDA",
  "USAspending",
  "BaFin",
];

const FAQS = [
  {
    q: "Is there an annual option?",
    a: "Yes — pick annual at checkout. Pro is $279 a year and Unlimited is $569 a year, which is two months free versus paying monthly.",
  },
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
  text-transform: uppercase; color: var(--premium);
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
function SignupForm({ plan }: { plan: string }) {
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
    <form onSubmit={submit} noValidate className="w-full max-w-lg mx-auto">
      <div className="flex flex-col sm:flex-row gap-2.5">
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
          className="btn-primary whitespace-nowrap"
          style={{ padding: "12px 22px", fontSize: 14, fontWeight: 700 }}
        >
          {submitting ? "Submitting…" : plan === "free" ? "Create free account" : `Continue with ${plan === "pro" ? "Pro" : "Unlimited"}`}
        </button>
      </div>
      {err && <p className="text-[12px] mt-1.5" style={{ color: "var(--bad)" }}>{err}</p>}
    </form>
  );
}

export default function PremiumPage() {
  const [annual, setAnnual] = useState(true);
  const [selected, setSelected] = useState<string>("pro");

  return (
    <div className="w-full pb-10">
      <style>{CSS}</style>

      {/* ─── Hero ─── */}
      <section className="relative pt-8 sm:pt-12 pb-14">
        <div className="prm-grid" aria-hidden />
        <div className="relative max-w-3xl">
          <p className="prm-eyebrow">InsiderBuying Premium</p>
          <h1 className="prm-h text-[34px] sm:text-[46px] mt-3.5">
            Follow the people who know
            <br />
            <span style={{ color: "var(--premium)" }}>the business best.</span>
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
                  style={{
                    width: `${c.w}%`,
                    background: "var(--premium)",
                    opacity: 1 - i * 0.16,
                  }}
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

      {/* ─── Plans ─── */}
      <section id="plans" className="scroll-mt-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="prm-h text-[26px] sm:text-[32px]">Plans</h2>
          <div
            className="inline-flex items-center gap-1 rounded-full p-1"
            style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
            role="group"
            aria-label="Billing period"
          >
            {([["Monthly", false], ["Annual · 2 months free", true]] as const).map(([label, val]) => (
              <button
                key={label}
                onClick={() => setAnnual(val)}
                aria-pressed={annual === val}
                className="px-3.5 py-1.5 rounded-full text-[12.5px] font-bold transition"
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

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-7 items-stretch">
          {PLANS.map((p, i) => {
            const paid = p.monthly > 0;
            const perMonth = annual && paid ? Math.round((p.annual / 12) * 100) / 100 : p.monthly;
            const isSel = selected === p.id;
            return (
              <motion.button
                key={p.id}
                type="button"
                onClick={() => setSelected(p.id)}
                aria-pressed={isSel}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.35, delay: i * 0.05 }}
                className="prm-panel card p-5 text-left h-full flex flex-col transition"
                style={{
                  ["--tick" as string]: isSel ? p.accent : "var(--border-strong)",
                  background: "var(--bg-2)",
                  borderColor: isSel
                    ? `color-mix(in srgb, ${p.accent} 55%, var(--border))`
                    : "var(--border)",
                  boxShadow: isSel ? `0 10px 34px color-mix(in srgb, ${p.accent} 14%, transparent)` : undefined,
                }}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[17px] font-bold tracking-tight">{p.name}</span>
                  {p.badge && (
                    <span
                      className="prm-num text-[9.5px] font-bold uppercase px-2 py-0.5 rounded"
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

                <div className="flex items-baseline gap-1.5 mt-3.5">
                  <span className="prm-num text-[34px] font-bold leading-none" style={{ letterSpacing: "-.03em" }}>
                    ${paid ? perMonth : 0}
                  </span>
                  <span className="text-[12.5px] font-semibold" style={{ color: "var(--text-mute)" }}>
                    {paid ? "/ mo" : "forever"}
                  </span>
                </div>
                <p className="prm-num text-[11px] mt-1.5" style={{ color: "var(--text-mute)" }}>
                  {paid ? (annual ? `$${p.annual} billed yearly` : `or $${p.annual}/yr`) : "No card needed"}
                </p>

                <div className="h-px my-4" style={{ background: "var(--border)" }} />

                <ul className="flex flex-col gap-2 flex-1">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px]">
                      <Check className="h-3.5 w-3.5 flex-shrink-0 mt-[3px]" strokeWidth={3} style={{ color: p.accent }} />
                      <span style={{ color: "var(--text-soft)" }}>{f}</span>
                    </li>
                  ))}
                </ul>

                <span
                  className="inline-flex items-center gap-1.5 text-[12.5px] font-bold mt-4"
                  style={{ color: isSel ? p.accent : "var(--text-mute)" }}
                >
                  {isSel ? (
                    <>
                      <CheckCircle2 className="h-3.5 w-3.5" /> Selected
                    </>
                  ) : (
                    <>
                      Select {p.name} <ArrowRight className="h-3.5 w-3.5" />
                    </>
                  )}
                </span>
              </motion.button>
            );
          })}
        </div>

        {/* signup for the selected plan */}
        <div className="card p-6 sm:p-7 mt-4 text-center" style={{ background: "var(--bg-2)" }}>
          <p className="text-[14px] mb-4" style={{ color: "var(--text-soft)" }}>
            {selected === "free" ? (
              <>Create a free account — no card, no expiry.</>
            ) : (
              <>
                Continue with{" "}
                <strong style={{ color: "var(--text)" }}>
                  {selected === "pro" ? "Pro" : "Unlimited"}
                </strong>{" "}
                at{" "}
                <span className="prm-num font-bold" style={{ color: "var(--text)" }}>
                  ${annual
                    ? Math.round((PLANS.find((p) => p.id === selected)!.annual / 12) * 100) / 100
                    : PLANS.find((p) => p.id === selected)!.monthly}
                  /mo
                </span>
                {annual ? " billed yearly." : "."}
              </>
            )}
          </p>
          <SignupForm plan={selected} />
          <p className="text-[11.5px] mt-3.5" style={{ color: "var(--text-mute)" }}>
            Cancel anytime · prices in USD
          </p>
        </div>
      </section>

      {/* ─── Sources ─── */}
      <section className="mt-14">
        <div className="card p-5 sm:p-6" style={{ background: "var(--bg-2)" }}>
          <div className="flex flex-col sm:flex-row sm:items-center gap-4 sm:gap-8">
            <p className="text-[13.5px] leading-relaxed sm:max-w-xs flex-shrink-0" style={{ color: "var(--text-soft)" }}>
              <span className="font-bold" style={{ color: "var(--text)" }}>Sourced from filings, not opinions.</span>{" "}
              Every figure traces back to a public disclosure.
            </p>
            <div className="flex flex-wrap gap-2">
              {SOURCES.map((s) => (
                <span
                  key={s}
                  className="prm-num text-[11.5px] px-2.5 py-1 rounded"
                  style={{ background: "var(--bg-3)", color: "var(--text-mute)", border: "1px solid var(--border)" }}
                >
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="mt-14 prm-faq max-w-3xl">
        <h2 className="prm-h text-[26px] sm:text-[30px]">Common questions</h2>
        <div className="flex flex-col gap-2 mt-6">
          {FAQS.map((f) => (
            <details key={f.q} className="card px-5 py-3.5" style={{ background: "var(--bg-2)" }}>
              <summary className="flex items-center justify-between gap-4">
                <span className="text-[14.5px] font-bold">{f.q}</span>
                <span className="prm-chev flex-shrink-0" style={{ color: "var(--premium)", fontSize: 17, lineHeight: 1 }} aria-hidden>
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
