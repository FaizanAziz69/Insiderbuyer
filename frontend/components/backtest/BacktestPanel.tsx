"use client";
import useSWR from "swr";
import { API_BASE, fetcher } from "@/lib/api";
import { BacktestChart, EquityPoint } from "./BacktestChart";

export interface BacktestStats {
  startDate: string;
  endDate: string;
  years: number;
  totalReturn: number;
  cagr: number;
  benchmarkTotalReturn: number;
  benchmarkCagr: number;
  maxDrawdown: number;
  sharpe: number;
  winRate: number;
  avgWin: number;
  avgLoss: number;
  volatility: number;
  beta: number;
  alpha: number;
  weeks: number;
  trades: number;
}

interface BacktestResponse {
  ready: boolean;
  curve: EquityPoint[];
  stats: BacktestStats | null;
  rules: {
    holdings: number;
    rebalance: string;
    lookbackDays: number;
    benchmark: string;
  };
  note?: string;
  progress?: { have: number; need: number };
}

export function useBacktest() {
  return useSWR<BacktestResponse>(
    `${API_BASE}/backtest/insider-strategy`,
    fetcher,
    {
      revalidateOnFocus: false,
      // Price history is gathered a slice per request, so poll while it fills
      // and back off to hourly once the result is in.
      refreshInterval: (latest) => (latest && !latest.ready ? 6_000 : 60 * 60_000),
    },
  );
}

const signed = (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;
const toneOf = (v: number) => (v >= 0 ? "var(--good)" : "var(--bad)");

/** One metric. Value wears an ink token unless it's a signed return. */
function Tile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: string;
  tone?: string;
  hint?: string;
}) {
  return (
    <div
      className="rounded-lg px-3 py-2.5"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
        {label}
      </div>
      <div
        className="text-[18px] font-bold tabular leading-tight mt-0.5"
        style={{ color: tone ?? "var(--text)" }}
      >
        {value}
      </div>
      {hint && <div className="text-[10px] text-faint mt-0.5">{hint}</div>}
    </div>
  );
}

/**
 * Full backtest section — chart, headline comparison, and the complete stat
 * table. Every figure is computed from our own Form 4 history; see
 * backend/src/backtest/backtest.service.ts for the rules.
 */
export function BacktestPanel() {
  const { data, isLoading } = useBacktest();

  if (isLoading || (data && !data.ready)) {
    return (
      <div
        className="rounded-xl p-6 text-center text-mute text-[14px]"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <div>
          {data?.note ||
            "Computing the backtest from our filing history — this takes a moment on first load."}
        </div>
        {data?.progress && (
          <div
            className="mt-3 mx-auto h-1.5 rounded-full overflow-hidden"
            style={{ background: "var(--bg-3)", maxWidth: 260 }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.round((data.progress.have / Math.max(1, data.progress.need)) * 100)}%`,
                background: "var(--accent)",
              }}
            />
          </div>
        )}
      </div>
    );
  }
  if (!data?.stats || !data.curve.length) return null;
  const s = data.stats;
  const beat = s.totalReturn - s.benchmarkTotalReturn;

  return (
    <div className="space-y-5">
      <div
        className="rounded-xl p-4 sm:p-5"
        style={{ background: "var(--bg-1)", border: "1px solid var(--border)" }}
      >
        <div className="flex items-baseline justify-between gap-3 flex-wrap mb-3">
          <div>
            <h3 className="text-[17px] font-bold" style={{ color: "var(--text)" }}>
              Insider strategy vs the S&amp;P 500
            </h3>
            <p className="text-[12px] text-mute mt-0.5">
              {s.startDate} → {s.endDate} · {s.years} years · both indexed to 100
            </p>
          </div>
          <div className="text-right">
            <div
              className="text-[26px] font-bold tabular leading-none"
              style={{ color: toneOf(s.totalReturn) }}
            >
              {signed(s.totalReturn)}
            </div>
            <div className="text-[11px] text-mute mt-1">
              vs {signed(s.benchmarkTotalReturn)} for SPY
            </div>
          </div>
        </div>

        <BacktestChart curve={data.curve} height={300} />
      </div>

      {/* Stat tiles — the same metrics published backtests quote */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        <Tile label="Total return" value={signed(s.totalReturn)} tone={toneOf(s.totalReturn)} hint={`SPY ${signed(s.benchmarkTotalReturn)}`} />
        <Tile label="CAGR" value={signed(s.cagr)} tone={toneOf(s.cagr)} hint={`SPY ${signed(s.benchmarkCagr)}`} />
        <Tile label="Excess vs SPY" value={signed(beat)} tone={toneOf(beat)} hint="Total-return difference" />
        <Tile label="Max drawdown" value={`${s.maxDrawdown.toFixed(1)}%`} tone="var(--bad)" hint="Peak to trough" />
        <Tile label="Sharpe" value={s.sharpe.toFixed(2)} hint="Annual return ÷ volatility" />
        <Tile label="Win rate" value={`${s.winRate.toFixed(1)}%`} hint={`${s.weeks} rebalanced weeks`} />
        <Tile label="Avg win / loss" value={`${signed(s.avgWin)} / ${s.avgLoss.toFixed(2)}%`} hint="Per week held" />
        <Tile label="Volatility" value={`${s.volatility.toFixed(1)}%`} hint="Annualised" />
        <Tile label="Beta" value={s.beta.toFixed(2)} hint="vs SPY" />
        <Tile label="Alpha" value={signed(s.alpha)} tone={toneOf(s.alpha)} hint="Annualised, beta-adjusted" />
        <Tile label="Positions" value={`${data.rules.holdings}`} hint={`${data.rules.rebalance}, equal weight`} />
        <Tile label="Trades" value={s.trades.toLocaleString()} hint="Weekly position fills" />
      </div>

      {/* Rules + honest limitations. */}
      <div
        className="rounded-lg p-4 text-[12px] leading-relaxed text-mute"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <span className="font-bold" style={{ color: "var(--text)" }}>
          How this is calculated —
        </span>{" "}
        every Monday we rank companies by total open-market insider purchase
        value over the trailing {data.rules.lookbackDays} days, using only
        filings dated on or before that day, buy the top {data.rules.holdings}{" "}
        equally weighted, hold a week, then rebalance. The benchmark is{" "}
        {data.rules.benchmark} over the identical window. Ranking uses raw filing
        data rather than the live Insider Score, because stored scores are
        as-of-today and ranking on them would leak future information into past
        weeks.
        <br />
        <br />
        <span className="font-bold" style={{ color: "var(--text)" }}>
          Limitations —
        </span>{" "}
        the window is {s.years} years, the span our Form 4 archive covers, so it
        is not a full market cycle. Returns are gross: no commissions, slippage,
        bid-ask spread, borrow or taxes, and weekly rebalancing of{" "}
        {data.rules.holdings} names would incur real costs. Weeks where no held
        name has a usable price sit in cash. Past performance does not predict
        future results, and this is informational only — not investment advice.
      </div>
    </div>
  );
}

/**
 * Compact version for the subscribe page hero — the curve plus the headline
 * performance figures only.
 */
export function BacktestMini() {
  const { data } = useBacktest();
  if (!data?.stats || !data.curve.length) return null;
  const s = data.stats;

  return (
    <div
      className="rounded-xl p-4"
      style={{
        background: "var(--bg-1)",
        border: "1px solid var(--border)",
      }}
    >
      <div className="flex items-baseline justify-between gap-2 mb-2">
        <span className="text-[12px] font-bold uppercase tracking-wider text-mute">
          Backtested insider strategy
        </span>
        <span className="text-[11px] text-faint tabular">{s.years}y</span>
      </div>

      <BacktestChart curve={data.curve} height={168} compact />

      <div className="grid grid-cols-3 gap-2 mt-3">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
            Strategy
          </div>
          <div
            className="text-[17px] font-bold tabular leading-tight"
            style={{ color: toneOf(s.totalReturn) }}
          >
            {signed(s.totalReturn)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
            S&amp;P 500
          </div>
          <div
            className="text-[17px] font-bold tabular leading-tight"
            style={{ color: toneOf(s.benchmarkTotalReturn) }}
          >
            {signed(s.benchmarkTotalReturn)}
          </div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-mute">
            Win rate
          </div>
          <div className="text-[17px] font-bold tabular leading-tight" style={{ color: "var(--text)" }}>
            {s.winRate.toFixed(0)}%
          </div>
        </div>
      </div>

      <p className="text-[10px] text-faint mt-2.5 leading-relaxed">
        Top {data.rules.holdings} by insider buying, rebalanced weekly,{" "}
        {s.startDate}–{s.endDate}. Gross of costs. Past performance does not
        predict future results.
      </p>
    </div>
  );
}
