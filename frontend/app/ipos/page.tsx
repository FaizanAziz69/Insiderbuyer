"use client";
import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import { Rocket } from "lucide-react";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";

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
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th>Company</th>
                <th>Status</th>
                <th>Exchange</th>
                <th className="text-right">Offer Price</th>
                <th className="text-right">Shares</th>
                <th className="text-right">Deal Size</th>
                <th className="text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="text-center text-mute py-10">
                    Loading live IPO calendar…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-mute py-10">
                    No IPOs match this filter.
                  </td>
                </tr>
              ) : (
                rows.map((r, i) => (
                  <motion.tr
                    key={`${r.symbol}-${r.date}-${i}`}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                  >
                    <td>
                      <div className="flex items-center gap-2.5 min-w-[220px]">
                        <CompanyLogo ticker={r.symbol} name={r.name} size={28} />
                        <div className="min-w-0">
                          <div className="font-mono text-[13px] font-bold text-accent">
                            {r.symbol || "—"}
                          </div>
                          <div className="text-[11px] text-mute truncate max-w-[220px]">
                            {r.name}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
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
                    </td>
                    <td className="text-[12px] text-soft">{r.exchange || "—"}</td>
                    <td className="text-right tabular">
                      {r.price ? (r.price.startsWith("$") ? r.price : `$${r.price}`) : "—"}
                    </td>
                    <td className="text-right tabular text-mute">{r.shares || "—"}</td>
                    <td className="text-right tabular">{r.dollarValue || "—"}</td>
                    <td className="text-right tabular text-[12px] text-soft whitespace-nowrap">
                      {r.date ? formatDate(r.date) : "—"}
                    </td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p className="text-[11px] text-faint">
        Source: live Nasdaq IPO calendar. Informational only — not a
        recommendation to buy or sell any security.
      </p>
    </div>
  );
}
