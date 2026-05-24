"use client";
import useSWR from "swr";
import { useState } from "react";
import { Search, Download } from "lucide-react";
import { API_BASE, TradesResponse, fetcher } from "@/lib/api";
import { TradesTable } from "@/components/TradesTable";

export default function TradesPage() {
  const [q, setQ] = useState("");
  const params = new URLSearchParams();
  params.set("limit", "100");
  if (q) params.set("q", q);

  const { data, isLoading } = useSWR<TradesResponse>(
    `${API_BASE}/trades?${params.toString()}`,
    fetcher,
    { refreshInterval: 60000 },
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-[24px] font-bold tracking-tight">All insider trades</h1>
          <p className="text-mute text-sm mt-1">
            Every open-market SEC Form 4 purchase we've parsed, ranked by date and size.
          </p>
        </div>
        <a href={`${API_BASE}/rankings.csv`} className="btn-secondary self-start sm:self-auto">
          <Download className="h-4 w-4" />
          Export CSV
        </a>
      </header>

      <div className="card p-3 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-faint pointer-events-none" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search ticker, company, or insider name…"
            className="input-base pl-10"
          />
        </div>
      </div>

      {isLoading || !data ? (
        <div className="card p-12 text-center text-mute">Loading trades…</div>
      ) : data.rows.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          No trades match your search.
        </div>
      ) : (
        <TradesTable trades={data.rows} total={data.total} paywallAfter={45} />
      )}
    </div>
  );
}
