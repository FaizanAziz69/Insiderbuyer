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
 * Live from `/iqs/metrics/sector-conviction`, which defines a cluster the same
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
    `${API_BASE}/iqs/metrics/sector-conviction?days=${days}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  if (isLoading && !data) return <VizSkeleton height={280} />;
  const all = data?.sectors || [];
  if (all.length === 0) return null;

  // Keep the story's sector visible even if it falls outside the top rows.
  const top = all.slice(0, maxRows);
  const focus = sector
    ? all.find((r) => r.sector.toLowerCase() === sector.toLowerCase())
    : null;
  const shown = focus && !top.some((r) => r.sector === focus.sector) ? [...top, focus] : top;
  const dropped = all.length - shown.length;

  return (
    <VizFrame
      title="Insider conviction by sector"
      subtitle={`Last ${data?.windowDays ?? days} days`}
      footnote={
        <>
          A cluster buy is one company with two or more distinct insiders filing
          open-market purchases inside the window.
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
            {["Sector", "Avg Insider Score", "Cluster buys", "Buy value", "YoY change"].map(
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
              </tr>
            );
          })}
        </tbody>
      </table>
    </VizFrame>
  );
}
