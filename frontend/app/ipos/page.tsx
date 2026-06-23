"use client";
import useSWR from "swr";
import { useState } from "react";
import { Rocket } from "lucide-react";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable } from "@/components/DataTable";

interface IpoRow {
  symbol: string;
  name: string;
  exchange: string | null;
  price: string | null;
  shares: string | null;
  dollarValue: string | null;
  date: string | null;
  status: "Priced" | "Upcoming" | "Filed";
}

const STATUS_COLOR: Record<string, string> = {
  Priced: "var(--good)",
  Upcoming: "var(--accent)",
  Filed: "var(--text-soft)",
};

export default function IposPage() {
  const [filter, setFilter] = useState<"" | "Priced" | "Upcoming">("");
  const { data, isLoading } = useSWR<{ rows: IpoRow[] }>(
    `${API_BASE}/ipo/calendar`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const all = data?.rows || [];
  const rows = all.filter((r) => (filter ? r.status === filter : true));

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Rocket className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            IPOs
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          IPO Calendar
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Recently priced and upcoming U.S. initial public offerings — ticker,
          exchange, offer price, shares offered and deal size. Newly public
          companies are where the earliest insider-buying signals often appear
          once lockups lift. Sourced from the live Nasdaq IPO calendar.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="ipos-top" />

      <div className="flex gap-2">
        {[
          { label: "All", value: "" },
          { label: "Priced", value: "Priced" },
          { label: "Upcoming", value: "Upcoming" },
        ].map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilter(opt.value as any)}
            className="px-3.5 py-1.5 rounded-full text-[12px] font-bold transition"
            style={{
              background: filter === opt.value ? "var(--accent)" : "var(--bg-2)",
              color: filter === opt.value ? "#fff" : "var(--text-soft)",
              border: "1px solid var(--border-strong)",
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading live IPO calendar…</div>
        ) : (
          <DataTable<IpoRow>
            rows={rows}
            rowKey={(r, i) => `${r.symbol}-${r.date}-${i}`}
            empty="No IPOs match this filter."
            columns={[
              {
                key: "company",
                label: "Company",
                filterable: true,
                sortValue: (r) => r.symbol,
                render: (r) => (
                  <div className="flex items-center gap-2.5 min-w-[220px]">
                    <CompanyLogo ticker={r.symbol} name={r.name} size={28} />
                    <div className="min-w-0">
                      <div className="font-mono text-[15px] font-bold text-accent">
                        {r.symbol || "—"}
                      </div>
                      <div className="text-[12px] text-mute truncate max-w-[220px]">
                        {r.name}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: "status",
                label: "Status",
                filterable: true,
                sortValue: (r) => r.status,
                render: (r) => (
                  <span
                    className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                    style={{
                      background: `color-mix(in srgb, ${
                        STATUS_COLOR[r.status] || "var(--text-soft)"
                      } 16%, transparent)`,
                      color: STATUS_COLOR[r.status] || "var(--text-soft)",
                    }}
                  >
                    {r.status}
                  </span>
                ),
              },
              {
                key: "exchange",
                label: "Exchange",
                filterable: true,
                sortValue: (r) => r.exchange ?? "",
                render: (r) => (
                  <span className="text-[12px] text-soft">{r.exchange || "—"}</span>
                ),
              },
              {
                key: "price",
                label: "Offer Price",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) =>
                  r.price ? parseFloat(r.price.replace(/[^0-9.]/g, "")) || null : null,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold">
                    {r.price ? (r.price.startsWith("$") ? r.price : `$${r.price}`) : "—"}
                  </span>
                ),
              },
              {
                key: "shares",
                label: "Shares",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) =>
                  r.shares ? parseFloat(r.shares.replace(/[^0-9.]/g, "")) || null : null,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">{r.shares || "—"}</span>
                ),
              },
              {
                key: "dollarValue",
                label: "Deal Size",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) =>
                  r.dollarValue
                    ? parseFloat(r.dollarValue.replace(/[^0-9.]/g, "")) || null
                    : null,
                render: (r) => <span className="tabular text-[14px] font-bold">{r.dollarValue || "—"}</span>,
              },
              {
                key: "date",
                label: "Date",
                filterable: true,
                align: "right",
                sortValue: (r) => (r.date ? new Date(r.date).getTime() : null),
                render: (r) => (
                  <span className="tabular text-[14px] font-bold text-soft whitespace-nowrap">
                    {r.date ? formatDate(r.date) : "—"}
                  </span>
                ),
              },
            ]}
          />
        )}
      </div>

      <p className="text-[11px] text-faint">
        Source: live Nasdaq IPO calendar. Informational only — not a
        recommendation to buy or sell any security.
      </p>
    </div>
  );
}
