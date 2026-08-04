"use client";
/**
 * TEMPORARY client-education page: type any ticker and see the full IQ Score
 * calculation, step by step — every input, where it comes from, and every
 * formula applied. Not linked in the nav; remove the folder (and the
 * /score-explainer endpoint) once the client has signed off on the model.
 */
import useSWR from "swr";
import { useState } from "react";
import { Calculator, Search } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";

interface SubFactor {
  key: string;
  name: string;
  weight: number;
  input: number | null;
  inputLabel: string;
  formula: string;
  score: number | null;
}
interface Component {
  key: string;
  name: string;
  weight: number;
  source: string;
  score: number | null;
  usedNeutral: boolean;
}
interface ScoreVersion {
  label: string;
  score: number | null;
  formula: string;
  includes: string[];
  note: string;
  factors?: Array<{ key: string; name: string; inputLabel: string; value: number }>;
  math?: { sum: number; log: number; scaled: number; final: number | null; steps: string[] };
}
interface Explain {
  found: boolean;
  ticker: string;
  filingsSource?: string;
  comparison?: { old: ScoreVersion; new: ScoreVersion };
  company?: { name: string; sector: string | null; industry: string | null };
  config?: { windowDays: number; neutral: number; ceiling: number };
  marketData?: {
    source: string;
    lastPrice: number | null;
    marketCap: number | null;
    marketCapUsed: number | null;
    capSanityNote: string | null;
    avgVol10d: number | null;
    avgVol3m: number | null;
  };
  transactions?: Array<{
    insiderName: string;
    role: string;
    roleMultiplier: number;
    code: string;
    date: string;
    shares: number;
    price: number;
    value: number;
    previousHoldings: number | null;
    status: "counted" | "excluded";
    reason: string | null;
  }>;
  aggregates?: {
    countedBuys: number;
    excluded: number;
    totalPurchaseValue: number;
    totalSellValue?: number;
    totalShares: number;
    distinctBuyers: number;
    insiderVwap: number | null;
    avgHoldingChangePct: number | null;
  };
  buying?: { subFactors: SubFactor[]; note: string; buyingScore: number | null };
  components?: Component[];
  final?: {
    formula: string;
    missingRule: string;
    dataCompleteness: number;
    ceiling: number;
    score: number | null;
    scoreNote: string | null;
  };
}

const fmtNum = (v: number | null | undefined, digits = 2) =>
  v == null || !Number.isFinite(v) ? "—" : v.toLocaleString("en-US", { maximumFractionDigits: digits });

function ScoreBadge({ score }: { score: number | null }) {
  const color =
    score == null ? "var(--text-mute)" : score >= 70 ? "var(--good)" : score >= 45 ? "var(--gold)" : "var(--bad)";
  return (
    <span
      className="inline-flex items-center justify-center min-w-[44px] h-8 px-2 rounded-lg text-[14px] font-bold tabular"
      style={{ background: `color-mix(in srgb, ${color} 14%, transparent)`, color }}
    >
      {score == null ? "—" : Math.round(score)}
    </span>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="flex items-center gap-3 mb-3">
        <span
          className="flex items-center justify-center h-7 w-7 rounded-full text-[13px] font-bold flex-shrink-0"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          {n}
        </span>
        <h2 className="text-[17px] font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

export default function ScoreExplainerPage() {
  const [input, setInput] = useState("");
  const [ticker, setTicker] = useState("");
  const { data, isLoading } = useSWR<Explain>(
    ticker ? `${API_BASE}/score-explainer/${encodeURIComponent(ticker)}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setTicker(input.trim().toUpperCase());
  };

  const d = data && data.found ? data : null;

  return (
    <div className="w-full max-w-5xl mx-auto space-y-5 pb-16">
      <header className="pt-2">
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Calculator className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Insider Score — Calculation Explainer</span>
        </div>
        <h1 className="text-[30px] sm:text-[36px] font-semibold tracking-tight">
          How is a stock&rsquo;s Insider Score calculated?
        </h1>
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          Type any ticker and see the complete calculation — every transaction we counted (or excluded, and why),
          every input with its data source, and every formula, ending at the final 0–99 score.
        </p>
      </header>

      <form onSubmit={submit} className="card p-4 flex gap-3 items-center" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
        <Search className="h-4 w-4 text-mute flex-shrink-0" />
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Enter a ticker — e.g. BGDE, MAIA, NNOX…"
          className="flex-1 px-3 py-2 rounded-md text-[14px]"
          style={{ background: "var(--bg-1)", border: "1px solid var(--border-strong)", color: "var(--text)" }}
        />
        <button
          type="submit"
          className="px-4 py-2 rounded-md text-[13px] font-bold"
          style={{ background: "var(--accent)", color: "#fff" }}
        >
          Explain score
        </button>
      </form>

      {isLoading && <div className="card p-10 text-center text-mute">Running the full calculation for {ticker}…</div>}
      {data && !data.found && (
        <div className="card p-10 text-center text-mute">
          Nothing found for &ldquo;{data.ticker}&rdquo; — not a resolvable ticker, or it has no SEC
          filings and no market quote we can reach.
        </div>
      )}

      {d && (
        <>
          {/* Result banner */}
          <div className="card p-5 flex items-center justify-between flex-wrap gap-4" style={{ background: "var(--bg-2)", border: "1px solid var(--border-strong)" }}>
            <div>
              <div className="text-[20px] font-bold">
                {d.ticker} <span className="text-mute font-medium text-[15px]">{d.company?.name}</span>
              </div>
              <div className="text-[13px] text-mute mt-0.5">
                {d.company?.sector || "Unknown sector"}
                {d.company?.industry ? ` · ${d.company.industry}` : ""}
              </div>
              {d.filingsSource === "live SEC EDGAR" && (
                <div className="text-[12px] mt-1" style={{ color: "var(--gold)" }}>
                  Fetched live from SEC EDGAR — this ticker isn&rsquo;t in our stored universe, so the
                  calculation below runs on its most recent filings in real time.
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-mute font-semibold uppercase tracking-wider">Final Insider Score</span>
              <span
                className="flex items-center justify-center h-14 w-14 rounded-xl text-[24px] font-extrabold"
                style={{
                  background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                  color: "var(--accent)",
                  border: "2px solid var(--accent)",
                }}
              >
                {d.final?.score ?? "—"}
              </span>
            </div>
          </div>
          {d.final?.scoreNote && (
            <div className="card p-4 text-[13px]" style={{ color: "var(--gold)" }}>{d.final.scoreNote}</div>
          )}

          {/* Old vs New score — side by side */}
          {d.comparison && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {[
                { v: d.comparison.old, accent: "var(--text-mute)", tag: "OLD" },
                { v: d.comparison.new, accent: "var(--accent)", tag: "NEW" },
              ].map(({ v, accent, tag }) => (
                <div
                  key={tag}
                  className="card p-5"
                  style={{
                    background: "var(--bg-2)",
                    border: `1px solid ${tag === "NEW" ? "var(--accent)" : "var(--border)"}`,
                  }}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ background: `color-mix(in srgb, ${accent} 15%, transparent)`, color: accent }}
                      >
                        {tag}
                      </span>
                      <div className="text-[15px] font-bold mt-1">{v.label}</div>
                    </div>
                    <span
                      className="flex items-center justify-center h-12 w-12 rounded-xl text-[20px] font-extrabold flex-shrink-0"
                      style={{
                        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
                        color: accent,
                        border: `2px solid ${accent}`,
                      }}
                    >
                      {v.score ?? "—"}
                    </span>
                  </div>
                  <div
                    className="rounded-md px-3 py-2 font-mono text-[11.5px] mb-3 overflow-x-auto whitespace-nowrap"
                    style={{ background: "var(--bg-1)" }}
                  >
                    {v.formula}
                  </div>
                  <div className="text-[11px] uppercase tracking-wider text-mute font-bold mb-1.5">
                    What&rsquo;s included
                  </div>
                  <ul className="space-y-1 mb-3">
                    {v.includes.map((line) => (
                      <li key={line} className="text-[13px] flex gap-2">
                        <span style={{ color: accent }}>•</span>
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>

                  {/* v1 — full working: factor values + the exact math chain */}
                  {tag === "OLD" && v.factors && (
                    <>
                      <div className="text-[11px] uppercase tracking-wider text-mute font-bold mb-1.5">
                        This stock&rsquo;s numbers
                      </div>
                      <table className="w-full text-[12.5px] mb-3">
                        <tbody>
                          {v.factors.map((f) => (
                            <tr key={f.key} style={{ borderTop: "1px solid var(--border)" }}>
                              <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">{f.key}</td>
                              <td className="py-1.5 pr-2">
                                <div>{f.name}</div>
                                <div className="text-mute text-[11.5px]">{f.inputLabel}</div>
                              </td>
                              <td className="py-1.5 text-right tabular font-bold">{f.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {v.math && (
                        <div className="rounded-md px-3 py-2 font-mono text-[11.5px] space-y-1 mb-3" style={{ background: "var(--bg-1)" }}>
                          {v.math.steps.map((s) => (
                            <div key={s}>{s}</div>
                          ))}
                        </div>
                      )}
                    </>
                  )}

                  {/* v2 — this stock's five component scores at a glance */}
                  {tag === "NEW" && d.components && (
                    <>
                      <div className="text-[11px] uppercase tracking-wider text-mute font-bold mb-1.5">
                        This stock&rsquo;s numbers
                      </div>
                      <table className="w-full text-[12.5px] mb-2">
                        <tbody>
                          {d.components.map((c) => {
                            const effective = c.score ?? d.config?.neutral ?? 50;
                            return (
                              <tr key={c.key} style={{ borderTop: "1px solid var(--border)" }}>
                                <td className="py-1.5 pr-2 font-semibold whitespace-nowrap">
                                  {c.name} <span className="text-mute font-normal">({Math.round(c.weight * 100)}%)</span>
                                </td>
                                <td className="py-1.5 pr-2 text-right tabular">
                                  {c.score != null ? Math.round(c.score) : `neutral ${d.config?.neutral}`}
                                </td>
                                <td className="py-1.5 text-right tabular font-bold">
                                  +{(effective * c.weight).toFixed(1)}
                                </td>
                              </tr>
                            );
                          })}
                          <tr style={{ borderTop: "1px solid var(--border-strong)" }}>
                            <td className="py-1.5 pr-2 font-bold">Weighted sum → rounded, cap 99</td>
                            <td />
                            <td className="py-1.5 text-right tabular font-extrabold" style={{ color: accent }}>
                              {v.score ?? "—"}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                      <p className="text-[11.5px] text-mute mb-3">
                        Full working for every component is in steps 1–6 below.
                      </p>
                    </>
                  )}

                  <p className="text-[12px] text-mute leading-relaxed">{v.note}</p>
                </div>
              ))}
            </div>
          )}

          {/* Step 1 — market data */}
          <Step n={1} title="Market data (the denominators)">
            <p className="text-[13px] text-mute mb-3">
              Source: <strong style={{ color: "var(--text)" }}>{d.marketData?.source}</strong>. Market cap is the
              denominator for the &ldquo;how big is the buying&rdquo; factors; price feeds the cost-basis comparison.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                ["Current price", d.marketData?.lastPrice != null ? `$${fmtNum(d.marketData.lastPrice)}` : "—"],
                ["Market cap", d.marketData?.marketCap != null ? formatCurrency(d.marketData.marketCap) : "—"],
                ["10-day avg volume", fmtNum(d.marketData?.avgVol10d, 0)],
                ["3-month avg volume", fmtNum(d.marketData?.avgVol3m, 0)],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg p-3" style={{ background: "var(--bg-1)" }}>
                  <div className="text-[11px] uppercase tracking-wider text-mute font-bold">{label}</div>
                  <div className="text-[15px] font-bold tabular mt-1">{value}</div>
                </div>
              ))}
            </div>
            {d.marketData?.capSanityNote && (
              <p className="text-[12px] mt-2" style={{ color: "var(--gold)" }}>⚠ {d.marketData.capSanityNote}</p>
            )}
          </Step>

          {/* Step 2 — transactions */}
          <Step n={2} title={`Insider transactions — last ${d.config?.windowDays} days (SEC Form 4)`}>
            <p className="text-[13px] text-mute mb-3">
              Every open-market transaction filed with the SEC. Genuine open-market{" "}
              <strong style={{ color: "var(--text)" }}>buys (code P)</strong> count as buying;{" "}
              <strong style={{ color: "var(--text)" }}>sells (code S)</strong> count against the stock in
              the Buy/Sell Balance sub-factor. Wash-style round-trips and implausible filings are
              excluded — each row says how it was treated.
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-mute text-[11px] uppercase tracking-wider">
                    <th className="py-2 pr-3">Insider</th>
                    <th className="py-2 pr-3">Role (×mult)</th>
                    <th className="py-2 pr-3">Date</th>
                    <th className="py-2 pr-3 text-right">Shares</th>
                    <th className="py-2 pr-3 text-right">Price</th>
                    <th className="py-2 pr-3 text-right">Value</th>
                    <th className="py-2">Counted?</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.transactions || []).map((t, i) => (
                    <tr key={i} style={{ borderTop: "1px solid var(--border)", opacity: t.status === "excluded" ? 0.55 : 1 }}>
                      <td className="py-2 pr-3 font-semibold">{t.insiderName}</td>
                      <td className="py-2 pr-3">{t.role} <span className="text-mute">(×{t.roleMultiplier})</span></td>
                      <td className="py-2 pr-3 tabular">{String(t.date).slice(0, 10)}</td>
                      <td className="py-2 pr-3 text-right tabular">{fmtNum(t.shares, 0)}</td>
                      <td className="py-2 pr-3 text-right tabular">${fmtNum(t.price)}</td>
                      <td className="py-2 pr-3 text-right tabular font-bold">{formatCurrency(t.value)}</td>
                      <td className="py-2">
                        {t.status === "counted" ? (
                          <span style={{ color: "var(--good)" }} className="font-bold">✓ counted</span>
                        ) : (
                          <span style={{ color: "var(--bad)" }} title={t.reason || ""}>✕ {t.reason}</span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {!d.transactions?.length && (
                    <tr><td colSpan={7} className="py-6 text-center text-mute">No Form 4 activity in the window.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </Step>

          {/* Step 3 — aggregates */}
          <Step n={3} title="Aggregate the counted buys">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                ["Counted buys", fmtNum(d.aggregates?.countedBuys, 0)],
                ["Total $ bought", d.aggregates ? formatCurrency(d.aggregates.totalPurchaseValue) : "—"],
                ["Total $ sold", d.aggregates?.totalSellValue != null ? formatCurrency(d.aggregates.totalSellValue) : "—"],
                ["Distinct buyers", fmtNum(d.aggregates?.distinctBuyers, 0)],
                ["Insider avg cost", d.aggregates?.insiderVwap != null ? `$${fmtNum(d.aggregates.insiderVwap)}` : "—"],
                ["Avg stake added", d.aggregates?.avgHoldingChangePct != null ? `${fmtNum(d.aggregates.avgHoldingChangePct)}%` : "—"],
              ].map(([label, value]) => (
                <div key={label as string} className="rounded-lg p-3" style={{ background: "var(--bg-1)" }}>
                  <div className="text-[11px] uppercase tracking-wider text-mute font-bold">{label}</div>
                  <div className="text-[15px] font-bold tabular mt-1">{value}</div>
                </div>
              ))}
            </div>
          </Step>

          {/* Step 4 — buying sub-factors */}
          <Step n={4} title="Buying & selling component — six sub-factors (50% of the final score)">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-mute text-[11px] uppercase tracking-wider">
                    <th className="py-2 pr-3">Sub-factor</th>
                    <th className="py-2 pr-3">Weight</th>
                    <th className="py-2 pr-3">Input (what we measured)</th>
                    <th className="py-2 pr-3">Formula</th>
                    <th className="py-2 text-right">Score</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.buying?.subFactors || []).map((s) => (
                    <tr key={s.key} style={{ borderTop: "1px solid var(--border)" }}>
                      <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{s.key}. {s.name}</td>
                      <td className="py-2.5 pr-3 tabular">{Math.round(s.weight * 100)}%</td>
                      <td className="py-2.5 pr-3">
                        <span className="tabular font-bold">{fmtNum(s.input, 4)}</span>{" "}
                        <span className="text-mute">({s.inputLabel})</span>
                      </td>
                      <td className="py-2.5 pr-3 text-mute text-[12px]">{s.formula}</td>
                      <td className="py-2.5 text-right"><ScoreBadge score={s.score} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-between mt-3 rounded-lg p-3" style={{ background: "var(--bg-1)" }}>
              <span className="text-[13px] text-mute">{d.buying?.note}</span>
              <span className="text-[14px] font-bold">
                Buying Score = <ScoreBadge score={d.buying?.buyingScore ?? null} />
              </span>
            </div>
          </Step>

          {/* Step 5 — five components */}
          <Step n={5} title="The five components and their weights">
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left text-mute text-[11px] uppercase tracking-wider">
                    <th className="py-2 pr-3">Component</th>
                    <th className="py-2 pr-3">Weight</th>
                    <th className="py-2 pr-3">Where the data comes from</th>
                    <th className="py-2 pr-3 text-right">Score</th>
                    <th className="py-2 text-right">Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {(d.components || []).map((c) => {
                    const effective = c.score ?? d.config?.neutral ?? 50;
                    return (
                      <tr key={c.key} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-2.5 pr-3 font-semibold whitespace-nowrap">{c.name}</td>
                        <td className="py-2.5 pr-3 tabular">{Math.round(c.weight * 100)}%</td>
                        <td className="py-2.5 pr-3 text-mute text-[12px]">
                          {c.source}
                          {c.usedNeutral && (
                            <span style={{ color: "var(--gold)" }}> — no data → neutral {d.config?.neutral}</span>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 text-right"><ScoreBadge score={c.score ?? d.config?.neutral ?? null} /></td>
                        <td className="py-2.5 text-right tabular font-bold">
                          {(effective * c.weight).toFixed(1)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Step>

          {/* Step 6 — final */}
          <Step n={6} title="Final score">
            <div className="rounded-lg p-4 font-mono text-[13px] overflow-x-auto" style={{ background: "var(--bg-1)" }}>
              {d.final?.formula}
            </div>
            <p className="text-[13px] text-mute mt-3">
              {d.final?.missingRule}. The weighted sum is rounded and capped at {d.final?.ceiling} — no stock ever
              gets a perfect score. Data completeness for this name:{" "}
              <strong style={{ color: "var(--text)" }}>
                {d.final ? Math.round((d.final.dataCompleteness ?? 0) * 100) : 0}%
              </strong>{" "}
              of the model&rsquo;s weight was backed by real data.
            </p>
            <div className="flex flex-wrap items-stretch gap-4 mt-4">
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
              >
                <span
                  className="flex items-center justify-center h-12 w-12 rounded-xl text-[20px] font-extrabold"
                  style={{
                    background: "color-mix(in srgb, var(--text-mute) 12%, transparent)",
                    color: "var(--text-mute)",
                    border: "2px solid var(--text-mute)",
                  }}
                >
                  {d.comparison?.old.score ?? "—"}
                </span>
                <div>
                  <div className="text-[13px] font-bold">Old Insider Score (v1)</div>
                  <div className="text-[11.5px] text-mute">Insider buying only — log(1 + A+B+C+D)</div>
                </div>
              </div>
              <div
                className="flex items-center gap-3 rounded-xl px-4 py-3"
                style={{
                  background: "color-mix(in srgb, var(--accent) 6%, var(--bg-1))",
                  border: "1px solid var(--accent)",
                }}
              >
                <span
                  className="flex items-center justify-center h-12 w-12 rounded-xl text-[20px] font-extrabold"
                  style={{
                    background: "color-mix(in srgb, var(--accent) 12%, transparent)",
                    color: "var(--accent)",
                    border: "2px solid var(--accent)",
                  }}
                >
                  {d.final?.score ?? "—"}
                </span>
                <div>
                  <div className="text-[13px] font-bold">New Insider Score (v2)</div>
                  <div className="text-[11.5px] text-mute">
                    5-component composite · out of {d.final?.ceiling}
                  </div>
                </div>
              </div>
            </div>
          </Step>
        </>
      )}
    </div>
  );
}
