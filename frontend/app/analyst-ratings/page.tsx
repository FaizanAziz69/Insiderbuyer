"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";

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

  return (
    <div className="max-w-7xl mx-auto space-y-6">
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
          Pair the Street&rsquo;s view with each name&rsquo;s insider-buying IQS
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
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Company</th>
                <th>Consensus</th>
                <th className="text-right">Price</th>
                <th className="text-right">Avg Target</th>
                <th className="text-right">Upside</th>
                <th className="text-right">Range</th>
                <th className="text-right">Analysts</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center text-mute py-10">
                    Loading live analyst data…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-mute py-10">
                    No matches.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => {
                  const rec = r.recommendation
                    ? REC_LABEL[r.recommendation] || {
                        label: r.recommendation,
                        color: "var(--text-soft)",
                      }
                    : null;
                  const up = (r.upsidePct ?? 0) >= 0;
                  return (
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
                      <td>
                        {rec ? (
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
                        )}
                      </td>
                      <td className="text-right tabular">${r.price.toFixed(2)}</td>
                      <td className="text-right tabular font-semibold">
                        {r.targetMean ? `$${r.targetMean.toFixed(2)}` : "—"}
                      </td>
                      <td
                        className="text-right tabular font-bold"
                        style={{ color: up ? "var(--good)" : "var(--bad)" }}
                      >
                        {r.upsidePct != null
                          ? `${up ? "+" : ""}${r.upsidePct.toFixed(1)}%`
                          : "—"}
                      </td>
                      <td className="text-right tabular text-[12px] text-mute whitespace-nowrap">
                        {r.targetLow && r.targetHigh
                          ? `$${r.targetLow.toFixed(0)}–$${r.targetHigh.toFixed(0)}`
                          : "—"}
                      </td>
                      <td className="text-right tabular text-mute">
                        {r.numAnalysts ?? "—"}
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-faint">
        Source: aggregated sell-side analyst coverage via live market data feed.
        Consensus and price targets are informational only and not a
        recommendation to buy or sell any security.
      </p>
    </div>
  );
}
