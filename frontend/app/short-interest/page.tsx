"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { TrendingDown, ArrowUp, ArrowDown } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable } from "@/components/DataTable";

interface ShortRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  sharesShort: number | null;
  sharesShortPrior: number | null;
  shortPctFloat: number | null;
  shortRatio: number | null;
  changePct: number | null;
  marketCap: number | null;
}

export default function ShortInterestPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{ rows: ShortRow[] }>(
    `${API_BASE}/market-stats/short-interest`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).filter(
    (r) =>
      !q ||
      r.symbol.toLowerCase().includes(q.toLowerCase()) ||
      r.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <TrendingDown className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Short Interest
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Short Interest Tracker
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Live short interest across major U.S. stocks — shares short, percent of
          float, days-to-cover, and the month-over-month change, most-shorted
          first. Heavy short interest alongside fresh insider buying may indicate
          a divergence worth monitoring. Updated each bi-monthly settlement cycle.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="short-top" />

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
            Loading live short-interest data…
          </div>
        ) : (
          <DataTable<ShortRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            empty="No matches."
            columns={[
              {
                key: "company",
                label: "Company",
                filterable: true,
                sortable: true,
                sortValue: (r) => r.symbol,
                render: (r) => (
                  <Link
                    href={`/companies/${encodeURIComponent(r.symbol)}`}
                    className="flex items-center gap-2.5 min-w-[200px]"
                  >
                    <CompanyLogo ticker={r.symbol} name={r.name} size={28} />
                    <div className="min-w-0">
                      <div className="font-mono text-[15px] font-bold text-accent">
                        {r.symbol}
                      </div>
                      <div className="text-[12px] text-mute truncate max-w-[200px]">
                        {r.name}
                      </div>
                    </div>
                  </Link>
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
                key: "pctFloat",
                label: "% of Float",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.shortPctFloat,
                render: (r) => (
                  <span className="tabular font-bold text-[14px]">
                    {r.shortPctFloat != null ? `${r.shortPctFloat.toFixed(2)}%` : "—"}
                  </span>
                ),
              },
              {
                key: "sharesShort",
                label: "Shares Short",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.sharesShort,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.sharesShort != null ? formatNumber(r.sharesShort) : "—"}
                  </span>
                ),
              },
              {
                key: "daysToCover",
                label: "Days to Cover",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.shortRatio,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold">
                    {r.shortRatio != null ? r.shortRatio.toFixed(1) : "—"}
                  </span>
                ),
              },
              {
                key: "momChange",
                label: "MoM Change",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.changePct,
                render: (r) => {
                  const rising = (r.changePct ?? 0) >= 0;
                  return r.changePct != null ? (
                    <span
                      className="inline-flex items-center gap-0.5 font-bold text-[14px] tabular"
                      style={{ color: rising ? "var(--bad)" : "var(--good)" }}
                    >
                      {rising ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {rising ? "+" : ""}
                      {r.changePct.toFixed(1)}%
                    </span>
                  ) : (
                    "—"
                  );
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
            ]}
          />
        )}
      </div>

      <p className="text-[11px] text-faint">
        Source: live market data feed (exchange-reported short interest). Rising
        short interest is shown in red, falling in green. Informational only —
        not a recommendation to buy or sell any security.
      </p>
    </div>
  );
}
