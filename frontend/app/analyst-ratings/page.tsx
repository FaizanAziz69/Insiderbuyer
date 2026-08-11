"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Star } from "lucide-react";
import { API_BASE, fetcher } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { AnalystRatingsPopover } from "@/components/AnalystRatingsPopover";

/** One ranked Wall Street analyst — matches the stockanalysis.com "Top
 *  Analysts" table: name, firm, main sector, measured success rate + average
 *  return, rating count and last rating date. */
interface AnalystRow {
  analyst: string;
  firm: string | null;
  slug: string;
  ratings: number;
  scoredRatings: number;
  successRate: number | null;
  avgReturn: number | null;
  mainSector: string | null;
  lastRatingMs: number | null;
}

function fmtDate(ms: number | null): string {
  if (!ms) return "—";
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export default function AnalystRatingsPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{ rows: AnalystRow[] }>(
    `${API_BASE}/analysts/top?limit=100`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).filter(
    (r) =>
      !q ||
      r.analyst.toLowerCase().includes(q.toLowerCase()) ||
      (r.firm || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.mainSector || "").toLowerCase().includes(q.toLowerCase()),
  );

  const columns: Column<AnalystRow>[] = [
    rankColumn<AnalystRow>(),
    {
      key: "analyst",
      label: "Analyst Name",
      sortValue: (r) => r.analyst,
      render: (r) => <AnalystRatingsPopover name={r.analyst} slug={r.slug} />,
    },
    {
      key: "firm",
      label: "Company",
      sortValue: (r) => r.firm || "",
      render: (r) => (
        <span className="text-[13px]" style={{ color: "var(--text-soft)" }}>
          {r.firm || "—"}
        </span>
      ),
    },
    {
      key: "mainSector",
      label: "Main Sector",
      sortValue: (r) => r.mainSector || "",
      render: (r) => (
        <span className="text-[13px]" style={{ color: "var(--text-soft)" }}>
          {r.mainSector || "—"}
        </span>
      ),
    },
    {
      key: "successRate",
      label: "Success Rate",
      pro: true,
      info: "Share of this analyst's directional price-target calls that moved the way they implied, one year out (or to date). Shown once they have enough calls at least 30 days old.",
      align: "right",
      sortValue: (r) => r.successRate ?? -1,
      render: (r) =>
        r.successRate == null ? (
          <span className="text-mute text-[12px]">Pending</span>
        ) : (
          <span
            className="tabular font-bold text-[13.5px]"
            style={{ color: r.successRate >= 50 ? "var(--good)" : "var(--bad)" }}
          >
            {r.successRate.toFixed(1)}%
          </span>
        ),
    },
    {
      key: "avgReturn",
      label: "Average Return",
      pro: true,
      info: "Average price move in the direction the analyst's target implied, across their scored calls.",
      align: "right",
      sortValue: (r) => r.avgReturn ?? -9999,
      render: (r) =>
        r.avgReturn == null ? (
          <span className="text-mute text-[12px]">—</span>
        ) : (
          <span
            className="tabular font-bold text-[13.5px]"
            style={{ color: r.avgReturn >= 0 ? "var(--good)" : "var(--bad)" }}
          >
            {r.avgReturn >= 0 ? "+" : ""}
            {r.avgReturn.toFixed(2)}%
          </span>
        ),
    },
    {
      key: "ratings",
      label: "Ratings",
      align: "right",
      sortValue: (r) => r.ratings,
      render: (r) => <span className="tabular text-[13.5px]">{r.ratings}</span>,
    },
    {
      key: "lastRatingMs",
      label: "Last Rating",
      align: "right",
      sortValue: (r) => r.lastRatingMs ?? 0,
      render: (r) => (
        <span className="text-mute text-[13px] tabular whitespace-nowrap">
          {fmtDate(r.lastRatingMs)}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Star className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Top Analysts</span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Top Wall Street Analysts
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Individual Wall Street analysts ranked by measured performance — the
          success rate and average return of their price-target calls, scored
          from each note&rsquo;s posting price against the year that followed.
          A rate shows once an analyst has enough calls at least 30 days old;
          newer coverage reads &ldquo;Pending&rdquo; rather than guessing.
        </p>
      </header>

      <div className="flex flex-wrap gap-x-6 gap-y-1.5">
        <Link
          href="/analyst-stocks"
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
        >
          See the stocks analysts rate most highly →
        </Link>
      </div>

      <AdSlot slot="leaderboard" seed="analyst-top" />

      <div
        className="card p-4"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <label className="block text-[11px] uppercase tracking-wider font-bold text-mute mb-1">
          Search
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Analyst, firm or sector…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-md text-[13px]"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading analyst performance…</div>
        ) : (
          <DataTable<AnalystRow>
            rows={rows}
            rowKey={(r) => r.slug || r.analyst}
            initialSort={{ key: "successRate", dir: "desc" }}
            empty="No matching analysts."
            columns={columns}
            gate={{
              label: "Top Analysts",
              bullets: [
                "Every ranked analyst, not just the preview",
                "Success rates and average returns as they mature",
                "Click any analyst for their rating history",
                "Firm and sector coverage for each analyst",
              ],
            }}
          />
        )}
      </div>

      <p className="text-[12px] text-mute leading-relaxed">
        Success rate = share of an analyst&rsquo;s directional calls that moved
        the way their target implied, one year out (or to date). Average return
        is the mean move in that direction. Measured from our own record of
        published price targets — informational, not investment advice.
      </p>
    </div>
  );
}
