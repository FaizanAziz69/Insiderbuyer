"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity } from "lucide-react";
import {
  API_BASE,
  TradeRow,
  TradesResponse,
  fetcher,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/api";
import { MonthlyBuySellMeter } from "@/components/home/MonthlyBuySellMeter";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";

type Side = "all" | "buy" | "sell";

export default function InsiderBuySellPage() {
  const [side, setSide] = useState<Side>("all");

  const { data, isLoading } = useSWR<TradesResponse>(
    `${API_BASE}/trades?month=1&side=${side}&limit=400`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

  // Back-fill market cap from the live quote feed for any ticker our DB doesn't
  // already carry a cap for (same source the stock lists use).
  const symbolsKey = useMemo(
    () =>
      Array.from(new Set(rows.map((r) => r.ticker).filter(Boolean)))
        .slice(0, 200)
        .join(","),
    [rows],
  );
  const { data: capData } = useSWR<{ rows: { symbol: string; marketCap: number | null }[] }>(
    symbolsKey ? `${API_BASE}/market-stats/quotes?symbols=${symbolsKey}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const capMap = useMemo(() => {
    const m: Record<string, number> = {};
    for (const q of capData?.rows || []) {
      if (q.marketCap != null) m[q.symbol.toUpperCase()] = q.marketCap;
    }
    return m;
  }, [capData]);
  const capOf = (r: TradeRow): number | null =>
    r.marketCap ?? (r.ticker ? capMap[r.ticker.toUpperCase()] ?? null : null);

  const columns: Column<TradeRow>[] = [
    {
      key: "ticker",
      label: "Ticker",
      filterable: true,
      sortValue: (r) => r.ticker || "",
      render: (r) =>
        r.ticker ? (
          <Link
            href={`/companies/${encodeURIComponent(r.ticker)}`}
            className="inline-flex items-center gap-2"
          >
            <CompanyLogo ticker={r.ticker} name={r.companyName} size={22} />
            <span className="font-mono text-[15px] font-bold text-accent hover:underline">
              {r.ticker}
            </span>
          </Link>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "company",
      label: "Company",
      filterable: true,
      sortValue: (r) => r.companyName,
      render: (r) => (
        <span className="text-[14px] font-medium truncate max-w-[200px] inline-block align-middle" style={{ color: "var(--text)" }}>
          {r.companyName}
        </span>
      ),
    },
    {
      key: "insider",
      label: "Insider",
      filterable: true,
      sortValue: (r) => r.insiderName,
      render: (r) => (
        <div className="min-w-0">
          <div className="text-[15px] font-bold truncate max-w-[200px]">{r.insiderName}</div>
          <div className="text-[12px] text-mute truncate max-w-[200px]">{r.rawTitle || r.role}</div>
        </div>
      ),
    },
    {
      key: "type",
      label: "Action",
      filterable: true,
      align: "center",
      filterLabel: (r) => r.type || "BUY",
      sortValue: (r) => r.type || "BUY",
      render: (r) =>
        r.type === "SELL" ? (
          <span className="badge" style={{ background: "color-mix(in srgb, var(--bad) 16%, transparent)", color: "var(--bad)" }}>SELL</span>
        ) : (
          <span className="badge badge-buy">BUY</span>
        ),
    },
    {
      key: "shares",
      label: "Shares",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.sharesBought,
      render: (r) => <span className="tabular text-[14px] font-bold">{formatNumber(r.sharesBought)}</span>,
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.pricePerShare,
      render: (r) => <span className="tabular text-[14px] font-bold">${r.pricePerShare.toFixed(2)}</span>,
    },
    {
      key: "total",
      label: "Total Value",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.totalValue,
      render: (r) => (
        <span
          className="tabular text-[14px] font-bold"
          style={{ color: r.type === "SELL" ? "var(--bad)" : "var(--good)" }}
        >
          {formatCurrency(r.totalValue)}
        </span>
      ),
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      sortValue: (r) => capOf(r),
      render: (r) => {
        const mc = capOf(r);
        return (
          <span className="tabular text-[14px] text-mute font-bold">
            {mc != null ? formatCurrency(mc) : "—"}
          </span>
        );
      },
    },
    {
      key: "date",
      label: "Date",
      align: "right",
      sortValue: (r) => r.transactionDate,
      render: (r) => (
        <span className="tabular text-[14px] text-soft whitespace-nowrap">
          {formatDate(r.transactionDate)}
        </span>
      ),
    },
  ];

  const tabs: { key: Side; label: string }[] = [
    { key: "all", label: "All" },
    { key: "buy", label: "Buying" },
    { key: "sell", label: "Selling" },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Activity className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Insider flow</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          Insider Buying &amp; Selling — This Month
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          Every open-market insider purchase (BUY) and sale (SELL) filed on SEC Form 4 so far this
          calendar month, updated daily as new filings are parsed. The gauge resets on the 1st.
        </p>
      </header>

      {/* The same meter as the home page, here as the section summary */}
      <MonthlyBuySellMeter linkable={false} />

      {/* Buy / Sell / All toggle */}
      <div
        className="inline-flex p-1 rounded-lg border"
        style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
      >
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setSide(t.key)}
            className={`px-4 py-1.5 text-[13px] font-semibold rounded-md transition ${
              side === t.key ? "text-white" : "text-mute hover:text-soft"
            }`}
            style={side === t.key ? { background: "var(--accent)" } : {}}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-mute">Loading insider activity…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-mute">No insider {side === "all" ? "" : side} activity recorded this month yet.</div>
        ) : (
          <DataTable<TradeRow>
            rows={rows}
            rowKey={(r) => r.id}
            initialSort={{ key: "total", dir: "desc" }}
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
          />
        )}
      </div>
    </div>
  );
}
