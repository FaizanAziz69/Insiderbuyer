"use client";
import Link from "next/link";
import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { API_BASE } from "@/lib/api";

const TRIAL_BULLETS = [
  "Automated portfolio monitoring with IQS alerts",
  "Daily stock ideas drawn from insider activity",
  "Stock screeners and Form 4 research tools",
];

export function TrialAndNewsletterStrip() {
  return (
    <section className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4 lg:gap-6">
      <TrialCard />
      <NewsletterCard />
    </section>
  );
}

function TrialCard() {
  return (
    <div
      className="rounded-lg p-6 sm:p-8"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start">
        <div>
          <div
            className="eyebrow mb-3"
            style={{
              color: "var(--accent)",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.08em",
            }}
          >
            EMPOWERING INVESTORS
          </div>
          <h2
            className="text-[26px] sm:text-[34px] font-semibold tracking-tight leading-tight"
            style={{ letterSpacing: "-0.01em" }}
          >
            Try Insider Buying Premium free for 30 days.
          </h2>
          <div
            className="mt-3 h-[3px] w-[34px]"
            style={{ background: "var(--accent)" }}
          />
          <ul className="mt-5 space-y-3">
            {TRIAL_BULLETS.map((b) => (
              <li key={b} className="flex items-start gap-2.5 text-[15px]">
                <CheckCircle2
                  className="h-5 w-5 mt-0.5 flex-shrink-0"
                  style={{ color: "var(--accent)" }}
                  strokeWidth={2.4}
                />
                <span className="text-soft">{b}</span>
              </li>
            ))}
          </ul>
          <Link
            href="/premium"
            className="btn-hover inline-flex items-center justify-center mt-6 px-8 py-4 rounded-md uppercase"
            style={{
              background: "var(--gold)",
              color: "#1a1300",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              minWidth: 240,
            }}
          >
            Begin Your Free Trial
          </Link>
        </div>
        <div className="hidden sm:block">
          <TrialIllustration />
        </div>
      </div>
    </div>
  );
}

function NewsletterCard() {
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
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
        body: JSON.stringify({
          email,
          phone: phone || undefined,
          source: "home-strip",
        }),
      });
      if (!res.ok) throw new Error(`Status ${res.status}`);
      setDone(true);
    } catch (err: any) {
      setError(err?.message || "Submission failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="rounded-lg p-6 sm:p-8"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="eyebrow mb-3"
        style={{
          color: "var(--accent)",
          fontSize: "0.95rem",
          fontWeight: 700,
          letterSpacing: "0.08em",
        }}
      >
        GET OUR NEWSLETTER
      </div>
      <h2
        className="text-[26px] sm:text-[34px] font-semibold tracking-tight leading-tight"
        style={{ letterSpacing: "-0.01em" }}
      >
        Subscribe to the Daily IQS Digest. 100% free.
      </h2>
      <div
        className="mt-3 h-[3px] w-[34px]"
        style={{ background: "var(--accent)" }}
      />

      {done ? (
        <div className="mt-6 inline-flex items-center gap-2 text-[14px] font-semibold text-good">
          <CheckCircle2 className="h-5 w-5" />
          You&rsquo;re subscribed — check your inbox.
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 space-y-3">
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="Enter your email address here"
            className="w-full px-4 py-3 rounded-md text-[14px]"
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
            }}
          />
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Enter your phone number here (optional)"
            className="w-full px-4 py-3 rounded-md text-[14px]"
            style={{
              background: "var(--bg-1)",
              border: "1px solid var(--border-strong)",
              color: "var(--text)",
            }}
          />
          <button
            type="submit"
            disabled={submitting}
            className="btn-hover w-full py-4 rounded-md uppercase"
            style={{
              background: submitting ? "var(--bg-3)" : "var(--accent)",
              color: submitting ? "var(--text-mute)" : "var(--on-accent)",
              fontSize: "0.95rem",
              fontWeight: 700,
              letterSpacing: "0.06em",
              cursor: submitting ? "default" : "pointer",
            }}
          >
            {submitting ? "Submitting…" : "Subscribe Now"}
          </button>
          {error && (
            <div className="text-[12px] text-[var(--bad)] text-center">
              {error}
            </div>
          )}
          <div className="text-[11px] text-mute text-center uppercase tracking-wider font-semibold">
            View SMS Terms
          </div>
        </form>
      )}
    </div>
  );
}

/** Tiny inline SVG mock that hints at the "product illustration" panel on the right. */
function TrialIllustration() {
  return (
    <svg viewBox="0 0 240 200" className="w-full h-auto" aria-hidden>
      <defs>
        <linearGradient id="bar1" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.9" />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.6" />
        </linearGradient>
      </defs>
      {/* Back card */}
      <rect
        x="20"
        y="30"
        width="160"
        height="140"
        rx="8"
        fill="var(--bg-1)"
        stroke="var(--border)"
      />
      <rect x="32" y="42" width="100" height="6" rx="2" fill="var(--bg-3)" />
      <rect x="32" y="54" width="60" height="4" rx="2" fill="var(--bg-3)" />
      {/* Chart bars */}
      {Array.from({ length: 10 }).map((_, i) => {
        const h = 12 + ((i * 13) % 56);
        return (
          <rect
            key={i}
            x={36 + i * 13}
            y={150 - h}
            width="9"
            height={h}
            rx="2"
            fill={i % 3 === 0 ? "var(--gold)" : "url(#bar1)"}
          />
        );
      })}
      {/* Floating watchlist card */}
      <rect
        x="120"
        y="20"
        width="100"
        height="60"
        rx="8"
        fill="var(--bg-2)"
        stroke="var(--border-strong)"
      />
      <text
        x="130"
        y="38"
        fontFamily="var(--font-sans)"
        fontSize="10"
        fontWeight="600"
        fill="var(--text)"
      >
        Watchlists
      </text>
      <rect x="130" y="44" width="46" height="3" rx="1" fill="var(--bg-3)" />
      <rect x="130" y="51" width="60" height="3" rx="1" fill="var(--bg-3)" />
      <rect x="130" y="58" width="38" height="3" rx="1" fill="var(--bg-3)" />
      <circle cx="200" cy="58" r="10" fill="var(--accent)" opacity="0.18" />
      <circle cx="200" cy="58" r="6" fill="var(--accent)" />
      {/* IQS pill */}
      <rect
        x="140"
        y="110"
        width="84"
        height="34"
        rx="6"
        fill="var(--bg-2)"
        stroke="var(--border)"
      />
      <text
        x="148"
        y="124"
        fontFamily="var(--font-sans)"
        fontSize="8"
        fontWeight="500"
        fill="var(--text-mute)"
      >
        IQS Score
      </text>
      <text
        x="148"
        y="138"
        fontFamily="var(--font-sans)"
        fontSize="14"
        fontWeight="700"
        fill="var(--accent)"
      >
        4.86
      </text>
      <text
        x="186"
        y="138"
        fontFamily="var(--font-sans)"
        fontSize="9"
        fontWeight="600"
        fill="var(--good)"
      >
        +1.07%
      </text>
    </svg>
  );
}
