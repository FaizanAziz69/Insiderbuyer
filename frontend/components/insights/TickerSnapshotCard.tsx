"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
import { API_BASE, CompanyDetail, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { StreetBadge, TierBadge } from "@/components/TierBadge";
import { PremiumValue } from "@/components/premium/PremiumValue";

interface Props {
  ticker: string;
}

/** MarketBeat-style right-rail stock quote card — logo, name, price, Insider Score
 *  tier, then a key-stats grid sourced from our SEC/Insider Score feed. */
export function TickerSnapshotCard({ ticker }: Props) {
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );
  /**
   * `companies.lastPrice` is written by the ingest when a filing is processed
   * and by the market-cap repair pass — neither is a price feed, so a name
   * nobody has filed on sits at a stale price for weeks. GoPro read $0.59 next
   * to an article about its run to $1.46 (2026-09-04). The quote endpoint is
   * live, so it wins and the table is only the fallback.
   */
  const { data: quotes } = useSWR<{ rows: Array<{ price: number; changePct: number; marketCap: number | null }> }>(
    `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );
  const quote = quotes?.rows?.[0] || null;

  if (isLoading && !data) {
    return <div className="shimmer rounded-lg" style={{ height: 280 }} />;
  }
  if (!data?.company) return null;

  const c = data.company;
  const s = data.score;
  const price =
    quote && quote.price > 0
      ? quote.price
      : c.lastPrice
        ? Number(c.lastPrice)
        : null;

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
            {/* Ticker badge = Wall Street consensus (analyst avg target vs
                price), NOT the Insider Score — insiders at a Street favourite
                like NVDA sell for years while the stock is bullish (George,
                2026-09-01). Insider tier only as a fallback when it's a real
                positive signal; a low insider score alone must never print
                "Bearish" next to the ticker. */}
            {data.analyst ? (
              <StreetBadge
                upsidePct={data.analyst.upsidePct}
                avgTarget={data.analyst.avgTarget}
                size="sm"
              />
            ) : s && Number(s.iqs) >= 55 ? (
              <TierBadge iqs={Number(s.iqs)} size="sm" />
            ) : null}
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
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className="tabular font-bold"
            style={{ fontSize: 26, letterSpacing: "-0.5px" }}
          >
            {price != null ? `$${price.toFixed(2)}` : "—"}
          </span>
          {quote && Number.isFinite(quote.changePct) ? (
            <span
              className="tabular text-[12px] font-bold"
              style={{ color: quote.changePct >= 0 ? "var(--good)" : "var(--bad)" }}
            >
              {quote.changePct >= 0 ? "+" : ""}
              {quote.changePct.toFixed(2)}%
            </span>
          ) : null}
        </div>
        <span className="text-[10px] uppercase tracking-wider font-bold text-mute">
          {c.sector || "—"}
        </span>
      </div>

      {/* Key stats grid */}
      <KeyStatsGrid detail={data} marketCap={quote?.marketCap ?? null} />

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

/** 2-column stats grid — Market Cap / Insider Score / Buyers / Transactions /
 *  Insider $ bought / As-of date. Reused inline in article bodies too. */
export function KeyStatsGrid({
  detail,
  marketCap,
}: {
  detail: CompanyDetail;
  /** Live market cap from the quote feed; the stored one is as stale as the
   *  stored price, so it is only the fallback. */
  marketCap?: number | null;
}) {
  const c = detail.company;
  const s = detail.score;
  const cap = marketCap && marketCap > 0 ? marketCap : c.marketCap ? Number(c.marketCap) : null;
  // The Insider Score cell is paygated like the stock-list column it mirrors —
  // `PremiumValue` keeps the row and its label visible (so readers see the
  // data exists) but never puts the number in the DOM for non-subscribers.
  const stats: Array<[string, React.ReactNode]> = [
    ["Market Cap", cap ? formatCurrency(cap) : "—"],
    [
      "Insider Score",
      s ? (
        <PremiumValue label="Insider Score">
          <span>{Number(s.iqs).toFixed(2)}</span>
        </PremiumValue>
      ) : (
        <span style={{ color: "var(--text-mute)" }}>None</span>
      ),
    ],
    // No score means no qualifying open-market buys — a fact, not a gap.
    // "—" reads as missing data (client, 2026-08-29: "data missing hai"), so
    // the buy counters print real zeros and the score cell says why.
    ["Distinct Buyers", s ? String(s.distinctBuyers) : "0"],
    ["Form 4 Buys", s ? String(s.transactionCount) : "0"],
    [
      "Insider $ Bought",
      s ? formatCurrency(Number(s.totalPurchaseValue)) : "$0",
    ],
    ["Score As Of", s?.asOfDate || "No open-market buys"],
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
