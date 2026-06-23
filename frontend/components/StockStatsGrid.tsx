"use client";
import useSWR from "swr";
import { ArrowDown, ArrowUp } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatNumber, formatDate } from "@/lib/api";

export interface StockStats {
  symbol: string;
  name: string | null;
  currency: string;
  price: number | null;
  change: number | null;
  changePct: number | null;
  marketCap: number | null;
  revenue: number | null;
  netIncome: number | null;
  eps: number | null;
  sharesOut: number | null;
  peRatio: number | null;
  forwardPE: number | null;
  dividendRate: number | null;
  dividendYield: number | null;
  exDividendDate: string | null;
  volume: number | null;
  open: number | null;
  previousClose: number | null;
  dayLow: number | null;
  dayHigh: number | null;
  week52Low: number | null;
  week52High: number | null;
  beta: number | null;
  analystRating: string | null;
  priceTarget: number | null;
  priceTargetUpsidePct: number | null;
  earningsDate: string | null;
}

const num = (n: number | null | undefined, dp = 2) =>
  n === null || n === undefined || Number.isNaN(n) ? "—" : Number(n).toFixed(dp);

const ratingLabel: Record<string, string> = {
  strong_buy: "Strong Buy",
  buy: "Buy",
  hold: "Hold",
  underperform: "Underperform",
  sell: "Sell",
};

/** Full stockanalysis.com-style fundamentals grid for a ticker. */
export function StockStatsGrid({
  ticker,
  fallbackMarketCap = null,
  fallbackPrice = null,
}: {
  ticker: string;
  /** DB-known values used when the live feed has no data for this symbol. */
  fallbackMarketCap?: number | null;
  fallbackPrice?: number | null;
}) {
  const { data, isLoading } = useSWR<{ stats: StockStats | null }>(
    `${API_BASE}/market-stats/stats?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const s = data?.stats;

  if (isLoading && !s) {
    return <div className="card p-5 h-72 shimmer rounded-lg" />;
  }
  if (!s) return null;

  const priceVal = s.price ?? fallbackPrice;
  const marketCapVal = s.marketCap ?? fallbackMarketCap;
  const up = (s.changePct ?? 0) >= 0;
  const rows: [string, React.ReactNode][] = [
    ["Market Cap", formatCurrency(marketCapVal)],
    ["Revenue (ttm)", formatCurrency(s.revenue)],
    ["Net Income (ttm)", formatCurrency(s.netIncome)],
    ["EPS (ttm)", num(s.eps)],
    ["Shares Out", formatNumber(s.sharesOut)],
    ["P/E Ratio", num(s.peRatio)],
    ["Forward P/E", num(s.forwardPE)],
    [
      "Dividend",
      s.dividendRate
        ? `$${num(s.dividendRate)}${s.dividendYield ? ` (${num(s.dividendYield)}%)` : ""}`
        : "—",
    ],
    ["Ex-Dividend Date", s.exDividendDate ? formatDate(s.exDividendDate) : "—"],
    ["Volume", formatNumber(s.volume)],
    ["Open", num(s.open)],
    ["Previous Close", num(s.previousClose)],
    [
      "Day's Range",
      s.dayLow && s.dayHigh ? `${num(s.dayLow)} - ${num(s.dayHigh)}` : "—",
    ],
    [
      "52-Week Range",
      s.week52Low && s.week52High ? `${num(s.week52Low)} - ${num(s.week52High)}` : "—",
    ],
    ["Beta", num(s.beta)],
    [
      "Analysts",
      s.analystRating ? (
        <span className="font-bold text-good">
          {ratingLabel[s.analystRating] || s.analystRating}
        </span>
      ) : (
        "—"
      ),
    ],
    [
      "Price Target",
      s.priceTarget ? (
        <span>
          {num(s.priceTarget)}
          {s.priceTargetUpsidePct != null && (
            <span
              className="ml-1 text-[12px]"
              style={{ color: s.priceTargetUpsidePct >= 0 ? "var(--good)" : "var(--bad)" }}
            >
              ({s.priceTargetUpsidePct >= 0 ? "+" : ""}
              {num(s.priceTargetUpsidePct)}%)
            </span>
          )}
        </span>
      ) : (
        "—"
      ),
    ],
    ["Earnings Date", s.earningsDate ? formatDate(s.earningsDate) : "—"],
  ];

  return (
    <div className="card p-5">
      {/* Price header */}
      <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 mb-1">
        <span className="text-[30px] font-bold tabular tracking-tight">
          {priceVal != null ? `$${num(priceVal)}` : "—"}
        </span>
        {s.change != null && s.changePct != null && (
          <span
            className="inline-flex items-center gap-1 text-[15px] font-bold tabular"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {up ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
            {up ? "+" : ""}
            {num(s.change)} ({up ? "+" : ""}
            {num(s.changePct)}%)
          </span>
        )}
      </div>
      <div className="text-[11px] text-mute uppercase tracking-wider font-mono mb-4">
        {s.symbol} · Real-Time Price · {s.currency}
      </div>

      {/* Stats grid — two columns of label/value rows */}
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className="flex items-center justify-between py-2 text-[14px]"
            style={{ borderBottom: "1px solid var(--border)" }}
          >
            <dt className="text-mute">{label}</dt>
            <dd className="font-semibold tabular text-right">{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
