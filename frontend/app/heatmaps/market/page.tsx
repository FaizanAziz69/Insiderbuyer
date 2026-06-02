"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import Link from "next/link";
import { API_BASE, RankingsResponse, fetcher, formatCurrency } from "@/lib/api";
import { StockHeatmap } from "@/components/heatmap/StockHeatmap";
import { PremiumGate } from "@/components/PremiumGate";
import { TierBadge } from "@/components/TierBadge";

type SortBy = "marketCap" | "iqs" | "totalPurchaseValue";

export default function MarketHeatmapPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=200`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
  const [sortBy, setSortBy] = useState<SortBy>("marketCap");
  const [sectorFilter, setSectorFilter] = useState<string>("All");

  const sectors = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(new Set(data.rows.map((r) => r.sector).filter(Boolean) as string[])).sort();
  }, [data]);

  const rows = useMemo(() => {
    if (!data) return [];
    return data.rows.filter((r) => sectorFilter === "All" || r.sector === sectorFilter);
  }, [data, sectorFilter]);

  const filtered = useMemo(() => {
    return rows.map((r) => ({
      ...r,
      marketCap:
        sortBy === "iqs"
          ? Math.max(r.iqs * 1e8, 1e6)
          : sortBy === "totalPurchaseValue"
          ? r.totalPurchaseValue
          : r.marketCap,
    }));
  }, [rows, sortBy]);

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3"
      >
        <div>
          <div className="flex items-center gap-2 text-mute text-sm mb-1">
            <Flame className="h-4 w-4" />
            <span className="font-mono uppercase tracking-wider text-[11px]">
              Market heatmap
            </span>
            <span className="live-dot live-dot-good ml-2 text-faint">live</span>
          </div>
          <h1
            className="text-[28px] font-bold tracking-tight"
            style={{ letterSpacing: "-0.4px" }}
          >
            Stock market heatmap
          </h1>
          <p className="text-mute text-sm mt-1">
            Every ranked U.S. company in one view. Tile size = {sortBy === "marketCap" ? "market cap" : sortBy === "iqs" ? "IQS strength" : "$ bought"}.
            Color = IQS conviction. Click any tile to drill in.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="inline-flex p-1 rounded-lg border"
            style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
          >
            {(
              [
                { key: "marketCap", label: "Mkt cap" },
                { key: "iqs", label: "IQS" },
                { key: "totalPurchaseValue", label: "$ bought" },
              ] as { key: SortBy; label: string }[]
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setSortBy(t.key)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition ${
                  sortBy === t.key ? "text-white" : "text-mute hover:text-soft"
                }`}
                style={
                  sortBy === t.key
                    ? {
                        background: "var(--accent)",
                        boxShadow: "0 4px 12px rgba(0,102,255,0.25)",
                      }
                    : {}
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </motion.header>

      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSectorFilter("All")}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
            style={{
              background: sectorFilter === "All" ? "var(--text-soft)" : "var(--bg-2)",
              color: sectorFilter === "All" ? "var(--bg-2)" : "var(--text-mute)",
              border: `1px solid ${
                sectorFilter === "All" ? "var(--text-soft)" : "var(--border)"
              }`,
            }}
          >
            All sectors
          </button>
          {sectors.slice(0, 8).map((s) => (
            <button
              key={s}
              onClick={() => setSectorFilter(s)}
              title={s}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition truncate max-w-[220px]"
              style={{
                background: sectorFilter === s ? "var(--text-soft)" : "var(--bg-2)",
                color: sectorFilter === s ? "var(--bg-2)" : "var(--text-mute)",
                border: `1px solid ${
                  sectorFilter === s ? "var(--text-soft)" : "var(--border)"
                }`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Top 5 premium picks */}
      {data && data.rows.length >= 5 && (
        <PremiumGate label="picks" count={5}>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 p-3 bg-[var(--bg-2)] rounded-md">
            {data.rows.slice(0, 5).map((r) => (
              <Link
                key={r.companyId}
                href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                className="card p-4"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-mono text-sm font-bold text-accent">
                    {r.ticker || "—"}
                  </span>
                  <TierBadge iqs={r.iqs} size="sm" />
                </div>
                <div className="text-[12px] text-soft truncate mb-2" title={r.name}>
                  {r.name}
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-mute">IQS</span>
                  <span className="font-bold tabular">{r.iqs.toFixed(2)}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1">
                  <span className="text-mute">Bought</span>
                  <span className="font-semibold tabular text-good">
                    {formatCurrency(r.totalPurchaseValue)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] mt-1">
                  <span className="text-mute">Mkt cap</span>
                  <span className="tabular text-mute">{formatCurrency(r.marketCap)}</span>
                </div>
              </Link>
            ))}
          </div>
        </PremiumGate>
      )}

      <div className="card p-4 sm:p-5">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3 text-xs text-mute font-mono">
            <span>Legend</span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded" style={{ background: "linear-gradient(135deg, #047857, #10b981)" }} />
              Elite
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded" style={{ background: "linear-gradient(135deg, #059669, #34d399)" }} />
              Strong
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded" style={{ background: "linear-gradient(135deg, #0e7490, #06b6d4)" }} />
              Notable
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-3 w-3 rounded" style={{ background: "linear-gradient(135deg, #475569, #64748b)" }} />
              Watch
            </span>
          </div>
          <div className="text-xs text-mute">
            {filtered.length} {filtered.length === 1 ? "tile" : "tiles"}
          </div>
        </div>

        {isLoading || !data ? (
          <div className="h-[520px] shimmer rounded" />
        ) : filtered.length === 0 ? (
          <div className="h-[520px] flex items-center justify-center text-sm text-mute">
            No ranked stocks match this filter.
          </div>
        ) : (
          <StockHeatmap rows={filtered} height={520} />
        )}
      </div>
    </div>
  );
}
