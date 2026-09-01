"use client";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";

/**
 * IQS 2.0 shadow panel for /score-explainer (brief Workstream E: the
 * explainer "renders the Workstream A decision for every transaction
 * (counted or excluded + reason), each component's inputs, sub-scores, decay
 * factors, penalties, and the final number").
 *
 * Published site-wide on George's instruction (2026-09-02): the score written
 * into iqs_scores.iqs is this one, so every surface reads it. The panel is the
 * audit trail behind that number — the brief calls the explainer "the trust
 * product", and it must be complete rather than illustrative.
 */
interface TradeRow {
  tx_id: string;
  transaction_date: string;
  insiderName: string | null;
  transactionCode: string | null;
  totalValue: number | null;
  scored: boolean;
  reason: string | null;
  detail: string | null;
  trade_score: string | number | null;
  components: Record<string, number> | null;
}
interface Iqs2Explain {
  found: boolean;
  ticker?: string;
  score?: {
    score: string | number | null;
    raw: string | number;
    multiplier: string | number;
    percentile: string | number;
    calibrated: string | number;
    penalties: { dilution: number; litigation: number } | null;
    distinct_buyers: number;
    counted_trades: number;
    unscored_reason: string | null;
    as_of: string;
  } | null;
  trades?: TradeRow[];
}

const n = (v: unknown): number | null => {
  const x = Number(v);
  return Number.isFinite(x) ? x : null;
};

const COMPONENT_LABELS: Record<string, string> = {
  conviction: "Conviction size",
  trackRecord: "Insider track record",
  seniority: "Seniority",
  opportunistic: "Opportunistic vs routine",
  contrarian: "Contrarian timing",
  valuationSize: "Valuation & size",
  ownership: "Ownership context",
};

export function Iqs2Panel({ ticker }: { ticker: string }) {
  const { data } = useSWR<Iqs2Explain>(
    ticker ? `${API_BASE}/iqs2/explain/${encodeURIComponent(ticker)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  if (!data?.found) return null;

  const s = data.score;
  const trades = data.trades || [];
  const counted = trades.filter((t) => t.scored);
  const excluded = trades.filter((t) => !t.scored);

  // Excluded lines grouped by reason — the histogram is the point: most Form 4
  // activity is not open-market buying at all.
  const byReason = new Map<string, number>();
  for (const t of excluded) byReason.set(t.reason || "OTHER", (byReason.get(t.reason || "OTHER") || 0) + 1);

  return (
    <section className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[17px] font-bold">IQS 2.0</h2>
        <span
          className="text-[10.5px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
          style={{ background: "var(--good)", color: "#fff" }}
        >
          Live
        </span>
        {s?.as_of && (
          <span className="text-[12px] text-mute">as of {String(s.as_of).slice(0, 10)}</span>
        )}
      </div>
      <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--text-mute)" }}>
        This is the score shown across the site. Below is the full working: every
        purchase counted, every filing excluded and why, each component of each
        trade score, the decay and cluster multiplier, and the penalties applied
        after ranking.
      </p>

      {s?.unscored_reason ? (
        <div className="text-[13px]" style={{ color: "var(--gold)" }}>
          Unscored — {s.unscored_reason === "BELOW_PRICE_FLOOR" ? "below the $0.10 price floor" : "below the liquidity floor"}.
          An unscored company is not a zero: we have no basis to rank it.
        </div>
      ) : s ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            ["Score", n(s.score) == null ? "—" : n(s.score)!.toFixed(1)],
            ["Percentile", `${((n(s.percentile) ?? 0) * 100).toFixed(1)}%`],
            ["Cluster ×", (n(s.multiplier) ?? 1).toFixed(2)],
            ["Buyers / trades", `${s.distinct_buyers} / ${s.counted_trades}`],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg p-3" style={{ background: "var(--bg-2)" }}>
              <div className="text-[11px] uppercase tracking-wider text-mute">{label}</div>
              <div className="text-[19px] font-bold tabular">{value}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-[13px] text-mute">
          No shadow score yet for this ticker — the nightly run covers companies
          with qualifying buying in the trailing 90 days.
        </div>
      )}

      {s?.penalties && (n(s.penalties.dilution) || n(s.penalties.litigation)) ? (
        <div className="text-[13px]" style={{ color: "var(--bad)" }}>
          Penalties applied after calibration: dilution −{(n(s.penalties.dilution) ?? 0).toFixed(1)}
          {n(s.penalties.litigation) ? `, litigation −${(n(s.penalties.litigation) ?? 0).toFixed(1)}` : ""}
        </div>
      ) : null}

      {counted.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-mute mb-2">
            Counted purchases ({counted.length})
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-[12.5px]">
              <thead>
                <tr className="text-mute text-left">
                  <th className="py-1 pr-3">Date</th>
                  <th className="py-1 pr-3">Insider</th>
                  <th className="py-1 pr-3 text-right">Value</th>
                  <th className="py-1 pr-3 text-right">Trade score</th>
                  <th className="py-1">Largest components</th>
                </tr>
              </thead>
              <tbody>
                {counted.slice(0, 25).map((t) => {
                  const comps = Object.entries(t.components || {})
                    .sort((a, b) => b[1] - a[1])
                    .slice(0, 3)
                    .map(([k, v]) => `${COMPONENT_LABELS[k] || k} ${v.toFixed(1)}`)
                    .join(" · ");
                  return (
                    <tr key={t.tx_id} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-1.5 pr-3 tabular">{String(t.transaction_date).slice(0, 10)}</td>
                      <td className="py-1.5 pr-3 truncate max-w-[200px]">{t.insiderName}</td>
                      <td className="py-1.5 pr-3 text-right tabular">
                        {n(t.totalValue) == null ? "—" : `$${Math.round(n(t.totalValue)!).toLocaleString()}`}
                      </td>
                      <td className="py-1.5 pr-3 text-right tabular font-bold" style={{ color: "var(--accent)" }}>
                        {n(t.trade_score) == null ? "—" : n(t.trade_score)!.toFixed(1)}
                      </td>
                      <td className="py-1.5 text-mute">{comps}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {excluded.length > 0 && (
        <div>
          <h3 className="text-[13px] font-bold uppercase tracking-wider text-mute mb-2">
            Excluded lines ({excluded.length}) — every one carries a reason
          </h3>
          <ul className="text-[12.5px] space-y-1">
            {Array.from(byReason.entries())
              .sort((a, b) => b[1] - a[1])
              .map(([reason, count]) => (
                <li key={reason} className="flex justify-between gap-4">
                  <span style={{ color: "var(--text-mute)" }}>
                    {reason.replaceAll("_", " ").toLowerCase()}
                  </span>
                  <span className="tabular">{count}</span>
                </li>
              ))}
          </ul>
        </div>
      )}
    </section>
  );
}
