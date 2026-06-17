"use client";
import useSWR from "swr";
import { API_BASE, DashboardResponse, fetcher, formatCurrency } from "@/lib/api";

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

interface SectorFlowsResponse {
  windowDays: number;
  sectors: Array<{
    sector: string;
    buyValue: number;
    sellValue: number;
    buyCount: number;
    sellCount: number;
    netValue: number;
  }>;
}

export default function SectorsPage() {
  const { data, isLoading } = useSWR<DashboardResponse>(`${API_BASE}/dashboard`, fetcher);
  const { data: flows } = useSWR<SectorFlowsResponse>(
    `${API_BASE}/metrics/sector-flows?days=30`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const sectors = data?.sectors || [];
  const total = sectors.reduce((a, s) => a + s.value, 0) || 1;
  const max = sectors[0]?.value || 1;

  const flowRows = flows?.sectors || [];
  const flowMax = Math.max(
    ...flowRows.map((r) => Math.max(r.buyValue, r.sellValue)),
    1,
  );

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Sector activity</h1>
        <p className="text-mute text-sm mt-1">
          Insider purchase volume by SEC SIC classification, last 7 days, descending.
        </p>
      </header>

      {isLoading ? (
        <div className="card p-12 text-center text-mute">Loading…</div>
      ) : sectors.length === 0 ? (
        <div className="card p-12 text-center text-mute">No sector activity yet.</div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sectors.map((s) => (
            <SectorTile key={s.name} s={s} total={total} max={max} />
          ))}
        </div>
      )}

      {/* Insider Buying vs Selling by Sector — Form 4 P vs S flows */}
      {flowRows.length > 0 && (
        <section className="card overflow-hidden">
          <div
            className="px-4 py-3 border-b"
            style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
          >
            <h2 className="text-[14px] font-bold uppercase tracking-wider">
              Insider Buying vs Selling by Sector
            </h2>
            <p className="text-[11px] text-mute mt-0.5">
              Open-market Form 4 purchases (P) vs sales (S), last{" "}
              {flows?.windowDays ?? 30} days.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Sector</th>
                  <th className="text-right">Bought</th>
                  <th className="text-right">Sold</th>
                  <th className="w-[34%]">Flow</th>
                  <th className="text-right">Net</th>
                </tr>
              </thead>
              <tbody>
                {flowRows.slice(0, 14).map((r) => (
                  <tr key={r.sector}>
                    <td className="text-[13px] font-semibold max-w-[240px] truncate">
                      {r.sector}
                    </td>
                    <td className="text-right tabular" style={{ color: "var(--good)" }}>
                      {formatCurrency(r.buyValue)}
                      <span className="text-[10px] text-faint ml-1">({r.buyCount})</span>
                    </td>
                    <td className="text-right tabular" style={{ color: "var(--bad)" }}>
                      {formatCurrency(r.sellValue)}
                      <span className="text-[10px] text-faint ml-1">({r.sellCount})</span>
                    </td>
                    <td>
                      <div className="flex items-center gap-1 h-2.5">
                        <div
                          className="h-full rounded-l"
                          style={{
                            background: "var(--good)",
                            width: `${Math.max(2, (r.buyValue / flowMax) * 50)}%`,
                          }}
                        />
                        <div
                          className="h-full rounded-r"
                          style={{
                            background: "var(--bad)",
                            width: `${Math.max(2, (r.sellValue / flowMax) * 50)}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td
                      className="text-right tabular font-bold"
                      style={{ color: r.netValue >= 0 ? "var(--good)" : "var(--bad)" }}
                    >
                      {r.netValue >= 0 ? "+" : "−"}
                      {formatCurrency(Math.abs(r.netValue))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
