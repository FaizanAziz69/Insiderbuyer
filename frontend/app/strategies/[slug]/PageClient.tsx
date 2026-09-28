"use client";
import Link from "next/link";
import { useState } from "react";
import { API_BASE } from "@/lib/api";
import { usePremiumSWR } from "@/lib/premium-fetch";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { RecordBadge, type RecordType } from "@/components/strategies/RecordBadge";

/** Brief v8 §5.2 — one strategy: chart, rules, parameters, metrics, limitations. */

const pct = (v: number | null | undefined, d = 1) =>
  v == null || !Number.isFinite(v) ? "—" : `${v > 0 ? "+" : ""}${(v * 100).toFixed(d)}%`;
const num = (v: number | null | undefined, d = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toFixed(d);

export default function PageClient({ slug }: { slug: string }) {
  const { data } = usePremiumSWR<any>(`${API_BASE}/strategies/${encodeURIComponent(slug)}`);
  if (!data) return <div className="text-[13px] text-mute py-10">Loading…</div>;
  if (data.error) return <div className="text-[13px] text-mute py-10">Strategy not found.</div>;

  const m = data.metrics || {};
  // §5.2's benchmark toggles. Which lines exist is decided by the run, because
  // a benchmark whose price series we do not hold must not be offered as a
  // choice that silently draws a flat line.
  const benchmarks: Array<{ key: string; label: string }> =
    data.benchmarks?.length ? data.benchmarks : [{ key: "sp500", label: "S&P 500" }];
  const equity: Array<{ date: string; value: number; benchmark: number }> = data.equity || [];
  const noResult = (data.rebalances ?? 0) === 0 || equity.length < 4;
  const withheld = data.premium === false;

  return (
    <div className="space-y-6">
      <header>
        <Link href="/strategies" className="text-[12px] text-accent hover:underline">
          ← All strategies
        </Link>
        <div className="flex flex-wrap items-center gap-2.5 mt-2">
          <h1 className="text-[28px] sm:text-[34px] font-semibold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
            {data.name}
          </h1>
          {/* §4.1 — the badge travels with every performance surface. */}
          <RecordBadge type={data.recordType as RecordType} size="md" />
        </div>
        <div className="text-[12px] text-mute mt-1.5">
          {data.dataset} · rebalanced every {data.rebalanceDays} days · parameters v{data.version}
          {data.from && data.to ? ` · tested ${data.from} → ${data.to}` : ""}
        </div>
      </header>

      {noResult ? (
        <section className="card p-5" style={{ border: "1px dashed var(--border)" }}>
          <h2 className="text-[15px] font-bold">No result to publish yet</h2>
          <ul className="mt-2 space-y-1.5">
            {(data.notes || []).map((n: string, i: number) => (
              <li key={i} className="text-[13px] text-mute leading-relaxed">{n}</li>
            ))}
          </ul>
        </section>
      ) : (
        <>
          <EquityChart equity={equity} benchmarks={benchmarks} />
          <section className="card p-4">
            <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute">Metrics</h2>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-3">
              <Metric label="Total return" value={pct(m.totalReturn)} />
              <Metric label="S&P 500" value={pct(m.benchmarkTotalReturn)} />
              <Metric label="CAGR" value={pct(m.cagr)} />
              <Metric label="Sortino" value={num(m.sortino)} />
              <Metric label="Sharpe" value={num(m.sharpe)} />
              <Metric label="Calmar" value={num(m.calmar)} />
              <Metric label="Max drawdown" value={pct(m.maxDrawdown)} />
              <Metric label="Volatility" value={pct(m.volatility)} />
              <Metric label="Downside capture" value={num(m.downsideCapture)} />
              <Metric label="Upside capture" value={num(m.upsideCapture)} />
              <Metric label="Turnover / rebalance" value={pct(data.turnover)} />
              <Metric label="Hit rate" value={pct(data.hitRate)} />
            </div>
          </section>
        </>
      )}

      <section className="card p-4">
        <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute">The rules</h2>
        <p className="text-[14px] mt-2 leading-relaxed">{data.rulesPlain}</p>
        <h3 className="text-[11px] uppercase tracking-wider font-bold text-mute mt-4">
          Exact parameters (v{data.version})
        </h3>
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 mt-2">
          {Object.entries(data.params || {}).map(([k, v]) => (
            <div key={k} className="flex justify-between text-[12.5px] border-b py-1" style={{ borderColor: "var(--border)" }}>
              <span className="text-mute">{k}</span>
              <span className="tabular font-semibold">{String(v)}</span>
            </div>
          ))}
        </div>
      </section>

      {/* §5.3 — holdings and the rebalance log are Premium. */}
      <section className="card p-4">
        <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute">Current holdings</h2>
        {withheld ? (
          <div className="mt-3">
            <PremiumValue label="Strategy holdings">
              <span className="text-[13px]">Unlock the full holdings list with weights and entry dates.</span>
            </PremiumValue>
          </div>
        ) : (data.holdings || []).length ? (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[10.5px] uppercase tracking-wider text-mute">
                  <th className="text-left py-1.5">Ticker</th>
                  <th className="text-right">Weight</th>
                  <th className="text-left pl-4">Entered</th>
                  <th className="text-left pl-4">Why</th>
                </tr>
              </thead>
              <tbody>
                {data.holdings.map((h: any) => (
                  <tr key={h.ticker} className="border-t" style={{ borderColor: "var(--border)" }}>
                    <td className="py-1.5 font-mono font-bold">
                      <Link href={`/companies/${h.ticker}`} className="text-accent hover:underline">{h.ticker}</Link>
                    </td>
                    <td className="text-right tabular">{(h.weight * 100).toFixed(1)}%</td>
                    <td className="pl-4 text-mute">{h.entryDate}</td>
                    <td className="pl-4 text-mute">{h.trigger}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-mute mt-2">No positions at the last rebalance.</p>
        )}
      </section>

      <section className="card p-4">
        <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute">
          What this strategy cannot see
        </h2>
        <ul className="mt-2 space-y-2">
          {(data.limitations || []).map((l: string, i: number) => (
            <li key={i} className="text-[13px] text-mute leading-relaxed">• {l}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-mute font-bold">{label}</div>
      <div className="text-[16px] font-bold tabular mt-0.5">{value}</div>
    </div>
  );
}

/**
 * §5.2's growth chart with the benchmark, and the drawdown beneath it.
 *
 * Both series share one scale — separately normalised curves always look close,
 * and the question the chart exists to answer is which one is higher.
 */
function EquityChart({
  equity,
  benchmarks,
}: {
  equity: Array<any>;
  benchmarks: Array<{ key: string; label: string }>;
}) {
  const [benchKey, setBenchKey] = useState(benchmarks[0]?.key ?? "sp500");
  const active = benchmarks.find((b) => b.key === benchKey) ?? benchmarks[0];
  const W = 760;
  const H = 220;
  const DH = 70;
  const benchAt = (e: any) => (Number.isFinite(e?.[benchKey]) ? e[benchKey] : e.benchmark);
  const vals = equity.flatMap((e) => [e.value, benchAt(e)]).filter(Number.isFinite);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  const x = (i: number) => (i / Math.max(1, equity.length - 1)) * W;
  const y = (v: number) => H - ((v - lo) / span) * H;
  const path = (pick: (e: any) => number) =>
    equity.map((e, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(e)).toFixed(1)}`).join(" ");

  let peak = -Infinity;
  const dd = equity.map((e) => {
    peak = Math.max(peak, e.value);
    return peak > 0 ? e.value / peak - 1 : 0;
  });
  const ddMin = Math.min(...dd, -0.0001);
  const ddPath = dd.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${(DH - (d / ddMin) * DH).toFixed(1)}`).join(" ");

  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-center gap-4 mb-2">
        <Legend color="var(--accent)" label="Strategy" />
        <Legend color="var(--text-faint)" label={active?.label ?? "Benchmark"} />
        {benchmarks.length > 1 && (
          <div className="ml-auto flex items-center gap-1.5">
            <span className="text-[10px] uppercase tracking-wider text-mute font-bold">Compare to</span>
            {benchmarks.map((b) => (
              <button
                key={b.key}
                onClick={() => setBenchKey(b.key)}
                className="px-2 h-6 rounded-md text-[11px] font-semibold"
                style={{
                  background: benchKey === b.key ? "var(--accent-soft)" : "transparent",
                  color: benchKey === b.key ? "var(--accent)" : "var(--text-mute)",
                  border: "1px solid var(--border)",
                }}
              >
                {b.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label="Growth">
          <path d={path(benchAt)} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
          <path d={path((e) => e.value)} fill="none" stroke="var(--accent)" strokeWidth="2" />
        </svg>
        <div className="text-[10px] uppercase tracking-wider text-mute font-bold mt-3 mb-1">Drawdown</div>
        <svg viewBox={`0 0 ${W} ${DH}`} width="100%" height={DH} preserveAspectRatio="none" aria-label="Drawdown">
          <path d={ddPath} fill="none" stroke="var(--bad)" strokeWidth="1.5" />
        </svg>
      </div>
      <div className="flex justify-between text-[10.5px] text-mute mt-1">
        <span>{equity[0]?.date}</span>
        <span>{equity[equity.length - 1]?.date}</span>
      </div>
    </section>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11.5px] text-mute">
      <span style={{ width: 14, height: 2, background: color, display: "inline-block" }} />
      {label}
    </span>
  );
}
