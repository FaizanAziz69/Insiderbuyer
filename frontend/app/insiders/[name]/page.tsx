"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowUpRight,
  ArrowDownRight,
  Building2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import {
  API_BASE,
  fetcher,
  formatCurrency,
  formatNumber,
  formatDate,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";

interface TradeRow {
  ticker: string | null;
  company: string;
  sector: string | null;
  side: "BUY" | "SELL";
  role: string;
  shares: number;
  pricePerShare: number;
  totalValue: number;
  livePrice: number | null;
  returnPct: number | null;
  transactionDate: string;
  filingUrl: string | null;
}
interface TickerAgg {
  ticker: string;
  name: string;
  sector: string | null;
  buys: number;
  sells: number;
  buyValue: number;
  sellValue: number;
  totalValue: number;
  trades: number;
}
interface Profile {
  name: string;
  roles: string[];
  primaryCompany: { ticker: string | null; name: string } | null;
  stats: {
    totalTrades: number;
    buyCount: number;
    sellCount: number;
    totalBought: number;
    totalSold: number;
    distinctCompanies: number;
    firstTraded: string;
    lastTraded: string;
    winRate: number | null;
    scoredBuys: number;
    avgBuyReturnPct: number | null;
  };
  bestTrade: TradeRow | null;
  topTickers: TickerAgg[];
  topSectors: { sector: string; count: number }[];
  trades: TradeRow[];
}

export default function InsiderProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const decoded = decodeURIComponent(name);
  const { data, isLoading } = useSWR<{ profile: Profile | null }>(
    `${API_BASE}/insiders/profile?name=${encodeURIComponent(decoded)}`,
    fetcher,
    { revalidateOnFocus: false },
  );
  const p = data?.profile || null;

  if (isLoading) {
    return (
      <div className="w-full space-y-6">
        <div className="shimmer rounded-lg h-40" />
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="shimmer rounded-lg h-24" />
          ))}
        </div>
        <div className="shimmer rounded-lg h-96" />
      </div>
    );
  }

  if (!p) {
    return (
      <div className="w-full">
        <Link href="/insiders" className="text-accent text-sm inline-flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to insiders
        </Link>
        <div className="card p-12 text-center text-mute">
          No insider trades found for &ldquo;{decoded}&rdquo;.
        </div>
      </div>
    );
  }

  const s = p.stats;
  const netBias =
    s.totalBought + s.totalSold > 0
      ? s.totalBought / (s.totalBought + s.totalSold)
      : 0.5;

  const tickerCols: Column<TickerAgg>[] = [
    {
      key: "ticker",
      label: "Company",
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2.5 group">
          <CompanyLogo ticker={r.ticker} name={r.name} size={26} />
          <span>
            <span className="font-mono font-bold group-hover:text-accent transition">{r.ticker}</span>
            <span className="block text-[11px] text-mute truncate max-w-[160px]">{r.name}</span>
          </span>
        </Link>
      ),
    },
    { key: "trades", label: "Trades", align: "center", sortValue: (r) => r.trades, render: (r) => r.trades },
    {
      key: "activity",
      label: "Buys / Sells",
      align: "center",
      render: (r) => (
        <span className="font-mono text-[12px]">
          <span style={{ color: "#10B981" }}>{r.buys}B</span>
          {" / "}
          <span style={{ color: "#EF4444" }}>{r.sells}S</span>
        </span>
      ),
    },
    {
      key: "totalValue",
      label: "Total Value",
      align: "right",
      sortValue: (r) => r.totalValue,
      render: (r) => formatCurrency(r.totalValue),
    },
  ];

  const tradeCols: Column<TradeRow>[] = [
    { key: "date", label: "Date", sortValue: (r) => new Date(r.transactionDate).getTime(), render: (r) => formatDate(r.transactionDate) },
    {
      key: "ticker",
      label: "Company",
      render: (r) =>
        r.ticker ? (
          <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group">
            <CompanyLogo ticker={r.ticker} name={r.company} size={22} />
            <span className="font-mono font-semibold group-hover:text-accent transition">{r.ticker}</span>
          </Link>
        ) : (
          <span className="text-mute">{r.company}</span>
        ),
    },
    {
      key: "side",
      label: "Type",
      align: "center",
      render: (r) => (
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase"
          style={{
            background: r.side === "BUY" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
            color: r.side === "BUY" ? "#10B981" : "#EF4444",
          }}
        >
          {r.side === "BUY" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {r.side}
        </span>
      ),
    },
    { key: "shares", label: "Shares", align: "right", sortValue: (r) => r.shares, render: (r) => formatNumber(r.shares) },
    { key: "price", label: "Price", align: "right", render: (r) => (r.pricePerShare > 0 ? `$${r.pricePerShare.toFixed(2)}` : "—") },
    { key: "value", label: "Value", align: "right", sortValue: (r) => r.totalValue, render: (r) => formatCurrency(r.totalValue) },
    {
      key: "return",
      label: "Return*",
      align: "right",
      sortValue: (r) => r.returnPct ?? -999,
      render: (r) =>
        r.returnPct == null ? (
          <span className="text-faint">—</span>
        ) : (
          <span style={{ color: r.returnPct >= 0 ? "#10B981" : "#EF4444" }} className="font-semibold tabular">
            {r.returnPct >= 0 ? "+" : ""}
            {r.returnPct.toFixed(1)}%
          </span>
        ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <Link href="/insiders" className="text-accent text-[13px] inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> All insiders
      </Link>

      {/* Header */}
      <header className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div
            className="flex items-center justify-center rounded-full flex-shrink-0 text-[22px] font-bold"
            style={{ width: 64, height: 64, background: "var(--accent-soft)", color: "var(--accent)" }}
          >
            {initials(p.name)}
          </div>
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight">{p.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-mute">
              {p.roles.map((r) => (
                <span key={r} className="rounded px-2 py-0.5 font-semibold" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                  {r}
                </span>
              ))}
              {p.primaryCompany?.ticker && (
                <span className="inline-flex items-center gap-1">
                  <Building2 className="h-3.5 w-3.5" />
                  Primarily{" "}
                  <Link href={`/companies/${p.primaryCompany.ticker}`} className="font-mono font-semibold text-accent">
                    {p.primaryCompany.ticker}
                  </Link>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Buy/sell bias bar */}
        <div className="mt-5">
          <div className="flex justify-between text-[11px] font-semibold mb-1">
            <span style={{ color: "#10B981" }}>{Math.round(netBias * 100)}% buying</span>
            <span style={{ color: "#EF4444" }}>{Math.round((1 - netBias) * 100)}% selling</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "rgba(239,68,68,0.25)" }}>
            <div style={{ width: `${netBias * 100}%`, background: "#10B981" }} />
          </div>
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Total Trades" value={String(s.totalTrades)} sub={`${s.buyCount} buys · ${s.sellCount} sells`} />
        <Stat label="Total Bought" value={formatCurrency(s.totalBought)} accent="#10B981" />
        <Stat label="Total Sold" value={formatCurrency(s.totalSold)} accent="#EF4444" />
        <Stat label="Companies" value={String(s.distinctCompanies)} />
        <Stat
          label="Buy Win Rate"
          value={s.winRate != null ? `${s.winRate}%` : "—"}
          sub={s.winRate != null ? `${s.scoredBuys} buys priced` : "insufficient data"}
        />
        <Stat
          label="Avg Buy Return*"
          value={s.avgBuyReturnPct != null ? `${s.avgBuyReturnPct >= 0 ? "+" : ""}${s.avgBuyReturnPct}%` : "—"}
          accent={s.avgBuyReturnPct != null ? (s.avgBuyReturnPct >= 0 ? "#10B981" : "#EF4444") : undefined}
        />
      </div>

      {/* Best trade + last active */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {p.bestTrade && p.bestTrade.returnPct != null && (
          <div className="card p-4 lg:col-span-2 flex items-center gap-4">
            <Trophy className="h-8 w-8 flex-shrink-0" style={{ color: "var(--accent)" }} />
            <div className="min-w-0">
              <div className="text-[11px] uppercase tracking-wider text-mute font-bold">Best buy (vs current price)</div>
              <div className="text-[15px] font-semibold mt-0.5">
                <span className="font-mono">{p.bestTrade.ticker}</span> — bought{" "}
                {formatCurrency(p.bestTrade.totalValue)} at ${p.bestTrade.pricePerShare.toFixed(2)},{" "}
                <span style={{ color: "#10B981" }} className="font-bold">
                  +{p.bestTrade.returnPct.toFixed(1)}%
                </span>{" "}
                since ({formatDate(p.bestTrade.transactionDate)})
              </div>
            </div>
          </div>
        )}
        <div className="card p-4 flex items-center gap-3">
          <TrendingUp className="h-7 w-7 flex-shrink-0 text-accent" />
          <div>
            <div className="text-[11px] uppercase tracking-wider text-mute font-bold">Active</div>
            <div className="text-[14px] font-semibold mt-0.5">
              {formatDate(s.firstTraded)} → {formatDate(s.lastTraded)}
            </div>
          </div>
        </div>
      </div>

      {/* Top tickers + sectors */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5">
        <section>
          <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Most-Traded Stocks</h2>
          <div className="card overflow-hidden">
            <DataTable<TickerAgg> rows={p.topTickers} rowKey={(r) => r.ticker} columns={tickerCols} />
          </div>
        </section>
        <section>
          <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Top Sectors</h2>
          <div className="card p-4 space-y-2.5">
            {p.topSectors.length === 0 && <p className="text-mute text-sm">No sector data.</p>}
            {p.topSectors.map((sec) => {
              const max = p.topSectors[0].count || 1;
              return (
                <div key={sec.sector}>
                  <div className="flex justify-between text-[12.5px] mb-1">
                    <span className="font-medium truncate">{sec.sector}</span>
                    <span className="text-mute font-mono">{sec.count}</span>
                  </div>
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
                    <div style={{ width: `${(sec.count / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      {/* Full trade history */}
      <section>
        <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Trade History</h2>
        <div className="card overflow-hidden">
          <DataTable<TradeRow>
            rows={p.trades}
            rowKey={(r, i) => `${r.ticker}-${r.transactionDate}-${i}`}
            columns={tradeCols}
          />
        </div>
        <p className="text-[11px] text-faint mt-2">
          *Return = current share price vs the insider&rsquo;s purchase price (buys only). Not the
          insider&rsquo;s realized return. Informational only — not investment advice.
        </p>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub?: string;
  accent?: string;
}) {
  return (
    <div className="card p-3.5">
      <div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">{label}</div>
      <div className="text-[20px] font-bold tracking-tight mt-1 tabular" style={accent ? { color: accent } : undefined}>
        {value}
      </div>
      {sub && <div className="text-[10.5px] text-faint mt-0.5">{sub}</div>}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}
