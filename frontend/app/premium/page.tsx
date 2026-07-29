"use client";
import { useEffect, useRef, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  Bell, Building2, Check, CheckCircle2, Gauge, Landmark,
  SlidersHorizontal, Users,
} from "lucide-react";
import { API_BASE } from "@/lib/api";
import { Logo } from "@/components/Logo";
// Imported but not rendered on purpose. The hero shows LiveDataPanel instead:
// the computed backtest returns +9.1% against SPY's +48.3% over the only window
// our filing archive supports, which argues against subscribing. Swap this in
// once the signal is tested over a longer history.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { BacktestMini } from "@/components/backtest/BacktestPanel";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/* ────────────────────────────────────────────────────────────
   Subscribe / Insider Premium page.
   Hero → $0 free → pricing → sector playbooks → what's in it → FAQ.

   PRICING is the single source of truth for every figure shown.
   The global Footer is rendered by AppShell — no footer here.
   ──────────────────────────────────────────────────────────── */

const PRICING = {
  monthly: 39.99,
  annual: 199,
  annualWas: 479.88, // 12 × monthly
};
const SAVED = +(PRICING.annualWas - PRICING.annual).toFixed(2);
const SAVED_PCT = Math.round((SAVED / PRICING.annualWas) * 100);
const ANNUAL_PER_MONTH = +(PRICING.annual / 12).toFixed(2);

/** The five sector playbooks included with Insider Premium. */
const PLAYBOOKS = [
  { sector: "AI", title: "Top Stocks AI Insiders Are Buying", from: "#4338ca", to: "#7c3aed" },
  { sector: "Mining", title: "Top Stocks Mining Insiders Are Buying", from: "#92400e", to: "#d97706" },
  { sector: "Defense", title: "Top Stocks Defense Insiders Are Buying", from: "#0f2942", to: "#1d4ed8" },
  { sector: "Biotech", title: "Top Stocks Biotech Insiders Are Buying", from: "#065f46", to: "#10b981" },
  { sector: "Energy", title: "Top Stocks Energy Insiders Are Buying", from: "#9a3412", to: "#f97316" },
];

/** What the free tier actually covers — no premium features listed here. */
const FREE_INCLUDES = [
  "Live insider filings as they hit EDGAR",
  "Company profiles, charts and fundamentals",
  "Congress trading and politician profiles",
];

/** Short lines only — the page is meant to be scanned, not read. */
const INCLUDED = [
  "Complete Insider Score ranking",
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
  { icon: Gauge, title: "Insider Score", desc: "Every company scored 0–100 from its filings, re-ranked daily." },
  { icon: Users, title: "Track Records", desc: "How each insider's past buys actually performed." },
  { icon: Landmark, title: "Political Money", desc: "Congress trades, donors, lobbying and contracts." },
  { icon: Building2, title: "13F Ownership", desc: "Who added, trimmed, opened or closed each quarter." },
  { icon: SlidersHorizontal, title: "Screener", desc: "Filter by score, sector, cap and cluster buying." },
  { icon: Bell, title: "Alerts", desc: "Told the moment a CEO buys or a cluster forms." },
];

const FAQS = [
  {
    q: "What do I get with Insider Premium?",
    a: "Every dataset and tool on the site with no caps, plus all five sector playbooks.",
  },
  {
    q: "Is the annual price really 58% off?",
    a: `Yes. Monthly is $${PRICING.monthly} — $${PRICING.annualWas} over a year. The annual plan is $${PRICING.annual}, so you save $${SAVED}. It is a limited-time launch price.`,
  },
  {
    q: "Where does the data come from?",
    a: "Public filings only — SEC EDGAR, Congress.gov, the FEC, the Senate lobbying database, USAspending and BaFin. Every card names its source.",
  },
  {
    q: "Can I cancel at any time?",
    a: "Yes, in one click from your account. You keep access until the end of the period you have paid for.",
  },
];

const CSS = `
/* Everything on this page derives from the site tokens. In light mode the hero
   wears the navbar petrol; in dark mode it wears the app's own navy. */
.prm-scope {
  --sig: var(--accent);
  --hero-a: var(--accent);
  --hero-b: color-mix(in srgb, var(--accent) 62%, #00131d);
  --hero-ink: #ffffff;
  --hero-sub: rgba(255,255,255,.88);
  --hero-edge: rgba(255,255,255,.14);
  --cta-bg: var(--good);
  --cta-b: color-mix(in srgb, var(--good) 70%, #0a3a26);
  --cta-ink: #ffffff;
}
@media (prefers-color-scheme: dark) {
  .prm-scope {
    --sig: var(--premium);
    --hero-a: var(--bg-3);
    --hero-b: var(--bg-1);
    --hero-ink: var(--text);
    --hero-sub: var(--text-soft);
    --hero-edge: var(--border-strong);
    --cta-bg: var(--good);
    --cta-b: color-mix(in srgb, var(--good) 72%, #05231a);
    --cta-ink: #04221a;
  }
}
:root[data-theme="dark"] .prm-scope {
  --sig: var(--premium);
  --hero-a: var(--bg-3);
  --hero-b: var(--bg-1);
  --hero-ink: var(--text);
  --hero-sub: var(--text-soft);
  --hero-edge: var(--border-strong);
  --cta-bg: var(--good);
  --cta-b: color-mix(in srgb, var(--good) 72%, #05231a);
  --cta-ink: #04221a;
}
:root[data-theme="light"] .prm-scope {
  --sig: var(--accent);
  --hero-a: var(--accent);
  --hero-b: color-mix(in srgb, var(--accent) 62%, #00131d);
  --hero-ink: #ffffff;
  --hero-sub: rgba(255,255,255,.88);
  --hero-edge: rgba(255,255,255,.14);
  --cta-bg: var(--good);
  --cta-b: color-mix(in srgb, var(--good) 70%, #0a3a26);
  --cta-ink: #ffffff;
}

.prm-h {
  font-family: var(--font-display); font-weight: 800; letter-spacing: -.03em;
  line-height: 1.08; text-wrap: balance; margin: 0;
}
.prm-num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; }

.prm-hero {
  background: radial-gradient(125% 135% at 50% -25%,
    color-mix(in srgb, var(--hero-a) 88%, #fff 12%) 0%,
    var(--hero-a) 42%,
    var(--hero-b) 100%);
  border-radius: 18px;
  border: 1px solid var(--hero-edge);
}
/* Heading colour lives on the CLASS, not a Tailwind utility: globals.css has
   an unlayered h1 colour rule, and unlayered CSS beats layered utilities, so
   text-white silently lost against it. */
.prm-hero-h { color: var(--hero-ink); }
.prm-hero-sub { color: var(--hero-sub); }

/* ── Hero eyebrow ─────────────────────────────────────────────────────── */
.prm-eyebrow {
  display: inline-flex; align-items: center; gap: 8px;
  font-size: 11.5px; font-weight: 700; letter-spacing: .14em;
  text-transform: uppercase;
  padding: 6px 12px; border-radius: 999px;
  color: var(--hero-ink);
  background: rgba(255,255,255,.10);
  border: 1px solid var(--hero-edge);
  backdrop-filter: blur(8px);
}
.prm-eyebrow-dot {
  width: 6px; height: 6px; border-radius: 999px;
  background: var(--cta-bg);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--cta-bg) 28%, transparent);
}

/* ── Hero live-data glass panel. The hero surface is DARK in both themes, so
   this panel's ink is hero-ink either way — it is not a theme inversion. ── */
.prm-live { color: var(--hero-ink); }
/* A white-tinted glass failed contrast in light mode (.88 white label text hit
   4.32:1 against the gradient's lightest point). A DARK scrim instead keeps the
   glass read while lifting every label to ~6:1. */
.prm-live.fx-glass {
  background: color-mix(in srgb, #00131d 16%, transparent);
  border-color: var(--hero-edge);
}
:root[data-theme="dark"] .prm-live.fx-glass {
  background: color-mix(in srgb, var(--bg-1) 55%, transparent);
}
.prm-live-strong { color: var(--hero-ink); }
.prm-live-dim { color: var(--hero-sub); }
.prm-live-label {
  font-size: 11px; font-weight: 700; letter-spacing: .1em;
  text-transform: uppercase; color: var(--hero-sub);
}
.prm-live-live {
  display: inline-flex; align-items: center; gap: 6px;
  font-size: 11px; font-weight: 700; text-transform: uppercase;
  letter-spacing: .1em; color: var(--hero-ink);
}
.prm-live-divide { border-top: 1px solid var(--hero-edge); }

/* Daily-filing bars. flex-1 with a min-width keeps 30 bars inside 375px. */
.prm-bar {
  flex: 1 1 0; min-width: 3px; border-radius: 2px 2px 0 0;
  background: linear-gradient(to top,
    color-mix(in srgb, var(--cta-bg) 85%, transparent),
    color-mix(in srgb, var(--hero-ink) 55%, transparent));
  transition: opacity .18s ease;
}
.prm-bar:hover { opacity: .75; }

.prm-chip {
  font-family: var(--font-mono); font-size: 11.5px; font-weight: 700;
  padding: 2px 7px; border-radius: 5px;
  color: var(--hero-ink);
  background: rgba(255,255,255,.12);
  border: 1px solid var(--hero-edge);
}

/* ── Free card: gradient sweep border + lift ──────────────────────────── */
.prm-free-card {
  position: relative; isolation: isolate;
  border-radius: 16px; padding: 28px;
  background: var(--bg-2);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-md);
  transition: transform .22s cubic-bezier(.22,1,.36,1), box-shadow .25s ease;
}
.prm-free-card::before {
  content: ""; position: absolute; z-index: -1; inset: -1.5px;
  border-radius: inherit;
  background: conic-gradient(from 0deg,
    transparent 0deg,
    color-mix(in srgb, var(--sig) 90%, transparent) 60deg,
    var(--premium) 120deg,
    transparent 190deg, transparent 360deg);
  opacity: 0; transition: opacity .3s ease;
  animation: fx-spin 6s linear infinite;
  will-change: transform;
}
.prm-free-card::after {
  content: ""; position: absolute; z-index: -1; inset: 0;
  border-radius: inherit; background: var(--bg-2);
}
.prm-free-card:hover,
.prm-free-card:focus-within {
  transform: translateY(-4px);
  box-shadow: var(--shadow-lg);
}
.prm-free-card:hover::before,
.prm-free-card:focus-within::before { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .prm-free-card::before { animation: none; opacity: 1; }
  .prm-free-card:hover, .prm-free-card:focus-within { transform: none; }
  .prm-mint:hover { filter: none; }
}

.prm-mint {
  background: linear-gradient(180deg, var(--cta-bg), var(--cta-b));
  color: var(--cta-ink);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--cta-bg) 30%, transparent);
  transition: filter .16s, transform .16s;
}
.prm-mint:hover { filter: brightness(1.08); }
.prm-mint:active { transform: translateY(1px); }

/* Price + content cards */
.prm-card {
  border: 1px solid var(--border); border-radius: 14px; background: var(--bg-2);
}
.prm-card--best {
  border-color: color-mix(in srgb, var(--sig) 50%, var(--border));
  box-shadow: 0 14px 40px color-mix(in srgb, var(--sig) 14%, transparent);
}
.prm-cta {
  background: linear-gradient(135deg, var(--sig), color-mix(in srgb, var(--sig) 52%, #6fd0ff));
  color: #fff;
  box-shadow: 0 8px 22px color-mix(in srgb, var(--sig) 28%, transparent),
              inset 0 1px 0 rgba(255,255,255,.22);
  transition: filter .16s, transform .16s;
}
.prm-cta:hover { filter: brightness(1.07); }
.prm-cta:active { transform: translateY(1px); }

/* E-book style playbook covers */
.prm-book {
  position: relative; aspect-ratio: 3 / 4; border-radius: 4px 10px 10px 4px;
  overflow: hidden; display: flex; flex-direction: column;
  align-items: center; justify-content: space-between;
  padding: 20px 16px 18px;
  box-shadow: 0 14px 28px rgba(0,0,0,.30), 0 2px 6px rgba(0,0,0,.22);
  transition: transform .22s, box-shadow .22s;
}
.prm-book::before { /* spine */
  content: ""; position: absolute; inset: 0 auto 0 0; width: 13px;
  background: linear-gradient(90deg, rgba(0,0,0,.42), rgba(0,0,0,.10) 60%, transparent);
}
.prm-book::after { /* gloss */
  content: ""; position: absolute; inset: 0;
  background: linear-gradient(118deg, rgba(255,255,255,.16) 0%, transparent 42%);
  pointer-events: none;
}
.prm-book:hover { transform: translateY(-6px) rotate(-.6deg); box-shadow: 0 22px 40px rgba(0,0,0,.38); }
@media (prefers-reduced-motion: reduce) {
  .prm-book, .prm-mint, .prm-cta { transition: none; }
  .prm-book:hover { transform: none; }
}
.prm-faq summary { cursor: pointer; list-style: none; }
.prm-faq summary::-webkit-details-marker { display: none; }
.prm-faq details[open] .prm-chev { transform: rotate(45deg); }
.prm-chev { transition: transform .18s; }
`;

/* Email capture — POSTs to the existing /subscribers endpoint. */
/**
 * Fade + rise entrance, staggered 80ms per child via the `--i` index each child
 * sets. IntersectionObserver-driven and runs ONCE. The animation itself lives in
 * globals.css (.fx-in), including its reduced-motion fallback, so a user with
 * that preference sees the finished state immediately and no observer matters.
 */
function Reveal({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [seen, setSeen] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);

  return (
    <div ref={ref} className={`fx-in ${seen ? "fx-seen" : ""} ${className}`}>
      {children}
    </div>
  );
}

/** Compact currency for the hero tiles — $1.8B, $847M, $12.4K. */
function shortMoney(v: number): string {
  const a = Math.abs(v);
  if (a >= 1e12) return `$${(v / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(v / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
}

interface DashboardLite {
  metrics: { totalRecentValue: number; topSector: { name: string; value: number } };
  activity: Array<{ date: string; count: number; value: number }>;
  topTrades: Array<{
    id: string;
    insiderName: string;
    role: string;
    ticker: string | null;
    companyName: string;
    totalValue: number;
  }>;
}

/**
 * Glass panel of REAL platform data for the hero — 30 days of Form 4 flow as a
 * bar chart plus headline totals and the largest recent buys. Everything comes
 * from /dashboard; nothing here is illustrative.
 *
 * Note it deliberately shows 30-day aggregates rather than a 24h count: the
 * feed legitimately reads zero early in the day, and a hero that says "0" is
 * worse than no hero at all.
 */
function LiveDataPanel() {
  const { data } = useSWR<DashboardLite>(`${API_BASE}/dashboard`, (u: string) =>
    fetch(u).then((r) => r.json()),
  );

  const activity = data?.activity ?? [];
  const filings = activity.reduce((a, d) => a + (d.count || 0), 0);
  const maxCount = Math.max(1, ...activity.map((d) => d.count || 0));
  const trades = (data?.topTrades ?? []).slice(0, 3);

  return (
    <Reveal>
      <div className="prm-live fx-glass p-5" style={{ ["--i" as string]: 0 }}>
        <div className="flex items-center justify-between gap-3 mb-1">
          <span className="prm-live-label">Insider buying · last 30 days</span>
          <span className="prm-live-live">
            <span className="prm-eyebrow-dot" aria-hidden />
            Live
          </span>
        </div>

        {/* Headline totals */}
        <div className="flex items-baseline gap-3 flex-wrap mt-3">
          <span className="prm-num text-[34px] font-bold leading-none prm-live-strong">
            {data ? shortMoney(data.metrics.totalRecentValue) : "—"}
          </span>
          <span className="text-[13px] prm-live-dim">
            {data ? `${filings.toLocaleString()} filings tracked` : "loading…"}
          </span>
        </div>

        {/* 30-day flow — one bar per day, height = filings that day.
            Pure CSS bars: no layout shift, scales to any width. */}
        <div
          className="flex items-end gap-[3px] mt-4"
          style={{ height: 68 }}
          role="img"
          aria-label={`Daily insider filings over the last 30 days, ${filings} in total`}
        >
          {activity.map((d) => (
            <span
              key={d.date}
              className="prm-bar"
              style={{ height: `${Math.max(6, ((d.count || 0) / maxCount) * 100)}%` }}
              title={`${d.date}: ${d.count} filings`}
            />
          ))}
          {!activity.length &&
            Array.from({ length: 30 }, (_, i) => (
              <span key={i} className="prm-bar" style={{ height: "18%", opacity: 0.35 }} />
            ))}
        </div>

        {/* Largest recent buys */}
        <div className="mt-4 pt-3.5 prm-live-divide space-y-2">
          {trades.length
            ? trades.map((t) => (
                <div key={t.id} className="flex items-center gap-2.5 text-[13px]">
                  <span className="prm-chip">{t.ticker || "—"}</span>
                  <span className="truncate prm-live-dim flex-1 min-w-0">
                    {t.insiderName}
                  </span>
                  <span className="prm-num font-bold prm-live-strong">
                    {shortMoney(t.totalValue)}
                  </span>
                </div>
              ))
            : Array.from({ length: 3 }, (_, i) => (
                <div key={i} className="shimmer rounded" style={{ height: 18 }} />
              ))}
        </div>
      </div>
    </Reveal>
  );
}

function SignupForm({ cta, tone = "cta" }: { cta: string; tone?: "cta" | "mint" }) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const btn = tone === "mint" ? "prm-mint" : "prm-cta";

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
      <div className="flex items-center justify-center gap-2 text-[14.5px] font-semibold text-good py-2">
        <CheckCircle2 className="h-5 w-5" /> Check your inbox to finish setting up.
      </div>
    );
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`${btn} w-full inline-flex items-center justify-center rounded-xl py-3.5 text-[16px] font-bold`}
      >
        {cta}
      </button>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="w-full flex flex-col gap-2.5">
      <input
        type="email"
        required
        autoFocus
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="you@example.com"
        aria-label="Email address"
        aria-invalid={!!err}
        className="w-full px-4 py-3 rounded-xl text-[14.5px] text-center"
        style={{
          background: "var(--bg-1)",
          border: err ? "1px solid var(--bad)" : "1px solid var(--border-strong)",
          color: "var(--text)",
        }}
      />
      <button
        type="submit"
        disabled={submitting}
        className={`${btn} w-full inline-flex items-center justify-center rounded-xl py-3.5 text-[16px] font-bold`}
      >
        {submitting ? "Submitting…" : cta}
      </button>
      {err && <p className="text-[12px] text-center" style={{ color: "var(--bad)" }}>{err}</p>}
    </form>
  );
}

/* Paid button. TO WIRE STRIPE: replace the onClick with a POST to /checkout
   and `window.location.href = session.url`. */
function BuyButton({ plan, label }: { plan: string; label: string }) {
  const [note, setNote] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => setNote(true)}
        className="prm-cta w-full inline-flex items-center justify-center rounded-xl py-3.5 text-[15.5px] font-bold"
      >
        {label}
      </button>
      {note && (
        <p className="text-[12.5px] mt-2.5 text-center leading-relaxed" style={{ color: "var(--text-soft)" }}>
          Card payments open shortly — create a free account and we&rsquo;ll email you when {plan} billing goes live.
        </p>
      )}
    </div>
  );
}

function BookCover({ sector, from, to }: { sector: string; from: string; to: string }) {
  return (
    <div className="prm-book" style={{ background: `linear-gradient(150deg, ${from}, ${to})` }}>
      <Logo size="sm" tone="light" className="opacity-95" />
      <div className="text-center">
        <div
          className="font-extrabold text-white leading-none"
          style={{ fontFamily: "var(--font-display)", fontSize: 30, letterSpacing: "-.02em" }}
        >
          {sector}
        </div>
        <div
          className="prm-num text-white/85 mt-1.5"
          style={{ fontSize: 11, letterSpacing: ".22em" }}
        >
          INSIDER
        </div>
      </div>
      <div className="prm-num text-white/70" style={{ fontSize: 9, letterSpacing: ".16em" }}>
        2026 PLAYBOOK
      </div>
    </div>
  );
}

export default function PremiumPage() {
  return (
    <div className="w-full pb-16 prm-scope">
      <style>{CSS}</style>

      {/* ─── Hero (above the fold) — copy left, live data right ───
          Layered depth: base gradient → drifting mesh → masked grid → scanline
          → grain → orbs, all pointer-events:none and all behind the content,
          so nothing can collide with the text at any width. */}
      <section className="prm-hero relative overflow-hidden px-6 sm:px-10 py-14 sm:py-20">
        <div className="fx-mesh" aria-hidden />
        <div className="fx-grid" aria-hidden />
        <div className="fx-scan" aria-hidden />
        <div className="fx-noise" aria-hidden />
        <div
          className="fx-orb"
          aria-hidden
          style={{ width: 260, height: 260, top: "-8%", right: "6%", background: "var(--mesh-2)" }}
        />
        <div
          className="fx-orb"
          aria-hidden
          style={{ width: 190, height: 190, bottom: "-12%", left: "4%", background: "var(--mesh-3)", animationDelay: "2.5s" }}
        />

        <div className="relative max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_420px] gap-10 lg:gap-14 items-center">
          <Reveal className="text-center lg:text-left">
            <div style={{ ["--i" as string]: 0 }}>
              <span className="prm-eyebrow">
                <span className="prm-eyebrow-dot" aria-hidden />
                Live SEC Form 4 intelligence
              </span>
            </div>
            <h1
              className="prm-h prm-hero-h text-[36px] sm:text-[58px] mt-4"
              style={{ ["--i" as string]: 1, letterSpacing: "-0.035em" }}
            >
              Tap Into The Power of Insider Data
            </h1>
            <p
              className="prm-hero-sub text-[17px] sm:text-[19px] leading-relaxed mt-5 max-w-xl mx-auto lg:mx-0"
              style={{ ["--i" as string]: 2 }}
            >
              Make more well-informed trading decisions with our next-generation stock research platform.
            </p>
            <div
              className="mt-9 w-full max-w-[300px] mx-auto lg:mx-0"
              style={{ ["--i" as string]: 3 }}
            >
              <SignupForm cta="Create Free Account" tone="mint" />
            </div>
          </Reveal>

          {/* Real platform data — 30 days of live Form 4 flow. */}
          <div className="min-w-0">
            <LiveDataPanel />
          </div>
        </div>
      </section>

      {/* ─── $0 forever ─── */}
      <section className="relative mt-16">
        <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-9 lg:gap-12 items-center">
          <Reveal>
            <h2 className="prm-h text-[32px] sm:text-[42px]" style={{ ["--i" as string]: 0 }}>
              Free to get started
            </h2>
            <p
              className="text-[16.5px] leading-relaxed mt-4 max-w-md"
              style={{ ["--i" as string]: 1, color: "var(--text-soft)" }}
            >
              Create an account and keep the essentials free for as long as you like.
            </p>
            <ul className="mt-6 space-y-2" style={{ ["--i" as string]: 2 }}>
              {FREE_INCLUDES.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14.5px]" style={{ color: "var(--text-soft)" }}>
                  <Check className="h-4 w-4 mt-0.5 flex-shrink-0" style={{ color: "var(--good)" }} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal>
            <div className="prm-free-card" style={{ ["--i" as string]: 0 }}>
              <div className="flex items-baseline justify-center gap-2.5 mb-5">
                <span
                  className="prm-num text-[60px] font-bold leading-none fx-blur-in"
                  style={{ letterSpacing: "-.04em", color: "var(--text)" }}
                >
                  $0
                </span>
                <span className="text-[16px] font-semibold" style={{ color: "var(--text-mute)" }}>
                  forever
                </span>
              </div>
              <SignupForm cta="Sign Up" />
              <p className="text-[12px] mt-3.5 text-center" style={{ color: "var(--text-mute)" }}>
                No payment details required
              </p>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ─── Insider Premium pricing ─── */}
      <section id="plans" className="mt-24 scroll-mt-6">
        <div className="text-center max-w-2xl mx-auto">
          <h2 className="prm-h text-[34px] sm:text-[46px]">Insider Premium</h2>
          <p className="text-[16.5px] leading-relaxed mt-4" style={{ color: "var(--text-soft)" }}>
            Every dataset, every tool, no caps — plus five sector playbooks.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mt-10 max-w-3xl mx-auto">
          {/* Monthly */}
          <div className="prm-card p-7 flex flex-col text-center">
            <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--text-mute)" }}>
              Monthly
            </span>
            <div className="flex items-baseline justify-center gap-1.5 mt-4">
              <span className="prm-num text-[46px] font-bold leading-none" style={{ letterSpacing: "-.035em" }}>
                ${PRICING.monthly}
              </span>
              <span className="text-[14px] font-semibold" style={{ color: "var(--text-mute)" }}>/ mo</span>
            </div>
            <p className="text-[13px] mt-3 mb-6" style={{ color: "var(--text-mute)" }}>
              Billed monthly. Cancel anytime.
            </p>
            <div className="mt-auto">
              <BuyButton plan="monthly" label="Get Insider Premium" />
            </div>
          </div>

          {/* Annual — the offer */}
          <div className="prm-card prm-card--best p-7 flex flex-col text-center relative">
            <span
              className="absolute -top-3 left-1/2 -translate-x-1/2 text-[10.5px] font-bold uppercase tracking-wider px-3 py-1 rounded-full whitespace-nowrap"
              style={{ background: "var(--sig)", color: "#fff" }}
            >
              Limited time · Save {SAVED_PCT}%
            </span>
            <span className="text-[13px] font-bold uppercase tracking-wider" style={{ color: "var(--sig)" }}>
              Annual
            </span>
            <div className="flex items-baseline justify-center gap-2 mt-4">
              <span className="prm-num text-[46px] font-bold leading-none" style={{ letterSpacing: "-.035em" }}>
                ${PRICING.annual}
              </span>
              <span className="prm-num text-[17px] line-through" style={{ color: "var(--text-faint)" }}>
                ${PRICING.annualWas}
              </span>
            </div>
            <p className="text-[13px] mt-3 mb-6" style={{ color: "var(--text-mute)" }}>
              Just <span className="prm-num font-bold" style={{ color: "var(--text)" }}>${ANNUAL_PER_MONTH}</span>/mo —
              you save <span className="prm-num font-bold" style={{ color: "var(--good)" }}>${SAVED}</span>.
            </p>
            <div className="mt-auto">
              <BuyButton plan="annual" label="Get Insider Premium" />
            </div>
          </div>
        </div>

        {/* Compact included list — two columns, short lines */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2.5 mt-10 max-w-3xl mx-auto">
          {INCLUDED.map((f) => (
            <div key={f} className="flex items-start gap-2.5 text-[14px]">
              <Check className="h-4 w-4 flex-shrink-0 mt-[3px]" strokeWidth={3} style={{ color: "var(--sig)" }} />
              <span style={{ color: "var(--text-soft)" }}>{f}</span>
            </div>
          ))}
        </div>
      </section>

      {/* ─── Sector playbooks ─── */}
      <section className="mt-24">
        <div className="text-center max-w-2xl mx-auto">
          <span className="prm-num text-[11px] uppercase tracking-[.14em]" style={{ color: "var(--sig)" }}>
            Included free with Premium
          </span>
          <h2 className="prm-h text-[30px] sm:text-[40px] mt-3">Five sector playbooks</h2>
          <p className="text-[16px] mt-4" style={{ color: "var(--text-soft)" }}>
            Where insiders are putting their own money, sector by sector — refreshed each quarter.
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-5 sm:gap-6 mt-10">
          {PLAYBOOKS.map((b) => (
            <div key={b.sector}>
              <BookCover sector={b.sector} from={b.from} to={b.to} />
              <p className="text-[13px] font-semibold leading-snug mt-3.5 text-center">{b.title}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ─── What you get ─── */}
      <section className="mt-24">
        <h2 className="prm-h text-[30px] sm:text-[38px] text-center">What you get</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-9">
          {BENEFITS.map((b) => {
            const Icon = b.icon;
            return (
              <div key={b.title} className="prm-card p-5 flex items-start gap-3.5">
                <span
                  className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: "color-mix(in srgb, var(--sig) 12%, transparent)", color: "var(--sig)" }}
                >
                  <Icon className="h-5 w-5" strokeWidth={1.9} />
                </span>
                <div className="min-w-0">
                  <h3 className="text-[15.5px] font-bold tracking-tight">{b.title}</h3>
                  <p className="text-[13px] leading-relaxed mt-1" style={{ color: "var(--text-mute)" }}>
                    {b.desc}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ─── FAQ ─── */}
      <section className="mt-24 max-w-3xl mx-auto prm-faq">
        <h2 className="prm-h text-[28px] sm:text-[34px] text-center">Common questions</h2>
        <div className="flex flex-col gap-2.5 mt-8">
          {FAQS.map((f) => (
            <details key={f.q} className="prm-card px-5 py-4">
              <summary className="flex items-center justify-between gap-4">
                <span className="text-[15px] font-bold">{f.q}</span>
                <span className="prm-chev flex-shrink-0" style={{ color: "var(--sig)", fontSize: 18, lineHeight: 1 }} aria-hidden>
                  +
                </span>
              </summary>
              <p className="text-[14px] leading-relaxed mt-3" style={{ color: "var(--text-soft)" }}>{f.a}</p>
            </details>
          ))}
        </div>

        <p className="text-[11.5px] mt-10 text-center leading-relaxed" style={{ color: "var(--text-faint)" }}>
          Informational only — not investment advice. Insider data comes from public regulatory filings
          and may be delayed.{" "}
          <Link href="/stocks" className="text-accent">Browse the live ranking</Link>.
        </p>
      </section>
    </div>
  );
}
