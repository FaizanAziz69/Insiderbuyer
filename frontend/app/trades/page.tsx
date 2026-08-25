"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { Search, Download } from "lucide-react";
import { API_BASE, TradesResponse, fetcher } from "@/lib/api";
import { TradesTable } from "@/components/TradesTable";
import { ExchangeFilter, ExchangeValue } from "@/components/ExchangeFilter";
import { ToolIntro } from "@/components/ToolIntro";

export default function TradesPage() {
  const [q, setQ] = useState("");
  const [exchange, setExchange] = useState<ExchangeValue>("all");
  const params = new URLSearchParams();
  params.set("limit", "1000");
  params.set("side", "all"); // real buys (P) + sells (S) only — no option grants
  if (q) params.set("q", q);
  if (exchange !== "all") params.set("exchange", exchange);

  const { data, isLoading } = useSWR<TradesResponse>(
    `${API_BASE}/trades?${params.toString()}`,
    fetcher,
    { refreshInterval: 60000 },
  );

  const sortedByValue = useMemo(() => {
    if (!data) return [];
    return [...data.rows].sort((a, b) => b.totalValue - a.totalValue);
  }, [data]);

  return (
    <div className="space-y-6 w-full">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">All insider trades</h1>
        <ToolIntro tagline="Every open-market purchase by a CEO, CFO, or director — scored, ranked, and updated in real time.">
          When an insider buys stock in their own company with personal capital, it is the highest-conviction signal in public markets. This feed shows every qualifying transaction, scored by the Insider Quality Score (IQS) — so you can separate meaningful conviction from routine activity at a glance.
        </ToolIntro>
        </div>
        <a href={`${API_BASE}/rankings.csv`} className="btn-secondary self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </header>

      <div className="card p-3 flex flex-col gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ticker, company, or insider name…"
            className="input-base"
            style={{ paddingLeft: "2.5rem" }}
          />
        </div>
        <ExchangeFilter value={exchange} onChange={setExchange} />
      </div>

      {isLoading || !data ? (
        <div className="card p-12 text-center text-mute">Loading trades…</div>
      ) : sortedByValue.length === 0 ? (
        <div className="card p-12 text-center text-mute">No trades match your search.</div>
      ) : (
        <TradesTable trades={sortedByValue} total={sortedByValue.length} />
      )}
    </div>
  );
}
