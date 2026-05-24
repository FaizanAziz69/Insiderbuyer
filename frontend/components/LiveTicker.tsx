"use client";
import useSWR from "swr";
import { API_BASE, RankingsResponse, fetcher, formatCurrency } from "@/lib/api";

export function LiveTicker() {
  const { data } = useSWR<RankingsResponse>(`${API_BASE}/rankings?limit=20`, fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  });

  const rows = data?.rows || [];
  if (rows.length === 0) return null;

  const items = [...rows, ...rows];

  return (
    <div className="ticker-strip" aria-label="Live insider buying ticker">
      <div className="ticker-track">
        {items.map((r, i) => {
          const direction = r.iqs >= 1 ? "up" : "down";
          return (
            <div key={`${r.companyId}-${i}`} className="ticker-item">
              <span className="ticker-sym">{r.ticker || "—"}</span>
              <span className="ticker-price">{formatCurrency(r.totalPurchaseValue)}</span>
              <span className={direction === "up" ? "ticker-up" : "ticker-down"}>
                {direction === "up" ? "▲" : "▼"} IQS {r.iqs.toFixed(2)}
              </span>
              <span className="text-faint">·</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
