"use client";
import { useMemo, useState } from "react";
import useSWR from "swr";
import { ChevronDown } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import {
  computeTechnicals,
  monthlySeasonality,
  ratingLabel,
  IndicatorRow,
  Signal,
} from "@/lib/indicators";

/* ═══════════════════════════════════════════════════════════════════════════
   Shared types
   ══════════════════════════════════════════════════════════════════════════ */
type FinRow = { date: string; [k: string]: number | string | null };
interface OHLCBar {
  date: string;
  close: number;
  high?: number;
  low?: number;
}

/* ═══════════════════════════════════════════════════════════════════════════
   Chart primitives (pure SVG, responsive via viewBox + width:100%)
   ══════════════════════════════════════════════════════════════════════════ */
const GOOD = "var(--good)";
const BAD = "var(--bad)";
const ACCENT = "var(--accent)";

function shortYear(d: string) {
  return String(d).slice(0, 4);
}
function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e12) return `${(n / 1e12).toFixed(1)}T`;
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(0)}M`;
  if (a >= 1e3) return `${(n / 1e3).toFixed(0)}K`;
  return n.toFixed(0);
}

/** Vertical bar chart — baseline at 0, positive green / negative red. */
function BarChart({
  data,
  unit = "currency",
}: {
  data: { label: string; value: number | null }[];
  unit?: "currency" | "pct" | "eps";
}) {
  const pts = data.filter((d) => d.value != null) as { label: string; value: number }[];
  if (pts.length === 0) return <NoData />;
  const W = Math.max(220, pts.length * 70);
  const H = 150;
  const pad = { t: 18, b: 20 };
  const vals = pts.map((p) => p.value);
  const max = Math.max(0, ...vals);
  const min = Math.min(0, ...vals);
  const span = max - min || 1;
  const zeroY = pad.t + ((max - 0) / span) * (H - pad.t - pad.b);
  const bw = (W / pts.length) * 0.56;
  const fmt = (v: number) =>
    unit === "pct" ? `${v.toFixed(1)}%` : unit === "eps" ? `$${v.toFixed(2)}` : compact(v);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }} preserveAspectRatio="none">
      {pts.map((p, i) => {
        const cx = (i + 0.5) * (W / pts.length);
        const y = pad.t + ((max - p.value) / span) * (H - pad.t - pad.b);
        const top = Math.min(y, zeroY);
        const h = Math.abs(y - zeroY);
        const pos = p.value >= 0;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={top} width={bw} height={Math.max(1, h)} rx={2} fill={pos ? GOOD : BAD} opacity={0.85} />
            <text x={cx} y={pos ? top - 4 : top + h + 12} textAnchor="middle" fontSize="9" fill="var(--text-mute)" fontWeight="700">
              {fmt(p.value)}
            </text>
            <text x={cx} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-faint)">
              {shortYear(p.label)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Line/area trend chart for a percentage-style series. */
function LineChart({
  data,
  unit = "pct",
}: {
  data: { label: string; value: number | null }[];
  unit?: "pct" | "currency";
}) {
  const pts = data.filter((d) => d.value != null) as { label: string; value: number }[];
  if (pts.length < 2) return <NoData />;
  const W = Math.max(220, pts.length * 70);
  const H = 150;
  const pad = { t: 18, b: 20, x: 24 };
  const vals = pts.map((p) => p.value);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const span = max - min || 1;
  const xOf = (i: number) => pad.x + (i / (pts.length - 1)) * (W - pad.x * 2);
  const yOf = (v: number) => pad.t + ((max - v) / span) * (H - pad.t - pad.b);
  const d = pts.map((p, i) => `${i ? "L" : "M"} ${xOf(i).toFixed(1)},${yOf(p.value).toFixed(1)}`).join(" ");
  const fmt = (v: number) => (unit === "pct" ? `${v.toFixed(1)}%` : compact(v));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 150 }} preserveAspectRatio="none">
      <path d={`${d} L ${xOf(pts.length - 1)},${H - pad.b} L ${xOf(0)},${H - pad.b} Z`} fill={ACCENT} opacity={0.1} />
      <path d={d} fill="none" stroke={ACCENT} strokeWidth={2} vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => (
        <g key={i}>
          <circle cx={xOf(i)} cy={yOf(p.value)} r={2.5} fill={ACCENT} />
          <text x={xOf(i)} y={yOf(p.value) - 6} textAnchor="middle" fontSize="9" fill="var(--text-mute)" fontWeight="700">
            {fmt(p.value)}
          </text>
          <text x={xOf(i)} y={H - 5} textAnchor="middle" fontSize="9" fill="var(--text-faint)">
            {shortYear(p.label)}
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Waterfall chart — Revenue → … → Net Income. */
function Waterfall({ steps }: { steps: { label: string; value: number; kind: "total" | "add" | "sub" }[] }) {
  const clean = steps.filter((s) => Number.isFinite(s.value));
  if (clean.length < 2) return <NoData />;
  const W = Math.max(320, clean.length * 78);
  const H = 200;
  const pad = { t: 16, b: 34 };
  // Running cumulative for add/sub; totals are absolute from 0.
  let run = 0;
  const bars = clean.map((s) => {
    if (s.kind === "total") {
      run = s.value;
      return { ...s, from: 0, to: s.value };
    }
    const from = run;
    run += s.kind === "sub" ? -Math.abs(s.value) : Math.abs(s.value);
    return { ...s, from, to: run };
  });
  const hi = Math.max(...bars.map((b) => Math.max(b.from, b.to)), 0);
  const lo = Math.min(...bars.map((b) => Math.min(b.from, b.to)), 0);
  const span = hi - lo || 1;
  const yOf = (v: number) => pad.t + ((hi - v) / span) * (H - pad.t - pad.b);
  const bw = (W / bars.length) * 0.6;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 200 }} preserveAspectRatio="none">
      {bars.map((b, i) => {
        const cx = (i + 0.5) * (W / bars.length);
        const y = Math.min(yOf(b.from), yOf(b.to));
        const h = Math.abs(yOf(b.to) - yOf(b.from));
        const color = b.kind === "total" ? ACCENT : b.kind === "sub" ? BAD : GOOD;
        return (
          <g key={i}>
            <rect x={cx - bw / 2} y={y} width={bw} height={Math.max(1, h)} rx={2} fill={color} opacity={0.85} />
            <text x={cx} y={y - 4} textAnchor="middle" fontSize="9" fill="var(--text-mute)" fontWeight="700">
              {compact(b.value)}
            </text>
            <text x={cx} y={H - 16} textAnchor="middle" fontSize="8.5" fill="var(--text-faint)">
              {b.label.length > 11 ? b.label.slice(0, 10) + "…" : b.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/** Semicircular Strong-Sell → Strong-Buy gauge (score in -1..1). */
function RatingGauge({ score, size = 200 }: { score: number; size?: number }) {
  const cx = size / 2;
  const cy = size * 0.58;
  const R = size * 0.4;
  const zones = [
    { c: "#e15241", from: 180, to: 144 }, // strong sell
    { c: "#e8956b", from: 144, to: 108 }, // sell
    { c: "#b8bcc4", from: 108, to: 72 }, // neutral
    { c: "#7cc47f", from: 72, to: 36 }, // buy
    { c: "#2e9e5b", from: 36, to: 0 }, // strong buy
  ];
  const polar = (deg: number, r: number) => {
    const a = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a) };
  };
  const arc = (from: number, to: number, r: number) => {
    const s = polar(from, r);
    const e = polar(to, r);
    return `M ${s.x.toFixed(1)} ${s.y.toFixed(1)} A ${r} ${r} 0 0 1 ${e.x.toFixed(1)} ${e.y.toFixed(1)}`;
  };
  const needleDeg = 90 * (1 - Math.max(-1, Math.min(1, score)));
  const np = polar(needleDeg, R - 6);
  const { label } = ratingLabel(score);
  return (
    <svg viewBox={`0 0 ${size} ${size * 0.72}`} className="w-full" style={{ maxWidth: size }}>
      {zones.map((z, i) => (
        <path key={i} d={arc(z.from, z.to, R)} fill="none" stroke={z.c} strokeWidth={size * 0.09} strokeLinecap="butt" />
      ))}
      <line x1={cx} y1={cy} x2={np.x} y2={np.y} stroke="var(--text)" strokeWidth={2.5} strokeLinecap="round" />
      <circle cx={cx} cy={cy} r={4} fill="var(--text)" />
      <text x={cx} y={cy + size * 0.12} textAnchor="middle" fontSize={size * 0.1} fontWeight="800" fill="var(--text)">
        {label}
      </text>
    </svg>
  );
}

function NoData() {
  return (
    <div className="h-[150px] flex items-center justify-center text-[12px] text-faint">
      Not enough data.
    </div>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold">{title}</h2>
      {subtitle && <p className="text-[12px] text-mute mb-4 mt-0.5">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </section>
  );
}

function ChartTitle({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] font-bold text-mute mb-1">{children}</div>;
}

const SIGNAL_COLOR: Record<Signal, string> = {
  buy: "var(--good)",
  sell: "var(--bad)",
  neutral: "var(--text-mute)",
};

/* ═══════════════════════════════════════════════════════════════════════════
   1. FINANCIALS SECTION — Performance / Revenue / Profitability / Balance /
      Cash Flow / Earnings tabs
   ══════════════════════════════════════════════════════════════════════════ */
const FIN_TABS = [
  "Performance",
  "Revenue Breakdown",
  "Profitability",
  "Balance Sheet",
  "Cash Flow",
  "Earnings",
] as const;
type FinTab = (typeof FIN_TABS)[number];

export function FinancialsSection({ ticker }: { ticker: string }) {
  const [tab, setTab] = useState<FinTab>("Performance");
  const { data, isLoading } = useSWR<{
    financials: { income: FinRow[]; balance: FinRow[]; cashflow: FinRow[] };
  }>(`${API_BASE}/market-stats/financials?symbol=${encodeURIComponent(ticker)}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60_000,
  });
  const f = data?.financials;

  if (isLoading) return <div className="card p-5 h-80 shimmer rounded-lg" />;
  if (!f || (!f.income.length && !f.balance.length && !f.cashflow.length))
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No financial statements available for {ticker}.
      </div>
    );

  const income = f.income || [];
  const balance = f.balance || [];
  const cashflow = f.cashflow || [];
  const num = (r: FinRow | undefined, k: string): number | null =>
    r && typeof r[k] === "number" ? (r[k] as number) : null;
  const series = (rows: FinRow[], k: string) =>
    rows.map((r) => ({ label: r.date, value: num(r, k) }));
  // Join income & balance by year for ROE/ROA.
  const byYear = (rows: FinRow[]) => new Map(rows.map((r) => [shortYear(r.date), r]));

  return (
    <section className="card p-5">
      <h2 className="text-[16px] font-semibold mb-3">Financials</h2>
      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto pb-2 -mx-1 px-1" style={{ scrollbarWidth: "none" }}>
        {FIN_TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className="px-3 py-1.5 rounded-md text-[12.5px] font-bold whitespace-nowrap transition"
            style={{
              background: t === tab ? "var(--accent)" : "var(--bg-3)",
              color: t === tab ? "var(--on-accent)" : "var(--text-mute)",
            }}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="mt-4">
        {tab === "Performance" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <ChartTitle>Revenue</ChartTitle>
              <BarChart data={series(income, "revenue")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Net Income</ChartTitle>
              <BarChart data={series(income, "netIncome")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Net Margin</ChartTitle>
              <LineChart data={series(income, "profitMargin")} unit="pct" />
            </div>
          </div>
        )}

        {tab === "Revenue Breakdown" && (
          <RevenueBreakdown row={income[income.length - 1]} num={num} />
        )}

        {tab === "Profitability" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <ChartTitle>Gross Margin</ChartTitle>
              <LineChart data={series(income, "grossMargin")} unit="pct" />
            </div>
            <div>
              <ChartTitle>Operating Margin</ChartTitle>
              <LineChart data={series(income, "operatingMargin")} unit="pct" />
            </div>
            <div>
              <ChartTitle>Net Margin</ChartTitle>
              <LineChart data={series(income, "profitMargin")} unit="pct" />
            </div>
            <div>
              <ChartTitle>Return on Equity (ROE)</ChartTitle>
              <LineChart
                data={income.map((r) => {
                  const b = byYear(balance).get(shortYear(r.date));
                  const ni = num(r, "netIncome");
                  const eq = num(b, "totalEquity");
                  return { label: r.date, value: ni != null && eq ? +((ni / eq) * 100).toFixed(2) : null };
                })}
                unit="pct"
              />
            </div>
            <div>
              <ChartTitle>Return on Assets (ROA)</ChartTitle>
              <LineChart
                data={income.map((r) => {
                  const b = byYear(balance).get(shortYear(r.date));
                  const ni = num(r, "netIncome");
                  const as = num(b, "totalAssets");
                  return { label: r.date, value: ni != null && as ? +((ni / as) * 100).toFixed(2) : null };
                })}
                unit="pct"
              />
            </div>
          </div>
        )}

        {tab === "Balance Sheet" && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <ChartTitle>Total Assets</ChartTitle>
              <BarChart data={series(balance, "totalAssets")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Total Liabilities</ChartTitle>
              <BarChart data={series(balance, "totalLiabilities")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Shareholder Equity</ChartTitle>
              <BarChart data={series(balance, "totalEquity")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Cash &amp; Equivalents</ChartTitle>
              <BarChart data={series(balance, "cash")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Total Debt</ChartTitle>
              <BarChart data={series(balance, "totalDebt")} unit="currency" />
            </div>
          </div>
        )}

        {tab === "Cash Flow" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <ChartTitle>Operating Cash Flow</ChartTitle>
              <BarChart data={series(cashflow, "operatingCashflow")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Free Cash Flow</ChartTitle>
              <BarChart data={series(cashflow, "freeCashflow")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Investing Cash Flow</ChartTitle>
              <BarChart data={series(cashflow, "investingCashflow")} unit="currency" />
            </div>
            <div>
              <ChartTitle>Financing Cash Flow</ChartTitle>
              <BarChart data={series(cashflow, "financingCashflow")} unit="currency" />
            </div>
          </div>
        )}

        {tab === "Earnings" && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <ChartTitle>Diluted EPS (Actual)</ChartTitle>
              <BarChart data={series(income, "dilutedEPS")} unit="eps" />
            </div>
            <div>
              <ChartTitle>Basic EPS (Actual)</ChartTitle>
              <BarChart data={series(income, "basicEPS")} unit="eps" />
            </div>
            <p className="md:col-span-2 text-[12px] text-faint">
              Estimated EPS (analyst consensus forecast) is not available from our current
              data source, so only reported (actual) EPS is shown.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function RevenueBreakdown({
  row,
  num,
}: {
  row: FinRow | undefined;
  num: (r: FinRow | undefined, k: string) => number | null;
}) {
  if (!row) return <NoData />;
  const rev = num(row, "revenue");
  const cogs = num(row, "costOfRevenue");
  const gross = num(row, "grossProfit");
  const opex = num(row, "operatingExpense");
  const opInc = num(row, "operatingIncome");
  const tax = num(row, "taxProvision");
  const net = num(row, "netIncome");
  const steps: { label: string; value: number; kind: "total" | "add" | "sub" }[] = [];
  if (rev != null) steps.push({ label: "Revenue", value: rev, kind: "total" });
  if (cogs != null) steps.push({ label: "COGS", value: cogs, kind: "sub" });
  if (gross != null) steps.push({ label: "Gross Profit", value: gross, kind: "total" });
  if (opex != null) steps.push({ label: "Op. Expenses", value: opex, kind: "sub" });
  if (opInc != null) steps.push({ label: "Op. Income", value: opInc, kind: "total" });
  if (tax != null) steps.push({ label: "Taxes", value: tax, kind: "sub" });
  if (net != null) steps.push({ label: "Net Income", value: net, kind: "total" });
  return (
    <div>
      <ChartTitle>Revenue → Net Income ({shortYear(row.date)})</ChartTitle>
      <Waterfall steps={steps} />
      <div className="flex gap-4 mt-2 text-[11px] text-mute">
        <span className="inline-flex items-center gap-1"><Dot c={ACCENT} /> Subtotal</span>
        <span className="inline-flex items-center gap-1"><Dot c={GOOD} /> Positive</span>
        <span className="inline-flex items-center gap-1"><Dot c={BAD} /> Cost / deduction</span>
      </div>
    </div>
  );
}
function Dot({ c }: { c: string }) {
  return <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />;
}

/* ═══════════════════════════════════════════════════════════════════════════
   2. TECHNICALS SECTION — computed from OHLC history
   ══════════════════════════════════════════════════════════════════════════ */
export function TechnicalsSection({ ticker }: { ticker: string }) {
  const { data, isLoading } = useSWR<{ history: { bars: OHLCBar[] } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=1y`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const tech = useMemo(() => {
    const bars = data?.history?.bars || [];
    if (bars.length < 30) return null;
    const closes = bars.map((b) => b.close);
    const highs = bars.map((b) => b.high ?? b.close);
    const lows = bars.map((b) => b.low ?? b.close);
    return computeTechnicals(closes, highs, lows);
  }, [data]);

  if (isLoading) return <div className="card p-5 h-72 shimmer rounded-lg" />;
  if (!tech)
    return (
      <div className="card p-8 text-center text-mute text-sm">
        Not enough price history to compute technicals for {ticker}.
      </div>
    );

  const counts = (rows: IndicatorRow[]) => ({
    buy: rows.filter((r) => r.signal === "buy").length,
    sell: rows.filter((r) => r.signal === "sell").length,
    neutral: rows.filter((r) => r.signal === "neutral").length,
  });
  const maC = counts(tech.movingAverages);
  const oscC = counts(tech.oscillators);

  return (
    <Card title="Technicals" subtitle={`Live signal built from ${ticker}'s price action — moving averages and momentum oscillators.`}>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-center">
        {/* Overall gauge */}
        <div className="flex flex-col items-center">
          <RatingGauge score={tech.overallScore} />
          <div className="flex gap-4 mt-2 text-[11px]">
            <span style={{ color: GOOD }}>{maC.buy + oscC.buy} Buy</span>
            <span className="text-mute">{maC.neutral + oscC.neutral} Neutral</span>
            <span style={{ color: BAD }}>{maC.sell + oscC.sell} Sell</span>
          </div>
        </div>
        {/* Signal tables */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <IndicatorTable title="Moving Averages" rows={tech.movingAverages} score={tech.maScore} />
          <IndicatorTable title="Oscillators" rows={tech.oscillators} score={tech.oscScore} />
        </div>
      </div>
    </Card>
  );
}

function IndicatorTable({ title, rows, score }: { title: string; rows: IndicatorRow[]; score: number }) {
  const { label } = ratingLabel(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[12px] font-bold text-mute uppercase tracking-wider">{title}</span>
        <span className="text-[11px] font-bold" style={{ color: SIGNAL_COLOR[score >= 0.1 ? "buy" : score <= -0.1 ? "sell" : "neutral"] }}>
          {label}
        </span>
      </div>
      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between py-1.5 text-[13px]" style={{ borderColor: "var(--border)" }}>
            <span className="text-soft">{r.name}</span>
            <span className="flex items-center gap-2">
              <span className="tabular text-mute">{r.value}</span>
              <span className="text-[10px] font-bold uppercase w-12 text-right" style={{ color: SIGNAL_COLOR[r.signal] }}>
                {r.signal}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   3. ANALYST RATING SECTION — consensus gauge + target range
   ══════════════════════════════════════════════════════════════════════════ */
interface AnalystRow {
  symbol: string;
  price: number;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upsidePct: number | null;
  recommendation: string | null;
  numAnalysts: number | null;
}
const REC_SCORE: Record<string, number> = {
  strong_buy: 1,
  buy: 0.5,
  outperform: 0.5,
  hold: 0,
  neutral: 0,
  underperform: -0.5,
  sell: -0.5,
  strong_sell: -1,
};
const REC_LABEL: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  sell: "Sell",
  strong_sell: "Strong Sell",
  outperform: "Outperform",
  underperform: "Underperform",
  neutral: "Neutral",
};

export function AnalystRatingSection({ ticker, price }: { ticker: string; price: number | null }) {
  const { data, isLoading } = useSWR<{ rows: AnalystRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const row = data?.rows?.find((r) => r.symbol.toUpperCase() === ticker.toUpperCase()) ?? null;

  if (isLoading && !row) return <div className="card p-5 h-56 shimmer rounded-lg" />;
  if (!row || (!row.recommendation && row.targetMean == null))
    return (
      <div className="card p-8 text-center text-mute text-sm">
        No analyst ratings available for {ticker}.
      </div>
    );

  const rec = (row.recommendation || "").toLowerCase();
  const score = REC_SCORE[rec] ?? 0;
  const now = price ?? row.price ?? null;
  const { low, targetMean: avg, targetHigh: high } = { low: row.targetLow, targetMean: row.targetMean, targetHigh: row.targetHigh };
  const upside = row.upsidePct;
  const up = upside != null && upside >= 0;
  const hasBar = now != null && avg != null && low != null && high != null && high > low;
  const lo = hasBar ? Math.min(low!, now!) : 0;
  const hi = hasBar ? Math.max(high!, now!) : 1;
  const span = hi - lo || 1;
  const pos = (v: number) => Math.min(100, Math.max(0, ((v - lo) / span) * 100));

  return (
    <Card title="Analyst Ratings & Price Targets" subtitle={`Wall Street consensus for ${ticker} — 12-month outlook.`}>
      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6 items-center">
        <div className="flex flex-col items-center">
          <RatingGauge score={score} />
          {row.numAnalysts != null && (
            <div className="text-[11px] text-mute mt-1">
              Based on {row.numAnalysts} analyst{row.numAnalysts === 1 ? "" : "s"}
            </div>
          )}
        </div>
        <div>
          {avg != null && (
            <div className="flex flex-wrap items-end justify-between gap-3 mb-6">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-mute font-bold">Consensus</div>
                <div className="text-[20px] font-bold" style={{ color: SIGNAL_COLOR[score >= 0.1 ? "buy" : score <= -0.1 ? "sell" : "neutral"] }}>
                  {REC_LABEL[rec] || row.recommendation || "—"}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[11px] uppercase tracking-wider text-mute font-bold">Average Target</div>
                <div className="text-[22px] font-bold tabular">${avg.toFixed(2)}</div>
                {upside != null && (
                  <div className="text-[13px] font-bold tabular" style={{ color: up ? GOOD : BAD }}>
                    {up ? "▲ +" : "▼ "}
                    {upside.toFixed(2)}% {up ? "upside" : "downside"}
                  </div>
                )}
              </div>
            </div>
          )}
          {hasBar && (
            <>
              <div className="relative h-2 rounded-full" style={{ background: "linear-gradient(90deg, var(--bad), var(--bg-3), var(--good))" }}>
                <TargetMark pos={pos(now!)} color="var(--text)" label="Now" below />
                <TargetMark pos={pos(avg!)} color="var(--accent)" label="Avg" />
              </div>
              <div className="grid grid-cols-3 mt-8 text-[12px]">
                <div>
                  <div className="text-mute uppercase text-[10px] font-bold tracking-wider">Low</div>
                  <div className="font-bold tabular">${low!.toFixed(2)}</div>
                </div>
                <div className="text-center">
                  <div className="text-mute uppercase text-[10px] font-bold tracking-wider">Average</div>
                  <div className="font-bold tabular" style={{ color: ACCENT }}>${avg!.toFixed(2)}</div>
                </div>
                <div className="text-right">
                  <div className="text-mute uppercase text-[10px] font-bold tracking-wider">High</div>
                  <div className="font-bold tabular">${high!.toFixed(2)}</div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}

function TargetMark({ pos, color, label, below }: { pos: number; color: string; label: string; below?: boolean }) {
  return (
    <div className="absolute flex flex-col items-center" style={{ left: `${pos}%`, transform: "translateX(-50%)", top: below ? 8 : -22 }}>
      {!below && <span className="text-[10px] font-bold mb-0.5" style={{ color }}>{label}</span>}
      <div className="h-4 w-4 rounded-full border-2" style={{ background: color, borderColor: "var(--bg-2)" }} />
      {below && <span className="text-[10px] font-bold mt-0.5" style={{ color }}>{label}</span>}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   4. SEASONALITY SECTION — average monthly performance heatmap
   ══════════════════════════════════════════════════════════════════════════ */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function seasonColor(v: number | null): string {
  if (v == null) return "var(--bg-3)";
  const t = Math.max(-1, Math.min(1, v / 8));
  if (t >= 0) {
    const a = Math.round(30 + t * 40);
    return `color-mix(in srgb, var(--good) ${a}%, var(--bg-3))`;
  }
  const a = Math.round(30 + -t * 40);
  return `color-mix(in srgb, var(--bad) ${a}%, var(--bg-3))`;
}

export function SeasonalitySection({ ticker }: { ticker: string }) {
  const { data, isLoading } = useSWR<{ history: { bars: OHLCBar[] } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=5y`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );
  const months = useMemo(() => {
    const bars = data?.history?.bars || [];
    if (bars.length < 12) return null;
    return monthlySeasonality(bars.map((b) => ({ date: b.date, close: b.close })));
  }, [data]);

  if (isLoading) return <div className="card p-5 h-40 shimmer rounded-lg" />;
  if (!months) return null; // hide gracefully when history is too short

  const maxYears = Math.max(...months.map((m) => m.count), 0);
  return (
    <Card title="Seasonality" subtitle={`Average monthly price change for ${ticker} over the last ${maxYears} year${maxYears === 1 ? "" : "s"}.`}>
      <div className="grid grid-cols-6 md:grid-cols-12 gap-1.5">
        {months.map((m) => (
          <div key={m.month} className="rounded-md p-2 text-center" style={{ background: seasonColor(m.avg) }}>
            <div className="text-[10px] font-bold text-mute">{MONTHS[m.month]}</div>
            <div className="text-[12px] font-bold tabular" style={{ color: m.avg == null ? "var(--text-faint)" : m.avg >= 0 ? "var(--good)" : "var(--bad)" }}>
              {m.avg == null ? "—" : `${m.avg >= 0 ? "+" : ""}${m.avg.toFixed(1)}%`}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   5. ETF OWNERSHIP  &  6. BONDS — hidden until a data source exists
   ══════════════════════════════════════════════════════════════════════════ */
interface EtfHolding {
  symbol: string;
  name: string;
  weight: number | null;
  marketValue: number | null;
}
export function EtfOwnershipSection({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ etfs: EtfHolding[] }>(
    `${API_BASE}/market-stats/etf-ownership?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false },
  );
  const etfs = data?.etfs || [];
  if (etfs.length === 0) return null; // graceful: hide when no data
  return (
    <Card title="ETFs Holding This Stock" subtitle={`Funds with meaningful ${ticker} exposure.`}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {etfs.map((e) => (
          <div key={e.symbol} className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center justify-between">
              <span className="font-mono font-bold text-accent">{e.symbol}</span>
              {e.weight != null && <span className="text-[12px] tabular font-bold">{e.weight.toFixed(2)}%</span>}
            </div>
            <div className="text-[12px] text-mute truncate">{e.name}</div>
            {e.marketValue != null && <div className="text-[11px] text-faint tabular mt-0.5">{formatCurrency(e.marketValue)}</div>}
          </div>
        ))}
      </div>
    </Card>
  );
}

interface BondRow {
  name: string;
  ytm: number | null;
  coupon: number | null;
  maturity: string | null;
}
export function BondsSection({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ bonds: BondRow[] }>(
    `${API_BASE}/market-stats/bonds?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000, shouldRetryOnError: false },
  );
  const bonds = data?.bonds || [];
  if (bonds.length === 0) return null; // graceful: hide when no data
  return (
    <Card title="Bonds" subtitle={`${ticker} corporate bonds.`}>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Bond</th>
              <th className="text-right">YTM</th>
              <th className="text-right">Coupon</th>
              <th className="text-right">Maturity</th>
            </tr>
          </thead>
          <tbody>
            {bonds.map((b, i) => (
              <tr key={i}>
                <td className="text-[13px]">{b.name}</td>
                <td className="text-right tabular">{b.ytm != null ? `${b.ytm.toFixed(2)}%` : "—"}</td>
                <td className="text-right tabular">{b.coupon != null ? `${b.coupon.toFixed(2)}%` : "—"}</td>
                <td className="text-right tabular">{b.maturity || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   7. FAQ SECTION — auto-generated from company data
   ══════════════════════════════════════════════════════════════════════════ */
interface FaqStats {
  price?: number | null;
  changePct?: number | null;
  marketCap?: number | null;
  revenue?: number | null;
  eps?: number | null;
  peRatio?: number | null;
  dividendYield?: number | null;
  dividendRate?: number | null;
  earningsDate?: string | null;
  priceTarget?: number | null;
  priceTargetUpsidePct?: number | null;
}
interface FaqProfile {
  employees?: number | null;
  sector?: string | null;
  industry?: string | null;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? s : d.toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" });
}

export function StockFAQSection({
  ticker,
  name,
  stats,
  profile,
  marketCap,
}: {
  ticker: string;
  name: string;
  stats: FaqStats | null;
  profile: FaqProfile | null;
  marketCap: number | null;
}) {
  const mc = stats?.marketCap ?? marketCap;
  const price = stats?.price ?? null;
  const qas: { q: string; a: string }[] = [];

  qas.push({
    q: `What is ${name} (${ticker}) stock price today?`,
    a: price != null
      ? `${name} stock is trading at $${price.toFixed(2)}${stats?.changePct != null ? `, ${stats.changePct >= 0 ? "up" : "down"} ${Math.abs(stats.changePct).toFixed(2)}% on the day` : ""}.`
      : `The latest price for ${ticker} is shown at the top of this page.`,
  });

  if (stats?.priceTarget != null) {
    qas.push({
      q: `What is the ${ticker} stock forecast?`,
      a: `Wall Street analysts have an average 12-month price target of $${stats.priceTarget.toFixed(2)} for ${ticker}${
        stats.priceTargetUpsidePct != null
          ? `, implying ${stats.priceTargetUpsidePct >= 0 ? "an upside" : "a downside"} of ${Math.abs(stats.priceTargetUpsidePct).toFixed(1)}% from the current price`
          : ""
      }.`,
    });
  }

  if (mc != null) {
    qas.push({
      q: `What is ${name}'s market cap?`,
      a: `${name} has a market capitalization of ${formatCurrency(mc)}.`,
    });
  }

  const earn = fmtDate(stats?.earningsDate);
  if (earn) qas.push({ q: `When is ${name}'s next earnings date?`, a: `${name} is expected to report earnings on ${earn}.` });

  qas.push({
    q: `Does ${name} pay dividends?`,
    a: stats?.dividendYield != null && stats.dividendYield > 0
      ? `Yes. ${name} pays a dividend with a yield of ${stats.dividendYield.toFixed(2)}%${stats.dividendRate != null ? ` ($${stats.dividendRate.toFixed(2)} per share annually)` : ""}.`
      : `${name} does not currently pay a regular dividend.`,
  });

  if (profile?.employees != null)
    qas.push({ q: `How many employees does ${name} have?`, a: `${name} employs approximately ${formatNumber(profile.employees)} people.` });

  if (stats?.revenue != null)
    qas.push({ q: `What is ${ticker}'s revenue?`, a: `${name} generated trailing-twelve-month revenue of ${formatCurrency(stats.revenue)}.` });

  qas.push({
    q: `How do I buy ${ticker} stock?`,
    a: `You can buy ${ticker} through any brokerage account by searching for the ticker symbol "${ticker}" and placing a buy order. Always do your own research first.`,
  });

  qas.push({
    q: `Should I invest in ${ticker}?`,
    a: `This page provides ${name}'s financials, technicals, analyst targets and insider activity to help your research. Nothing here is investment advice — consider your own goals and risk tolerance, and consult a licensed advisor.`,
  });

  return (
    <Card title="Frequently Asked Questions">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
        {qas.map((qa) => (
          <FaqItem key={qa.q} q={qa.q} a={qa.a} />
        ))}
      </div>
    </Card>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between gap-3 p-3.5 text-left">
        <span className="text-[14px] font-semibold">{q}</span>
        <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform text-mute" style={{ transform: open ? "rotate(180deg)" : "none" }} />
      </button>
      {open && <p className="px-3.5 pb-3.5 text-[13px] text-soft leading-relaxed">{a}</p>}
    </div>
  );
}
