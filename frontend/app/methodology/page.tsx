"use client";
import Link from "next/link";
import { ArrowLeft, BarChart3, Users, Crown, TrendingUp } from "lucide-react";

const FACTORS = [
  {
    icon: BarChart3,
    letter: "A",
    title: "Purchase Volume (Relative to Market Cap)",
    measures:
      "How much insiders are investing compared to the size of the company. A $5M buy is huge for a $50M company but barely moves a $500B one.",
    why: [
      "Weights large purchases in smaller companies more heavily than the same dollar amount in giants.",
      "Surfaces small companies where insiders are making outsized moves — often the best opportunities.",
    ],
  },
  {
    icon: Users,
    letter: "B",
    title: "Cluster Purchases (Are Multiple Insiders Buying?)",
    measures:
      "Whether several insiders are buying at once. A CEO buying alone is good; the CEO, CFO and multiple directors all buying within weeks is a much stronger signal.",
    why: [
      "Captures group confidence — the more insiders buying, the stronger the signal.",
      "The log keeps a single company with very many buyers from dominating the score unfairly.",
    ],
  },
  {
    icon: Crown,
    letter: "C",
    title: "Insider Role Weighting (Who Is Buying Matters)",
    measures:
      "Not all insiders carry the same weight. A CEO, CFO or COO buying is far more meaningful than a director, which in turn outweighs a lower-level insider.",
    why: [
      "Prioritises the most significant purchases over those from lower-level executives.",
      "Filters out transactions less likely to move future performance.",
    ],
  },
  {
    icon: TrendingUp,
    letter: "D",
    title: "Holding Change (How Much Are Insiders Increasing Their Stake?)",
    measures:
      "How much bigger an insider's total holdings became after the purchase.",
    why: [
      "A CEO who owns 1M shares buying 10k more isn't a big deal.",
      "A CFO who owns 10k and buys 10k more just doubled their stake — a much stronger signal.",
      "Captures whether insiders are making a real financial commitment.",
    ],
  },
];

export default function MethodologyPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      <div
        className="text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{ color: "var(--accent)", letterSpacing: "0.14em" }}
      >
        Methodology
      </div>
      <h1 className="font-bold tracking-tight" style={{ fontSize: "clamp(28px,4vw,40px)", letterSpacing: "-0.6px" }}>
        How We Calculate the Insider Score
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-soft">
        The Insider Score is a single 0–100 number that combines multiple factors to
        measure how strong insider buying activity is for a company. We calculate
        four key factors that capture the <strong>size, intensity, and
        significance</strong> of insider purchases, then combine them into a
        final score that ranks companies from strongest to weakest insider-buying
        signals.
      </p>

      <div className="mt-8 space-y-5">
        {FACTORS.map((f) => {
          const Icon = f.icon;
          return (
            <section
              key={f.letter}
              className="rounded-lg p-5"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-3 mb-2">
                <span
                  className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
                  style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                >
                  <Icon className="h-5 w-5" />
                </span>
                <h2 className="font-bold tracking-tight" style={{ fontSize: 19 }}>
                  <span className="text-accent mr-1.5">{f.letter}.</span>
                  {f.title}
                </h2>
              </div>
              <p className="text-[14px] text-soft leading-relaxed">
                <strong className="text-[var(--text)]">What it measures: </strong>
                {f.measures}
              </p>
              <ul className="mt-3 space-y-1.5">
                {f.why.map((w) => (
                  <li key={w} className="flex gap-2 text-[13px] text-soft leading-relaxed">
                    <span className="text-accent font-bold flex-shrink-0">•</span>
                    <span>{w}</span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>

      {/* Final score */}
      <section
        className="mt-6 rounded-lg p-5"
        style={{
          background:
            "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--bg-2)) 0%, var(--bg-2) 100%)",
          border: "1px solid var(--border)",
          borderLeft: "4px solid var(--accent)",
        }}
      >
        <h2 className="font-bold tracking-tight mb-2" style={{ fontSize: 20 }}>
          How the Final Score Works
        </h2>
        <p className="text-[14px] text-soft leading-relaxed">
          These four factors are combined and normalised into a single{" "}
          <strong className="text-[var(--text)]">0–100 Insider Score</strong>. The exact
          weighting and combination are part of our proprietary model, but the
          intuition is simple: the more an insider purchase reflects real
          conviction — large relative to the company, made by senior insiders,
          alongside other buyers, meaningfully growing their stake — the higher
          the score.
        </p>
        <ul className="mt-3 space-y-1.5">
          <li className="flex gap-2 text-[13px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span><strong>Higher Insider Score = stronger insider confidence.</strong></span>
          </li>
          <li className="flex gap-2 text-[13px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span>Scores update continuously as new SEC Form 4 filings come in.</span>
          </li>
        </ul>
        <p className="mt-3 text-[12px] text-mute leading-relaxed">
          We continuously analyse real data and refine the model to keep it as
          predictive and useful as possible. Informational only — not investment
          advice.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/companies" className="btn-primary">
          See the live Insider Score rankings
        </Link>
        <Link href="/screener" className="btn-secondary">
          Open the screener
        </Link>
      </div>
    </div>
  );
}
