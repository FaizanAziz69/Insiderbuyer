"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Coins } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";

interface DividendRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  dividendYield: number | null;
  dividendRate: number | null;
  payoutRatio: number | null;
  exDividendDate: string | null;
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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Company</th>
                <th className="text-right">Price</th>
                <th className="text-right">Div Yield</th>
                <th className="text-right">Annual Rate</th>
                <th className="text-right">Payout Ratio</th>
                <th className="text-right">Ex-Div Date</th>
                <th className="text-right">Market Cap</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center text-mute py-10">
                    Loading live dividend data…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-mute py-10">
                    No matches.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <motion.tr
                    key={r.symbol}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                  >
                    <td>
                      <Link
                        href={`/companies/${encodeURIComponent(r.symbol)}`}
                        className="flex items-center gap-2.5 min-w-[200px]"
                      >
                        <CompanyLogo ticker={r.symbol} name={r.name} size={28} />
                        <div className="min-w-0">
                          <div className="font-mono text-[13px] font-bold text-accent">
                            {r.symbol}
                          </div>
                          <div className="text-[11px] text-mute truncate max-w-[200px]">
                            {r.name}
                          </div>
                        </div>
                      </Link>
                    </td>
                    <td className="text-right tabular">${r.price.toFixed(2)}</td>
                    <td
                      className="text-right tabular font-bold"
                      style={{ color: "var(--good)" }}
                    >
                      {r.dividendYield != null ? `${r.dividendYield.toFixed(2)}%` : "—"}
                    </td>
                    <td className="text-right tabular">
                      {r.dividendRate != null ? `$${r.dividendRate.toFixed(2)}` : "—"}
                    </td>
                    <td className="text-right tabular text-mute">
                      {r.payoutRatio != null ? `${r.payoutRatio.toFixed(0)}%` : "—"}
                    </td>
                    <td className="text-right tabular text-[12px] text-soft whitespace-nowrap">
                      {r.exDividendDate ? formatDate(r.exDividendDate) : "—"}
                    </td>
                    <td className="text-right tabular text-mute">
                      {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-faint">
        Source: live market data feed. Dividend figures are informational only
        and not a recommendation to buy or sell any security.
      </p>
    </div>
  );
}
