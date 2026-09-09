"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Coins } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";

interface DividendRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  exDividendDate: string | null;
  changePct?: number | null;
  peRatio?: number | null;
  marketCap: number | null;
}

export default function DividendsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{ rows: DividendRow[] }>(
    `${API_BASE}/market-stats/dividends`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).filter(
    (r) =>
      !q ||
      r.symbol.toLowerCase().includes(q.toLowerCase()) ||
      r.name.toLowerCase().includes(q.toLowerCase()),
  );

  // Live quotes for the tickers shown in the table.
  const tickerKey = rows
    .map((r) => (r.symbol || "").toUpperCase())
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

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Coins className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Dividends
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Dividend Stocks &amp; Yields
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Live dividend yields, annual payout rates, payout ratios and upcoming
          ex-dividend dates across major U.S. dividend payers, highest yield
          first. A high yield paired with steady insider buying may suggest
          management confidence in the payout. Data refreshed throughout the
          trading day.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="dividends-top" />

      <div
        className="card p-4"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <label className="block text-[11px] uppercase tracking-wider font-bold text-mute mb-1">
          Search
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticker or company…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-md text-[13px]"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">
            Loading live dividend data…
          </div>
        ) : (
          <DataTable<DividendRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            empty="No matches."
            initialSort={{ key: "marketCap", dir: "desc" }}
            columns={[
              rankColumn<DividendRow>(),
              {
                key: "company",
                label: "Company",
                sortable: true,
                sortValue: (r) => r.symbol,
                render: (r) => (
                  <span className="inline-flex items-center gap-2">
                    <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />
                    <Link
                      href={`/companies/${encodeURIComponent(r.symbol)}`}
                      className="flex items-center gap-2.5 min-w-[200px]"
                    >
                      <CompanyLogo ticker={r.symbol} name={r.name} size={28} />
                      <div className="min-w-0">
                        <div className="font-mono text-[15px] font-bold text-accent">
                          {r.symbol}
                        </div>
                        <div className="text-[14px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                          {r.name}
                        </div>
                      </div>
                    </Link>
                  </span>
                ),
              },
              {
                key: "price",
                label: "Price",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.price,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold">${r.price.toFixed(2)}</span>
                ),
              },
              {
                key: "changePct",
                label: "Change %",
                align: "right",
                sortValue: (r) => r.changePct ?? quoteBySym.get((r.symbol || "").toUpperCase())?.changePct ?? null,
                render: (r) => {
                  const q = { changePct: r.changePct ?? quoteBySym.get((r.symbol || "").toUpperCase())?.changePct ?? null };
                  if (q.changePct == null) return <span className="text-faint text-[13px]">—</span>;
                  const up = q.changePct >= 0;
                  return <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>{up ? "+" : ""}{q.changePct.toFixed(2)}%</span>;
                },
              },
              {
                key: "marketCap",
                label: "Market Cap",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.marketCap,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                  </span>
                ),
              },
              {
                key: "divYield",
                label: "Div Yield",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.dividendYield,
                render: (r) => (
                  <span className="tabular font-bold text-[14px]" style={{ color: "var(--good)" }}>
                    {r.dividendYield != null ? `${r.dividendYield.toFixed(2)}%` : "—"}
                  </span>
                ),
              },
              {
                key: "annualRate",
                label: "Annual Rate",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.dividendRate,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold">
                    {r.dividendRate != null ? `$${r.dividendRate.toFixed(2)}` : "—"}
                  </span>
                ),
              },
              {
                key: "payoutRatio",
                label: "Payout Ratio",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.payoutRatio,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.payoutRatio != null ? `${r.payoutRatio.toFixed(0)}%` : "—"}
                  </span>
                ),
              },
              {
                key: "exDivDate",
                label: "Ex-Div Date",
                filterable: true,
                align: "right",
                sortValue: (r) =>
                  r.exDividendDate ? new Date(r.exDividendDate).getTime() : null,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold text-soft whitespace-nowrap">
                    {r.exDividendDate ? formatDate(r.exDividendDate) : "—"}
                  </span>
                ),
              },
              {
                key: "peRatio",
                label: "P/E",
                align: "right",
                sortValue: (r) => r.peRatio ?? quoteBySym.get((r.symbol || "").toUpperCase())?.peRatio ?? null,
                render: (r) => {
                  const pe = r.peRatio ?? quoteBySym.get((r.symbol || "").toUpperCase())?.peRatio;
                  return <span className="tabular text-mute text-[13px] font-bold">{pe != null ? pe.toFixed(1) : "—"}</span>;
                },
              },
            ]}
          />
        )}
      </div>

      <p className="text-[11px] text-faint">
        Source: live market data feed. Dividend figures are informational only
        and not a recommendation to buy or sell any security.
      </p>
    </div>
  );
}
