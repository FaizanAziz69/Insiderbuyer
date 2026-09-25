"use client";

/**
 * The list visual — George, 2026-09-23, against a reference screenshot:
 * ticker, logo and company on the left, one bar per row on the right carrying
 * the number the list is ranked on.
 *
 * It is the same data contract the ranked bar chart reads, drawn as a table
 * because that is what a fifteen-name screen wants: a reader scanning for a
 * company scans the ticker column, not bar lengths.
 *
 * Bars are signed. A screen of 52-week lows is a column of negative numbers
 * and reads red; the highs screen is the same component and reads green. The
 * sign comes from the value, never from the article.
 */

import Link from "next/link";
import { CompanyLogo } from "@/components/CompanyLogo";
import { IqsBadge } from "./IqsBadge";
import type { ChartPayload, ChartRow } from "./RankedBarChart";

function fmtValue(row: ChartRow): string {
  if (row.valueKind === "pct") return `${row.value >= 0 ? "+" : ""}${row.value.toFixed(2)}%`;
  const n = row.value;
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${n.toFixed(0)}`;
}

export function ScreenTable({
  payload,
  valueHeading,
}: {
  payload: ChartPayload;
  valueHeading?: string;
}) {
  const rows = payload.variants.all ?? payload.variants.discretionary ?? [];
  if (!rows.length) return null;

  // One scale for the whole column so bar lengths are comparable down the page.
  const widest = Math.max(...rows.map((r) => Math.abs(r.value)), 1);

  return (
    <figure className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-[14px]">
          <thead>
            <tr style={{ background: "var(--bg-3)" }}>
              <th scope="col" className="text-left font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] px-3 py-2.5" style={{ color: "var(--text-mute)" }}>
                Ticker
              </th>
              <th scope="col" className="text-left font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] px-3 py-2.5" style={{ color: "var(--text-mute)" }}>
                Company
              </th>
              <th scope="col" className="text-right font-mono text-[10.5px] font-semibold uppercase tracking-[1.4px] px-3 py-2.5 whitespace-nowrap" style={{ color: "var(--text-mute)" }}>
                {valueHeading ?? payload.valueLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const negative = r.value < 0;
              const width = Math.max(6, (Math.abs(r.value) / widest) * 100);
              return (
                <tr key={r.key} style={{ borderTop: "1px solid var(--border)" }}>
                  <td className="px-3 py-2.5 font-mono font-bold whitespace-nowrap align-middle">
                    {r.href ? (
                      <Link href={r.href} className="hover:underline" style={{ color: "var(--text)" }}>
                        {r.label}
                      </Link>
                    ) : (
                      r.label
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-middle">
                    <span className="flex items-center gap-2 min-w-0">
                      <CompanyLogo ticker={r.label} name={r.sublabel ?? r.label} size={20} />
                      <span className="truncate" style={{ color: "var(--text-soft)" }}>
                        {r.sublabel ?? r.label}
                      </span>
                      {r.iqs !== null && <IqsBadge iqs={r.iqs} />}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 align-middle" style={{ width: "42%", minWidth: 180 }}>
                    <span className="flex justify-end">
                      <span
                        className="inline-flex items-center justify-end rounded px-2 py-[3px] font-mono text-[13px] font-semibold tabular-nums"
                        style={{
                          width: `${width}%`,
                          minWidth: 72,
                          background: negative ? "var(--bad-soft)" : "var(--good-soft)",
                          color: negative ? "var(--bad-strong)" : "var(--good-strong)",
                          border: `1px solid ${negative ? "var(--bad)" : "var(--good)"}`,
                        }}
                      >
                        {fmtValue(r)}
                      </span>
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <figcaption className="px-3 py-2.5 text-[11.5px] leading-snug" style={{ borderTop: "1px solid var(--border)", color: "var(--text-mute)" }}>
        {payload.source}
        {payload.cadenceNote ? <span className="block mt-1">{payload.cadenceNote}</span> : null}
      </figcaption>
    </figure>
  );
}
