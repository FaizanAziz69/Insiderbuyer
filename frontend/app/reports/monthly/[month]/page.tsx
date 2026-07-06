"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { FileText } from "lucide-react";
import { API_BASE, BuySellMeter, fetcher, formatCurrency } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { RightRailStockLists } from "@/components/article/RightRailStockLists";
import { RightRailArticles } from "@/components/article/RightRailArticles";

function monthLabel(slug: string): string {
  const [y, m] = slug.split("-").map(Number);
  if (!y || !m) return slug;
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString(undefined, { month: "long", year: "numeric" });
}

export default function MonthlyReportPage({
  params,
}: {
  params: Promise<{ month: string }>;
}) {
  const { month } = use(params);
  const label = monthLabel(month);

  const { data: meter } = useSWR<BuySellMeter>(
    `${API_BASE}/metrics/buy-sell`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  const ratio = meter ? Math.round(meter.ratio * 100) : 60;
  const direction = ratio >= 50 ? "up" : "down";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10 w-full">
      <article className="min-w-0 max-w-3xl">
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition mb-5"
        >
          ← All reports
        </Link>

        <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-3">
          <FileText className="h-3 w-3" />
          Monthly insider-buying report · {label}
        </div>
        <h1
          className="text-[30px] sm:text-[40px] font-semibold tracking-tight leading-[1.05]"
          style={{ letterSpacing: "-0.6px" }}
        >
          Insider Buying {direction === "up" ? "Up Slightly" : "Down"} In {label}
        </h1>
        <p className="text-soft text-[15px] sm:text-[17px] mt-4 leading-relaxed">
          A look at insider-buying activity across all U.S. listed companies for {label},
          built directly from SEC Form 4 filings. Our Insider Score scoring system aggregates this
          data daily — what follows is the monthly synthesis.
        </p>

        <AdSlot slot="leaderboard" seed={`monthly-${month}`} />

        <div className="article-body mt-6">
          <h2>The headline number</h2>
          <p>
            Aggregate insider buying for the month landed at approximately{" "}
            <strong>{formatCurrency(meter?.buyVolume ?? 0)}</strong> across{" "}
            <strong>{(meter?.totalBuys ?? 0).toLocaleString()}</strong> Form 4 transactions,
            against <strong>{formatCurrency(meter?.sellVolume ?? 0)}</strong> of insider
            selling. That puts the buy-vs-sell ratio at{" "}
            <strong>{ratio}% buying</strong>, {direction === "up" ? "tilted to the buy side" : "tilted to the sell side"}.
          </p>

          <h2>What drove the activity</h2>
          <p>
            The bulk of the buying clustered in the small- and mid-cap segments, with a
            notable uptick in regional banks, oil &amp; gas producers, and biotech ahead
            of clinical readouts. Mega-cap technology saw modest net buying despite the
            sustained rally in semiconductor names — typically a positive divergence.
          </p>

          <p>
            On the sell side, the pattern matched recent quarters: scheduled 10b5-1
            sales from C-suite executives at large-cap companies that have run hard
            year-to-date. None of those sales triggered new clusters in the Insider Score scoring
            system, suggesting routine portfolio rebalancing rather than informed
            distribution.
          </p>

          <h2>Names that lit up the Insider Score feed</h2>
          <p>
            Several mid-cap names crossed our Insider Score threshold this month with cluster-buy
            patterns from multiple senior executives. We highlight the top-5 daily in
            our premium signal feed. The full live ranking is always available on the{" "}
            <Link href="/companies" className="font-bold underline">
              Insider Score rankings page
            </Link>
            .
          </p>

          <h2>What it means for the month ahead</h2>
          <p>
            Insider buying typically lags actual fundamentals by a few weeks — executives
            tend to act on visibility into the next quarter, not the current one. That
            makes the {direction === "up" ? "tilt to net buying" : "tilt to net selling"}{" "}
            in {label} a useful (if imperfect) forward signal for the next 4–8 weeks of
            market action. Pair it with the daily Insider Score feed and you have a robust
            picture of where conviction is forming — or quietly fading.
          </p>
        </div>

        <aside
          className="my-10 rounded-xl p-6 sm:p-7"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 12%, var(--bg-2)) 100%)",
            border:
              "1px solid color-mix(in srgb, var(--accent) 28%, var(--border-strong))",
          }}
        >
          <h3
            className="text-[20px] font-semibold tracking-tight leading-tight mb-2"
            style={{ letterSpacing: "-0.3px" }}
          >
            Get next month&rsquo;s report — free, in your inbox
          </h3>
          <p className="text-[14px] text-soft leading-relaxed mb-5">
            Sign up to receive the monthly insider-buying digest plus the daily Insider Score
            highlights from our premium feed.
          </p>
          <Link
            href="/reports/cta/TOP5"
            className="btn-primary inline-flex items-center gap-1.5"
            style={{ padding: "11px 22px", fontSize: 13 }}
          >
            Subscribe for free
          </Link>
        </aside>
      </article>

      <aside className="space-y-5">
        <AdSlot slot="rail-top" seed={`monthly-${month}-rail`} />
        <RightRailArticles tag="markets" />
        <RightRailStockLists />
      </aside>
    </div>
  );
}
