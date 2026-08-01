"use client";
import Link from "next/link";
import { BacktestPanel } from "@/components/backtest/BacktestPanel";
import {
  ArrowLeft,
  BookOpen,
  LineChart,
  Eye,
  Search,
  Scale,
  Compass,
  Users,
  Crown,
  TrendingUp,
} from "lucide-react";

const WHAT_TO_LOOK_FOR = [
  {
    icon: Users,
    title: "Cluster buys",
    body: "Several insiders buying around the same time is a far stronger signal than a single purchase. When the CEO, CFO and multiple directors all buy within weeks, it reflects shared conviction.",
  },
  {
    icon: Crown,
    title: "Senior roles",
    body: "Who is buying matters. A CEO, CFO or COO has the clearest view of the business, so their purchases carry more weight than those of a junior insider.",
  },
  {
    icon: Scale,
    title: "Size relative to market cap",
    body: "A $5M buy is enormous for a $50M company but barely registers for a $500B giant. Judging the dollar amount against company size separates meaningful moves from rounding errors.",
  },
  {
    icon: TrendingUp,
    title: "How much they grew their stake",
    body: "An insider who doubles their personal holdings is making a real financial commitment — a much stronger signal than a small top-up on an already-large position.",
  },
];

export default function LearnInsiderBuyingPage() {
  return (
    <div className="max-w-3xl mx-auto">
      <Link
        href="/"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to dashboard
      </Link>

      {/* Header */}
      <div
        className="text-[11px] font-bold uppercase tracking-wider mb-2"
        style={{ color: "var(--accent)", letterSpacing: "0.14em" }}
      >
        Guide
      </div>
      <h1
        className="font-bold tracking-tight"
        style={{ fontSize: "clamp(28px,4vw,40px)", letterSpacing: "-0.6px" }}
      >
        Intro to Insider Buying
      </h1>
      <p className="mt-4 text-[16px] leading-relaxed text-soft">
        A plain-English guide to what insider buying is, why open-market
        purchases can be a meaningful signal, and how to read the activity for
        yourself.
      </p>

      {/* What is insider buying? */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <BookOpen className="h-5 w-5" />
          </span>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 22 }}>
            What is insider buying?
          </h2>
        </div>
        <p className="text-[15px] text-soft leading-relaxed">
          An <strong className="text-[var(--text)]">insider</strong> is a
          person with a close view of a company&apos;s business — typically its
          officers (CEOs, CFOs and other senior executives), members of the
          board of directors, and anyone who owns more than 10% of the
          company&apos;s shares.
        </p>
        <p className="mt-3 text-[15px] text-soft leading-relaxed">
          <strong className="text-[var(--text)]">Insider buying</strong> is
          when one of these people buys their own company&apos;s stock on the
          open market — the same exchange any ordinary investor uses, with their
          own money. Because insiders have a duty to be transparent, every such
          trade must be reported to the U.S. Securities and Exchange Commission
          (SEC) on a <strong className="text-[var(--text)]">Form 4</strong>{" "}
          within two business days. Those filings are public, which is what
          makes this activity possible to track at all.
        </p>
      </section>

      {/* Backtest — the premise tested on our own filing history */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <LineChart className="h-5 w-5" />
          </span>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 22 }}>
            Does it actually work? A backtest
          </h2>
        </div>
        <p className="text-[15px] text-soft leading-relaxed mb-5">
          Rather than take the premise on trust, we tested it on our own filing
          archive. The rules are deliberately crude — no scoring model, no
          discretion — so the result reflects the raw signal: each week, buy the
          ten companies with the most insider buying behind them, equally
          weighted, and hold for a week.
        </p>
        <BacktestPanel />
      </section>

      {/* Why it matters */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Eye className="h-5 w-5" />
          </span>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 22 }}>
            Why it matters
          </h2>
        </div>
        <p className="text-[15px] text-soft leading-relaxed">
          The classic framing comes from investor Peter Lynch:{" "}
          <em>
            insiders may sell their shares for any number of reasons, but they
            generally buy for only one
          </em>{" "}
          — they expect the stock to be worth more later. Selling can be
          explained by taxes, diversification, a house, a divorce or simple
          cash needs. A purchase puts an insider&apos;s own money at risk in the
          one stock they understand best.
        </p>
        <p className="mt-3 text-[15px] text-soft leading-relaxed">
          The important distinction is that the meaningful signal comes from{" "}
          <strong className="text-[var(--text)]">open-market buys</strong> —
          discretionary purchases an insider chose to make. It does{" "}
          <em>not</em> come from shares received as compensation, such as stock
          grants or exercised options, which arrive on a schedule regardless of
          how the insider feels about the price.
        </p>
      </section>

      {/* What to look for */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Search className="h-5 w-5" />
          </span>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 22 }}>
            What to look for
          </h2>
        </div>
        <p className="text-[15px] text-soft leading-relaxed">
          Not all insider buys are equal. A few characteristics tend to make a
          purchase more meaningful:
        </p>

        <div className="mt-5 space-y-4">
          {WHAT_TO_LOOK_FOR.map((item) => {
            const Icon = item.icon;
            return (
              <div
                key={item.title}
                className="rounded-lg p-5"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg flex-shrink-0"
                    style={{
                      background: "var(--accent-soft)",
                      color: "var(--accent)",
                    }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <h3 className="font-bold tracking-tight" style={{ fontSize: 17 }}>
                    {item.title}
                  </h3>
                </div>
                <p className="text-[14px] text-soft leading-relaxed">
                  {item.body}
                </p>
              </div>
            );
          })}
        </div>

        <div
          className="mt-5 rounded-lg p-5"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 9%, var(--bg-2)) 0%, var(--bg-2) 100%)",
            border: "1px solid var(--border)",
            borderLeft: "4px solid var(--accent)",
          }}
        >
          <p className="text-[14px] text-soft leading-relaxed">
            These four characteristics are exactly what our{" "}
            <strong className="text-[var(--text)]">
              Insider Score
            </strong>{" "}
            captures — a single 0–100 number that combines the size, intensity
            and significance of insider purchases so you don&apos;t have to weigh
            them by hand. See live scores in the{" "}
            <Link href="/companies" className="text-accent font-semibold underline">
              Insider Score rankings
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Buys vs. sells */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Scale className="h-5 w-5" />
          </span>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 22 }}>
            Buys vs. sells
          </h2>
        </div>
        <p className="text-[15px] text-soft leading-relaxed">
          Insider <strong className="text-[var(--text)]">sells</strong> are
          noisy. Much insider selling is automatic and planned in advance — for
          example through pre-arranged trading plans — or simply reflects an
          executive turning a slice of their compensation into cash for reasons
          that have nothing to do with the company&apos;s prospects. A sale tells
          you very little on its own.
        </p>
        <p className="mt-3 text-[15px] text-soft leading-relaxed">
          Insider <strong className="text-[var(--text)]">buys</strong> are
          cleaner. An insider voluntarily adding to their position, with their
          own after-tax money, is choosing to increase their exposure to a stock
          they could just as easily leave alone. That is why open-market buying
          is treated as the signal, and selling mostly as background noise.
        </p>
      </section>

      {/* How to use InsiderBuying.com */}
      <section className="mt-10">
        <div className="flex items-center gap-3 mb-3">
          <span
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0"
            style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            <Compass className="h-5 w-5" />
          </span>
          <h2 className="font-bold tracking-tight" style={{ fontSize: 22 }}>
            How to use InsiderBuying.com
          </h2>
        </div>
        <p className="text-[15px] text-soft leading-relaxed">
          We turn live SEC Form 4 filings into something you can actually scan.
          A good starting point:
        </p>
        <ul className="mt-4 space-y-3">
          <li className="flex gap-2.5 text-[15px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span>
              <Link href="/companies" className="text-accent font-semibold underline">
                Insider Score rankings
              </Link>{" "}
              — every company sorted by the strength of its current insider
              buying, strongest signals first.
            </span>
          </li>
          <li className="flex gap-2.5 text-[15px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span>
              <Link href="/stock-lists" className="text-accent font-semibold underline">
                Stock lists
              </Link>{" "}
              — curated groupings such as cluster buys and CEO buying, so you
              can browse by theme rather than one ticker at a time.
            </span>
          </li>
          <li className="flex gap-2.5 text-[15px] text-soft leading-relaxed">
            <span className="text-accent font-bold flex-shrink-0">•</span>
            <span>
              <strong className="text-[var(--text)]">Per-company Form 4 activity</strong>{" "}
              — open any company to see the underlying filings: who bought, what
              role they hold, how many shares, and how their stake changed.
            </span>
          </li>
        </ul>
      </section>

      {/* Disclaimer */}
      <p className="mt-10 text-[12px] text-mute leading-relaxed">
        Informational only — not investment advice. Insider buying is one signal
        among many and does not guarantee future performance. Always do your own
        research before making any investment decision.
      </p>

      {/* CTA */}
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/companies" className="btn-primary">
          See the live Insider Score rankings
        </Link>
      </div>
    </div>
  );
}
