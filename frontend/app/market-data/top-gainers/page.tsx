"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowDown, ArrowUp, Sparkles, TrendingUp } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Sparkline } from "@/components/Sparkline";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { AiCatalyst, useExplainerPrewarm } from "@/components/AiCatalyst";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";

interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  changeAbs: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
  peRatio?: number | null;
  dividendYield?: number | null;
}


export default function TopGainersPage() {
  const { data, isLoading } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=1000`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

  // Pre-warm the AI "Movement Explainer" for the visible rows in ONE batched
  // request (single model call server-side) — every ✨ hover is then instant.
  useExplainerPrewarm(rows);

  // 7-day price sparklines for the listed tickers (cached, keyless until ready).
  const tickerKey = rows
    .map((r) => r.symbol.toUpperCase())
    .filter(Boolean)
    .slice(0, 60)
    .join(",");
  const { data: sparkData } = useSWR<{ spark: Record<string, number[]> }>(
    tickerKey ? `${API_BASE}/market-stats/spark?symbols=${tickerKey}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const sparkMap = sparkData?.spark || {};

  const columns: Column<MoverRow>[] = [
    rankColumn<MoverRow>(),
    {
      key: "symbol",
      label: "Company",
      sortValue: (r) => r.symbol,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />
          <Link
            href={`/companies/${encodeURIComponent(r.symbol)}`}
            className="flex items-center gap-2"
          >
            <CompanyLogo ticker={r.symbol} name={r.name} size={24} />
            <div className="min-w-0">
              <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                {r.symbol}
              </div>
              <div
                className="truncate max-w-[240px] text-[13px] font-medium"
                style={{ color: "var(--text)" }}
              >
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
        <span className="tabular font-bold text-[14px]">${r.price.toFixed(2)}</span>
      ),
    },
    {
      key: "changePct",
      label: "Change %",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.changePct,
      render: (r) => {
        const up = r.changePct >= 0;
        return (
          <span
            className="tabular font-bold text-[14px]"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            <span className="inline-flex items-center gap-0.5 justify-end">
              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {up ? "+" : ""}
              {r.changePct.toFixed(2)}%
            </span>
          </span>
        );
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      align: "right",
      sortValue: (r) => r.marketCap,
      render: (r) => (
        <span className="tabular text-mute text-[14px] font-bold">
          {r.marketCap ? formatCurrency(r.marketCap) : "—"}
        </span>
      ),
    },
    {
      key: "peRatio",
      label: "P/E",
      align: "right",
      sortValue: (r) => r.peRatio ?? null,
      render: (r) => (
        <span className="tabular text-mute text-[13px] font-bold">
          {r.peRatio != null ? r.peRatio.toFixed(1) : "—"}
        </span>
      ),
    },
    {
      key: "dividendYield",
      label: "Div Yield",
      align: "right",
      sortValue: (r) => r.dividendYield ?? null,
      render: (r) => (
        <span className="tabular text-mute text-[13px] font-bold">
          {r.dividendYield != null ? r.dividendYield.toFixed(2) + "%" : "—"}
        </span>
      ),
    },
    {
      key: "volume",
      label: "Volume",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.volume,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">{formatNumber(r.volume)}</span>
      ),
    },
    {
      key: "avgVolume",
      label: "Avg Volume",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.avgVolume,
      render: (r) => (
        <span className="tabular text-mute text-[14px] font-bold">
          {formatNumber(r.avgVolume)}
        </span>
      ),
    },
    {
      key: "spark7d",
      label: "7D",
      sortable: false,
      align: "center",
      render: (r) => <Sparkline data={sparkMap[r.symbol.toUpperCase()]} />,
    },
    {
      key: "catalyst",
      label: "AI Catalyst",
      sortable: false,
      align: "center",
      render: (r) => (
        <AiCatalyst ticker={r.symbol} name={r.name} changePct={r.changePct} />
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <TrendingUp className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Market Data</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1
          className="text-[28px] sm:text-[34px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          Today&rsquo;s Top Gainers
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          Every U.S. stock up 10% or more today, ranked by intraday change
          with live volume, market cap and a 7-day price trend. Hover the{" "}
          <Sparkles className="inline h-3.5 w-3.5 text-accent align-text-bottom" /> AI Catalyst
          icon on any row for a one-line read on the likely driver of the move.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="top-gainers" />

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading…</div>
        ) : (
          <DataTable<MoverRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            initialSort={{ key: "changePct", dir: "desc" }}
            empty="No gainers right now."
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
          />
        )}
      </div>
    </div>
  );
}
