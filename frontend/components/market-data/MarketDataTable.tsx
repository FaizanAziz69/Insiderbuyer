"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowDown, ArrowUp, Flame } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import {
  API_BASE,
  fetcher,
  formatCurrency,
  formatNumber,
} from "@/lib/api";

export interface MarketStatRow {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  sector: string | null;
}

interface Props {
  endpoint: "top-gainers" | "top-losers" | "most-active";
  title: string;
  blurb: string;
  Icon?: any;
}

export function MarketDataTable({ endpoint, title, blurb, Icon = Flame }: Props) {
  const { data, isLoading } = useSWR<{ rows: MarketStatRow[] }>(
    `${API_BASE}/market-stats/${endpoint}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

  const columns: Column<MarketStatRow>[] = [
    {
      key: "rank",
      label: "#",
      sortable: false,
      render: (_r, i) => (
        <span className="text-faint text-[11px] tabular">{i + 1}</span>
      ),
    },
    {
      key: "symbol",
      label: "Ticker",
      filterable: true,
      sortValue: (r) => r.symbol,
      render: (r) => (
        <Link
          href={`/companies/${encodeURIComponent(r.symbol)}`}
          className="font-mono text-[15px] font-bold text-accent hover:underline"
        >
          {r.symbol}
        </Link>
      ),
    },
    {
      key: "name",
      label: "Company",
      filterable: true,
      sortValue: (r) => r.name,
      render: (r) => <span className="truncate max-w-[280px] text-[12px]">{r.name}</span>,
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
      key: "changeAbs",
      label: "Change",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.changeAbs,
      render: (r) => {
        const up = r.changePct >= 0;
        return (
          <span
            className="tabular font-bold text-[14px]"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {up ? "+" : ""}
            {r.changeAbs.toFixed(2)}
          </span>
        );
      },
    },
    {
      key: "changePct",
      label: "% Change",
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
            <span className="inline-flex items-center gap-0.5">
              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {up ? "+" : ""}
              {r.changePct.toFixed(2)}%
            </span>
          </span>
        );
      },
    },
    {
      key: "volume",
      label: "Volume",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.volume,
      render: (r) => <span className="tabular text-[14px] font-bold">{formatNumber(r.volume)}</span>,
    },
    {
      key: "avgVolume",
      label: "Avg Volume",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.avgVolume,
      render: (r) => (
        <span className="tabular text-mute text-[14px] font-bold">{formatNumber(r.avgVolume)}</span>
      ),
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
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Icon className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Market Data
          </span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          {title}
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">{blurb}</p>
      </header>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="overflow-x-auto">
            <table className="table-base">
              <tbody>
                <tr>
                  <td className="text-center text-mute py-10">Loading…</td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <DataTable<MarketStatRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            initialSort={{ key: "changePct", dir: "desc" }}
            empty="No rows."
            columns={columns}
          />
        )}
      </div>
    </div>
  );
}
