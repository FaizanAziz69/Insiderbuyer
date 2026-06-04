"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { Activity, ArrowDown, ArrowUp, BarChart3, Flame } from "lucide-react";
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
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>#</th>
                <th>Ticker</th>
                <th>Company</th>
                <th className="text-right">Price</th>
                <th className="text-right">Change</th>
                <th className="text-right">% Change</th>
                <th className="text-right">Volume</th>
                <th className="text-right">Avg Volume</th>
                <th className="text-right">Market Cap</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="text-center text-mute py-10">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center text-mute py-10">
                    No rows.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const up = r.changePct >= 0;
                  return (
                    <motion.tr
                      key={r.symbol}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                    >
                      <td className="text-faint text-[12px] tabular">{i + 1}</td>
                      <td>
                        <Link
                          href={`/companies/${encodeURIComponent(r.symbol)}`}
                          className="font-mono text-sm font-bold text-accent hover:underline"
                        >
                          {r.symbol}
                        </Link>
                      </td>
                      <td className="truncate max-w-[280px]">{r.name}</td>
                      <td className="text-right tabular font-semibold">
                        ${r.price.toFixed(2)}
                      </td>
                      <td
                        className="text-right tabular font-semibold"
                        style={{ color: up ? "var(--good)" : "var(--bad)" }}
                      >
                        {up ? "+" : ""}
                        {r.changeAbs.toFixed(2)}
                      </td>
                      <td
                        className="text-right tabular font-bold"
                        style={{ color: up ? "var(--good)" : "var(--bad)" }}
                      >
                        <span className="inline-flex items-center gap-0.5">
                          {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                          {up ? "+" : ""}
                          {r.changePct.toFixed(2)}%
                        </span>
                      </td>
                      <td className="text-right tabular">{formatNumber(r.volume)}</td>
                      <td className="text-right tabular text-mute">
                        {formatNumber(r.avgVolume)}
                      </td>
                      <td className="text-right tabular text-mute">
                        {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
