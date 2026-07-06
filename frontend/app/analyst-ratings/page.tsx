"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";

interface AnalystRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upsidePct: number | null;
  recommendation: string | null;
  numAnalysts: number | null;
}

const REC_LABEL: Record<string, { label: string; color: string }> = {
  strong_buy: { label: "Strong Buy", color: "var(--good)" },
  buy: { label: "Buy", color: "var(--good)" },
  hold: { label: "Hold", color: "var(--gold)" },
  underperform: { label: "Underperform", color: "var(--bad)" },
  sell: { label: "Sell", color: "var(--bad)" },
};

export default function AnalystRatingsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{ rows: AnalystRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings`,
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
  const { data: quoteData } = useSWR<{ rows: { symbol: string; price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null; marketCap?: number | null }[] }>(
    tickerKey ? `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(tickerKey)}` : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const quoteBySym = new Map<string, { price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null; marketCap?: number | null }>();
  (quoteData?.rows || []).forEach((q) => quoteBySym.set(q.symbol.toUpperCase(), q));

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <ShieldCheck className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Analyst Ratings
          </span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Wall Street Analyst Ratings
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Live consensus recommendations and 12-month price targets across the
          most widely-covered U.S. stocks, ranked by analyst-implied upside.
          Pair the Street&rsquo;s view with each name&rsquo;s insider-buying Insider Score
          to see where conviction lines up. Data refreshed throughout the trading
          day.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="analyst-top" />

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
          <div className="text-center text-mute py-10">Loading live analyst data…</div>
        ) : (
          <DataTable<AnalystRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            initialSort={{ key: "marketCap", dir: "desc" }}
            empty="No matches."
            columns={[
              rankColumn<AnalystRow>(),
              {
                key: "company",
                label: "Company",
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
                key: "consensus",
                label: "Consensus",
                filterable: true,
                sortValue: (r) => r.recommendation ?? "",
                render: (r) => {
                  const rec = r.recommendation
                    ? REC_LABEL[r.recommendation] || {
                        label: r.recommendation,
                        color: "var(--text-soft)",
                      }
                    : null;
                  return rec ? (
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold uppercase tracking-wider"
                      style={{
                        background: `color-mix(in srgb, ${rec.color} 16%, transparent)`,
                        color: rec.color,
                      }}
                    >
                      {rec.label}
                    </span>
                  ) : (
                    "—"
                  );
                },
              },
              {
                key: "price",
                label: "Price",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.price,
                render: (r) => <span className="tabular text-[14px] font-bold">${r.price.toFixed(2)}</span>,
              },
              {
                key: "changePct",
                label: "Change %",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.changePct ?? null,
                render: (r) => {
                  const q = quoteBySym.get((r.symbol || "").toUpperCase());
                  if (!q || q.changePct == null) return <span className="text-faint text-[13px]">—</span>;
                  const up = q.changePct >= 0;
                  return <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>{up ? "+" : ""}{q.changePct.toFixed(2)}%</span>;
                },
              },
              {
                key: "marketCap",
                label: "Market Cap",
                filterable: true,
                filterType: "marketCapPreset",
                filterLabelText: "Market Cap",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.marketCap ?? null,
                render: (r) => {
                  const mc = quoteBySym.get((r.symbol || "").toUpperCase())?.marketCap ?? null;
                  return (
                    <span className="tabular text-mute text-[14px] font-bold">
                      {mc ? formatCurrency(mc) : "—"}
                    </span>
                  );
                },
              },
              {
                key: "peRatio",
                label: "P/E",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.peRatio ?? null,
                render: (r) => {
                  const pe = quoteBySym.get((r.symbol || "").toUpperCase())?.peRatio;
                  return <span className="tabular text-mute text-[13px] font-bold">{pe != null ? pe.toFixed(1) : "—"}</span>;
                },
              },
              {
                key: "dividendYield",
                label: "Div Yield",
                align: "right",
                sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.dividendYield ?? null,
                render: (r) => {
                  const dy = quoteBySym.get((r.symbol || "").toUpperCase())?.dividendYield;
                  return <span className="tabular text-mute text-[13px] font-bold">{dy != null ? dy.toFixed(2) + "%" : "—"}</span>;
                },
              },
              {
                key: "targetMean",
                label: "Avg Target",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.targetMean,
                render: (r) => (
                  <span className="tabular font-bold text-[14px]">
                    {r.targetMean ? `$${r.targetMean.toFixed(2)}` : "—"}
                  </span>
                ),
              },
              {
                key: "upsidePct",
                label: "Upside",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.upsidePct,
                render: (r) => {
                  const up = (r.upsidePct ?? 0) >= 0;
                  return (
                    <span
                      className="tabular font-bold text-[14px]"
                      style={{ color: up ? "var(--good)" : "var(--bad)" }}
                    >
                      {r.upsidePct != null
                        ? `${up ? "+" : ""}${r.upsidePct.toFixed(1)}%`
                        : "—"}
                    </span>
                  );
                },
              },
              {
                key: "range",
                label: "Range",
                filterable: true,
                filterLabel: (r) =>
                  r.targetLow && r.targetHigh
                    ? `$${r.targetLow.toFixed(0)}–$${r.targetHigh.toFixed(0)}`
                    : "",
                align: "right",
                sortValue: (r) => r.targetLow,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold text-mute whitespace-nowrap">
                    {r.targetLow && r.targetHigh
                      ? `$${r.targetLow.toFixed(0)}–$${r.targetHigh.toFixed(0)}`
                      : "—"}
                  </span>
                ),
              },
              {
                key: "numAnalysts",
                label: "Analysts",
                filterable: true,
                filterType: "range",
                align: "right",
                sortValue: (r) => r.numAnalysts,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">{r.numAnalysts ?? "—"}</span>
                ),
              },
            ]}
          />
        )}
      </div>

      <p className="text-[11px] text-faint">
        Source: aggregated sell-side analyst coverage via live market data feed.
        Consensus and price targets are informational only and not a
        recommendation to buy or sell any security.
      </p>
    </div>
  );
}
