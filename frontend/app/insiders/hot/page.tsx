"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Flame, Activity, ArrowUp, ArrowDown } from "lucide-react";
import { ExchangeFilter, ExchangeValue } from "@/components/ExchangeFilter";
import {
  API_BASE,
  RankingRow,
  RankingsResponse,
  fetcher,
  formatCurrency,
  formatDate,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { WatchlistButton } from "@/components/WatchlistButton";

/**
 * Insider strategy signal — how strong/clustered the recent insider buying is,
 * mirroring TipRanks' "Insider Signal" (Very Positive / Positive / Neutral).
 * Driven by the Insider Score composite and the number of distinct insiders buying.
 */

/** A ranking row plus the 50→1 display number shown in the # column. */
type Row50 = RankingRow & { displayRank: number };

export default function InsiderHotStocksPage() {
  // "Exchanges" filter — narrows the ranking by listing venue (ranking stays
  // global; sent to the API as &exchange=).
  const [exchange, setExchange] = useState<ExchangeValue>("all");

  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=1000&live=1${exchange !== "all" ? `&exchange=${exchange}` : ""}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const rows: RankingRow[] = data?.rows || [];

  // 7-day price sparklines — "recent stock behaviour" for each ticker.
  const tickerKey = rows
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 60)
    .join(",");

  // Analyst-implied potential upside % — rendered next to the Insider Score.
  const { data: analystData } = useSWR<{ rows: { symbol: string; upsidePct: number | null }[] }>(
    tickerKey
      ? `${API_BASE}/market-stats/analyst-ratings?symbols=${encodeURIComponent(tickerKey)}`
      : null,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const upsideBySym = new Map<string, number | null>();
  (analystData?.rows || []).forEach((r) => upsideBySym.set(r.symbol.toUpperCase(), r.upsidePct));

  // Top 50 only, on one page. The list counts DOWN — #50 first, #1 last — so
  // the strongest Insider Score sits at the bottom. Display rank is attached
  // per row (not derived from position) so it survives column sorting.
  const top50: Row50[] = rows
    .slice(0, 50)
    .map((r, i) => ({ ...r, displayRank: i + 1 }))
    .reverse();

  const columns: Column<Row50>[] = [
    {
      key: "rank",
      label: "#",
      align: "center",
      sortValue: (r) => r.displayRank,
      render: (r) => (
        <span className="tabular text-[15px] font-bold" style={{ color: "var(--text)" }}>
          #{r.displayRank}
        </span>
      ),
    },
    {
      key: "ticker",
      label: "Company",
      sortValue: (r) => r.ticker || "",
      render: (r) => {
        const ticker = r.ticker || "";
        return (
          <span className="inline-flex items-center gap-2">
            {ticker && (
              <WatchlistButton ticker={ticker} variant="icon" size="sm" />
            )}
            <Link
              href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
              className="flex items-center gap-2"
            >
              <CompanyLogo ticker={ticker} name={r.name} size={22} />
              <div className="min-w-0">
                <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                  {ticker || "—"}
                </div>
                <div className="text-[13px] font-medium truncate max-w-[220px]" style={{ color: "var(--text)" }}>
                  {r.name}
                </div>
              </div>
            </Link>
          </span>
        );
      },
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.livePrice ?? r.lastPrice ?? null,
      render: (r) => {
        const p = r.livePrice ?? r.lastPrice;
        return (
          <span className="tabular font-bold text-[14px]">
            {p != null ? `$${p.toFixed(2)}` : "—"}
          </span>
        );
      },
    },
    {
      key: "changePct",
      label: "Price Change",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.changePct ?? null,
      render: (r) => {
        if (r.changePct == null) return <span className="text-faint text-[13px]">—</span>;
        const up = r.changePct >= 0;
        return (
          <span
            className="tabular font-bold text-[14px] inline-flex items-center gap-0.5 justify-end"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {up ? "+" : ""}
            {r.changePct.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "iqs",
      label: "Insider Score",
      align: "center",
      sortValue: (r) => r.iqs ?? null,
      render: (r) => <IqsScoreCell iqs={r.iqs} />,
    },
    {
      key: "upside",
      label: "Potential Upside",
      align: "right",
      sortValue: (r) => upsideBySym.get((r.ticker || "").toUpperCase()) ?? null,
      render: (r) => {
        const u = upsideBySym.get((r.ticker || "").toUpperCase());
        if (u == null) return <span className="text-faint text-[13px]">—</span>;
        const up = u >= 0;
        return (
          <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>
            {up ? "+" : ""}
            {u.toFixed(0)}%
          </span>
        );
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      sortValue: (r) => r.marketCap ?? null,
      render: (r) => (
        <span className="tabular text-[14px] text-mute font-bold">
          {formatCurrency(r.marketCap)}
        </span>
      ),
    },
    {
      key: "buyers",
      label: "Insider Buyers",
      align: "right",
      sortValue: (r) => r.distinctBuyers,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">{r.distinctBuyers}</span>
      ),
    },
    {
      key: "bought",
      label: "$ Bought",
      align: "right",
      sortValue: (r) => r.totalPurchaseValue,
      render: (r) => (
        <span
          className="tabular text-[14px] font-bold"
          style={{ color: "var(--good)" }}
        >
          {formatCurrency(r.totalPurchaseValue)}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Flame className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Insider activity
          </span>
          <Activity className="h-3.5 w-3.5 text-faint ml-1" />
          <span className="live-dot live-dot-good ml-1 text-faint">live</span>
        </div>
        <h1
          className="text-[28px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Top Insider Scores
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          U.S. companies ranked by Insider Score <em>quality</em> — not by raw
          dollar volume of buying. The list counts down to #1: a higher score
          means stronger, more bullish insider conviction, even when the share
          price is falling.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="insider-hot-top" />

      {/* Exchanges filter — All / U.S. / Canada / Germany */}
      <ExchangeFilter value={exchange} onChange={setExchange} />

      {/* Top 50 — one page, counting down #50 → #1 */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-mute">Loading insider data…</div>
        ) : top50.length === 0 ? (
          <div className="p-12 text-center text-mute">
            No insider buying data available.
          </div>
        ) : (
          <DataTable<Row50>
            rows={top50}
            rowKey={(r, i) => (r.ticker || r.companyId || r.name || "") + i}
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
            pageSize={50}
            gate={{
              label: "Insider Score",
              bullets: [
                "All 50 ranked names, not just the preview",
                "The Insider Score and its v1 comparison",
                "Potential upside and analyst price targets",
                "Every new Form 4 the moment it lands",
              ],
            }}
          />
        )}
      </div>

      {/* How we rank */}
      <section className="card p-5 sm:p-6 max-w-4xl">
        <h2 className="text-[20px] font-bold tracking-tight mb-3">
          How we rank Top Insider Scores
        </h2>
        <p className="text-[15px] text-soft leading-relaxed">
          Stocks are ranked by our Insider Score, a 0–100 composite that weighs
          the dollar size of insider purchases relative to the company&rsquo;s
          market cap, the number of distinct insiders buying (a cluster of
          buyers carries more signal than a lone trade), the seniority of the
          buyers&rsquo; roles (a CEO or CFO buy outweighs a director&rsquo;s),
          and how much each insider grew their existing stake. A higher score is
          more bullish — even when the share price is falling — because it
          measures buying quality, not price momentum. Informational, not a
          trade recommendation.
        </p>
      </section>
    </div>
  );
}
