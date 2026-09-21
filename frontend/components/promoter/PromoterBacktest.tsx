"use client";
import useSWR from "swr";
import Link from "next/link";
import { API_BASE, fetcher } from "@/lib/api";
import { BacktestChart, type EquityPoint } from "@/components/backtest/BacktestChart";
import type { BacktestStats } from "@/components/backtest/BacktestPanel";
import { MaskedCell } from "@/components/premium/MaskedCell";
import { issuerDecoyFor } from "@/components/premium/lockedDecoys";

/**
 * George 2026-09-21: "a backtest of stocks that have spent money on stock
 * promotions … how these stocks have performed historically."
 *
 * Renders GET /promoter/backtest: the event study (return from the contract
 * start date at 30/60/90/180/365 days against the S&P/TSX 60), the 90-day-hold
 * portfolio curve on the same chart component as the insider backtest, and
 * the breakdowns by fee and exchange. Same paygate rule as the page: every
 * figure is visible, the issuer identity in the best/worst lists is what the
 * unlock buys.
 */

interface HorizonRow { days: number; n: number; mean: number; median: number; winRate: number; benchMean: number; meanExcess: number; medianExcess: number; beatRate: number }
interface BucketRow { bucket: string; n: number; median: number; mean: number; winRate: number; medianExcess: number }
interface EventRow { ticker: string; issuer: string | null; exchange: string | null; start: string; monthlyFeeCad: number | null; providers: number; r30: number | null; r90: number | null; bench90: number | null; rNow: number | null }
interface Payload {
  ready: boolean;
  note?: string;
  computedAt?: string;
  benchmark: string;
  benchmarkLabel: string;
  coverage: { contracts: number; events: number; pricedEvents: number; issuers: number; pricedIssuers: number; firstStart: string | null; lastStart: string | null; byYear: Array<{ year: string; events: number; priced: number }> };
  horizons: HorizonRow[];
  byFee: BucketRow[];
  byExchange: BucketRow[];
  histogram90: Array<{ label: string; n: number }>;
  best90: EventRow[];
  worst90: EventRow[];
  portfolio: { ready: boolean; curve: EquityPoint[]; stats: BacktestStats | null; rules: { holdings: number; rebalance: string; lookbackDays: number; benchmark: string }; note?: string };
}

const signed = (v: number | null | undefined) => (v == null ? "—" : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`);
const tone = (v: number | null | undefined) => (v == null ? "var(--text-mute)" : v >= 0 ? "var(--good)" : "var(--bad)");
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—");

function Tile({ label, value, tone: c, hint }: { label: string; value: React.ReactNode; tone?: string; hint?: React.ReactNode }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <div className="text-[10px] uppercase tracking-wider font-bold text-mute">{label}</div>
      <div className="text-[18px] font-bold tabular leading-tight mt-0.5" style={{ color: c ?? "var(--text)" }}>{value}</div>
      {hint && <div className="text-[10px] text-faint mt-0.5">{hint}</div>}
    </div>
  );
}

export function PromoterBacktest({ locked }: { locked: boolean }) {
  const { data } = useSWR<Payload>(`${API_BASE}/promoter/backtest`, fetcher, {
    revalidateOnFocus: false,
    refreshInterval: (latest) => (latest && !latest.ready ? 6_000 : 60 * 60_000),
  });
  const h90 = data?.horizons.find((h) => h.days === 90);
  const h30 = data?.horizons.find((h) => h.days === 30);
  const s = data?.portfolio?.stats;

  const nameCell = (r: EventRow, i: number) =>
    locked ? (
      (() => {
        const [t, n] = issuerDecoyFor(i);
        return (
          <MaskedCell label="the issuers" lock>
            <span className="font-bold">{t}</span> <span className="text-mute">{n}</span>
          </MaskedCell>
        );
      })()
    ) : (
      <Link href={`/promoter-score/${r.ticker}`} className="hover:text-accent">
        <span className="font-bold">{r.ticker}</span> <span className="text-mute">{r.issuer || ""}</span>
      </Link>
    );

  return (
    <section className="mt-8" aria-labelledby="promo-backtest-h">
      <h2 id="promo-backtest-h" className="text-[20px] font-bold tracking-tight" style={{ color: "var(--text)" }}>
        What happened after the promotion started
      </h2>
      <p className="text-[13px] mt-1 max-w-[860px]" style={{ color: "var(--text-mute)" }}>
        A backtest of every disclosed investor-relations contract in our record. For each issuer we take the share
        price on the first session after the contract start date and measure the move at 30, 60, 90, 180 and 365 days
        against the S&amp;P/TSX 60 over the same window. Below it, a portfolio that buys each promoted stock the week
        its contract begins, holds it 90 days, equal weight, and is rebalanced weekly.
      </p>

      {!data || !data.ready ? (
        <div className="mt-4 rounded-xl p-6 text-center text-mute text-[14px]" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          {data?.note || "Loading the promotion backtest…"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 mt-4">
            <Tile label="Contracts" value={data.coverage.contracts} hint={`${data.coverage.events} issuer starts`} />
            <Tile label="Priced" value={data.coverage.pricedEvents} hint={`${data.coverage.pricedIssuers} of ${data.coverage.issuers} issuers have price data`} />
            <Tile label="Median · 30 days" value={signed(h30?.median)} tone={tone(h30?.median)} hint={h30 ? `${h30.winRate}% up · n=${h30.n}` : undefined} />
            <Tile label="Median · 90 days" value={signed(h90?.median)} tone={tone(h90?.median)} hint={h90 ? `${h90.winRate}% up · n=${h90.n}` : undefined} />
            <Tile label="vs TSX 60 · 90 days" value={signed(h90?.medianExcess)} tone={tone(h90?.medianExcess)} hint={h90 ? `${h90.beatRate}% beat the index` : undefined} />
            <Tile label="Record" value={`${data.coverage.firstStart?.slice(0, 4) ?? "—"}–${data.coverage.lastStart?.slice(0, 4) ?? "—"}`} hint="First and latest contract start" />
          </div>

          {/* Horizon table */}
          <div className="mt-5 rounded-lg overflow-x-auto" style={{ border: "1px solid var(--border)" }}>
            <table className="w-full text-[12.5px]" style={{ minWidth: 640 }}>
              <thead>
                <tr className="text-left text-[10.5px] uppercase tracking-wider text-mute" style={{ background: "var(--bg-2)" }}>
                  <th className="px-3 py-2">After the start date</th>
                  <th className="px-3 py-2 text-right">Contracts</th>
                  <th className="px-3 py-2 text-right">Median return</th>
                  <th className="px-3 py-2 text-right">Average</th>
                  <th className="px-3 py-2 text-right">Finished up</th>
                  <th className="px-3 py-2 text-right">TSX 60 avg</th>
                  <th className="px-3 py-2 text-right">Median vs index</th>
                  <th className="px-3 py-2 text-right">Beat index</th>
                </tr>
              </thead>
              <tbody>
                {data.horizons.filter((h) => h.n > 0).map((h) => (
                  <tr key={h.days} style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3 py-2 font-semibold">{h.days} days</td>
                    <td className="px-3 py-2 text-right tabular">{h.n}</td>
                    <td className="px-3 py-2 text-right tabular font-bold" style={{ color: tone(h.median) }}>{signed(h.median)}</td>
                    <td className="px-3 py-2 text-right tabular" style={{ color: tone(h.mean) }}>{signed(h.mean)}</td>
                    <td className="px-3 py-2 text-right tabular">{h.winRate}%</td>
                    <td className="px-3 py-2 text-right tabular" style={{ color: tone(h.benchMean) }}>{signed(h.benchMean)}</td>
                    <td className="px-3 py-2 text-right tabular font-bold" style={{ color: tone(h.medianExcess) }}>{signed(h.medianExcess)}</td>
                    <td className="px-3 py-2 text-right tabular">{h.beatRate}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Portfolio curve */}
          {data.portfolio.stats && data.portfolio.curve.length > 2 && (
            <div className="mt-5 rounded-xl p-4 sm:p-5" style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
                <div>
                  <div className="text-[14px] font-bold" style={{ color: "var(--text)" }}>Promoted-stock portfolio vs the S&amp;P/TSX 60</div>
                  <div className="text-[12px] text-mute">
                    {fmtDate(data.portfolio.stats.startDate)} → {fmtDate(data.portfolio.stats.endDate)} · buy at contract start, hold 90 days, equal weight, weekly rebalance · both indexed to 100
                  </div>
                </div>
                <div className="text-[13px] font-bold tabular">
                  <span style={{ color: tone(s!.totalReturn) }}>{signed(s!.totalReturn)}</span>
                  <span className="text-mute font-semibold"> vs </span>
                  <span style={{ color: tone(s!.benchmarkTotalReturn) }}>{signed(s!.benchmarkTotalReturn)}</span>
                  <span className="text-mute font-semibold"> for XIU</span>
                </div>
              </div>
              <BacktestChart curve={data.portfolio.curve} height={260} strategyLabel="Promoted stocks (90-day hold)" benchmarkLabel="S&P/TSX 60 (XIU)" />
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2.5 mt-4">
                <Tile label="CAGR" value={signed(s!.cagr)} tone={tone(s!.cagr)} hint={`XIU ${signed(s!.benchmarkCagr)}`} />
                <Tile label="Max drawdown" value={signed(s!.maxDrawdown)} tone="var(--bad)" />
                <Tile label="Win rate" value={`${s!.winRate}%`} hint={`${s!.weeks} weeks`} />
                <Tile label="Volatility" value={`${s!.volatility}%`} hint="Annualised" />
                <Tile label="Beta" value={s!.beta} hint="vs XIU" />
                <Tile label="Alpha" value={signed(s!.alpha)} tone={tone(s!.alpha)} hint="Annualised, beta-adjusted" />
              </div>
            </div>
          )}

          {/* Buckets + distribution */}
          <div className="grid gap-4 lg:grid-cols-3 mt-5">
            {[{ title: "By monthly fee · 90 days", rows: data.byFee }, { title: "By exchange · 90 days", rows: data.byExchange }].map((blk) => (
              <div key={blk.title} className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-mute" style={{ background: "var(--bg-2)" }}>{blk.title}</div>
                <table className="w-full text-[12.5px]">
                  <tbody>
                    {blk.rows.map((r) => (
                      <tr key={r.bucket} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-2">{r.bucket} <span className="text-faint">· {r.n}</span></td>
                        <td className="px-3 py-2 text-right tabular font-bold" style={{ color: tone(r.median) }}>{signed(r.median)}</td>
                        <td className="px-3 py-2 text-right tabular text-mute">{r.winRate}% up</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            <div className="rounded-lg overflow-hidden" style={{ border: "1px solid var(--border)" }}>
              <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-mute" style={{ background: "var(--bg-2)" }}>Where the 90-day returns landed</div>
              <div className="px-3 py-2 space-y-1.5">
                {(() => {
                  const max = Math.max(1, ...data.histogram90.map((b) => b.n));
                  return data.histogram90.map((b) => (
                    <div key={b.label} className="flex items-center gap-2 text-[12px]">
                      <span className="w-[112px] shrink-0 text-mute">{b.label}</span>
                      <span className="h-3 rounded-sm" style={{ width: `${Math.round((b.n / max) * 100)}%`, minWidth: b.n ? 3 : 0, background: b.label.startsWith("−") ? "var(--bad)" : "var(--good)", opacity: 0.8 }} />
                      <span className="tabular text-mute">{b.n}</span>
                    </div>
                  ));
                })()}
              </div>
            </div>
          </div>

          {/* Best / worst */}
          <div className="grid gap-4 lg:grid-cols-2 mt-5">
            {[{ title: "Best 90 days after a contract began", rows: data.best90 }, { title: "Worst 90 days after a contract began", rows: data.worst90 }].map((blk, bi) => (
              <div key={blk.title} className="rounded-lg overflow-x-auto" style={{ border: "1px solid var(--border)" }}>
                <div className="px-3 py-2 text-[11px] font-bold uppercase tracking-wider text-mute" style={{ background: "var(--bg-2)" }}>{blk.title}</div>
                <table className="w-full text-[12.5px]" style={{ minWidth: 460 }}>
                  <thead>
                    <tr className="text-left text-[10.5px] uppercase tracking-wider text-mute">
                      <th className="px-3 py-1.5">Issuer</th>
                      <th className="px-3 py-1.5">Start</th>
                      <th className="px-3 py-1.5 text-right">Fee / mo</th>
                      <th className="px-3 py-1.5 text-right">90 days</th>
                      <th className="px-3 py-1.5 text-right">TSX 60</th>
                    </tr>
                  </thead>
                  <tbody>
                    {blk.rows.map((r, i) => (
                      <tr key={`${r.ticker}-${r.start}`} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="px-3 py-1.5">{nameCell(r, bi * 8 + i)}</td>
                        <td className="px-3 py-1.5 tabular text-mute whitespace-nowrap">{fmtDate(r.start)}</td>
                        <td className="px-3 py-1.5 text-right tabular">{r.monthlyFeeCad != null ? `C$${Math.round(r.monthlyFeeCad).toLocaleString("en-US")}` : "—"}</td>
                        <td className="px-3 py-1.5 text-right tabular font-bold" style={{ color: tone(r.r90) }}>{signed(r.r90)}</td>
                        <td className="px-3 py-1.5 text-right tabular text-mute">{signed(r.bench90)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          <p className="text-[11.5px] mt-3" style={{ color: "var(--text-mute)" }}>
            How this is calculated: contracts come from TSX Venture Policy 3.4 and CSE disclosure news releases we have ingested.
            Several providers signed by one issuer on the same date count as one start. Returns use dividend-adjusted closes;
            a horizon that has not elapsed is not reported; single-name returns are capped at −95% and +300% so one bad
            venture print cannot dominate an average. Issuers without price coverage are counted but not measured. Coverage by
            year: {data.coverage.byYear.map((y) => `${y.year} ${y.priced}/${y.events}`).join(" · ")}. Historical averages,
            not a forecast, and not investment advice. Paying for investor relations is legal and disclosed; this page takes no
            view on whether it is a good sign or a bad one.
          </p>
        </>
      )}
    </section>
  );
}
