"use client";
import useSWR from "swr";
import Link from "next/link";
import { Calendar } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";

interface Row {
  date: string;
  symbol: string;
  name: string;
  estimate: string | null;
  time: string | null;
}

function readableTime(t: string | null): string {
  if (!t) return "—";
  if (t.includes("pre-market")) return "Pre-market";
  if (t.includes("after-hours")) return "After hours";
  if (t.includes("not-supplied")) return "TBD";
  return t.replace(/-/g, " ");
}

export function EarningsCalendar({ days = 7 }: { days?: number }) {
  const { data } = useSWR<{ rows: Row[] }>(
    `${API_BASE}/earnings/calendar?days=${days}`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).slice(0, 12);

  return (
    <section
      className="rounded-lg overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <div className="inline-flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-wider">
          <Calendar className="h-3.5 w-3.5 text-accent" />
          Upcoming Earnings
        </div>
        <Link
          href="/earnings"
          className="text-[12px] font-semibold text-accent hover:underline"
        >
          Full calendar →
        </Link>
      </div>
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-mute text-[12px]">No earnings scheduled.</div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {rows.map((r) => {
            const d = new Date(r.date + "T00:00:00");
            const short = d.toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            });
            return (
              <li key={`${r.date}-${r.symbol}`}>
                <Link
                  href={`/companies/${encodeURIComponent(r.symbol)}`}
                  className="grid grid-cols-[44px_1fr_auto] gap-3 items-center px-4 py-2.5 hover:bg-[var(--accent-soft)] transition"
                >
                  <div
                    className="text-[11px] uppercase font-bold tracking-wider text-accent text-center leading-tight"
                  >
                    {short}
                  </div>
                  <div className="min-w-0">
                    <div className="font-mono text-[15px] font-bold text-accent truncate">
                      {r.symbol}
                    </div>
                    <div className="text-[12px] text-mute truncate">{r.name}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[11px] uppercase tracking-wider text-mute font-bold">
                      {readableTime(r.time)}
                    </div>
                    <div className="text-[14px] font-bold tabular">
                      {r.estimate || "—"}
                    </div>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
