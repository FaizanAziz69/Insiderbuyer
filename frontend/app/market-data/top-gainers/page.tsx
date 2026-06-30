"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowDown, ArrowUp, Sparkles, TrendingUp } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Sparkline } from "@/components/Sparkline";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
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
}

/**
 * One-line AI catalyst / "why" note — surfaces the single most-likely driver
 * of the move: an outsized percentage swing, unusually heavy volume vs. its
 * own average, or a sector-wide reaction. Shown on hover behind the catalyst
 * icon to keep the table clean.
 */
function why(r: MoverRow): string {
  const dir = r.changePct >= 0 ? "rallying" : "selling off";
  const hints: string[] = [];
  if (Math.abs(r.changePct) > 10)
    hints.push(`an outsized ${r.changePct >= 0 ? "+" : ""}${r.changePct.toFixed(1)}% move`);
  if (r.avgVolume > 0 && r.volume > r.avgVolume * 1.5)
    hints.push(`heavy volume (${formatNumber(r.volume)} vs ${formatNumber(r.avgVolume)} avg)`);
  if (r.sector === "Technology") hints.push("a broader tech-sector reaction");
  else if (r.sector === "Energy") hints.push("a move across the energy complex");
  else if (r.sector === "Healthcare")
    hints.push("a likely healthcare catalyst (FDA / data readout)");
  else if (r.sector === "Financial Services" || r.sector === "Financials")
    hints.push("a financials-sector reaction");
  if (!hints.length) hints.push("one of the largest intraday moves in our universe");
  return `${dir.charAt(0).toUpperCase()}${dir.slice(1)} on ${hints.slice(0, 2).join(" and ")}.`;
}

export default function TopGainersPage() {
  const { data, isLoading } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/top-gainers?limit=100`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

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
    {
      key: "rank",
      label: "#",
      align: "left",
      sortable: false,
      className: "w-12",
      render: (_r, i) => <span className="text-faint text-[11px] tabular">{i + 1}</span>,
    },
    {
      key: "symbol",
      label: "Ticker",
      filterable: true,
      sortValue: (r) => r.symbol,
      render: (r) => (
        <Link
          href={`/companies/${encodeURIComponent(r.symbol)}`}
          className="inline-flex items-center gap-2"
        >
          <CompanyLogo ticker={r.symbol} name={r.name} size={24} />
          <span className="font-mono text-[15px] font-bold text-accent hover:underline">
            {r.symbol}
          </span>
        </Link>
      ),
    },
    {
      key: "name",
      label: "Company",
      filterable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <span
          className="truncate max-w-[240px] inline-block align-middle text-[14px] font-medium"
          style={{ color: "var(--text)" }}
        >
          {r.name}
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
      key: "spark7d",
      label: "7D",
      sortable: false,
      align: "center",
      render: (r) => <Sparkline data={sparkMap[r.symbol.toUpperCase()]} />,
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
      key: "catalyst",
      label: "AI Catalyst",
      sortable: false,
      align: "center",
      render: (r) => (
        <span className="group/cat relative inline-flex items-center justify-center">
          {/* Button so it's tappable on mobile — focus reveals the tooltip
              (touch devices have no hover). */}
          <button
            type="button"
            className="inline-flex items-center justify-center h-7 w-7 rounded-full cursor-pointer focus:outline-none"
            style={{
              background: "color-mix(in srgb, var(--accent) 14%, transparent)",
              color: "var(--accent)",
            }}
            aria-label="Show AI catalyst"
          >
            <Sparkles className="h-4 w-4" />
          </button>
          {/* Tooltip — shows on hover (desktop) and on tap/focus (mobile). */}
          <span
            className="pointer-events-none absolute right-0 bottom-full z-30 mb-2 w-64 rounded-md px-3 py-2 text-[12px] font-medium leading-snug text-left opacity-0 shadow-lg transition-opacity duration-150 group-hover/cat:opacity-100 group-focus-within/cat:opacity-100"
            style={{ background: "#ffffff", color: "#000000", border: "1px solid var(--border)" }}
            role="tooltip"
          >
            {why(r)}
          </span>
        </span>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
          The biggest percentage gainers on the U.S. market today, ranked by intraday change
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
