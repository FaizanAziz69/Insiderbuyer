"use client";
import Link from "next/link";
import { useRef, useState } from "react";
import { API_BASE } from "@/lib/api";
import { usePremiumSWR } from "@/lib/premium-fetch";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { PaywallOverlay } from "@/components/PaywallOverlay";
import { decoyEquity } from "@/components/strategies/decoy";
import { RecordBadge, type RecordType } from "@/components/strategies/RecordBadge";

/**
 * Brief v8 §5.2 — one strategy: chart, rules, parameters, metrics, limitations.
 *
 * Faizan 2026-09-29 ("paygate this page", /strategies): the curve and the
 * metrics are Premium now, alongside the holdings and log §5.3 already gated.
 * A guest's payload has them deleted (backend strategies/gating.ts), so the
 * locked view draws a decoy curve under the site's one paywall overlay. The
 * rules, exact parameters and limitations stay free — they are the honesty
 * the page is built on, and what a crawler should index.
 */

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
  const withheld = data.premium === false;
  const equity: Array<{ date: string; value: number; benchmark: number }> = withheld
    ? decoyEquity(slug)
    : data.equity || [];
  // Withheld payloads carry no curve, so its length says nothing about whether
  // a result exists; the rebalance count is the field that survives.
  const noResult = (data.rebalances ?? 0) === 0 || (!withheld && equity.length < 4);

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
        <Performance withheld={withheld} name={data.name}>
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
              {/* §6 models costs; showing what they came to is what lets a
                  reader weigh a high-turnover strategy against a quiet one. */}
              <Metric label="Costs paid" value={pct(data.costsPaid)} />
            </div>
          </section>
        </Performance>
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
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute">Current holdings</h2>
          {!withheld && (data.holdings || []).length > 0 && (
            <CsvButton slug={data.slug} holdings={data.holdings} />
          )}
        </div>
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

      {/* §5.2's rebalance log — every add and drop with its trigger. Premium. */}
      <section className="card p-4">
        <h2 className="text-[13px] uppercase tracking-wider font-bold text-mute">Rebalance log</h2>
        {withheld ? (
          <div className="mt-3">
            <PremiumValue label="Rebalance log">
              <span className="text-[13px]">
                Unlock every add and drop this strategy has made, with the trigger for each.
              </span>
            </PremiumValue>
          </div>
        ) : (data.rebalanceLog || []).length ? (
          <RebalanceLog log={data.rebalanceLog} />
        ) : (
          <p className="text-[13px] text-mute mt-2">No changes recorded over the test window.</p>
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

/**
 * §5.2's rebalance log. Newest first, because the question a reader arrives
 * with is what changed at the last rebalance, not what changed five years ago.
 * Capped in the view with a control to see the rest — a weekly strategy has
 * thousands of rows and rendering all of them helps nobody.
 */
function RebalanceLog({ log }: { log: Array<{ date: string; ticker: string; action: string; trigger: string }> }) {
  const [all, setAll] = useState(false);
  const rows = [...log].reverse();
  const shown = all ? rows : rows.slice(0, 25);
  return (
    <>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-mute">
              <th className="text-left py-1.5">Date</th>
              <th className="text-left">Action</th>
              <th className="text-left">Ticker</th>
              <th className="text-left pl-4">Trigger</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={`${r.date}-${r.ticker}-${i}`} className="border-t" style={{ borderColor: "var(--border)" }}>
                <td className="py-1.5 text-mute tabular whitespace-nowrap">{r.date}</td>
                <td>
                  <span
                    className="text-[10.5px] font-bold uppercase tracking-wider"
                    style={{ color: r.action === "add" ? "var(--good)" : "var(--bad)" }}
                  >
                    {r.action === "add" ? "Added" : "Dropped"}
                  </span>
                </td>
                <td className="font-mono font-bold">
                  <Link href={`/companies/${r.ticker}`} className="text-accent hover:underline">{r.ticker}</Link>
                </td>
                <td className="pl-4 text-mute">{r.trigger}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > 25 && (
        <button
          onClick={() => setAll((v) => !v)}
          className="text-[12px] text-accent hover:underline mt-2.5"
        >
          {all ? "Show fewer" : `Show all ${rows.length} changes`}
        </button>
      )}
    </>
  );
}

/**
 * §5.3's CSV export, Premium.
 *
 * Built in the browser from the holdings already on the page rather than
 * fetched: the data is here, and a download the viewer starts themselves needs
 * no second round trip to say the same thing.
 */
function CsvButton({ slug, holdings }: { slug: string; holdings: any[] }) {
  const onClick = () => {
    const esc = (v: string) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = ["ticker,weight,entry_date,trigger"];
    for (const h of holdings) {
      lines.push([h.ticker, (h.weight ?? 0).toFixed(6), h.entryDate, esc(h.trigger)].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug}-holdings.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };
  return (
    <button
      onClick={onClick}
      className="px-2.5 h-7 rounded-md text-[11.5px] font-semibold"
      style={{ background: "var(--bg-2)", color: "var(--text-mute)", border: "1px solid var(--border)" }}
    >
      Export CSV
    </button>
  );
}

/**
 * The chart and metrics grid, walled for a guest. Under the blur is a decoy
 * curve and a grid of dashes (the metric fields are absent), which is all a
 * height-clipped peek needs to show what membership buys.
 */
function Performance({
  withheld,
  name,
  children,
}: {
  withheld: boolean;
  name: string;
  children: React.ReactNode;
}) {
  if (!withheld) return <div className="space-y-6">{children}</div>;
  return (
    <PaywallOverlay
      title={`See how ${name} has actually performed`}
      subtitle="The equity curve, drawdowns and every metric are for members."
      bullets={[
        "Total return, CAGR, Sortino, Sharpe, Calmar and max drawdown",
        "The curve against the S&P 500, Russell 2000 and a 60/20/20 blend",
        "Current holdings with weights and entry dates, exportable to CSV",
        "Every rebalance the engine has made, with the trigger for each",
      ]}
      peekHeight={380}
    >
      <div className="space-y-6">{children}</div>
    </PaywallOverlay>
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
 *
 * Read in dollars, not index points. The stored curve starts at 1.0, which
 * tells a reader nothing: a line going up could be 20% or 200%. Scaled to a
 * $10,000 opening balance it answers the question people actually bring to a
 * strategy page, and §1 aims this page at a general reader rather than at
 * someone fluent in normalised series.
 */
function EquityChart({
  equity,
  benchmarks,
}: {
  equity: Array<any>;
  benchmarks: Array<{ key: string; label: string }>;
}) {
  const [benchKey, setBenchKey] = useState(benchmarks[0]?.key ?? "sp500");
  const [hover, setHover] = useState<number | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const active = benchmarks.find((b) => b.key === benchKey) ?? benchmarks[0];

  const W = 760;
  const H = 220;
  const DH = 80;
  const PAD_L = 54; // room for the axis labels, which sit inside the viewBox
  const BASE = 10_000;

  const benchAt = (e: any) => (Number.isFinite(e?.[benchKey]) ? e[benchKey] : e.benchmark);
  const vals = equity.flatMap((e) => [e.value, benchAt(e)]).filter(Number.isFinite);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  const span = hi - lo || 1;
  // PAD_L is padding on the WRAPPER now, so the viewBox is all plot.
  const plotW = W;
  const x = (i: number) => (i / Math.max(1, equity.length - 1)) * plotW;
  const y = (v: number) => H - ((v - lo) / span) * H;
  const path = (pick: (e: any) => number) =>
    equity.map((e, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(pick(e)).toFixed(1)}`).join(" ");

  // Round dollar levels rather than whatever the data's min and max happen to
  // be — an axis reading "$13,847" is a number nobody asked for.
  const money = (v: number) => `$${Math.round(v * BASE).toLocaleString()}`;
  const ticks = (() => {
    const loD = lo * BASE;
    const hiD = hi * BASE;
    const rough = (hiD - loD) / 4;
    const mag = Math.pow(10, Math.floor(Math.log10(Math.max(1, rough))));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? mag * 10;
    const out: number[] = [];
    for (let v = Math.ceil(loD / step) * step; v <= hiD; v += step) out.push(v / BASE);
    return out;
  })();

  // Drawdown, recomputed here so the axis beneath can be labelled in percent.
  let peak = -Infinity;
  const dd = equity.map((e) => {
    peak = Math.max(peak, e.value);
    return peak > 0 ? e.value / peak - 1 : 0;
  });
  const ddMin = Math.min(...dd, -0.0001);
  const ddY = (d: number) => (d / ddMin) * DH;
  const ddPath = dd.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${ddY(d).toFixed(1)}`).join(" ");
  const worstIdx = dd.indexOf(Math.min(...dd));

  // One label per calendar year, so a reader can place the shape in time.
  const yearTicks = (() => {
    const seen = new Set<string>();
    const out: Array<{ i: number; label: string }> = [];
    equity.forEach((e, i) => {
      const yr = String(e?.date || "").slice(0, 4);
      if (yr && !seen.has(yr)) {
        seen.add(yr);
        out.push({ i, label: yr });
      }
    });
    return out;
  })();

  const pointFromClientX = (clientX: number) => {
    const rect = boxRef.current?.getBoundingClientRect();
    if (!rect || !equity.length) return null;
    // The svg is stretched to the box width, so the mapping is linear on it.
    // rect is the padded wrapper; the plot starts PAD_L in.
    const plotPx = rect.width - PAD_L;
    const frac = (clientX - rect.left - PAD_L) / Math.max(1, plotPx);
    const i = Math.round(frac * (equity.length - 1));
    return Math.max(0, Math.min(equity.length - 1, i));
  };

  const h = hover != null ? equity[hover] : null;
  const hDiff = h ? (h.value - benchAt(h)) * BASE : 0;

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

      <p className="text-[11.5px] text-mute mb-2">
        What ${BASE.toLocaleString()} would have become, before tax. Simulated — see the record
        badge above.
      </p>

      <div
        ref={boxRef}
        className="relative"
        style={{ paddingLeft: PAD_L }}
        onMouseMove={(e) => setHover(pointFromClientX(e.clientX))}
        onMouseLeave={() => setHover(null)}
        onTouchStart={(e) => setHover(pointFromClientX(e.touches[0].clientX))}
        onTouchMove={(e) => setHover(pointFromClientX(e.touches[0].clientX))}
        onTouchEnd={() => setHover(null)}
      >
        {/* Axis labels are HTML, not SVG text. The chart stretches to the
            container with preserveAspectRatio="none", which is right for the
            lines and wrong for type: at 2.5x it smeared the drawdown's "0%"
            and "-6%" sideways, and the bottom label fell outside the viewBox
            and was clipped. HTML labels sit beside the plot and do neither. */}
        {ticks.map((t) => (
          <span
            key={t}
            className="absolute text-[10px] font-bold tabular"
            style={{ left: 0, top: y(t) - 7, width: PAD_L - 8, textAlign: "right", color: "var(--text-mute)" }}
          >
            {money(t)}
          </span>
        ))}
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-label="Growth">
          {ticks.map((t) => (
            <line
              key={t}
              x1={0}
              x2={W}
              y1={y(t)}
              y2={y(t)}
              stroke="var(--border)"
              strokeWidth="1"
              opacity="0.6"
            />
          ))}
          <path d={path(benchAt)} fill="none" stroke="var(--text-faint)" strokeWidth="1.5" />
          <path d={path((e) => e.value)} fill="none" stroke="var(--accent)" strokeWidth="2" />
          {hover != null && (
            <>
              <line x1={x(hover)} x2={x(hover)} y1={0} y2={H} stroke="var(--text-mute)" strokeWidth="1" opacity="0.5" />
              <circle cx={x(hover)} cy={y(equity[hover].value)} r="3.5" fill="var(--accent)" />
              <circle cx={x(hover)} cy={y(benchAt(equity[hover]))} r="3" fill="var(--text-faint)" />
            </>
          )}
        </svg>

        {h && (
          <div
            className="absolute pointer-events-none rounded-lg px-3 py-2 text-[11.5px] shadow-lg"
            style={{
              // An absolutely positioned child measures percentages against the
              // PADDING box, which includes the axis gutter — so a raw
              // percentage would drift every tooltip rightwards. This walks the
              // fraction across the plot only.
              left: `calc(${PAD_L}px + (100% - ${PAD_L}px) * ${(x(hover!) / W).toFixed(4)})`,
              transform: x(hover!) / W > 0.6 ? "translate(-108%, 0)" : "translate(8%, 0)",
              top: 4,
              background: "var(--bg-elevated)",
              border: "1px solid var(--border)",
              minWidth: 160,
            }}
          >
            <div className="font-semibold tabular" style={{ color: "var(--text)" }}>{h.date}</div>
            <div className="flex justify-between gap-4 mt-1">
              <span className="text-mute">Strategy</span>
              <span className="tabular font-bold" style={{ color: "var(--accent)" }}>{money(h.value)}</span>
            </div>
            <div className="flex justify-between gap-4">
              <span className="text-mute">{active?.label}</span>
              <span className="tabular">{money(benchAt(h))}</span>
            </div>
            <div className="flex justify-between gap-4 mt-1 pt-1" style={{ borderTop: "1px solid var(--border)" }}>
              <span className="text-mute">Difference</span>
              <span
                className="tabular font-bold"
                style={{ color: hDiff >= 0 ? "var(--good)" : "var(--bad)" }}
              >
                {hDiff >= 0 ? "+" : "−"}${Math.abs(Math.round(hDiff)).toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Year markers, so the shape can be placed in time. */}
      {/* The labels live in a box that starts where the plot starts, so a
          percentage is a percentage OF THE PLOT rather than of the plot plus
          the axis gutter — which would drift every label rightwards. */}
      <div className="h-4 mt-0.5" style={{ paddingLeft: PAD_L }} aria-hidden>
        <div className="relative h-full">
          {yearTicks.map((t) => (
            <span
              key={t.label}
              className="absolute text-[10px] text-mute font-bold tabular"
              style={{ left: `${(x(t.i) / W) * 100}%`, transform: "translateX(-50%)" }}
            >
              {t.label}
            </span>
          ))}
        </div>
      </div>

      <div className="flex items-baseline justify-between mt-3 mb-1">
        <span className="text-[10px] uppercase tracking-wider text-mute font-bold">Drawdown</span>
        <span className="text-[11px] tabular" style={{ color: "var(--bad)" }}>
          Worst {(Math.min(...dd) * 100).toFixed(1)}%
          {equity[worstIdx]?.date ? ` · ${equity[worstIdx].date}` : ""}
        </span>
      </div>
      <div className="relative" style={{ paddingLeft: PAD_L }}>
        {[0, 0.5, 1].map((f) => (
          <span
            key={f}
            className="absolute text-[10px] font-bold tabular"
            style={{
              left: 0,
              // The last label sits on the bottom edge, so it is nudged up to
              // stay inside the box instead of being cut in half by it.
              top: Math.min(ddY(ddMin * f) - 7, DH - 13),
              width: PAD_L - 8,
              textAlign: "right",
              color: "var(--text-mute)",
            }}
          >
            {(ddMin * f * 100).toFixed(0)}%
          </span>
        ))}
        <svg viewBox={`0 0 ${W} ${DH}`} width="100%" height={DH} preserveAspectRatio="none" aria-label="Drawdown">
          {[0, 0.5, 1].map((f) => (
            <line key={f} x1={0} x2={W} y1={ddY(ddMin * f)} y2={ddY(ddMin * f)} stroke="var(--border)" strokeWidth="1" opacity="0.6" />
          ))}
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
