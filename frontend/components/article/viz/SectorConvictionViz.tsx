"use client";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { VizFrame, VizSkeleton } from "./VizFrame";

/**
 * §7 viz 3 — Sector Comparison Table. "Sector | Avg IQS | Cluster Buys (30
 * days) | YoY Change."
 *
 * Live from `/metrics/sector-conviction`, which defines a cluster the same
 * way the scoring engine does (2+ distinct buyers at one company inside the
 * window), so the number in an article and the number on the platform cannot
 * disagree. The average score is a paygated number like any other, so it goes
 * through `PremiumValue`; the cluster count and the year-over-year change are
 * not scores and stay open.
 *
 * `data-viz="sector-table" data-days="30" data-rows="8"`
 */

interface Row {
  sector: string;
  avgIqs: number | null;
  companies: number;
  clusterBuys: number;
  buyValue: number;
  yoyChangePct: number | null;
}

export function SectorConvictionViz({
  days = 30,
  rows: maxRows = 8,
  sector,
}: {
  days?: number;
  rows?: number;
  /** Highlight one sector — the story's own — without hiding the others. */
  sector?: string | null;
}) {
  const { data, isLoading } = useSWR<{ windowDays: number; sectors: Row[] }>(
    // NB: no "/iqs" segment. IqsController is declared `@Controller()` with no
    // prefix, so its routes sit at the API root — /metrics/..., /companies/...,
    // /rankings. Writing /iqs/metrics/... 404s, the fetch fails, and the viz
    // renders as a blank gap in the middle of the article.
    `${API_BASE}/metrics/sector-conviction?days=${days}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  if (isLoading && !data) return <VizSkeleton height={280} />;
  const all = data?.sectors || [];
  if (all.length === 0) return null;

  // THE YOY COLUMN IS SUPPRESSED UNLESS THE DATA SUPPORTS IT.
  //
  // §7 specifies a "YoY Change" column, but our Form 4 history effectively
  // begins in Aug/Sep 2025 (41 open-market purchases that month, then 87-129 a
  // month after). A year-over-year comparison therefore measures the ingest
  // ramping up, not insider behaviour — it would print enormous increases that
  // look like a finding and are an artefact. On top of that, the year-ago
  // window currently has buys in only six sectors, none of which are in the
  // top rows, so the column renders entirely "n/a".
  //
  // Either outcome is worse than no column: one is misleading, the other looks
  // broken. So the column appears only when at least half the displayed rows
  // have a real figure, and the caption says when it does not.
  const top = all.slice(0, maxRows);
  // Keep the story's own sector visible even if it falls outside the top rows.
  const focus = sector
    ? all.find((r) => r.sector.toLowerCase() === sector.toLowerCase())
    : null;
  const shown = focus && !top.some((r) => r.sector === focus.sector) ? [...top, focus] : top;
  const dropped = all.length - shown.length;
  const withYoy = shown.filter((r) => r.yoyChangePct != null).length;
  const showYoy = shown.length > 0 && withYoy >= Math.ceil(shown.length / 2);

  return (
    <VizFrame
      title="Insider conviction by sector"
      subtitle={`Last ${data?.windowDays ?? days} days`}
      footnote={
        <>
          A cluster buy is one company with two or more distinct insiders filing
          open-market purchases inside the window.
          {!showYoy
            ? " Year-over-year change is not shown: our Form 4 record does not yet cover a comparable window a year back, and a figure drawn from it would measure our own coverage rather than insider behaviour."
            : ""}
          {dropped > 0 ? ` ${dropped} further sector${dropped === 1 ? "" : "s"} not shown — ` : " "}
          <Link href="/sectors" className="text-accent hover:underline">
            see every sector →
          </Link>
        </>
      }
    >
      <table className="w-full text-[13px]" style={{ borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "1px solid var(--border)" }}>
            {["Sector", "Avg Insider Score", "Cluster buys", "Buy value", ...(showYoy ? ["YoY change"] : [])].map(
              (h, i) => (
                <th
                  key={h}
                  className="px-3 py-2 text-[10.5px] font-bold uppercase tracking-wider whitespace-nowrap"
                  style={{ color: "var(--text-mute)", textAlign: i === 0 ? "left" : "right" }}
                >
                  {h}
                </th>
              ),
            )}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => {
            const isFocus = !!sector && r.sector.toLowerCase() === sector.toLowerCase();
            return (
              <tr
                key={r.sector}
                style={{
                  borderBottom: "1px solid var(--border)",
                  background: isFocus ? "var(--accent-soft)" : undefined,
                }}
              >
                <td className="px-3 py-2 whitespace-nowrap" style={{ fontWeight: isFocus ? 700 : 400 }}>
                  {r.sector}
                  {r.companies > 0 ? (
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--text-mute)" }}>
                      ({r.companies})
                    </span>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-right tabular">
                  {r.avgIqs == null ? (
                    "—"
                  ) : (
                    <PremiumValue label="Insider Score">{r.avgIqs.toFixed(1)}</PremiumValue>
                  )}
                </td>
                <td className="px-3 py-2 text-right tabular">{r.clusterBuys}</td>
                <td className="px-3 py-2 text-right tabular whitespace-nowrap">
                  {r.buyValue > 0 ? formatCurrency(r.buyValue) : "—"}
                </td>
                {showYoy ? (
                  <td
                    className="px-3 py-2 text-right tabular whitespace-nowrap font-semibold"
                    style={{
                      color:
                        r.yoyChangePct == null
                          ? "var(--text-mute)"
                          : r.yoyChangePct >= 0
                            ? "var(--good)"
                            : "var(--bad)",
                    }}
                  >
                    {r.yoyChangePct == null
                      ? "n/a"
                      : `${r.yoyChangePct >= 0 ? "+" : ""}${r.yoyChangePct.toFixed(0)}%`}
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </VizFrame>
  );
}
