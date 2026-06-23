"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bell,
  Check,
  CheckCircle2,
  Crown,
  Gauge,
  Landmark,
  LineChart,
  Sparkles,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

/* ────────────────────────────────────────────────────────────
   Subscribe/premium landing page.
   Section order mirrors newsfailures.com, content adapted to
   InsiderBuying.com (Form 4 + IQS insider-buying analytics).
   1. Hero  2. In Action  3. Why Investors  4. Testimonials
   5. Conversion band  6. Pricing  7. From the Blog
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

  async function submit(e: React.FormEvent) {
    e.preventDefault();
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
    } catch (err: any) {
      setError(err?.message || "Submission failed");
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
      className={`flex flex-col sm:flex-row gap-2.5 w-full max-w-md ${
        align === "center" ? "mx-auto" : ""
      }`}
    >
      <input
        type="email"
        required
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Enter your email address"
        className="flex-1 px-4 py-3 rounded-lg text-[14px]"
        style={{
          background: "var(--bg-1)",
          border: "1px solid var(--border-strong)",
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
      {error && (
        <div className="text-[12px] text-[var(--bad)] w-full text-center sm:absolute">
          {error}
        </div>
      )}
    </form>
  );
}

// ─── Data ─────────────────────────────────────────────────────
const STATS = [
  { value: "10,000+", label: "Form 4 filings tracked" },
  { value: "500", label: "Companies IQS-scored" },
  { value: "Daily", label: "AI insider briefings" },
  { value: "Live", label: "Market data & heatmaps" },
];

const FEATURES = [
  {
    icon: Gauge,
    title: "IQS 4-Factor Scoring",
    desc: "Every company gets a proprietary 0–100 Insider Buying Quality Score from purchase volume, cluster effect, role weighting, and holding-change magnitude.",
  },
  {
    icon: Bell,
    title: "Cluster-Buy Alerts",
    desc: "Get notified the moment multiple distinct insiders buy the same stock in a short window — the strongest conviction signal in the data.",
  },
  {
    icon: Crown,
    title: "CEO / CFO Conviction Buys",
    desc: "Role-weighted scoring surfaces purchases by the executives who know the business best — CEO, CFO and COO buys carry the most weight.",
  },
  {
    icon: LineChart,
    title: "Live Market Data & Heatmaps",
    desc: "Real-time quotes, sector performance, top movers and earnings — paired with IQS heatmaps so you see where the smart money is concentrated.",
  },
  {
    icon: Landmark,
    title: "Congressional & Famous-Investor Tracking",
    desc: "Follow congressional trades and the 13F portfolios of legendary investors alongside corporate-insider activity in one view.",
  },
  {
    icon: Sparkles,
    title: "Daily AI Briefings",
    desc: "Every morning, an AI digest synthesises the latest filings into plain-language briefings on the day's most notable insider buying.",
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Insiders might sell their shares for any number of reasons, but they buy them for only one: they think the price will rise.",
    name: "Peter Lynch",
    source: "One Up on Wall Street",
  },
  {
    quote:
      "Be fearful when others are greedy, and greedy when others are fearful. Conviction shows when insiders put their own capital on the line.",
    name: "Warren Buffett",
    source: "Chairman, Berkshire Hathaway",
  },
  {
    quote:
      "When the people who know a company best are buying with their own money, pay attention — that signal is hard to fake.",
    name: "The InsiderBuying thesis",
    source: "Why open-market Form 4 buys matter",
  },
];

const PLAN_FEATURES = [
  "IQS rankings & cluster-buy alerts",
  "Full insider + congressional feeds",
  "Live heatmaps & top movers",
  "Famous-investor 13F portfolios",
  "Daily AI briefings",
  "CSV exports",
];

const BLOG_POSTS = [
  {
    category: "IQS Methodology",
    title: "How the IQS Score Reads Insider Conviction",
    read: "8 min read",
    desc: "A breakdown of the four factors — volume, clusters, role weighting and holding change — and why each one matters.",
  },
  {
    category: "Cluster Buys",
    title: "What a Cluster Buy Really Tells You",
    read: "6 min read",
    desc: "When several distinct insiders buy the same stock in days, the signal strengthens. Here's how we surface it.",
  },
  {
    category: "Smart Money",
    title: "Following CEO & CFO Purchases the Right Way",
    read: "7 min read",
    desc: "Not all insider buys are equal. Why executive open-market purchases carry the heaviest weight in our model.",
  },
];

export default function PremiumPage() {
  return (
    <div className="space-y-20 sm:space-y-28">
      {/* ───────────────────────── 1. HERO ───────────────────────── */}
      <section
        className="relative overflow-hidden -mx-2 sm:-mx-3 lg:-mx-4 -mt-6 sm:-mt-8"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 14%, var(--bg-2)) 100%)",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <div className="hero-orb hero-orb-a" aria-hidden />
        <div className="hero-orb hero-orb-b" aria-hidden />
        <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-28 text-center">
          <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          >
            <div
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider text-white mb-6"
              style={{
                background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
              }}
            >
              <Sparkles className="h-3 w-3" />
              Insider-buying intelligence
            </div>
            <h1
              className="text-[40px] sm:text-[58px] font-bold tracking-tight leading-[1.05]"
              style={{ letterSpacing: "-1px" }}
            >
              Follow the Smart Money.
            </h1>
            <p
              className="mt-4 text-[17px] sm:text-[21px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              Insider-buying intelligence with a quantitative edge.
            </p>
            <p className="text-soft mt-5 text-[15px] sm:text-[17px] max-w-2xl mx-auto leading-relaxed">
              Insiders buy their own stock for one reason — they expect the price to
              rise. InsiderBuying.com tracks every open-market SEC Form 4 purchase and
              scores it with our proprietary 0–100 IQS engine, so you can catch
              executive conviction the moment it shows up in the filings — before the
              crowd does.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <TrialCapture source="premium-hero" />
              <a
                href="#why"
                className="btn-secondary whitespace-nowrap"
                style={{ padding: "12px 20px", fontSize: 14 }}
              >
                Learn more
              </a>
            </div>
            <p className="text-mute text-[12px] mt-4">
              30-day free trial · No card required · Cancel anytime
            </p>
          </motion.div>
        </div>
      </section>

      {/* ──────────────── 2. SEE INSIDERBUYING IN ACTION ──────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <SectionHeading
          eyebrow="Product tour"
          title="See InsiderBuying in Action"
          blurb="A live analytics layer on top of the SEC Form 4 firehose — rankings, heatmaps and the raw insider feed, all scored by IQS."
        />

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mt-10">
          <FauxLeaderboard />
          <FauxHeatmap />
          <FauxTradesTable />
        </div>

        {/* Stat callouts */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {STATS.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.35, delay: i * 0.06 }}
              className="card p-5 text-center"
            >
              <div
                className="text-[26px] sm:text-[32px] font-bold tracking-tight"
                style={{ color: "var(--accent)", letterSpacing: "-0.5px" }}
              >
                {s.value}
              </div>
              <div className="text-mute text-[12px] mt-1 leading-snug">{s.label}</div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ──────────────── 3. WHY INVESTORS USE INSIDERBUYING ──────────────── */}
      <section id="why" className="max-w-6xl mx-auto px-2 scroll-mt-24">
        <SectionHeading
          eyebrow="The edge"
          title="Why Investors Use InsiderBuying"
          blurb="Insiders buy for one reason — they expect the price to rise. We turn that signal into a measurable, rankable score so you can act on conviction, not noise."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            return (
              <motion.div
                key={f.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: (i % 3) * 0.06 }}
                className="card card-lift p-6"
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--accent-2) 22%, var(--bg-3)), color-mix(in srgb, var(--accent) 18%, var(--bg-3)))",
                    border: "1px solid color-mix(in srgb, var(--accent-2) 30%, var(--border))",
                  }}
                >
                  <Icon className="h-5 w-5" style={{ color: "var(--accent-2)" }} strokeWidth={2} />
                </div>
                <h3 className="text-[17px] font-bold tracking-tight mb-2">{f.title}</h3>
                <p className="text-soft text-[14px] leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ──────────────── 4. TESTIMONIALS — WHAT THE LEGENDS SAY ──────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <SectionHeading
          eyebrow="Conviction, in their words"
          title="What the Legends Say"
          blurb="The case for following insider buying isn't new — the greatest investors have made it for decades."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {TESTIMONIALS.map((t, i) => (
            <motion.div
              key={t.name}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="card p-6 flex flex-col"
            >
              <div
                className="text-[40px] leading-none font-bold mb-3"
                style={{ color: "color-mix(in srgb, var(--accent) 45%, transparent)" }}
                aria-hidden
              >
                &ldquo;
              </div>
              <p
                className="text-[15px] leading-relaxed flex-1"
                style={{ color: "var(--text)", fontWeight: 500 }}
              >
                {t.quote}
              </p>
              <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>
                  {t.name}
                </div>
                <div className="text-mute text-[12px] mt-0.5">{t.source}</div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      {/* ──────────────── 5. CONVERSION BAND ──────────────── */}
      <section className="max-w-5xl mx-auto px-2">
        <div
          className="rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 16%, var(--bg-2)) 100%)",
            border: "1px solid var(--border)",
          }}
        >
          <div className="hero-orb hero-orb-b" aria-hidden />
          <div className="relative">
            <h2
              className="text-[28px] sm:text-[38px] font-bold tracking-tight leading-tight"
              style={{ letterSpacing: "-0.6px" }}
            >
              Start tracking insider conviction today
            </h2>
            <p className="text-soft mt-4 text-[15px] sm:text-[17px] max-w-2xl mx-auto leading-relaxed">
              Join the investors who follow the smart money. Get full access to IQS
              rankings, cluster-buy alerts, live heatmaps and daily AI briefings — free
              for 30 days.
            </p>
            <div className="mt-7">
              <TrialCapture source="premium-conversion-band" />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────── 6. SIMPLE PRICING ──────────────── */}
      <section className="max-w-3xl mx-auto px-2">
        <SectionHeading
          eyebrow="Pricing"
          title="Simple Pricing"
          blurb="One plan. Full access. No hidden fees. Cancel anytime."
        />

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, amount: 0.2 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
          className="card p-7 sm:p-9 mt-10 mx-auto max-w-md"
          style={{
            borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border))",
            boxShadow: "0 10px 32px color-mix(in srgb, var(--accent) 16%, transparent)",
          }}
        >
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <div className="text-[20px] font-bold tracking-tight">All-Access</div>
            <span className="badge badge-gold">Best value</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-5">
            <span className="text-[44px] font-bold tracking-tight" style={{ letterSpacing: "-1px" }}>
              $29
            </span>
            <span className="text-mute text-[15px] font-semibold">/ month</span>
          </div>

          <div className="h-px mb-5" style={{ background: "var(--border)" }} />

          <ul className="space-y-3 mb-7">
            {PLAN_FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-[14px]">
                <span
                  className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-soft">{f}</span>
              </li>
            ))}
          </ul>

          <TrialCapture source="premium-pricing" align="left" />
          <p className="text-mute text-[12px] mt-4 text-center">
            30-day free trial · No card required · Cancel anytime
          </p>
        </motion.div>
      </section>

      {/* ──────────────── 7. FROM THE BLOG ──────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <SectionHeading
          eyebrow="From the blog"
          title="Insider-Buying Insights"
          blurb="Editorial briefings synthesised from the live Form 4 feed and our IQS scoring engine."
          action={{ label: "View all articles", href: "/insights" }}
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {BLOG_POSTS.map((p, i) => (
            <motion.div
              key={p.title}
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.2 }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
            >
              <Link
                href="/insights"
                className="card card-lift p-6 h-full flex flex-col group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="badge badge-neutral">{p.category}</span>
                  <span className="text-mute text-[12px]">{p.read}</span>
                </div>
                <h3 className="text-[17px] font-bold tracking-tight leading-snug mb-2 group-hover:text-accent transition">
                  {p.title}
                </h3>
                <p className="text-soft text-[14px] leading-relaxed flex-1">{p.desc}</p>
                <span className="inline-flex items-center gap-1 text-[13px] font-bold text-accent mt-4">
                  Read article <ArrowRight className="h-3.5 w-3.5" />
                </span>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>
    </div>
  );
}

// ─── Section heading helper ───────────────────────────────────
function SectionHeading({
  eyebrow,
  title,
  blurb,
  action,
}: {
  eyebrow: string;
  title: string;
  blurb: string;
  action?: { label: string; href: string };
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <div
        className="eyebrow mb-3"
        style={{ color: "var(--accent)", letterSpacing: "0.12em" }}
      >
        {eyebrow}
      </div>
      <h2
        className="text-[30px] sm:text-[40px] font-bold tracking-tight leading-tight"
        style={{ letterSpacing: "-0.6px" }}
      >
        {title}
      </h2>
      <p className="text-soft mt-4 text-[15px] sm:text-[16px] leading-relaxed">{blurb}</p>
      {action && (
        <Link
          href={action.href}
          className="inline-flex items-center gap-1 text-[13px] font-bold text-accent mt-4 hover:underline"
        >
          {action.label} <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      )}
    </div>
  );
}

// ─── Faux dashboard preview panels (illustrative, no data fetch) ──────────────
function PanelChrome({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <h3 className="text-[12px] font-bold uppercase tracking-wider truncate">{title}</h3>
        <span className="live-dot live-dot-good">Live</span>
      </div>
      <div className="p-3">{children}</div>
    </div>
  );
}

function iqsColor(iqs: number) {
  if (iqs >= 70) return "var(--good)";
  if (iqs >= 55) return "var(--accent)";
  if (iqs >= 40) return "var(--accent-2)";
  return "var(--text-mute)";
}

function FauxLeaderboard() {
  const rows = [
    { rank: 1, ticker: "NVDA", iqs: 88 },
    { rank: 2, ticker: "AXON", iqs: 81 },
    { rank: 3, ticker: "CELH", iqs: 74 },
    { rank: 4, ticker: "DKNG", iqs: 66 },
    { rank: 5, ticker: "RKLB", iqs: 58 },
    { rank: 6, ticker: "PLTR", iqs: 52 },
  ];
  return (
    <PanelChrome title="IQS Leaderboard">
      <div className="space-y-1.5">
        {rows.map((r) => (
          <div
            key={r.ticker}
            className="flex items-center gap-3 rounded-md px-2.5 py-2"
            style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
          >
            <span className="text-mute text-[12px] font-mono w-4">{r.rank}</span>
            <span className="text-[13px] font-bold font-mono flex-1">{r.ticker}</span>
            <div
              className="h-1.5 rounded-full flex-1 max-w-[80px] overflow-hidden"
              style={{ background: "var(--bg-3)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${r.iqs}%`, background: iqsColor(r.iqs) }}
              />
            </div>
            <span
              className="text-[13px] font-bold font-mono w-7 text-right"
              style={{ color: iqsColor(r.iqs) }}
            >
              {r.iqs}
            </span>
          </div>
        ))}
      </div>
    </PanelChrome>
  );
}

function FauxHeatmap() {
  // Deterministic tile values so colors are stable across renders.
  const tiles = [
    72, 88, 41, 63, 55, 34, 81, 49, 66, 58, 77, 38, 60, 92, 45, 51, 69, 43, 84, 53, 47,
    74, 36, 62,
  ];
  return (
    <PanelChrome title="IQS Heatmap">
      <div className="grid grid-cols-6 gap-1.5">
        {tiles.map((v, i) => (
          <div
            key={i}
            className="rounded-md flex items-center justify-center"
            style={{
              aspectRatio: "1",
              background: `color-mix(in srgb, ${iqsColor(v)} ${Math.round(
                25 + (v / 100) * 55,
              )}%, var(--bg-1))`,
            }}
          >
            <span className="text-[10px] font-bold font-mono text-white/90">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between mt-3 text-[10px] text-mute font-mono uppercase tracking-wider">
        <span>Low IQS</span>
        <span>High IQS</span>
      </div>
    </PanelChrome>
  );
}

function FauxTradesTable() {
  const trades = [
    { who: "CEO", ticker: "AXON", val: "$2.4M", buy: true },
    { who: "CFO", ticker: "CELH", val: "$890K", buy: true },
    { who: "Dir.", ticker: "DKNG", val: "$1.1M", buy: true },
    { who: "CEO", ticker: "RKLB", val: "$640K", buy: true },
    { who: "COO", ticker: "PLTR", val: "$420K", buy: true },
    { who: "Dir.", ticker: "NVDA", val: "$3.7M", buy: true },
  ];
  return (
    <PanelChrome title="Latest Insider Buys">
      <div className="space-y-1.5">
        {trades.map((t, i) => (
          <div
            key={i}
            className="flex items-center gap-2.5 rounded-md px-2.5 py-2"
            style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
          >
            <span
              className="text-[10px] font-bold uppercase rounded px-1.5 py-0.5"
              style={{ background: "var(--bg-3)", color: "var(--text-mute)" }}
            >
              {t.who}
            </span>
            <span className="text-[13px] font-bold font-mono flex-1">{t.ticker}</span>
            <span className="text-[13px] font-mono font-semibold" style={{ color: "var(--text)" }}>
              {t.val}
            </span>
            <span className="badge badge-buy">BUY</span>
          </div>
        ))}
      </div>
    </PanelChrome>
  );
}
