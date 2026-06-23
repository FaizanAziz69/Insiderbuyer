"use client";
import useSWR from "swr";
import { Calendar } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { DataTable } from "@/components/DataTable";

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

/** Parse a numeric value out of a formatted string (e.g. "$1.2B", "0.45") for
 *  sorting. Returns null when there's no parseable number. */
function numericValue(s: string | null): number | null {
  if (!s) return null;
  const m = s.replace(/,/g, "").match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  let n = parseFloat(m[0]);
  if (/[tT]\b|[tT]$/.test(s)) n *= 1e12;
  else if (/[bB]\b|[bB]$/.test(s)) n *= 1e9;
  else if (/[mM]\b|[mM]$/.test(s)) n *= 1e6;
  else if (/[kK]\b|[kK]$/.test(s)) n *= 1e3;
  return n;
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
                  <DataTable<EarningsRow>
                    rows={rows}
                    rowKey={(r) => `${r.date}-${r.symbol}`}
                    columns={[
                      {
                        key: "symbol",
                        label: "Ticker",
                        filterable: true,
                        sortValue: (r) => r.symbol,
                        render: (r) => (
                          <a
                            href={`/companies/${encodeURIComponent(r.symbol)}`}
                            className="font-mono text-[15px] font-bold text-accent hover:underline"
                          >
                            {r.symbol}
                          </a>
                        ),
                      },
                      {
                        key: "name",
                        label: "Company",
                        filterable: true,
                        sortValue: (r) => r.name,
                        render: (r) => (
                          <span className="truncate max-w-[280px] text-[12px]">{r.name}</span>
                        ),
                      },
                      {
                        key: "time",
                        label: "Time",
                        filterable: true,
                        sortValue: (r) => readableTime(r.time),
                        render: (r) => (
                          <span
                            className="text-[11px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded"
                            style={{
                              background: "var(--bg-3)",
                              color: "var(--text-soft)",
                            }}
                          >
                            {readableTime(r.time)}
                          </span>
                        ),
                      },
                      {
                        key: "estimate",
                        label: "EPS Forecast",
                        filterable: true,
                        filterType: "range",
                        align: "right",
                        sortValue: (r) => numericValue(r.estimate),
                        render: (r) => (
                          <span className="tabular font-bold text-[14px]">
                            {r.estimate || "—"}
                          </span>
                        ),
                      },
                      {
                        key: "lastEps",
                        label: "Last EPS",
                        filterable: true,
                        filterType: "range",
                        align: "right",
                        sortValue: (r) => numericValue(r.lastEpsForecast),
                        render: (r) => (
                          <span className="tabular text-mute text-[14px] font-bold">
                            {r.lastEpsForecast || "—"}
                          </span>
                        ),
                      },
                      {
                        key: "marketCap",
                        label: "Market Cap",
                        filterable: true,
                        filterType: "range",
                        align: "right",
                        sortValue: (r) => numericValue(r.marketCap),
                        render: (r) => (
                          <span className="tabular text-mute text-[14px] font-bold">
                            {r.marketCap || "—"}
                          </span>
                        ),
                      },
                    ]}
                  />
                </section>
              );
            })}
        </div>
      )}
    </div>
  );
}
