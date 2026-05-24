"use client";
import Link from "next/link";
import { formatCurrency } from "@/lib/api";

interface Sector {
  name: string;
  value: number;
  count: number;
}

function colorFor(intensity: number) {
  // intensity 0..1 — green at top, blue middle, gray bottom
  if (intensity >= 0.66) return { bg: "var(--good)", fg: "#062f23" };
  if (intensity >= 0.33) return { bg: "var(--accent)", fg: "#06122b" };
  if (intensity >= 0.12) return { bg: "color-mix(in srgb, var(--accent) 35%, var(--bg-2))", fg: "var(--text)" };
  return { bg: "var(--bg-3)", fg: "var(--text-soft)" };
}

export function SectorHeatmap({ sectors }: { sectors: Sector[] }) {
  const cells = sectors.slice(0, 6);
  const total = cells.reduce((a, s) => a + s.value, 0) || 1;
  const max = cells[0]?.value || 1;

  return (
    <div className="card p-5">
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold">Sector insider activity</div>
          <div className="text-xs text-mute mt-0.5">Last 7 days, by purchase volume</div>
        </div>
        <Link
          href="/heatmaps/sector"
          className="text-xs text-accent hover:underline"
        >
          View all →
        </Link>
      </div>
      {cells.length === 0 ? (
        <div className="text-sm text-mute py-8 text-center">No sector activity yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {cells.map((s) => {
            const intensity = s.value / max;
            const { bg, fg } = colorFor(intensity);
            const pct = ((s.value / total) * 100).toFixed(1);
            return (
              <Link
                key={s.name}
                href={`/sectors`}
                className="heatmap-cell group"
                style={{ background: bg, color: fg }}
                title={`${pct}% of weekly volume · ${s.count} trades`}
              >
                <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80 truncate">
                  {s.name}
                </div>
                <div className="text-lg font-bold tabular mt-1">{formatCurrency(s.value)}</div>
                <div className="text-[11px] opacity-75 mt-0.5">{pct}% · {s.count} trades</div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
