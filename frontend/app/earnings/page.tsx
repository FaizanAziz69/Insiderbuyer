"use client";
import useSWR from "swr";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";

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

function dateLabel(date: string): string {
  const d = new Date(date + "T00:00:00");
  if (Number.isNaN(d.getTime())) return date;
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
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

  return (
    <div className="w-full space-y-6">
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
          highest-conviction Insider Score signals.
        </p>
      </header>

      {isLoading ? (
        <div className="card p-12 text-center text-mute">Loading earnings calendar…</div>
      ) : rows.length === 0 ? (
        <div className="card p-12 text-center text-mute">
          No earnings reports scheduled for the next 7 days.
        </div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable<EarningsRow>
            rows={rows}
            rowKey={(r) => `${r.date}-${r.symbol}`}
            initialSort={{ key: "marketCap", dir: "desc" }}
            columns={[
              rankColumn<EarningsRow>(),
              {
                key: "symbol",
                label: "Company",
                sortValue: (r) => r.symbol,
                render: (r) => (
                  <span className="inline-flex items-center gap-2">
                    {r.symbol && <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />}
                    <Link
                      href={r.symbol ? `/companies/${encodeURIComponent(r.symbol)}` : "#"}
                      className="flex items-center gap-2"
                    >
                      <CompanyLogo ticker={r.symbol || ""} name={r.name} size={22} />
                      <div className="min-w-0">
                        <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                          {r.symbol || "—"}
                        </div>
                        <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                          {r.name}
                        </div>
                      </div>
                    </Link>
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
              {
                key: "date",
                label: "Date",
                filterable: true,
                filterType: "select",
                filterLabel: (r) => dateLabel(r.date),
                sortValue: (r) => r.date,
                render: (r) => (
                  <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: "var(--text)" }}>
                    {dateLabel(r.date)}
                  </span>
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
                    style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
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
                  <span className="tabular font-bold text-[14px]">{r.estimate || "—"}</span>
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
            ]}
          />
        </div>
      )}
    </div>
  );
}
