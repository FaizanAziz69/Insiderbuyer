"use client";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, CompanyDetail, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { VizFrame, VizSkeleton } from "./VizFrame";

/**
 * §7 viz 2 — Insider Score Card. "Company | IQS Score | Score Tier | Last
 * Transaction Date."
 *
 * THE ONE PLACE AN ARTICLE MAY CARRY THE NUMBER. Prose may not: the score is
 * premium on every other product surface, the publish route strips it out of
 * body text, and `sanitizeArticleHtml` masks it at render for stored articles.
 * Here it goes through `PremiumValue` — the same gate the stock tables use —
 * so a subscriber reads the number and everyone else reads the tier and a
 * lock. That is how §7's "remind readers we have data they cannot get
 * elsewhere" and the paywall both hold at once.
 *
 * `data-viz="iqs-card" data-ticker="CCJ"`
 */

/** The scoring engine's own band boundaries — kept in step with `iqsBand` in
 *  content-generator.service.ts and `bandFor` in sanitizeArticleHtml.ts. */
function tierFor(iqs: number): { label: string; color: string } {
  if (iqs >= 80) return { label: "Exceptional — top tier", color: "var(--good)" };
  if (iqs >= 70) return { label: "Very strong signal", color: "var(--good)" };
  if (iqs >= 60) return { label: "Strong signal", color: "var(--accent-2)" };
  if (iqs >= 45) return { label: "Moderate signal", color: "var(--gold)" };
  return { label: "Emerging signal", color: "var(--text-mute)" };
}

export function IqsScoreCardViz({ ticker }: { ticker: string }) {
  const sym = ticker.toUpperCase();
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  if (isLoading && !data) return <VizSkeleton height={150} />;
  const score = data?.score;
  if (!data?.company || !score) return null;

  const iqs = Number(score.iqs);
  const tier = tierFor(iqs);
  const purchases = (data.transactions || []).filter((t) => t.transactionCode === "P");
  const lastPurchase = purchases[0] || null;

  const cells: Array<{ label: string; value: React.ReactNode }> = [
    {
      label: "Company",
      value: (
        <Link href={`/companies/${sym}`} className="hover:text-accent hover:underline">
          {data.company.name} ({sym})
        </Link>
      ),
    },
    {
      label: "Insider Score",
      value: (
        <span className="text-[22px] font-bold tabular">
          <PremiumValue label="Insider Score">{iqs.toFixed(2)}</PremiumValue>
        </span>
      ),
    },
    {
      label: "Score tier",
      value: (
        <span className="font-semibold" style={{ color: tier.color }}>
          {tier.label}
        </span>
      ),
    },
    {
      label: "Last open-market purchase",
      value: lastPurchase
        ? `${formatDate(lastPurchase.transactionDate)} · ${
            lastPurchase.priceSuspect ? "—" : formatCurrency(Number(lastPurchase.totalValue))
          }`
        : "None on file",
    },
  ];

  return (
    <VizFrame
      title="Insider Score card"
      subtitle={`${score.distinctBuyers} distinct buyer${score.distinctBuyers === 1 ? "" : "s"} · ${score.transactionCount} filing${score.transactionCount === 1 ? "" : "s"}`}
      footnote={
        <>
          Scored as of {formatDate(score.asOfDate)}.{" "}
          <Link href="/methodology" className="text-accent hover:underline">
            How the Insider Score works →
          </Link>
        </>
      }
    >
      <div className="grid grid-cols-2 md:grid-cols-4 divide-x" style={{ borderColor: "var(--border)" }}>
        {cells.map((c) => (
          <div key={c.label} className="px-4 py-3.5 min-w-[150px]">
            <div
              className="text-[10px] font-bold uppercase tracking-wider mb-1.5"
              style={{ color: "var(--text-mute)" }}
            >
              {c.label}
            </div>
            <div className="text-[14px] leading-snug">{c.value}</div>
          </div>
        ))}
      </div>
    </VizFrame>
  );
}
