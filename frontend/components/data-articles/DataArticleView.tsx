"use client";

/**
 * Data article template — Developer Project Brief (Aug 24 2026), §3.1:
 *
 *  Category breadcrumb → question-style H1 → dek → byline with "LIVE —
 *  refreshes weekly" pill → interactive chart module → "The numbers that
 *  matter" takeaway box → 6–10 short body sections → pull quote → "What it
 *  means for you" (segmented by reader type) → Premium CTA → compliance footer.
 *
 * Text sections arrive from the CMS (already {{filled}} from live data); the
 * chart module is locked to its endpoint. "Updated" renders from the data
 * refresh timestamp, never from an editor's save.
 */

import { useCallback, useState } from "react";
import Link from "next/link";
import { RankedBarChart, type ChartPayload } from "./RankedBarChart";
import { ListArticleModule } from "./ListArticleModule";
import { ComplianceFooter } from "@/components/ComplianceFooter";
import { SUBSCRIBE_HREF } from "@/lib/funnel";

export interface DataArticle {
  slug: string;
  headline: string;
  dek: string;
  category: string;
  refresh: "weekly" | "monthly" | "quarterly";
  chart:
    | "insider-buys"
    | "insider-sells"
    | "analysts"
    | "hedge-funds"
    | "congress-proximity"
    | "congress-flags"
    // George 2026-09-23 — the list articles.
    | "market-lows"
    | "market-highs"
    | "insider-buys-ytd"
    | "analyst-targets"
    | "ipos-ytd"
    | "hedge-funds-ytd";
  periods: string[];
  sections: {
    takeaways: string[];
    body: Array<{ heading: string; html: string }>;
    pullQuote: { text: string; attribution: string };
    whatItMeans: Array<{ audience: string; text: string }>;
    cta: { headline: string; body: string };
  };
  refreshedAt: string | null;
  asOf: string | null;
  /** Null since the client removed the methodology surface on 2026-09-15
   *  ("hum kabhi bhi methodology user ko nai dekhayein gay"). Kept on the
   *  type so an older cached payload still parses. */
  methodologyUrl: string | null;
}

const REFRESH_LABEL = { weekly: "refreshes weekly", monthly: "refreshes monthly", quarterly: "refreshes quarterly" } as const;
const CHART_TITLE: Partial<Record<DataArticle["chart"], string>> = {
  "insider-buys": "Top 10 stocks by open-market insider purchases",
  "insider-sells": "Top 10 stocks by insider sales",
  analysts: "Top 10 analysts by hit rate",
  "hedge-funds": "Top 10 managers by trailing-12-month return",
  "congress-proximity": "Members of Congress holding stocks their committees' agencies awarded",
  "congress-flags": "Committee and contract flags, newest first",
  "market-lows": "Trading at a 52-week low",
  "market-highs": "Trading at a 52-week high",
  "insider-buys-ytd": "The largest open-market insider buys of the year",
  "analyst-targets": "The widest gaps to consensus price targets",
  "ipos-ytd": "This year's listings, ranked by return from the offer price",
  "hedge-funds-ytd": "Top managers by return on disclosed 13F longs, year to date",
};
const CHART_SUBTITLE: Partial<Record<DataArticle["chart"], string>> = {
  "insider-buys": "Form 4 code P only — 10b5-1 plan buys, option exercises and awards excluded",
  "insider-sells": "Form 4 code S — filter planned 10b5-1 sales from discretionary ones",
  analysts: "Directional hit rate on calls at least 30 days old; 20 graded calls minimum, ranked on the sample-adjusted lower bound",
  "hedge-funds": "Value-weighted return of disclosed 13F long positions, rebalanced at filing dates",
  "congress-proximity": "Verified committee-to-contract links only",
  "congress-flags": "Verified committee-to-contract links only",
  "market-lows": "Every NYSE, NASDAQ and AMEX company above $2bn, within 3% of its lowest price in a year — ranked by the year-to-date move",
  "market-highs": "Every NYSE, NASDAQ and AMEX company above $2bn, within 3% of its highest price in a year — ranked by the year-to-date move",
  "insider-buys-ytd": "Discretionary open-market purchases (Form 4 code P) since January 1",
  "analyst-targets": "Average of targets published in the last 180 days; at least four analysts per name",
  "ipos-ytd": "Return measured from the offer price, not the first public trade",
  "hedge-funds-ytd": "Value-weighted return of disclosed long positions, rebalanced at each filing date and repriced live",
};

/** George's list articles render the table and the per-stock breakdown; the
 *  original four keep the ranked bar module they launched with. */
const LIST_CHARTS = new Set<DataArticle["chart"]>(["market-lows", "market-highs", "insider-buys-ytd", "analyst-targets", "ipos-ytd"]);

function fmtLong(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function DataArticleView({ article }: { article: DataArticle }) {
  const [updated, setUpdated] = useState<string | null>(article.refreshedAt);
  const onLoaded = useCallback((p: ChartPayload) => setUpdated(p.refreshedAt), []);
  const s = article.sections;

  return (
    <article className="w-full max-w-[860px] mx-auto space-y-7" itemScope itemType="https://schema.org/Article">
      {/* Breadcrumb */}
      <nav aria-label="Breadcrumb" className="text-[12px] font-semibold uppercase tracking-[1.6px]" style={{ color: "var(--text-mute)" }}>
        <Link href="/data" className="hover:underline">
          Data
        </Link>
        <span className="mx-2" aria-hidden>
          /
        </span>
        <span style={{ color: "var(--accent)" }}>{article.category}</span>
      </nav>

      <header className="space-y-3">
        <h1 className="text-[30px] sm:text-[40px] font-bold leading-[1.1] tracking-tight" style={{ fontFamily: "var(--font-display)" }} itemProp="headline">
          {article.headline}
        </h1>
        <p className="text-[16px] sm:text-[18px] leading-relaxed" style={{ color: "var(--text-soft)" }} itemProp="description">
          {article.dek}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[12.5px]" style={{ color: "var(--text-mute)" }}>
          <span>
            By <span itemProp="author">InsiderBuying.com Data Desk</span>
          </span>
          <span aria-hidden>·</span>
          <span>
            Updated <time dateTime={updated ?? undefined} itemProp="dateModified">{fmtLong(updated)}</time>
          </span>
          <span
            className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-[3px] font-mono text-[11px] font-semibold uppercase tracking-wide"
            style={{ background: "var(--good-soft)", color: "var(--good-strong)", border: "1px solid var(--good)" }}
          >
            <span className="relative flex w-2 h-2">
              <span className="absolute inline-flex w-full h-full rounded-full opacity-60 motion-safe:animate-ping" style={{ background: "var(--good)" }} />
              <span className="relative inline-flex w-2 h-2 rounded-full" style={{ background: "var(--good)" }} />
            </span>
            Live — {REFRESH_LABEL[article.refresh]}
          </span>
        </div>
      </header>

      {/* Locked data module: the visual, plus the per-stock breakdown on list articles */}
      {LIST_CHARTS.has(article.chart) ? (
        <ListArticleModule
          slug={article.slug}
          period={article.periods[0]}
          title={CHART_TITLE[article.chart] ?? article.headline}
          subtitle={CHART_SUBTITLE[article.chart] ?? ""}
          onLoaded={onLoaded}
        />
      ) : (
        <RankedBarChart
          slug={article.slug}
          chart={article.chart}
          periods={article.periods}
          title={CHART_TITLE[article.chart] ?? article.headline}
          subtitle={CHART_SUBTITLE[article.chart] ?? ""}
          onLoaded={onLoaded}
        />
      )}

      {/* Key takeaways */}
      <aside className="rounded-xl p-4 sm:p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)", borderLeft: "4px solid #C9A227" }} aria-labelledby="takeaways-h">
        <h2 id="takeaways-h" className="font-mono text-[11.5px] font-semibold uppercase tracking-[1.6px] mb-3" style={{ color: "var(--text-mute)" }}>
          The numbers that matter
        </h2>
        <ul className="space-y-2">
          {s.takeaways.map((t, i) => (
            <li key={i} className="flex gap-3 text-[14.5px] leading-snug">
              <span className="font-mono text-[12px] font-bold mt-[3px] shrink-0" style={{ color: "#C9A227" }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              <span dangerouslySetInnerHTML={{ __html: t }} />
            </li>
          ))}
        </ul>
      </aside>

      {/* Body sections */}
      <div className="space-y-6 article-body" itemProp="articleBody">
        {s.body.map((b, i) => (
          <section key={i}>
            <h2 className="text-[20px] sm:text-[22px] font-bold leading-tight mb-2" style={{ fontFamily: "var(--font-display)" }}>
              {b.heading}
            </h2>
            <div className="text-[15.5px] leading-[1.7] space-y-3 [&_a]:underline [&_a]:font-semibold" style={{ color: "var(--text)" }} dangerouslySetInnerHTML={{ __html: b.html }} />
          </section>
        ))}
      </div>

      {/* Pull quote */}
      <blockquote className="py-2 pl-5 sm:pl-6" style={{ borderLeft: "4px solid var(--brand-surface)" }}>
        <p className="text-[20px] sm:text-[24px] font-semibold leading-snug" style={{ fontFamily: "var(--font-display)" }}>
          &ldquo;{s.pullQuote.text}&rdquo;
        </p>
        <footer className="mt-2 font-mono text-[12px] uppercase tracking-wide" style={{ color: "var(--text-mute)" }}>
          — {s.pullQuote.attribution}
        </footer>
      </blockquote>

      {/* What it means for you */}
      <aside className="rounded-xl p-4 sm:p-5" style={{ background: "var(--accent-soft)", border: "1px solid var(--border)" }} aria-labelledby="wimfy-h">
        <h2 id="wimfy-h" className="font-mono text-[11.5px] font-semibold uppercase tracking-[1.6px] mb-3" style={{ color: "var(--accent)" }}>
          What it means for you
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {s.whatItMeans.map((w, i) => (
            <div key={i} className="rounded-lg p-3" style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)" }}>
              <div className="text-[12px] font-bold uppercase tracking-wide mb-1" style={{ color: "var(--text-soft)" }}>
                {w.audience}
              </div>
              <p className="text-[13.5px] leading-relaxed" dangerouslySetInnerHTML={{ __html: w.text }} />
            </div>
          ))}
        </div>
      </aside>

      {/* Premium CTA */}
      {/* Brand surface (navy in both themes) with every text colour set explicitly —
          the heading used to inherit the page text colour and vanished in light mode,
          then used --on-accent, which is near-black in dark mode (dark-on-dark). */}
      <section
        className="rounded-2xl p-5 sm:p-7 flex flex-col sm:flex-row sm:items-center gap-4"
        style={{ background: "var(--brand-surface)", border: "1px solid var(--brand-surface-border)", color: "var(--on-brand-surface)" }}
        aria-labelledby="cta-h"
      >
        <div className="flex-1 min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[1.6px] mb-1.5" style={{ color: "var(--gold)" }}>
            Premium · $199 / year
          </div>
          <h2 id="cta-h" className="text-[20px] sm:text-[24px] font-bold leading-tight" style={{ fontFamily: "var(--font-display)", color: "var(--on-brand-surface)" }}>
            {s.cta.headline}
          </h2>
          <p className="mt-2 text-[14px] leading-relaxed" style={{ color: "var(--on-brand-surface)", opacity: 0.82 }} dangerouslySetInnerHTML={{ __html: s.cta.body }} />
        </div>
        <Link
          href={SUBSCRIBE_HREF}
          className="shrink-0 inline-flex items-center justify-center rounded-lg px-5 py-3 font-bold text-[14.5px] transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--good)", color: "#fff" }}
        >
          See Premium plans →
        </Link>
      </section>

      <ComplianceFooter methodology={article.methodologyUrl} />
    </article>
  );
}
