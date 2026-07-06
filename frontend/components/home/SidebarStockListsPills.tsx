"use client";
import Link from "next/link";
import { useState } from "react";
import { ArrowRight, Sparkles } from "lucide-react";
import { API_BASE } from "@/lib/api";

// Shared client-side email check: require a local part, a domain, and a TLD.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const isValidEmail = (v: string) => EMAIL_RE.test(v.trim());

const LIST_PILLS = [
  { slug: "metals-and-mining", label: "Metals & Mining" },
  { slug: "tech", label: "Tech" },
  { slug: "gold", label: "Gold" },
  { slug: "silver", label: "Silver" },
  { slug: "blue-chip", label: "Blue Chip" },
  { slug: "oil", label: "Oil" },
  { slug: "warren-buffett", label: "Warren Buffett" },
  { slug: "jeff-bezos", label: "Jeff Bezos" },
  { slug: "ray-dalio", label: "Ray Dalio" },
  { slug: "eric-sprott", label: "Eric Sprott" },
  { slug: "trump-family", label: "Trump Family" },
  { slug: "politicians", label: "Politicians" },
];

const TOOL_PILLS = [
  { href: "/analyst-ratings", label: "Analyst Ratings" },
  { href: "/dividends", label: "Dividends" },
  { href: "/congressional-trades", label: "Congressional Trading" },
  { href: "/earnings", label: "Earnings" },
  { href: "/trades", label: "Insider Trades" },
  { href: "/ipos", label: "IPOs" },
  { href: "/short-interest", label: "Short Interest" },
  { href: "/heatmaps/market", label: "Stock Heatmap" },
];

export function SidebarStockListsPills() {
  return (
    <aside className="space-y-6">
      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3
            className="text-[16px] font-semibold tracking-tight"
            style={{ letterSpacing: "-0.2px" }}
          >
            Stock Lists
          </h3>
          <Link
            href="/stock-lists"
            className="text-[11px] font-semibold text-accent hover:underline inline-flex items-center gap-0.5"
          >
            All lists <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="flex flex-wrap gap-2">
          {LIST_PILLS.map((p) => (
            <Link
              key={p.slug}
              href={`/stock-lists/${p.slug}`}
              className="pill-link"
            >
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between mb-3">
          <h3
            className="text-[16px] font-semibold tracking-tight"
            style={{ letterSpacing: "-0.2px" }}
          >
            More Tools
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {TOOL_PILLS.map((p) => (
            <Link key={p.href} href={p.href} className="pill-link">
              {p.label}
            </Link>
          ))}
        </div>
      </section>

      <NewsletterCard />
    </aside>
  );
}

function NewsletterCard() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
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
        body: JSON.stringify({ email, phone: phone || undefined, source: "home-rail" }),
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
    <section
      className="rounded-xl p-5"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 16%, var(--bg-2)) 100%)",
        border: "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-strong))",
      }}
    >
      <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-2">
        <Sparkles className="h-3 w-3" />
        Daily Insider Score digest
      </div>
      <h4 className="text-[18px] font-semibold tracking-tight leading-tight mb-2">
        Get the morning insider-buying recap
      </h4>
      <p className="text-[12px] text-soft leading-relaxed mb-3">
        One short email each market day — the strongest Insider Score movers, biggest Form 4 buys,
        and a snapshot of congressional disclosures.
      </p>
      {done ? (
        <div className="text-[12px] font-semibold text-good">
          You&rsquo;re on the list — check your inbox shortly.
        </div>
      ) : (
        <form onSubmit={submit} noValidate className="space-y-2">
          <div>
            <label
              className="block text-[11px] font-semibold mb-1"
              style={{ color: "var(--text-soft)" }}
            >
              Email address <span style={{ color: "var(--bad)" }}>*</span>
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={validateEmail}
              placeholder="Your email address"
              aria-invalid={!!emailError}
              className="w-full px-3 py-2 rounded-md text-[13px]"
              style={{
                background: "var(--bg-1)",
                border: emailError
                  ? "1px solid var(--bad)"
                  : "1px solid var(--border-strong)",
                color: "var(--text)",
              }}
            />
            {emailError && (
              <p
                className="mt-1.5 text-left text-[12px]"
                style={{ color: "var(--bad)" }}
              >
                {emailError}
              </p>
            )}
          </div>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="w-full px-3 py-2 rounded-md text-[13px]"
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            className="btn-hover w-full py-2.5 rounded-md font-bold uppercase tracking-wider text-[12px]"
            style={{
              background: submitting ? "var(--bg-3)" : "var(--gold)",
              color: submitting ? "var(--text-mute)" : "#1a1300",
            }}
          >
            {submitting ? "Submitting…" : "Subscribe — free"}
          </button>
          {error && (
            <p
              className="text-left text-[12px]"
              style={{ color: "var(--bad)" }}
            >
              {error}
            </p>
          )}
        </form>
      )}
    </section>
  );
}