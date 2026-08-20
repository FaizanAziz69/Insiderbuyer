"use client";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  BellRing,
  Lightbulb,
  SlidersHorizontal,
  ArrowRight,
  Mail,
  Phone,
  CheckCircle2,
  TrendingUp,
  Activity,
  Sparkles,
} from "lucide-react";
import { API_BASE } from "@/lib/api";

/* ------------------------------------------------------------------ *
 * Immersive premium promo — hero (left) + layered floating dashboard
 * widgets (right) with the newsletter as a glass panel overlapping the
 * dashboard. Uses the site's own theme tokens so it reads natively in
 * both light and dark.
 * ------------------------------------------------------------------ */

const ACCENT_GRADIENT = "linear-gradient(135deg, var(--accent), var(--accent-2))";
const ACCENT_GLOW = "0 16px 40px -14px color-mix(in srgb, var(--accent) 60%, transparent)";
const FOCUS_RING = "0 0 0 3px color-mix(in srgb, var(--accent) 26%, transparent)";
const CARD_SHADOW = "0 24px 60px -24px rgba(2,10,30,0.35)";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

/* Claims audited against the code (client free/paid audit): there is no
   score-movement alerting, so the first bullet now sells what /alerts and the
   watchlist actually do. */
const FEATURES = [
  { icon: BellRing, text: "Portfolio monitoring with the Insider Score on every holding" },
  { icon: Lightbulb, text: "Daily stock ideas drawn from insider activity" },
  { icon: SlidersHorizontal, text: "Stock screeners and Form 4 research tools" },
];

export function TrialAndNewsletterStrip() {
  return (
    <motion.section
      initial={{ opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="relative overflow-hidden rounded-[20px] px-5 py-7 sm:px-8 sm:py-9 lg:px-10 lg:py-10"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
        boxShadow: "0 20px 60px -30px rgba(2,10,30,0.4)",
      }}
    >
      {/* ambient glows */}
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 -top-24 h-80 w-80 rounded-full"
        style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", filter: "blur(90px)" }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-28 -left-24 h-80 w-80 rounded-full"
        style={{ background: "color-mix(in srgb, var(--accent-2) 20%, transparent)", filter: "blur(90px)" }}
      />
      {/* faint grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage:
            "linear-gradient(color-mix(in srgb, var(--text) 6%, transparent) 1px, transparent 1px), linear-gradient(90deg, color-mix(in srgb, var(--text) 6%, transparent) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
          maskImage: "radial-gradient(120% 120% at 50% 0%, #000 30%, transparent 80%)",
          WebkitMaskImage: "radial-gradient(120% 120% at 50% 0%, #000 30%, transparent 80%)",
        }}
      />

      <div className="relative grid grid-cols-1 items-center gap-8 lg:grid-cols-[0.95fr_1.05fr] lg:gap-6">
        <HeroSide />
        <DashboardSide />
      </div>
    </motion.section>
  );
}

/* ------------------------------- HERO ----------------------------- */

function HeroSide() {
  return (
    <div className="relative">
      <span
        className="inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-[0.14em]"
        style={{
          color: "var(--accent)",
          background: "var(--accent-soft)",
          border: "1px solid color-mix(in srgb, var(--accent) 24%, transparent)",
        }}
      >
        <Sparkles className="h-3.5 w-3.5" />
        Empowering Investors
      </span>

      <h2
        className="mt-4 text-[25px] font-semibold leading-[1.08] tracking-tight sm:text-[34px]"
        style={{ letterSpacing: "-0.02em" }}
      >
        Get Insider Intel with{" "}
        <span
          style={{
            background: ACCENT_GRADIENT,
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            WebkitTextFillColor: "transparent",
          }}
        >
          Insider Access
        </span>
        .
      </h2>

      <p className="mt-3 max-w-md text-[14px] leading-relaxed text-soft">
        Turn raw SEC Form 4 filings into a real-time edge — every insider buy,
        scored and delivered before the crowd catches on.
      </p>

      <ul className="mt-5 space-y-2.5">
        {FEATURES.map((f) => (
          <li key={f.text} className="flex items-center gap-3">
            <span
              className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg"
              style={{
                background: "var(--accent-soft)",
                border: "1px solid color-mix(in srgb, var(--accent) 22%, transparent)",
              }}
            >
              <f.icon className="h-4 w-4" style={{ color: "var(--accent)" }} strokeWidth={2.2} />
            </span>
            <span className="text-[13.5px] text-soft">{f.text}</span>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.98 }}>
          <Link
            href="/premium"
            className="group inline-flex items-center gap-2 rounded-lg px-5 py-3 text-[13.5px] font-bold uppercase tracking-wide"
            style={{ background: ACCENT_GRADIENT, color: "var(--on-accent)", boxShadow: ACCENT_GLOW }}
          >
            Unlock Insider Access
            <ArrowRight className="h-[18px] w-[18px] transition-transform duration-300 group-hover:translate-x-1" strokeWidth={2.5} />
          </Link>
        </motion.div>
        <span className="inline-flex items-center gap-1.5 text-[13px] text-mute">
          <CheckCircle2 className="h-4 w-4" style={{ color: "var(--good)" }} />
          30-day money-back guarantee
        </span>
      </div>
    </div>
  );
}

/* ---------------------------- DASHBOARD --------------------------- */

function DashboardSide() {
  return (
    <div className="relative lg:pl-6">
      {/* main analytics card */}
      <AnalyticsCard />

      {/* floating stat chips (desktop) */}
      <FloatingChip
        className="absolute -left-4 top-6 hidden lg:flex"
        icon={TrendingUp}
        value="+18.4%"
        label="30-day return"
        tone="good"
        delay={0.3}
      />
      <FloatingChip
        className="absolute -right-3 top-40 hidden xl:flex"
        icon={Activity}
        value="92"
        label="Insider Score"
        tone="accent"
        delay={0.45}
      />

      {/* newsletter — glass panel overlapping the dashboard */}
      <div className="relative z-20 mt-4 lg:-mt-10 lg:ml-10">
        <NewsletterPanel />
      </div>
    </div>
  );
}

function AnalyticsCard() {
  return (
    <GlassCard className="relative z-0 p-4 sm:p-5">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-mute">
            Portfolio growth
          </div>
          <div className="mt-0.5 flex items-baseline gap-2">
            <span className="text-[21px] font-bold tracking-tight">$48,250</span>
            <span
              className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold"
              style={{ color: "var(--good)", background: "color-mix(in srgb, var(--good) 14%, transparent)" }}
            >
              <TrendingUp className="h-3 w-3" /> +18.4%
            </span>
          </div>
        </div>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--accent)", background: "var(--accent-soft)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} />
          Live
        </span>
      </div>

      <GrowthChart />

      {/* mini legend / ticker row */}
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { k: "Insider buys", v: "+$2.4M" },
          { k: "New signals", v: "37" },
          { k: "Win rate", v: "74%" },
        ].map((s) => (
          <div
            key={s.k}
            className="rounded-lg px-2.5 py-2"
            style={{ background: "color-mix(in srgb, var(--bg-3) 60%, transparent)" }}
          >
            <div className="text-[9px] uppercase tracking-wider text-mute">{s.k}</div>
            <div className="mt-0.5 text-[13px] font-bold">{s.v}</div>
          </div>
        ))}
      </div>
    </GlassCard>
  );
}

function GrowthChart() {
  const line =
    "M0 96 C 30 90, 40 70, 70 74 S 120 58, 150 48 S 210 40, 240 22 S 300 18, 330 8";
  const area = `${line} L360 8 L360 120 L0 120 Z`;
  return (
    <svg viewBox="0 0 360 120" className="mt-3 h-20 w-full" preserveAspectRatio="none">
      <defs>
        <linearGradient id="tnArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
        </linearGradient>
        <linearGradient id="tnStroke" x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor="var(--accent)" />
          <stop offset="100%" stopColor="var(--accent-2)" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#tnArea)" />
      <motion.path
        d={line}
        fill="none"
        stroke="url(#tnStroke)"
        strokeWidth="2.5"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        whileInView={{ pathLength: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 1.2, ease: "easeInOut" }}
      />
      <motion.circle
        r="4"
        cx="330"
        cy="8"
        fill="var(--accent-2)"
        initial={{ opacity: 0, scale: 0 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 1.1, duration: 0.4 }}
        style={{ filter: "drop-shadow(0 0 6px var(--accent-2))" }}
      />
    </svg>
  );
}

function FloatingChip({
  className = "",
  icon: Icon,
  value,
  label,
  tone,
  delay = 0,
}: {
  className?: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  value: string;
  label: string;
  tone: "good" | "accent";
  delay?: number;
}) {
  const color = tone === "good" ? "var(--good)" : "var(--accent)";
  return (
    <motion.div
      aria-hidden
      initial={{ opacity: 0, y: 12, scale: 0.9 }}
      whileInView={{ opacity: 1, y: 0, scale: 1 }}
      viewport={{ once: true }}
      transition={{ delay, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={`pointer-events-none z-10 items-center gap-2.5 rounded-2xl px-3.5 py-2.5 ${className}`}
      style={{
        background: "color-mix(in srgb, var(--bg-1) 80%, transparent)",
        border: "1px solid color-mix(in srgb, var(--accent) 20%, transparent)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        boxShadow: CARD_SHADOW,
      }}
    >
      <span
        className="flex h-8 w-8 items-center justify-center rounded-lg"
        style={{ background: `color-mix(in srgb, ${color} 16%, transparent)` }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </span>
      <span className="leading-tight">
        <span className="block text-[15px] font-bold" style={{ color }}>
          {value}
        </span>
        <span className="block text-[10px] uppercase tracking-wider text-mute">{label}</span>
      </span>
    </motion.div>
  );
}

/* --------------------------- NEWSLETTER --------------------------- */

function NewsletterPanel() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
        body: JSON.stringify({ email, phone: phone || undefined, source: "home-strip" }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDone(true);
    } catch {
      setError("Something went wrong — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <GlassCard className="p-5" gradientBorder>
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em]" style={{ color: "var(--accent)" }}>
          Get Our Newsletter
        </span>
        <span
          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: "var(--good)", background: "color-mix(in srgb, var(--good) 14%, transparent)" }}
        >
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--good)" }} />
          100% Free
        </span>
      </div>

      <h3 className="mt-2 text-[18px] font-semibold leading-tight tracking-tight sm:text-[20px]">
        Subscribe to the Daily Insider Score Digest.
      </h3>

      {done ? (
        <div
          className="mt-5 flex items-center gap-3 rounded-xl px-4 py-4"
          role="status"
          aria-live="polite"
          style={{
            background: "color-mix(in srgb, var(--good) 12%, transparent)",
            border: "1px solid color-mix(in srgb, var(--good) 35%, transparent)",
          }}
        >
          <CheckCircle2 className="h-5 w-5" style={{ color: "var(--good)" }} />
          <span className="text-[14px] font-semibold">You&rsquo;re subscribed — check your inbox.</span>
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="mt-4 space-y-2.5">
          <Field
            icon={Mail}
            type="email"
            required
            value={email}
            onChange={setEmail}
            onValidate={validateEmail}
            placeholder="Enter your email address here"
            label="Email address"
            invalid={!!emailError}
          />
          {emailError && (
            <p className="-mt-1 text-[12px]" style={{ color: "var(--bad)" }} aria-live="polite">
              {emailError}
            </p>
          )}
          <Field
            icon={Phone}
            type="tel"
            value={phone}
            onChange={setPhone}
            placeholder="Enter your phone number here (optional)"
            label="Phone number"
          />

          <motion.button
            type="submit"
            disabled={submitting}
            whileHover={submitting ? undefined : { y: -2 }}
            whileTap={submitting ? undefined : { scale: 0.99 }}
            className="mt-1 w-full rounded-xl py-3 text-[14px] font-bold uppercase tracking-wide"
            style={{
              background: submitting ? "var(--bg-3)" : ACCENT_GRADIENT,
              color: submitting ? "var(--text-mute)" : "var(--on-accent)",
              cursor: submitting ? "default" : "pointer",
              boxShadow: submitting ? "none" : ACCENT_GLOW,
            }}
          >
            {submitting ? "Submitting…" : "Subscribe Now"}
          </motion.button>

          {error && (
            <p className="text-[12px]" style={{ color: "var(--bad)" }} aria-live="polite">
              {error}
            </p>
          )}
          <div className="pt-0.5 text-center text-[11px] font-semibold uppercase tracking-wider text-mute">
            View SMS Terms
          </div>
        </form>
      )}
    </GlassCard>
  );
}

/* --------------------------- primitives --------------------------- */

function GlassCard({
  children,
  className = "",
  gradientBorder = false,
}: {
  children: React.ReactNode;
  className?: string;
  gradientBorder?: boolean;
}) {
  if (gradientBorder) {
    return (
      <div
        className="rounded-[22px]"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 55%, transparent), color-mix(in srgb, var(--accent-2) 55%, transparent))",
          padding: 1,
          boxShadow: CARD_SHADOW,
        }}
      >
        <div
          className={`rounded-[21px] ${className}`}
          style={{
            background: "color-mix(in srgb, var(--bg-1) 85%, transparent)",
            backdropFilter: "blur(16px)",
            WebkitBackdropFilter: "blur(16px)",
          }}
        >
          {children}
        </div>
      </div>
    );
  }
  return (
    <div
      className={`rounded-[22px] ${className}`}
      style={{
        background: "color-mix(in srgb, var(--bg-1) 82%, transparent)",
        border: "1px solid var(--border)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        boxShadow: CARD_SHADOW,
      }}
    >
      {children}
    </div>
  );
}

function Field({
  icon: Icon,
  type,
  value,
  onChange,
  onValidate,
  placeholder,
  label,
  required,
  invalid,
}: {
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  type: string;
  value: string;
  onChange: (v: string) => void;
  onValidate?: () => void;
  placeholder: string;
  label: string;
  required?: boolean;
  invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <span
        className="flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 transition-shadow"
        style={{
          background: "color-mix(in srgb, var(--bg-2) 75%, transparent)",
          border: `1px solid ${invalid ? "var(--bad)" : "var(--border-strong)"}`,
        }}
        onFocus={(e) => {
          e.currentTarget.style.boxShadow = FOCUS_RING;
          if (!invalid) e.currentTarget.style.borderColor = "var(--accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.boxShadow = "none";
          if (!invalid) e.currentTarget.style.borderColor = "var(--border-strong)";
        }}
      >
        <Icon className="h-[18px] w-[18px] flex-shrink-0" style={{ color: "var(--text-mute)" }} />
        <input
          type={type}
          required={required}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onValidate}
          placeholder={placeholder}
          aria-invalid={invalid}
          className="w-full bg-transparent text-[14.5px] outline-none"
          style={{ color: "var(--text)" }}
        />
      </span>
    </label>
  );
}
