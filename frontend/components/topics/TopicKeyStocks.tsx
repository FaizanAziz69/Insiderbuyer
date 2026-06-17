"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

interface Quote {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

/** Right-rail card — live quotes for the tickers that define this topic. */
export function TopicKeyStocks({
  label,
  tickers,
}: {
  label: string;
  tickers: string[];
}) {
  const { data } = useSWR<{ rows: Quote[] }>(
    tickers.length
      ? `${API_BASE}/market-stats/quotes?symbols=${tickers.join(",")}`
      : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono flex items-center justify-between"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <span>Key {label} Stocks</span>
        <span className="live-dot live-dot-good text-faint">live</span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.length === 0
          ? Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="px-4 py-2.5">
                <div className="h-3 w-24 shimmer rounded" />
              </div>
            ))
          : rows.map((r) => {
              const up = r.changePct >= 0;
              return (
                <Link
                  key={r.symbol}
                  href={`/companies/${encodeURIComponent(r.symbol)}`}
                  className="flex items-center gap-2.5 px-4 py-2.5 hover:bg-[var(--bg-3)] transition"
                >
                  <CompanyLogo ticker={r.symbol} name={r.name} size={26} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono text-[13px] font-bold text-accent">
                      {r.symbol}
                    </div>
                    <div className="text-[10px] text-mute truncate max-w-[120px]">
                      {r.name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tabular text-[13px] font-semibold">
                      ${r.price.toFixed(2)}
                    </div>
                    <div
                      className="tabular text-[11px] font-bold inline-flex items-center gap-0.5"
                      style={{ color: up ? "var(--good)" : "var(--bad)" }}
                    >
                      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {up ? "+" : ""}
                      {r.changePct.toFixed(2)}%
                    </div>
                  </div>
                </Link>
              );
            })}
      </div>
    </section>
  );
}
