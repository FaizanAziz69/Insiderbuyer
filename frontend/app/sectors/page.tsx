"use client";
import useSWR from "swr";
import { API_BASE, DashboardResponse, fetcher, formatCurrency } from "@/lib/api";
import { PremiumGate } from "@/components/PremiumGate";

function colorFor(intensity: number) {
  if (intensity >= 0.66) return { bg: "var(--good)", fg: "#062f23" };
  if (intensity >= 0.33) return { bg: "var(--accent)", fg: "#06122b" };
  if (intensity >= 0.12)
    return { bg: "color-mix(in srgb, var(--accent) 35%, var(--bg-2))", fg: "var(--text)" };
  return { bg: "var(--bg-3)", fg: "var(--text-soft)" };
}

function SectorTile({
  s,
  total,
  max,
}: {
  s: { name: string; value: number; count: number };
  total: number;
  max: number;
}) {
  const intensity = s.value / max;
  const { bg, fg } = colorFor(intensity);
  const pct = ((s.value / total) * 100).toFixed(1);
  return (
    <div
      className="heatmap-cell"
      style={{ background: bg, color: fg, minHeight: 120 }}
      title={`${pct}% of weekly volume · ${s.count} trades`}
    >
      <div className="text-[11px] font-semibold uppercase tracking-wider opacity-80 truncate">
        {s.name}
      </div>
      <div className="text-2xl font-bold tabular mt-2">{formatCurrency(s.value)}</div>
      <div className="text-xs opacity-75 mt-1">
        {pct}% · {s.count} trades
      </div>
    </div>
  );
}

export default function SectorsPage() {
  const { data, isLoading } = useSWR<DashboardResponse>(`${API_BASE}/dashboard`, fetcher);
  const sectors = data?.sectors || [];
  const total = sectors.reduce((a, s) => a + s.value, 0) || 1;
  const max = sectors[0]?.value || 1;
  const top3 = sectors.slice(0, 3);
  const rest = sectors.slice(3);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Sector activity</h1>
        <p className="text-mute text-sm mt-1">
          Insider purchase volume by SEC SIC classification, last 7 days, descending. Top 3 sectors
          are premium.
        </p>
      </header>

      {isLoading ? (
        <div className="card p-12 text-center text-mute">Loading…</div>
      ) : sectors.length === 0 ? (
        <div className="card p-12 text-center text-mute">No sector activity yet.</div>
      ) : (
        <>
          {top3.length > 0 && (
            <PremiumGate label="sectors" count={3}>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3">
                {top3.map((s) => (
                  <SectorTile key={s.name} s={s} total={total} max={max} />
                ))}
              </div>
            </PremiumGate>
          )}
          {rest.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {rest.map((s) => (
                <SectorTile key={s.name} s={s} total={total} max={max} />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
