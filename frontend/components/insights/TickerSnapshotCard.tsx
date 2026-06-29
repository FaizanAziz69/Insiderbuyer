"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { TierBadge } from "@/components/TierBadge";

interface Props {
  ticker: string;
}

/** MarketBeat-style right-rail stock quote card — logo, name, price, IQS
 *  tier, then a key-stats grid sourced from our SEC/IQS feed. */
export function TickerSnapshotCard({ ticker }: Props) {
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );

  if (isLoading && !data) {
    return <div className="shimmer rounded-lg" style={{ height: 280 }} />;
  }
  if (!data?.company) return null;

  const c = data.company;
  const s = data.score;

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      {/* Header — logo + ticker + name */}
      <div
        className="flex items-center gap-3 px-4 py-3.5 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <CompanyLogo ticker={c.ticker} name={c.name} size={40} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="font-mono text-[15px] font-bold text-accent">
              {c.ticker}
            </span>
            {s && <TierBadge iqs={Number(s.iqs)} size="sm" />}
          </div>
          <div className="text-[12px] text-soft truncate" title={c.name}>
            {c.name}
          </div>
        </div>
      </div>

      {/* Price row */}
      <div
        className="flex items-baseline justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)" }}
      >
        <span
          className="tabular font-bold"
          style={{ fontSize: 26, letterSpacing: "-0.5px" }}
        >
          {c.lastPrice ? `$${Number(c.lastPrice).toFixed(2)}` : "—"}
        </span>
        <span className="text-[10px] uppercase tracking-wider font-bold text-mute">
          {c.sector || "—"}
        </span>
      </div>

      {/* Key stats grid */}
      <KeyStatsGrid detail={data} />

      {/* Actions */}
      <div
        className="flex gap-2 px-4 py-3 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <Link
          href={`/companies/${encodeURIComponent(c.ticker || "")}`}
          className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-md text-[12px] font-bold uppercase tracking-wider"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          Full profile <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <Link
          href="/watchlist"
          className="inline-flex items-center justify-center gap-1 px-3 py-2 rounded-md text-[12px] font-bold uppercase tracking-wider"
          style={{
            border: "1px solid var(--border-strong)",
            color: "var(--text-soft)",
          }}
        >
          <Plus className="h-3.5 w-3.5" /> Watch
        </Link>
      </div>
    </div>
  );
}

/** 2-column stats grid — Market Cap / IQS / Buyers / Transactions /
 *  Insider $ bought / As-of date. Reused inline in article bodies too. */
export function KeyStatsGrid({ detail }: { detail: CompanyDetail }) {
  const c = detail.company;
  const s = detail.score;
  const stats: Array<[string, string]> = [
    ["Market Cap", c.marketCap ? formatCurrency(Number(c.marketCap)) : "—"],
    ["IQS Score", s ? Number(s.iqs).toFixed(2) : "—"],
    ["Distinct Buyers", s ? String(s.distinctBuyers) : "—"],
    ["Form 4 Buys", s ? String(s.transactionCount) : "—"],
    [
      "Insider $ Bought",
      s ? formatCurrency(Number(s.totalPurchaseValue)) : "—",
    ],
    ["Score As Of", s?.asOfDate || "—"],
  ];
  return (
    <div className="grid grid-cols-2">
      {stats.map(([label, value], i) => (
        <div
          key={label}
          className="px-4 py-2.5"
          style={{
            borderBottom:
              i < stats.length - 2 ? "1px solid var(--border)" : undefined,
            borderRight: i % 2 === 0 ? "1px solid var(--border)" : undefined,
          }}
        >
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
            {label}
          </div>
          <div className="text-[13px] font-semibold tabular mt-0.5">
            {value}
          </div>
        </div>
      ))}
    </div>
  );
}
