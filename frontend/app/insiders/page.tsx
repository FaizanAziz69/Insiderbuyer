"use client";
import useSWR from "swr";
import Link from "next/link";
import { Lock } from "lucide-react";
import { API_BASE, InsiderRow, fetcher, formatCurrency } from "@/lib/api";

export default function InsidersPage() {
  const { data, isLoading } = useSWR<InsiderRow[]>(
    `${API_BASE}/insiders?limit=50`,
    fetcher,
    { refreshInterval: 120000 },
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Top insiders</h1>
        <p className="text-mute text-sm mt-1">
          Insiders ranked by total recent purchase volume. Track-record accuracy is a{" "}
          <span className="text-accent">premium</span> feature.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card overflow-hidden">
          <div className="px-5 py-4 border-b border-[var(--border)] flex items-center justify-between">
            <div>
              <div className="text-[15px] font-semibold">Ranked by buying volume</div>
              <div className="text-xs text-mute mt-0.5">Last 90 days</div>
            </div>
          </div>
          {isLoading || !data ? (
            <div className="px-5 py-10 text-center text-mute">Loading…</div>
          ) : (
            <ul className="divide-y divide-[var(--border)]">
              {data.map((row, i) => (
                <li
                  key={`${row.name}-${row.ticker}-${i}`}
                  className="px-5 py-4 flex items-center gap-4 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)]"
                >
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
                  >
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="font-semibold text-sm truncate">{row.name}</div>
                    <div className="text-xs text-mute truncate">
                      {row.company}
                      {row.ticker && (
                        <>
                          {" · "}
                          <Link
                            href={`/companies/${encodeURIComponent(row.ticker)}`}
                            className="text-accent hover:underline font-mono"
                          >
                            {row.ticker}
                          </Link>
                        </>
                      )}
                    </div>
                  </div>
                  <span className="badge badge-neutral">{row.role}</span>
                  <div className="text-right hidden sm:block">
                    <div className="text-sm font-semibold tabular">
                      {formatCurrency(row.totalValue)}
                    </div>
                    <div className="text-[11px] text-mute">{row.trades} trade{row.trades === 1 ? "" : "s"}</div>
                  </div>
                  <div className="badge badge-gold hidden md:inline-flex">
                    <Lock className="h-3 w-3" />
                    Accuracy
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5 relative overflow-hidden">
          <div className="text-[15px] font-semibold">Performance vs benchmark</div>
          <div className="text-xs text-mute mt-0.5">Track-record accuracy</div>
          <div className="paywall-blur mt-5 space-y-3">
            {[94, 88, 81, 76, 71].map((p) => (
              <div key={p}>
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-mute">Insider</span>
                  <span className="font-semibold">{p}%</span>
                </div>
                <div className="h-1.5 rounded-full" style={{ background: "var(--bg-3)" }}>
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${p}%`, background: "var(--accent)" }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="paywall-overlay">
            <Lock className="h-5 w-5 text-mute mb-2" />
            <div className="text-sm text-soft font-semibold mb-1">Premium feature</div>
            <div className="text-xs text-mute mb-3 max-w-xs">
              Backtested track-record accuracy needs months of price history.
            </div>
            <Link href="/premium" className="btn-primary">
              Unlock →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
