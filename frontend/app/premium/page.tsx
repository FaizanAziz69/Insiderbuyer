"use client";
import Link from "next/link";
import { Check, Sparkles } from "lucide-react";

const FEATURES = [
  "Full insider rankings (no row cap)",
  "Real-time email & Telegram alerts",
  "Custom screener filters (save unlimited)",
  "Insider track-record accuracy %",
  "AI-generated market analysis & articles",
  "Sector rotation & confidence index charts",
  "Watchlist with unlimited tickers",
  "API access (5,000 requests / day)",
];

export default function PremiumPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <header className="text-center mb-8">
        <div
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider text-white mb-4"
          style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
        >
          <Sparkles className="h-3 w-3" />
          Premium
        </div>
        <h1 className="text-[32px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          Unlock the full picture
        </h1>
        <p className="text-soft mt-3 max-w-xl mx-auto">
          The free tier is a teaser. Premium gives you the screener, alerts, full rankings, and the
          AI-generated analysis layer that turns insider noise into signal.
        </p>
      </header>

      <div className="card p-8 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl"
          style={{ background: "color-mix(in srgb, var(--accent) 30%, transparent)" }}
        />
        <div className="relative">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-5xl font-bold tracking-tight">$29</span>
            <span className="text-mute">/ month</span>
          </div>
          <div className="text-sm text-mute mb-7">Cancel anytime · 7-day free trial</div>

          <ul className="space-y-3 mb-7">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3">
                <span
                  className="h-5 w-5 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ background: "var(--good-soft)", color: "var(--good)" }}
                >
                  <Check className="h-3 w-3" strokeWidth={3} />
                </span>
                <span className="text-soft text-[15px]">{f}</span>
              </li>
            ))}
          </ul>

          <Link
            href="#"
            className="btn-primary w-full"
            style={{ padding: "12px 16px", fontSize: 15 }}
          >
            Start 7-day free trial
          </Link>
          <div className="text-center text-[11px] text-mute mt-3">
            Payments processing coming soon. No charges yet.
          </div>
        </div>
      </div>
    </div>
  );
}
