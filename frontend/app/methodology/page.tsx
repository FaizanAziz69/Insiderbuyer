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
    formula: "Purchase Volume Factor = Σ(Shares Bought × Price) ÷ Market Cap",
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
    formula: "Cluster Factor = log(1 + Number of Distinct Insider Buyers)",
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
      "Not all insiders carry the same weight. A CEO or CFO buying is far more meaningful than a lower-level executive.",
    formula:
      "Role-Weighted Purchase Volume = Σ(Shares Bought × Price × Role Multiplier) ÷ Market Cap",
    multipliers: [
      ["CEO", "3.0"],
      ["CFO", "3.0"],
      ["COO", "3.0"],
      ["Director", "2.0"],
      ["Other Insiders", "1.0"],
    ],
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
    formula:
      "Holding Change % = (Shares Bought ÷ Previous Holdings) × 100   •   Factor = Σ(Holding Change %) ÷ Number of Insiders Who Bought",
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
        How We Calculate the Insider Buying Quality Score (IQS)
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-soft">
        The IQS is a single 0–100 number that combines multiple factors to
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
              <div
                className="mt-3 rounded-md px-4 py-3 font-mono text-[13px] overflow-x-auto"
                style={{ background: "var(--bg-3)", color: "var(--text)" }}
              >
                {f.formula}
              </div>
              {f.multipliers && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {f.multipliers.map(([role, mult]) => (
                    <span
                      key={role}
                      className="text-[12px] font-semibold px-2.5 py-1 rounded-full"
                      style={{ background: "var(--bg-3)", border: "1px solid var(--border-strong)" }}
                    >
                      {role} = <span className="text-accent">{mult}</span>
                    </span>
                  ))}
                </div>
              )}
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
          Final Calculation of IQS
        </h2>
        <div
          className="rounded-md px-4 py-3 font-mono text-[14px] overflow-x-auto"
          style={{ background: "var(--bg-3)", color: "var(--text)" }}
        >
          IQS = log(1 + (Purchase Volume Factor + Cluster Factor + Role-Weighted
          Purchase Volume + Holding Change Factor))
        </div>
        <ul className="mt-3 space-y-1.5">
          <li className="flex gap-2 text-[13px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span>The log transformation prevents extreme values from distorting the rankings.</span>
          </li>
          <li className="flex gap-2 text-[13px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span>The result is scaled onto a 0–100 composite. <strong>Higher IQS = stronger insider confidence.</strong></span>
          </li>
        </ul>
        <p className="mt-3 text-[12px] text-mute leading-relaxed">
          We continuously analyse real data and fine-tune this formula to keep it
          as predictive and useful as possible. Informational only — not
          investment advice.
        </p>
      </section>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/companies" className="btn-primary">
          See the live IQS rankings
        </Link>
        <Link href="/screener" className="btn-secondary">
          Open the screener
        </Link>
      </div>
    </div>
  );
}
