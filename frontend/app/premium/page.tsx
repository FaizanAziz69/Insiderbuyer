"use client";
import { useEffect, useState } from "react";
import {
  Bell, Building2, Check, ChevronDown, Gauge, Landmark,
  ShieldCheck, SlidersHorizontal, Users,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { Logo } from "@/components/Logo";
import { getAuthToken, useAuth } from "@/lib/auth";
import { usePremium } from "@/components/premium/PremiumContext";
import { LoginModal } from "@/components/LoginModal";

/* ────────────────────────────────────────────────────────────
   Subscribe / Insider Premium — clean white pricing page in the
   TipRanks-upgrade + Autopilot-landing mould (client instruction).
   PRICING is the single source of truth for every figure.
   ──────────────────────────────────────────────────────────── */

const PRICING = {
  monthly: 39.99,
  annual: 199,
  annualWas: 479.88, // 12 × monthly
};
const SAVED = +(PRICING.annualWas - PRICING.annual).toFixed(2);
const SAVED_PCT = Math.round((SAVED / PRICING.annualWas) * 100);
const ANNUAL_PER_MONTH = +(PRICING.annual / 12).toFixed(2);

const FREE_INCLUDES = [
  "Live insider filings as they hit EDGAR",
  "Company profiles, charts and fundamentals",
  "Congress trading and politician profiles",
];

const INCLUDED = [
  "Complete Insider Score ranking (0–99), re-ranked daily",
  "Full screener and every stock list",
  "Insider profiles with track records",
  "Politician trades, donors and legislation",
  "Institutional 13F ownership and treemaps",
  "Nine-tab stock profiles",
  "Lobbying and federal contract data",
  "Unlimited watchlists and alerts",
  "Daily CSV exports",
  "All five sector playbooks",
];

const BENEFITS = [
  { icon: Gauge, title: "Insider Score", desc: "Every company scored from its filings, re-ranked daily." },
  { icon: Users, title: "Track Records", desc: "How each insider's past buys actually performed." },
  { icon: Landmark, title: "Political Money", desc: "Congress trades, donors, lobbying and contracts." },
  { icon: Building2, title: "13F Ownership", desc: "Who added, trimmed, opened or closed each quarter." },
  { icon: SlidersHorizontal, title: "Screener", desc: "Filter by score, sector, cap and cluster buying." },
  { icon: Bell, title: "Alerts", desc: "Told the moment a CEO buys or a cluster forms." },
];

const PLAYBOOKS = [
  { sector: "AI", from: "#4338ca", to: "#7c3aed" },
  { sector: "Mining", from: "#92400e", to: "#d97706" },
  { sector: "Defense", from: "#0f2942", to: "#1d4ed8" },
  { sector: "Biotech", from: "#065f46", to: "#10b981" },
  { sector: "Energy", from: "#9a3412", to: "#f97316" },
];

const FAQS = [
  { q: "What do I get with Insider Premium?", a: "Every dataset and tool on the site with no caps, plus all five sector playbooks." },
  { q: `Is the annual price really ${SAVED_PCT}% off?`, a: `Yes. Monthly is $${PRICING.monthly} — $${PRICING.annualWas} over a year. The annual plan is $${PRICING.annual}, so you save $${SAVED}. It is a limited-time launch price.` },
  { q: "Where does the data come from?", a: "Public filings only — SEC EDGAR, Congress.gov, the FEC, the Senate lobbying database, USAspending and BaFin. Every card names its source." },
  { q: "Can I cancel any time?", a: "Yes, in one click from your account. You keep access until the end of the period you have paid for." },
];

const CSS = `
.sub-scope { background: var(--bg-1); }
.sub-card { background: var(--bg-1); border: 1px solid var(--border); border-radius: 18px; }
.sub-card-hi { border: 2px solid var(--accent); box-shadow: 0 20px 50px color-mix(in srgb, var(--accent) 16%, transparent); }
.sub-cta { background: var(--good); color: #fff; border: 1px solid color-mix(in srgb, var(--good) 70%, #0a3a26); transition: filter .15s; }
.sub-cta:hover { filter: brightness(1.07); }
.sub-ghost { background: transparent; color: var(--text); border: 1px solid var(--border-strong); transition: background .15s; }
.sub-ghost:hover { background: var(--bg-2); }
.sub-book { aspect-ratio: 3/4; border-radius: 12px; display: flex; flex-direction: column; align-items: center; justify-content: space-between; padding: 18px 12px; box-shadow: 0 12px 30px rgba(0,0,0,.18); }
`;

/* ── Stripe checkout button (unchanged flow) ─────────────────── */
function BuyButton({ plan, label }: { plan: string; label: string }) {
  const { user } = useAuth();
  const { premium } = usePremium();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [loginOpen, setLoginOpen] = useState(false);

  const startCheckout = async () => {
    if (busy) return;
    if (!user) { setLoginOpen(true); return; }
    setBusy(true); setErr(null);
    try {
      const res = await fetch(`${API_BASE}/billing/checkout`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
        body: JSON.stringify({ plan }),
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
      setBusy(false);
      setErr(e instanceof Error ? e.message : "Something went wrong — try again.");
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={startCheckout}
        disabled={busy}
        className="sub-cta w-full inline-flex items-center justify-center rounded-xl py-3.5 text-[15.5px] font-bold disabled:opacity-60"
      >
        {busy ? "Opening secure checkout…" : premium ? "Manage subscription" : label}
      </button>
      {!user && (
        <p className="text-[12px] mt-2.5 text-center leading-relaxed text-mute">
          You&rsquo;ll sign in first so the subscription ties to your account. No credit card to browse the free tier.
        </p>
      )}
      {err && <p className="text-[12px] mt-2.5 text-center text-[color:var(--bad)]">{err}</p>}
      <LoginModal open={loginOpen} onClose={() => setLoginOpen(false)} />
    </div>
  );
}

/* ── Post-checkout ?checkout=success handling (unchanged) ─────── */
function CheckoutOutcome() {
  const { refreshPremium } = usePremium();
  const [state, setState] = useState<"none" | "syncing" | "success" | "cancelled" | "error">("none");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const outcome = params.get("checkout");
    if (!outcome) return;
    if (outcome === "cancelled") { setState("cancelled"); return; }
    if (outcome !== "success") return;
    const sessionId = params.get("session_id");
    setState("syncing");
    (async () => {
      try {
        const res = await fetch(`${API_BASE}/billing/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${getAuthToken() ?? ""}` },
          body: JSON.stringify({ sessionId }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.message || "sync failed");
        await refreshPremium();
        setState(data?.premium ? "success" : "syncing");
        if (!data?.premium) setTimeout(async () => { await refreshPremium(); setState("success"); }, 4000);
      } catch { setState("error"); }
    })();
  }, [refreshPremium]);
  if (state === "none") return null;
  const styles: Record<string, { bg: string; border: string; color: string }> = {
    success: { bg: "var(--good-soft)", border: "var(--good)", color: "var(--good-strong)" },
    syncing: { bg: "var(--accent-soft)", border: "var(--accent)", color: "var(--accent)" },
    cancelled: { bg: "var(--bg-3)", border: "var(--border-strong)", color: "var(--text-soft)" },
    error: { bg: "var(--bad-soft)", border: "var(--bad)", color: "var(--bad)" },
  };
  const s = styles[state];
  return (
    <div className="max-w-3xl mx-auto mt-8 rounded-xl px-5 py-4 text-center text-[14.5px] font-semibold"
      style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color }} role="status">
      {state === "syncing" && "Finalizing your subscription…"}
      {state === "success" && "You're in! Insider Premium is active — every paywall is now unlocked."}
      {state === "cancelled" && "Checkout was cancelled — no charge was made."}
      {state === "error" && "We couldn't confirm the payment automatically. If you were charged, refresh in a minute or contact support."}
    </div>
  );
}

function BookCover({ sector, from, to }: { sector: string; from: string; to: string }) {
  return (
    <div className="sub-book" style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}>
      <Logo size="sm" tone="light" className="opacity-95" />
      <div className="text-center">
        <div className="font-extrabold text-white leading-none" style={{ fontSize: 26, letterSpacing: "-.02em" }}>{sector}</div>
        <div className="text-white/85 mt-1.5" style={{ fontSize: 10, letterSpacing: ".22em" }}>INSIDER</div>
      </div>
      <div className="text-white/70" style={{ fontSize: 8.5, letterSpacing: ".16em" }}>2026 PLAYBOOK</div>
    </div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="sub-card overflow-hidden">
      <button type="button" onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 px-5 py-4 text-left">
        <span className="text-[14.5px] font-bold">{q}</span>
        <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform" style={{ transform: open ? "rotate(180deg)" : "none", color: "var(--text-mute)" }} />
      </button>
      {open && <div className="px-5 pb-4 text-[13.5px] leading-relaxed text-soft">{a}</div>}
    </div>
  );
}

export default function PremiumPage() {
  const [annual, setAnnual] = useState(true);
  const price = annual ? PRICING.annual : PRICING.monthly;
  const per = annual ? ANNUAL_PER_MONTH : PRICING.monthly;

  return (
    <div className="sub-scope w-full">
      <style>{CSS}</style>

      {/* ── Hero (Autopilot-clean, centered, airy) ─────────────── */}
      <section className="max-w-3xl mx-auto text-center px-4 pt-10 sm:pt-16 pb-8">
        <span className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.16em] px-3 py-1 rounded-full"
          style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
          <ShieldCheck className="h-3.5 w-3.5" /> Insider Premium
        </span>
        <h1 className="text-[34px] sm:text-[52px] font-bold tracking-tight leading-[1.05] mt-5"
          style={{ letterSpacing: "-1px" }}>
          Trade with the insiders&rsquo; edge
        </h1>
        <p className="text-[16px] sm:text-[18px] text-soft leading-relaxed mt-4 max-w-xl mx-auto">
          See exactly what corporate insiders and politicians are buying — scored,
          ranked and delivered the moment it&rsquo;s filed. One subscription unlocks
          every dataset and tool on the site.
        </p>
        <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
          <a href="#pricing" className="sub-cta inline-flex items-center justify-center rounded-xl px-8 py-3.5 text-[15.5px] font-bold">
            Get Insider Premium
          </a>
          <span className="text-[13px] text-mute">Cancel anytime · No credit card to browse</span>
        </div>
        <p className="text-[12px] text-faint mt-5">
          Built on public filings — SEC EDGAR · Congress.gov · FEC · lobbying · USAspending
        </p>
      </section>

      <div className="px-4">
        <CheckoutOutcome />
      </div>

      {/* ── Pricing (TipRanks-style: toggle + Free vs Premium) ─── */}
      <section id="pricing" className="max-w-4xl mx-auto px-4 py-10 scroll-mt-8">
        <div className="text-center mb-7">
          <h2 className="text-[26px] sm:text-[32px] font-bold tracking-tight">Simple, honest pricing</h2>
          {/* Monthly / Annual toggle */}
          <div className="inline-flex items-center gap-1 mt-5 p-1 rounded-full" style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}>
            {[
              { key: false, label: "Monthly" },
              { key: true, label: "Annual" },
            ].map((o) => {
              const on = annual === o.key;
              return (
                <button key={o.label} type="button" onClick={() => setAnnual(o.key)}
                  className="inline-flex items-center gap-2 px-5 py-2 rounded-full text-[13.5px] font-bold transition"
                  style={{ background: on ? "var(--accent)" : "transparent", color: on ? "var(--on-accent)" : "var(--text-mute)" }}>
                  {o.label}
                  {o.key && (
                    <span className="text-[10.5px] font-extrabold px-1.5 py-0.5 rounded"
                      style={{ background: on ? "rgba(255,255,255,0.2)" : "var(--good-soft)", color: on ? "#fff" : "var(--good-strong)" }}>
                      SAVE {SAVED_PCT}%
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
          {/* Free */}
          <div className="sub-card p-6 sm:p-7">
            <div className="text-[13px] font-bold uppercase tracking-wider text-mute">Free</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[40px] font-extrabold tabular leading-none">$0</span>
              <span className="text-[14px] text-mute">/ forever</span>
            </div>
            <p className="text-[13px] text-soft mt-2">Browse the raw feed — no account needed.</p>
            <a href="/" className="sub-ghost mt-5 w-full inline-flex items-center justify-center rounded-xl py-3.5 text-[15px] font-bold">
              Keep browsing free
            </a>
            <ul className="mt-6 space-y-3">
              {FREE_INCLUDES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "var(--text-mute)" }} />
                  <span className="text-soft">{f}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Premium (highlighted) */}
          <div className="sub-card sub-card-hi p-6 sm:p-7 relative">
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10.5px] font-extrabold uppercase tracking-wider px-3 py-1 rounded-full"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}>
              Most Popular
            </span>
            <div className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--accent)" }}>Insider Premium</div>
            <div className="mt-2 flex items-baseline gap-1.5">
              <span className="text-[40px] font-extrabold tabular leading-none">${per}</span>
              <span className="text-[14px] text-mute">/ month</span>
            </div>
            <p className="text-[13px] text-soft mt-2">
              {annual ? (
                <>Billed ${PRICING.annual}/year — <span className="font-bold" style={{ color: "var(--good-strong)" }}>save ${SAVED} ({SAVED_PCT}% off)</span></>
              ) : (
                <>Billed ${PRICING.monthly} monthly · switch to annual to save {SAVED_PCT}%</>
              )}
            </p>
            <div className="mt-5">
              <BuyButton plan={annual ? "annual" : "monthly"} label="Get Insider Premium" />
            </div>
            <ul className="mt-6 space-y-3">
              {INCLUDED.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[13.5px]">
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "var(--good)" }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── Benefits grid (clean cards) ────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight text-center mb-8">Everything in one subscription</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="sub-card p-5">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl mb-3"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}>
                  <Icon className="h-5 w-5" />
                </span>
                <div className="text-[15px] font-bold">{b.title}</div>
                <div className="text-[13px] text-soft leading-relaxed mt-1">{b.desc}</div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Sector playbooks ───────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 py-10">
        <div className="text-center mb-7">
          <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight">Five sector playbooks included</h2>
          <p className="text-[14px] text-soft mt-2">The top stocks insiders are buying in each sector — refreshed for 2026.</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 max-w-3xl mx-auto">
          {PLAYBOOKS.map((p) => (
            <BookCover key={p.sector} sector={p.sector} from={p.from} to={p.to} />
          ))}
        </div>
      </section>

      {/* ── FAQ ────────────────────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-4 py-10">
        <h2 className="text-[24px] sm:text-[30px] font-bold tracking-tight text-center mb-6">Questions</h2>
        <div className="space-y-3">
          {FAQS.map((f) => <FaqItem key={f.q} q={f.q} a={f.a} />)}
        </div>
      </section>

      {/* ── Final CTA + trust ──────────────────────────────────── */}
      <section className="max-w-2xl mx-auto px-4 pb-16 text-center">
        <div className="sub-card p-8">
          <h2 className="text-[24px] sm:text-[28px] font-bold tracking-tight">Start following the smart money</h2>
          <p className="text-[14px] text-soft mt-2 mb-6">
            {annual ? `$${ANNUAL_PER_MONTH}/mo billed annually` : `$${PRICING.monthly}/mo`} · cancel anytime · public-filing data only.
          </p>
          <div className="max-w-sm mx-auto">
            <BuyButton plan={annual ? "annual" : "monthly"} label="Get Insider Premium" />
          </div>
        </div>
      </section>
    </div>
  );
}
