"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Activity,
  Gauge,
  Landmark,
  LayoutGrid,
  Briefcase,
  Building2,
  Newspaper,
  FlaskConical,
  KeyRound,
  Code2,
  Rocket,
  Palette,
  Mail,
} from "lucide-react";

/* ────────────────────────────────────────────────────────────
   B2B / "For Business" marketing landing page for InsiderBuying.com.
   Pitches licensing the data + widgets + white-label dashboards to
   partners. Matches the design language of app/premium/page.tsx.
   1. Hero  2. What you can license  3. Who it's for
   4. How it works  5. Let's talk CTA band
   The global Nav + Footer are rendered by AppShell — none here.
   ──────────────────────────────────────────────────────────── */

const DEMO_HREF = "/reports/cta/TOP5";
const CONTACT_HREF = "mailto:admin@insiderbuying.com?subject=InsiderBuying%20API%20%2F%20licensing%20enquiry";

// ─── Data ─────────────────────────────────────────────────────
const LICENSE_FEATURES = [
  {
    icon: Activity,
    title: "Real-time Insider Feed",
    desc: "A clean, normalized Form 4 API — every open-market insider buy and sell, parsed from the SEC firehose and delivered as structured JSON within minutes of filing.",
  },
  {
    icon: Gauge,
    title: "Insider Scores API",
    desc: "Pull our proprietary 0–100 Insider Score for any covered company, along with the underlying factor breakdown — volume, clusters, role weighting and conviction.",
  },
  {
    icon: Landmark,
    title: "Congressional Trades Data",
    desc: "Programmatic access to congressional trading disclosures, mapped to tickers and ready to surface alongside corporate-insider activity inside your product.",
  },
  {
    icon: LayoutGrid,
    title: "Heatmap & Widget Embeds",
    desc: "Drop-in embeddable widgets — Insider Score heatmaps, leaderboards and live insider-buy tickers — that render in an iframe and inherit your brand's look and feel.",
  },
  {
    icon: Briefcase,
    title: "Famous-Investor 13F Data",
    desc: "The latest 13F portfolios of legendary investors, structured and queryable, so you can show your users what the smart money is holding and how it's changing.",
  },
  {
    icon: Palette,
    title: "White-Label Dashboards",
    desc: "A fully white-labeled analytics dashboard under your own domain and branding — rankings, screeners and heatmaps powered by our engine, shipped as your feature.",
  },
];

const AUDIENCES = [
  {
    icon: Building2,
    title: "Fintech Apps",
    desc: "Add an insider-conviction layer to your investing or research app without building a Form 4 pipeline. Ship the feature in days, not quarters.",
  },
  {
    icon: Briefcase,
    title: "Brokerages",
    desc: "Surface Insider Scores and insider activity right inside your trading flow to deepen engagement and give clients a signal they can't get elsewhere.",
  },
  {
    icon: Newspaper,
    title: "Media & Publishers",
    desc: "Embed live heatmaps and insider-buy widgets in your finance coverage, or license the feed to power data-driven editorial and newsletters.",
  },
  {
    icon: FlaskConical,
    title: "Research Firms",
    desc: "Integrate normalized insider, congressional and 13F datasets into your models and reports via a stable API built for analysis at scale.",
  },
];

const STEPS = [
  {
    icon: KeyRound,
    step: "01",
    title: "Get a key",
    desc: "Book a demo and we'll provision an API key scoped to the datasets you need — insider feed, Insider Score, congressional, or 13F — with sandbox access to start.",
  },
  {
    icon: Code2,
    step: "02",
    title: "Call the API / embed a widget",
    desc: "Hit clean REST endpoints with structured JSON, or drop an embeddable heatmap or leaderboard widget into your app. Clear docs, predictable schemas.",
  },
  {
    icon: Rocket,
    step: "03",
    title: "Ship",
    desc: "Go live under your own brand. We handle the SEC ingestion, scoring and uptime so your team can focus on the product your users see.",
  },
];

export default function BusinessPage() {
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
              <Briefcase className="h-3 w-3" />
              For Business
            </div>
            <h1
              className="text-[40px] sm:text-[58px] font-bold tracking-tight leading-[1.05]"
              style={{ letterSpacing: "-1px" }}
            >
              Insider-buying data, built into your product
            </h1>
            <p
              className="mt-4 text-[17px] sm:text-[21px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              License the engine behind InsiderBuying.com.
            </p>
            <p className="text-soft mt-5 text-[15px] sm:text-[17px] max-w-2xl mx-auto leading-relaxed">
              Give your users the same insider-conviction signal we built our platform
              on — without building the pipeline yourself. Get programmatic API access to
              our real-time Form 4 feed, Insider Scores, congressional trades and 13F data,
              drop in embeddable heatmap and leaderboard widgets, or ship a fully
              white-label dashboard under your own brand.
            </p>
            <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={DEMO_HREF}
                className="btn-primary whitespace-nowrap"
                style={{ padding: "12px 22px", fontSize: 14, fontWeight: 600 }}
              >
                Book a demo
              </Link>
              <a
                href="#license"
                className="btn-secondary whitespace-nowrap"
                style={{ padding: "12px 20px", fontSize: 14 }}
              >
                View API docs
              </a>
            </div>
            <p className="text-mute text-[12px] mt-4">
              Custom pricing · Sandbox access · SLA-backed uptime
            </p>
          </motion.div>
        </div>
      </section>

      {/* ──────────────── 2. WHAT YOU CAN LICENSE ──────────────── */}
      <section id="license" className="max-w-6xl mx-auto px-2 scroll-mt-24">
        <SectionHeading
          eyebrow="Licensing"
          title="What you can license"
          blurb="Six building blocks, each available as an API, an embeddable widget, or a white-label surface — mix and match to fit your product."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mt-10">
          {LICENSE_FEATURES.map((f, i) => {
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
                    border:
                      "1px solid color-mix(in srgb, var(--accent-2) 30%, var(--border))",
                  }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--accent-2)" }}
                    strokeWidth={2}
                  />
                </div>
                <h3 className="text-[17px] font-bold tracking-tight mb-2">{f.title}</h3>
                <p className="text-soft text-[14px] leading-relaxed">{f.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ──────────────── 3. WHO IT'S FOR ──────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <SectionHeading
          eyebrow="Use cases"
          title="Who it's for"
          blurb="Teams that want to ship insider-buying intelligence as a feature — not stand up an SEC ingestion stack and a scoring model from scratch."
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-10">
          {AUDIENCES.map((a, i) => {
            const Icon = a.icon;
            return (
              <motion.div
                key={a.title}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
                className="card card-lift p-6 flex flex-col"
              >
                <div
                  className="h-11 w-11 rounded-xl flex items-center justify-center mb-4"
                  style={{
                    background: "var(--bg-3)",
                    border: "1px solid var(--border)",
                  }}
                >
                  <Icon
                    className="h-5 w-5"
                    style={{ color: "var(--accent)" }}
                    strokeWidth={2}
                  />
                </div>
                <h3 className="text-[16px] font-bold tracking-tight mb-2">{a.title}</h3>
                <p className="text-soft text-[14px] leading-relaxed flex-1">{a.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ──────────────── 4. HOW IT WORKS ──────────────── */}
      <section className="max-w-6xl mx-auto px-2">
        <SectionHeading
          eyebrow="Integration"
          title="How it works"
          blurb="Three steps from kickoff to production. We carry the data plumbing; you ship the experience."
        />

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mt-10">
          {STEPS.map((s, i) => {
            const Icon = s.icon;
            return (
              <motion.div
                key={s.step}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ duration: 0.4, delay: i * 0.08 }}
                className="card p-6 relative overflow-hidden"
              >
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="h-11 w-11 rounded-xl flex items-center justify-center flex-shrink-0"
                    style={{
                      background:
                        "linear-gradient(135deg, color-mix(in srgb, var(--accent-2) 22%, var(--bg-3)), color-mix(in srgb, var(--accent) 18%, var(--bg-3)))",
                      border:
                        "1px solid color-mix(in srgb, var(--accent-2) 30%, var(--border))",
                    }}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={{ color: "var(--accent-2)" }}
                      strokeWidth={2}
                    />
                  </div>
                  <span
                    className="text-[28px] font-bold font-mono tracking-tight"
                    style={{ color: "color-mix(in srgb, var(--accent) 40%, transparent)" }}
                    aria-hidden
                  >
                    {s.step}
                  </span>
                </div>
                <h3 className="text-[17px] font-bold tracking-tight mb-2">{s.title}</h3>
                <p className="text-soft text-[14px] leading-relaxed">{s.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </section>

      {/* ──────────────── 5. LET'S TALK CTA BAND ──────────────── */}
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
            <div
              className="eyebrow mb-3"
              style={{ color: "var(--accent)", letterSpacing: "0.12em" }}
            >
              Plans
            </div>
            <h2
              className="text-[28px] sm:text-[38px] font-bold tracking-tight leading-tight"
              style={{ letterSpacing: "-0.6px" }}
            >
              Custom pricing — let&rsquo;s talk
            </h2>
            <p className="text-soft mt-4 text-[15px] sm:text-[17px] max-w-2xl mx-auto leading-relaxed">
              Pricing scales with the datasets you license, call volume and white-label
              scope. Tell us what you&rsquo;re building and we&rsquo;ll put together a
              plan and a sandbox key to get you started.
            </p>
            <div className="mt-7 flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link
                href={DEMO_HREF}
                className="btn-primary whitespace-nowrap"
                style={{ padding: "12px 22px", fontSize: 14, fontWeight: 600 }}
              >
                Book a demo
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href={CONTACT_HREF}
                className="btn-secondary whitespace-nowrap inline-flex items-center gap-1.5"
                style={{ padding: "12px 20px", fontSize: 14 }}
              >
                <Mail className="h-4 w-4" />
                Contact us
              </a>
            </div>
            <p className="text-mute text-[12px] mt-4">
              No fixed tiers · Volume-based · SLA available
            </p>
          </div>
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
}: {
  eyebrow: string;
  title: string;
  blurb: string;
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
    </div>
  );
}
