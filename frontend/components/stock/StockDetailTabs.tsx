"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import { StockStatsGrid } from "@/components/StockStatsGrid";

export type DetailView =
  | "overview"
  | "chart"
  | "financials"
  | "statistics"
  | "history"
  | "profile";

const TABS: { key: DetailView; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "financials", label: "Financials" },
  { key: "statistics", label: "Statistics" },
  { key: "history", label: "History" },
  { key: "profile", label: "Profile" },
  { key: "chart", label: "Chart" },
];

export function StockDetailTabBar({
  active,
  onChange,
}: {
  active: DetailView;
  onChange: (v: DetailView) => void;
}) {
  return (
    <div className="border-b overflow-x-auto" style={{ borderColor: "var(--border)" }}>
      <div className="flex items-center gap-1 min-w-max">
        {TABS.map((t) => {
          const on = active === t.key;
          return (
            <button
              key={t.key}
              onClick={() => onChange(t.key)}
              className="relative px-4 py-2.5 text-[14px] font-semibold transition whitespace-nowrap"
              style={{ color: on ? "var(--accent)" : "var(--text-mute)" }}
            >
              {t.label}
              {on && (
                <span
                  className="absolute left-2 right-2 -bottom-px h-0.5 rounded-full"
                  style={{ background: "var(--accent)" }}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Renders the panel for a non-overview tab. */
export function StockDetailPanel({
  ticker,
  view,
  fallbackMarketCap = null,
  fallbackPrice = null,
}: {
  ticker: string;
  view: DetailView;
  fallbackMarketCap?: number | null;
  fallbackPrice?: number | null;
}) {
  if (view === "statistics")
    return (
      <StockStatsGrid
        ticker={ticker}
        fallbackMarketCap={fallbackMarketCap}
        fallbackPrice={fallbackPrice}
      />
    );
  if (view === "chart") return <ChartPanel ticker={ticker} />;
  if (view === "financials") return <FinancialsPanel ticker={ticker} />;
  if (view === "history") return <HistoryPanel ticker={ticker} />;
  if (view === "profile") return <ProfilePanel ticker={ticker} />;
  return null;
}

// ---------------------------------------------------------------- Chart
interface Bar {
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number;
  volume: number;
  changePct: number;
}

function ChartPanel({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ history: { bars: Bar[] } }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=1y`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const bars = data?.history?.bars || [];
  const path = useMemo(() => {
    if (bars.length < 2) return null;
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const W = 1000;
    const H = 300;
    const pts = closes.map((c, i) => {
      const x = (i / (closes.length - 1)) * W;
      const y = H - ((c - min) / range) * H;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    return { d: `M ${pts.join(" L ")}`, area: `M ${pts.join(" L ")} L ${W},${H} L 0,${H} Z`, min, max, W, H };
  }, [bars]);

  const up = bars.length >= 2 && bars[bars.length - 1].close >= bars[0].close;
  const stroke = up ? "var(--good)" : "var(--bad)";

  if (!data) return <div className="card p-5 h-80 shimmer rounded-lg" />;
  if (!path)
    return <div className="card p-8 text-center text-mute text-sm">No price history available.</div>;

  const first = bars[0].close;
  const last = bars[bars.length - 1].close;
  const chgPct = first ? ((last - first) / first) * 100 : 0;

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4 flex-wrap gap-2">
        <div className="text-[15px] font-semibold">{ticker} · 1-Year Price</div>
        <div className="text-[14px] font-bold tabular" style={{ color: up ? "var(--good)" : "var(--bad)" }}>
          {chgPct >= 0 ? "+" : ""}
          {chgPct.toFixed(2)}% · ${last.toFixed(2)}
        </div>
      </div>
      <svg viewBox={`0 0 ${path.W} ${path.H}`} preserveAspectRatio="none" className="w-full" style={{ height: 300 }}>
        <defs>
          <linearGradient id="sd-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={stroke} stopOpacity="0.22" />
            <stop offset="100%" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={path.area} fill="url(#sd-area)" />
        <path d={path.d} fill="none" stroke={stroke} strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="flex justify-between text-[11px] text-mute mt-2 tabular">
        <span>{bars[0].date}</span>
        <span>Hi ${path.max.toFixed(2)} · Lo ${path.min.toFixed(2)}</span>
        <span>{bars[bars.length - 1].date}</span>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- Financials
interface FinRow {
  date: string;
  [k: string]: number | null | string;
}
function FinancialsPanel({ ticker }: { ticker: string }) {
  const { data } = useSWR<{
    financials: { income: FinRow[]; balance: FinRow[]; cashflow: FinRow[] };
  }>(`${API_BASE}/market-stats/financials?symbol=${encodeURIComponent(ticker)}`, fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 10 * 60_000,
  });
  const f = data?.financials;
  if (!data) return <div className="card p-5 h-72 shimmer rounded-lg" />;
  if (!f || (!f.income.length && !f.balance.length && !f.cashflow.length))
    return <div className="card p-8 text-center text-mute text-sm">No financial statements available for {ticker}.</div>;

  return (
    <div className="space-y-6">
      <FinTable
        title="Income Statement"
        rows={f.income}
        lines={[
          ["Revenue", "revenue"],
          ["Cost of Revenue", "costOfRevenue"],
          ["Gross Profit", "grossProfit"],
          ["Gross Margin", "grossMargin", "pct"],
          ["SG&A", "sga"],
          ["R&D Expense", "researchDevelopment"],
          ["Operating Expenses", "operatingExpense"],
          ["Operating Income", "operatingIncome"],
          ["Operating Margin", "operatingMargin", "pct"],
          ["EBITDA", "ebitda"],
          ["Interest Expense", "interestExpense"],
          ["Pretax Income", "pretaxIncome"],
          ["Income Tax", "taxProvision"],
          ["Net Income", "netIncome"],
          ["Profit Margin", "profitMargin", "pct"],
          ["Basic EPS", "basicEPS", "eps"],
          ["Diluted EPS", "dilutedEPS", "eps"],
          ["Diluted Shares", "dilutedShares", "shares"],
        ]}
      />
      <FinTable
        title="Balance Sheet"
        rows={f.balance}
        lines={[
          ["Total Assets", "totalAssets"],
          ["Current Assets", "currentAssets"],
          ["Cash & Equivalents", "cash"],
          ["Total Liabilities", "totalLiabilities"],
          ["Current Liabilities", "currentLiabilities"],
          ["Total Debt", "totalDebt"],
          ["Total Equity", "totalEquity"],
          ["Retained Earnings", "retainedEarnings"],
          ["Working Capital", "workingCapital"],
        ]}
      />
      <FinTable
        title="Cash Flow"
        rows={f.cashflow}
        lines={[
          ["Operating Cash Flow", "operatingCashflow"],
          ["Capital Expenditures", "capex"],
          ["Free Cash Flow", "freeCashflow"],
          ["Investing Cash Flow", "investingCashflow"],
          ["Financing Cash Flow", "financingCashflow"],
          ["Stock Buybacks", "buyback"],
          ["Ending Cash", "endCashPosition"],
        ]}
      />
    </div>
  );
}

type FinFmt = "currency" | "pct" | "eps" | "shares";

function fmtFin(v: number, fmt: FinFmt): string {
  if (fmt === "pct") return `${v.toFixed(2)}%`;
  if (fmt === "eps") return `$${v.toFixed(2)}`;
  if (fmt === "shares") return formatNumber(v);
  return formatCurrency(v);
}

function FinTable({
  title,
  rows,
  lines,
}: {
  title: string;
  rows: FinRow[];
  lines: [string, string, FinFmt?][];
}) {
  if (!rows.length) return null;
  return (
    <div className="card overflow-hidden">
      <div className="px-5 py-3 border-b text-[15px] font-semibold" style={{ borderColor: "var(--border)" }}>
        {title}
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Metric</th>
              {rows.map((r) => (
                <th key={r.date} className="text-right">
                  {String(r.date).slice(0, 4) || "—"}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map(([label, key, fmt]) => (
              <tr key={key}>
                <td className="font-semibold text-[14px]">{label}</td>
                {rows.map((r) => {
                  const v = r[key];
                  return (
                    <td key={r.date} className="text-right tabular text-[14px]">
                      {typeof v === "number" ? fmtFin(v, fmt || "currency") : "—"}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- History
const HISTORY_PAGE_SIZE = 25;

function HistoryPanel({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ history: { bars: Bar[] } }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(ticker)}&range=1y`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const [page, setPage] = useState(0);
  const bars = useMemo(
    () => (data?.history?.bars || []).slice().reverse(), // newest first
    [data],
  );

  if (!data) return <div className="card p-5 h-72 shimmer rounded-lg" />;
  if (!bars.length)
    return <div className="card p-8 text-center text-mute text-sm">No price history available.</div>;

  const pageCount = Math.ceil(bars.length / HISTORY_PAGE_SIZE);
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * HISTORY_PAGE_SIZE;
  const pageBars = bars.slice(start, start + HISTORY_PAGE_SIZE);

  return (
    <div className="card overflow-hidden">
      <div
        className="px-5 py-3 border-b flex items-center justify-between gap-3"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="text-[15px] font-semibold">Price History</span>
        <span className="text-[12px] text-mute tabular">
          {start + 1}&ndash;{Math.min(start + HISTORY_PAGE_SIZE, bars.length)} of {bars.length} days
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>Date</th>
              <th className="text-right">Open</th>
              <th className="text-right">High</th>
              <th className="text-right">Low</th>
              <th className="text-right">Close</th>
              <th className="text-right">Change %</th>
              <th className="text-right">Volume</th>
            </tr>
          </thead>
          <tbody>
            {pageBars.map((b) => {
              const up = b.changePct >= 0;
              return (
                <tr key={b.date}>
                  <td className="text-[14px] font-semibold whitespace-nowrap">{b.date}</td>
                  <td className="text-right tabular text-[14px]">{b.open != null ? `$${b.open.toFixed(2)}` : "—"}</td>
                  <td className="text-right tabular text-[14px]">{b.high != null ? `$${b.high.toFixed(2)}` : "—"}</td>
                  <td className="text-right tabular text-[14px]">{b.low != null ? `$${b.low.toFixed(2)}` : "—"}</td>
                  <td className="text-right tabular text-[14px] font-bold">${b.close.toFixed(2)}</td>
                  <td className="text-right tabular text-[14px] font-bold" style={{ color: up ? "var(--good)" : "var(--bad)" }}>
                    {up ? "+" : ""}
                    {b.changePct.toFixed(2)}%
                  </td>
                  <td className="text-right tabular text-[14px] text-mute">{formatNumber(b.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {/* Pagination */}
      <div
        className="flex items-center justify-between gap-3 px-5 py-3 border-t"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setPage((p) => Math.max(0, p - 1))}
          disabled={safePage <= 0}
          className="inline-flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--bg-3)", border: "1px solid var(--border-strong)", color: "var(--text-soft)" }}
        >
          ← Previous
        </button>
        <span className="text-[12px] text-mute tabular">
          Page {safePage + 1} of {pageCount}
        </span>
        <button
          onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
          disabled={safePage >= pageCount - 1}
          className="inline-flex items-center gap-1 text-[13px] font-semibold px-3 py-1.5 rounded-md transition disabled:opacity-40 disabled:cursor-not-allowed"
          style={{ background: "var(--bg-3)", border: "1px solid var(--border-strong)", color: "var(--text-soft)" }}
        >
          Next →
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Profile
interface Profile {
  name: string;
  exchange: string | null;
  sector: string | null;
  industry: string | null;
  employees: number | null;
  website: string | null;
  phone: string | null;
  description: string | null;
  address: string | null;
  country: string | null;
  officers: { name: string | null; title: string | null; pay: number | null }[];
}
function ProfilePanel({ ticker }: { ticker: string }) {
  const { data } = useSWR<{ profile: Profile }>(
    `${API_BASE}/market-stats/profile?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const p = data?.profile;
  if (!data) return <div className="card p-5 h-72 shimmer rounded-lg" />;
  if (!p) return <div className="card p-8 text-center text-mute text-sm">No company profile available.</div>;

  const facts: [string, React.ReactNode][] = [
    ["Sector", p.sector || "—"],
    ["Industry", p.industry || "—"],
    ["Employees", p.employees != null ? formatNumber(p.employees) : "—"],
    ["Exchange", p.exchange || "—"],
    ["Country", p.country || "—"],
    [
      "Website",
      p.website ? (
        <a href={p.website} target="_blank" rel="noreferrer" className="text-accent hover:underline break-all">
          {p.website.replace(/^https?:\/\//, "")}
        </a>
      ) : (
        "—"
      ),
    ],
  ];

  return (
    <div className="space-y-6">
      <div className="card p-5">
        <div className="text-[18px] font-bold mb-3">{p.name}</div>
        {p.description && (
          <p className="text-[15px] text-soft leading-relaxed">{p.description}</p>
        )}
        {p.address && <div className="text-[13px] text-mute mt-3">{p.address}</div>}
      </div>

      <div className="card p-5">
        <div className="text-[15px] font-semibold mb-3">Company Details</div>
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {facts.map(([label, value]) => (
            <div
              key={label}
              className="flex items-center justify-between py-2 text-[14px]"
              style={{ borderBottom: "1px solid var(--border)" }}
            >
              <dt className="text-mute">{label}</dt>
              <dd className="font-semibold text-right">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      {p.officers.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-5 py-3 border-b text-[15px] font-semibold" style={{ borderColor: "var(--border)" }}>
            Key Executives
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Title</th>
                  <th className="text-right">Pay</th>
                </tr>
              </thead>
              <tbody>
                {p.officers.map((o, i) => (
                  <tr key={`${o.name}-${i}`}>
                    <td className="font-semibold text-[14px]">{o.name || "—"}</td>
                    <td className="text-[14px] text-soft">{o.title || "—"}</td>
                    <td className="text-right tabular text-[14px]">{o.pay != null ? formatCurrency(o.pay) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
