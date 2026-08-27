"use client";
import useSWR from "swr";
import Link from "next/link";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
} from "@/lib/api";
import { VizFrame, VizSkeleton } from "./VizFrame";

/**
 * §7 viz 5 — Transaction Comparison Row. The manual's example is the Cameco
 * cluster: "Insider 1 (CFO, $3.2M, Aug 15) | Insider 2 (CEO, $3.8M, Aug 17) |
 * Insider 3 (Director, $1.4M, Aug 19)."
 *
 * One column per BUYER, not per filing: a single Form 4 often reports one
 * purchase across several lines, and a reader comparing conviction wants one
 * column per person with their full amount — the same aggregation the alert
 * digest uses.
 *
 * The window matters to the claim. A "cluster" is only a cluster if the buys
 * are close together, so the default is 30 days and the caption states the
 * span the columns actually cover.
 *
 * `data-viz="tx-compare" data-ticker="CCJ" data-days="30"`
 */

interface Buyer {
  name: string;
  role: string;
  title: string;
  value: number;
  firstDate: string;
  lastDate: string;
  filings: number;
}

export function TxCompareViz({
  ticker,
  days = 30,
  max = 5,
}: {
  ticker: string;
  days?: number;
  max?: number;
}) {
  const sym = ticker.toUpperCase();
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  if (isLoading && !data) return <VizSkeleton height={160} />;
  if (!data?.company) return null;

  const cutoff = Date.now() - days * 86400_000;
  const purchases = (data.transactions || []).filter(
    (t) =>
      t.transactionCode === "P" &&
      !t.priceSuspect &&
      Date.parse(t.transactionDate) >= cutoff,
  );
  if (purchases.length === 0) return null;

  const byBuyer = new Map<string, Buyer>();
  for (const t of purchases) {
    const cur =
      byBuyer.get(t.insiderName) ||
      ({
        name: t.insiderName,
        role: t.role,
        title: t.rawTitle || t.role,
        value: 0,
        firstDate: t.transactionDate,
        lastDate: t.transactionDate,
        filings: 0,
      } as Buyer);
    cur.value += Number(t.totalValue || 0);
    cur.filings += 1;
    if (Date.parse(t.transactionDate) < Date.parse(cur.firstDate)) cur.firstDate = t.transactionDate;
    if (Date.parse(t.transactionDate) > Date.parse(cur.lastDate)) cur.lastDate = t.transactionDate;
    byBuyer.set(t.insiderName, cur);
  }

  const buyers = Array.from(byBuyer.values())
    .sort((a, b) => b.value - a.value)
    .slice(0, max);
  const dropped = byBuyer.size - buyers.length;
  const total = Array.from(byBuyer.values()).reduce((a, b) => a + b.value, 0);
  const dates = purchases.map((t) => Date.parse(t.transactionDate)).sort((a, b) => a - b);
  const spanDays = Math.max(
    1,
    Math.round((dates[dates.length - 1] - dates[0]) / 86400_000) || 1,
  );

  return (
    <VizFrame
      title={`${sym} — who bought`}
      subtitle={`${byBuyer.size} insider${byBuyer.size === 1 ? "" : "s"} · ${formatCurrency(total)} · ${spanDays} day${spanDays === 1 ? "" : "s"}`}
      footnote={
        <>
          Open-market purchases only, aggregated per insider across their
          filings in the last {days} days.
          {dropped > 0 ? ` ${dropped} smaller buyer${dropped === 1 ? "" : "s"} not shown — ` : " "}
          <Link href={`/companies/${sym}`} className="text-accent hover:underline">
            full filing history →
          </Link>
        </>
      }
    >
      <div
        className="grid divide-x"
        style={{
          gridTemplateColumns: `repeat(${buyers.length}, minmax(150px, 1fr))`,
          borderColor: "var(--border)",
        }}
      >
        {buyers.map((b) => (
          <div key={b.name} className="px-4 py-3.5">
            <div className="text-[13px] font-bold leading-snug">
              <Link
                href={`/insiders/${encodeURIComponent(b.name)}`}
                className="hover:text-accent hover:underline"
              >
                {b.name}
              </Link>
            </div>
            <div
              className="text-[11px] mt-0.5 leading-snug"
              style={{ color: "var(--text-mute)" }}
            >
              {b.title}
            </div>
            <div
              className="text-[19px] font-bold tabular mt-2"
              style={{ color: "var(--good)" }}
            >
              {formatCurrency(b.value)}
            </div>
            <div className="text-[11px] tabular mt-0.5" style={{ color: "var(--text-soft)" }}>
              {b.firstDate === b.lastDate
                ? formatDate(b.firstDate)
                : `${formatDate(b.firstDate)} – ${formatDate(b.lastDate)}`}
              {b.filings > 1 ? ` · ${b.filings} filings` : ""}
            </div>
          </div>
        ))}
      </div>
    </VizFrame>
  );
}
