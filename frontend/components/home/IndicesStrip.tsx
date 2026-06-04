"use client";
import useSWR from "swr";
import { ArrowDown, ArrowUp } from "lucide-react";
import { API_BASE, IndicesResponse, fetcher } from "@/lib/api";

export function IndicesStrip() {
  const { data } = useSWR<IndicesResponse>(`${API_BASE}/indices`, fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: false,
  });
  const quotes = data?.quotes || [];

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="overflow-x-auto">
        <div className="flex items-stretch divide-x divide-[var(--border)] min-w-max">
          {quotes.length === 0
            ? Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="px-5 py-3 min-w-[140px] shimmer h-16" />
              ))
            : quotes.map((q) => {
                const up = q.changePct >= 0;
                return (
                  <div
                    key={q.symbol}
                    className="px-5 py-3 min-w-[140px] flex flex-col justify-center"
                  >
                    <div className="text-[10px] uppercase tracking-wider font-bold text-mute font-mono">
                      {q.shortName}
                    </div>
                    <div className="text-[15px] font-semibold tabular tracking-tight mt-0.5">
                      {q.value.toLocaleString(undefined, {
                        maximumFractionDigits: q.value < 100 ? 2 : 0,
                      })}
                    </div>
                    <div
                      className="inline-flex items-center gap-0.5 text-[11px] font-bold tabular mt-0.5"
                      style={{ color: up ? "var(--good)" : "var(--bad)" }}
                    >
                      {up ? (
                        <ArrowUp className="h-3 w-3" />
                      ) : (
                        <ArrowDown className="h-3 w-3" />
                      )}
                      {up ? "+" : ""}
                      {q.changePct.toFixed(2)}%
                    </div>
                  </div>
                );
              })}
        </div>
      </div>
    </section>
  );
}
