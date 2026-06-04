"use client";
import useSWR from "swr";
import { Calendar } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

interface EarningsRow {
  date: string;
  symbol: string;
  name: string;
  estimate: string | null;
  lastEpsForecast: string | null;
  marketCap: string | null;
  time: string | null;
}

function readableTime(t: string | null): string {
  if (!t) return "—";
  if (t.includes("pre-market")) return "Pre-market";
  if (t.includes("after-hours")) return "After hours";
  if (t.includes("not-supplied")) return "TBD";
  return t.replace(/-/g, " ");
}

export default function EarningsPage() {
  const { data, isLoading } = useSWR<{ rows: EarningsRow[] }>(
    `${API_BASE}/earnings/calendar?days=7`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];

  const groupedByDate = new Map<string, EarningsRow[]>();
  for (const r of rows) {
    const arr = groupedByDate.get(r.date) || [];
    arr.push(r);
    groupedByDate.set(r.date, arr);
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Calendar className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Earnings Calendar
          </span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1
          className="text-[28px] sm:text-[34px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          Upcoming Earnings Releases
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          The next 7 days of corporate earnings releases for U.S. listed companies. Earnings
          surprises move stocks fast — and insider buying ahead of earnings is one of the
          highest-conviction IQS signals.
        </p>
      </header>

      {isLoading ? (
        <div className="card p-12 text-center text-mute">Loading earnings calendar…</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          No earnings reports scheduled for the next 7 days.
        </div>
      ) : (
        <div className="space-y-6">
          {Array.from(groupedByDate.entries())
            .sort((a, b) => a[0].localeCompare(b[0]))
            .map(([date, rows]) => {
              const d = new Date(date + "T00:00:00");
              const label = d.toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
                year: "numeric",
              });
              return (
                <section key={date} className="card overflow-hidden">
                  <div
                    className="px-5 py-3 border-b"
                    style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
                  >
                    <div className="text-[12px] uppercase tracking-wider font-bold text-accent">
                      {label}
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Ticker</th>
                          <th>Company</th>
                          <th>Time</th>
                          <th className="text-right">EPS Forecast</th>
                          <th className="text-right">Last EPS</th>
                          <th className="text-right">Market Cap</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => (
                          <tr key={`${r.date}-${r.symbol}`}>
                            <td>
                              <a
                                href={`/companies/${encodeURIComponent(r.symbol)}`}
                                className="font-mono text-sm font-bold text-accent hover:underline"
                              >
                                {r.symbol}
                              </a>
                            </td>
                            <td className="truncate max-w-[280px]">{r.name}</td>
                            <td>
                              <span
                                className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                                style={{
                                  background: "var(--bg-3)",
                                  color: "var(--text-soft)",
                                }}
                              >
                                {readableTime(r.time)}
                              </span>
                            </td>
                            <td className="text-right tabular font-semibold">
                              {r.estimate || "—"}
                            </td>
                            <td className="text-right tabular text-mute">
                              {r.lastEpsForecast || "—"}
                            </td>
                            <td className="text-right tabular text-mute">
                              {r.marketCap || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
