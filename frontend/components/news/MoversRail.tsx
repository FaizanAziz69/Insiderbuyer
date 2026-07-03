"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowDown, ArrowUp } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
}

const ENDPOINTS = [
  { key: "top-gainers", title: "Top Gainers", href: "/market-data/top-gainers" },
  { key: "top-losers", title: "Top Losers", href: "/market-data/top-losers" },
] as const;

function MoverList({
  endpoint,
  title,
  href,
}: {
  endpoint: string;
  title: string;
  href: string;
}) {
  const { data } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/${endpoint}?limit=6`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).slice(0, 6);

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <h3 className="text-[12px] font-bold uppercase tracking-wider">{title}</h3>
        <Link href={href} className="text-[10px] font-bold text-accent hover:underline uppercase tracking-wider">
          View all
        </Link>
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
                  className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--bg-3)] transition"
                >
                  <div className="min-w-0">
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

/** Live market-movers rail — gainers / losers / most-active mini lists.
 *  Gives the news page the right-hand "live market" column you'd see on a
 *  stock-exchange news site. */
export function MoversRail() {
  return (
    <div className="space-y-4">
      {ENDPOINTS.map((e) => (
        <MoverList key={e.key} endpoint={e.key} title={e.title} href={e.href} />
      ))}
    </div>
  );
}
