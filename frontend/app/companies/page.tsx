"use client";
import useSWR from "swr";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ExchangeFilter, ExchangeValue } from "@/components/ExchangeFilter";
import { API_BASE, RankingRow, RankingsResponse, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { PremiumGate } from "@/components/PremiumGate";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { rankColumn } from "@/components/tableColumns";

// Shared column definitions — reused by both the free and paywall tables.
const tickerCol: Column<RankingRow> = {
  key: "ticker",
  label: "Company",
  sortValue: (r) => r.ticker ?? "",
  render: (r) => (
    <span className="inline-flex items-center gap-2">
      {r.ticker && <WatchlistButton ticker={r.ticker} variant="icon" size="sm" />}
      <Link
        href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
        className="flex items-center gap-2"
      >
        <CompanyLogo ticker={r.ticker || ""} name={r.name} size={22} />
        <div className="min-w-0">
          <div className="font-mono text-[15px] font-bold text-accent hover:underline">
            {r.ticker || "—"}
          </div>
          <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
            {r.name}
          </div>
        </div>
      </Link>
    </span>
  ),
};

const sectorCol: Column<RankingRow> = {
  key: "sector",
  label: "Sector",
  filterable: true,
  sortValue: (r) => r.sector ?? "",
  render: (r) => (
    <span className="text-[14px] truncate max-w-[180px]" style={{ color: "var(--text)" }}>{r.sector || "—"}</span>
  ),
};

const boughtCol: Column<RankingRow> = {
  key: "bought",
  label: "Bought",
  filterable: true,
  filterType: "range",
  align: "right",
  sortValue: (r) => r.totalPurchaseValue,
  render: (r) => (
    <span className="tabular text-accent font-bold text-[14px]">
      {formatCurrency(r.totalPurchaseValue)}
    </span>
  ),
};

const iqsCol: Column<RankingRow> = {
  key: "iqs",
  label: "Insider Score",
  align: "center",
  sortValue: (r) => r.iqs ?? null,
  render: (r) => <IqsScoreCell iqs={r.iqs} />,
};

// Categorized preset filter for the "Insiders Buying" column. Cluster = 2+
// distinct insiders; CEO/CFO/Hedge Funds match the buyer types on each stock.
const INSIDER_TYPE_PRESETS = [
  { key: "cluster", label: "Cluster Buying (2+ insiders)", test: (r: RankingRow) => r.distinctBuyers >= 2 },
  { key: "ceo", label: "CEO buying", test: (r: RankingRow) => !!r.hasCeoBuyer },
  { key: "cfo", label: "CFO buying", test: (r: RankingRow) => !!r.hasCfoBuyer },
  { key: "fund", label: "Hedge funds / institutions", test: (r: RankingRow) => !!r.hasFundBuyer },
];

export default function CompaniesPage() {
  const [exchange, setExchange] = useState<ExchangeValue>("all");
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=500${exchange !== "all" ? `&exchange=${exchange}` : ""}`,
    fetcher,
  );

  // Live quotes for the tickers shown in the table.
  const tickerKey = (data?.rows || [])
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 250)
    .join(",");
  const { data: quoteData } = useSWR<{ rows: { symbol: string; price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null }[] }>(
    tickerKey ? `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(tickerKey)}` : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const quoteBySym = new Map<string, { price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null }>();
  (quoteData?.rows || []).forEach((q) => quoteBySym.set(q.symbol.toUpperCase(), q));

  // Analyst-implied potential upside % for the same tickers (12-month avg
  // target vs. current price) — shown next to the Insider Score.
  const { data: analystData } = useSWR<{ rows: { symbol: string; upsidePct: number | null }[] }>(
    tickerKey
      ? `${API_BASE}/market-stats/analyst-ratings?symbols=${encodeURIComponent(tickerKey)}`
      : null,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const upsideBySym = new Map<string, number | null>();
  (analystData?.rows || []).forEach((r) => upsideBySym.set(r.symbol.toUpperCase(), r.upsidePct));

  // Top-5 are premium-gated; rest are free.
  // Display order counts DOWN: free rows N → 6 on top, blurred 5 → 1 at bottom.
  const top5Desc = [...(data?.rows.slice(0, 5) || [])].reverse();
  const restDesc = [...(data?.rows.slice(5) || [])].reverse();

  // Segmented layout: stock/market data on the left band, Insider Score data
  // on the right band (grouped header renders the two labelled segments).
  const STOCK = "Stock";
  const INSIDER = "Insider Score";
  const freeColumns: Column<RankingRow>[] = [
    { ...rankColumn<RankingRow>(), group: STOCK },
    { ...tickerCol, group: STOCK },
    {
      key: "price",
      label: "Price",
      group: STOCK,
      align: "right",
      sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.price ?? null,
      render: (r) => {
        const q = quoteBySym.get((r.ticker || "").toUpperCase());
        return <span className="tabular font-bold text-[14px]">{q ? `$${q.price.toFixed(2)}` : "—"}</span>;
      },
    },
    {
      key: "changePct",
      label: "Change %",
      group: STOCK,
      align: "right",
      sortValue: (r) => quoteBySym.get((r.ticker || "").toUpperCase())?.changePct ?? null,
      render: (r) => {
        const q = quoteBySym.get((r.ticker || "").toUpperCase());
        if (!q || q.changePct == null) return <span className="text-faint text-[13px]">—</span>;
        const up = q.changePct >= 0;
        return <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>{up ? "+" : ""}{q.changePct.toFixed(2)}%</span>;
      },
    },
    {
      key: "mktcap",
      label: "Mkt cap",
      group: STOCK,
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      align: "right",
      sortValue: (r) => r.marketCap,
      render: (r) => (
        <span className="tabular text-mute text-[14px] font-bold">{formatCurrency(r.marketCap)}</span>
      ),
    },
    { ...iqsCol, group: INSIDER },
    {
      key: "upside",
      label: "Potential Upside",
      group: INSIDER,
      filterable: true,
      filterType: "range",
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
      key: "buyers",
      label: "Insiders Buying",
      group: INSIDER,
      filterable: true,
      filterType: "preset",
      filterLabelText: "Insider Type",
      filterPresets: INSIDER_TYPE_PRESETS,
      align: "right",
      sortValue: (r) => r.distinctBuyers,
      render: (r) => <span className="tabular text-[14px] font-bold">{r.distinctBuyers}</span>,
    },
    { ...boughtCol, group: INSIDER },
    {
      key: "lastBuyDate",
      label: "Last Buy",
      group: INSIDER,
      align: "right",
      sortValue: (r) => r.lastBuyDate ?? null,
      render: (r) => (
        <span className="tabular text-[14px] text-soft whitespace-nowrap">
          {r.lastBuyDate ? formatDate(r.lastBuyDate) : "—"}
        </span>
      ),
    },
    {
      key: "action",
      label: "",
      sortable: false,
      render: (r) =>
        r.ticker ? (
          <Link
            href={`/companies/${encodeURIComponent(r.ticker)}`}
            className="inline-flex items-center text-mute hover:text-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null,
    },
  ];

  const compactColumns: Column<RankingRow>[] = [
    rankColumn<RankingRow>(),
    tickerCol,
    {
      key: "mktcap",
      label: "Mkt cap",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      align: "right",
      sortValue: (r) => r.marketCap,
      render: (r) => (
        <span className="tabular text-mute text-[14px] font-bold">{formatCurrency(r.marketCap)}</span>
      ),
    },
    iqsCol,
    sectorCol,
    boughtCol,
  ];

  return (
    <div className="space-y-6 w-full">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Companies by Insider Score</h1>
        <p className="text-mute text-sm mt-1">
          U.S. public companies ranked by the Insider Score. Highest scores at the
          bottom — the top 5 need Insider Access.
        </p>
        <p
          className="mt-3 max-w-3xl rounded-lg px-4 py-3 text-[13px] leading-relaxed"
          style={{
            background: "var(--accent-soft)",
            border: "1px solid var(--border)",
            color: "var(--text)",
          }}
        >
          <strong>How to read the score:</strong> a higher Insider Score = more
          bullish insider conviction — even if the share price is falling. The
          score measures the <em>quality</em> of insider buying (who is buying,
          how large, and how clustered), not price momentum.
        </p>
      </header>

      <ExchangeFilter value={exchange} onChange={setExchange} />

      {/* Free rows — highest rank at top, counts down to rank 6 */}
      <div className="card overflow-hidden">
        {isLoading || !data ? (
          <div className="text-center text-mute py-10">Loading…</div>
        ) : (
          <DataTable<RankingRow>
            rows={restDesc}
            rowKey={(r) => r.companyId}
            empty="No more companies ranked yet."
            columns={freeColumns}
            initialSort={{ key: "mktcap", dir: "desc" }}
          />
        )}
      </div>

      {/* Premium-gated top 5 — rendered last so it sits at the bottom of the page */}
      {top5Desc.length > 0 && (
        <PremiumGate label="picks" count={5}>
          <div className="card overflow-hidden m-0" style={{ border: "none" }}>
            <DataTable<RankingRow>
              rows={top5Desc}
              rowKey={(r) => r.companyId}
              columns={compactColumns}
            />
          </div>
        </PremiumGate>
      )}
    </div>
  );
}
