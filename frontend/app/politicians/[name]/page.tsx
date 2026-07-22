"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownRight, Landmark, TrendingUp } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";

interface PolTrade {
  ticker: string | null;
  company: string;
  action: "Buy" | "Sell";
  amountMin: number | null;
  amountMax: number | null;
  transactionDate: string;
  reportedDate: string | null;
}
interface TickerAgg {
  ticker: string;
  company: string;
  buys: number;
  sells: number;
  estValue: number;
  trades: number;
}
interface Profile {
  name: string;
  chamber: string;
  party: string | null;
  photoUrl: string | null;
  stats: {
    totalTrades: number;
    buyCount: number;
    sellCount: number;
    buyValue: number;
    sellValue: number;
    estTotalVolume: number;
    distinctTickers: number;
    firstTraded: string;
    lastTraded: string;
  };
  topTickers: TickerAgg[];
  trades: PolTrade[];
}

function amountRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && max !== min)
    return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  return formatCurrency(min ?? max);
}

export default function PoliticianProfilePage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = use(params);
  const decoded = decodeURIComponent(name);
  const { data, isLoading } = useSWR<{ profile: Profile | null }>(
    `${API_BASE}/congressional-trades/profile?name=${encodeURIComponent(decoded)}`,
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
        <Link href="/congressional-trades" className="text-accent text-sm inline-flex items-center gap-1 mb-6">
          <ArrowLeft className="h-4 w-4" /> Back to congressional trades
        </Link>
        <div className="card p-12 text-center text-mute">
          No congressional disclosures found for &ldquo;{decoded}&rdquo;.
        </div>
      </div>
    );
  }

  const s = p.stats;
  const bias =
    s.buyValue + s.sellValue > 0 ? s.buyValue / (s.buyValue + s.sellValue) : 0.5;
  const partyColor = p.party?.startsWith("R") ? "#EF4444" : p.party?.startsWith("D") ? "#3B82F6" : "var(--accent)";

  const tickerCols: Column<TickerAgg>[] = [
    {
      key: "ticker",
      label: "Company",
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2.5 group">
          <CompanyLogo ticker={r.ticker} name={r.company} size={26} />
          <span>
            <span className="font-mono font-bold group-hover:text-accent transition">{r.ticker}</span>
            <span className="block text-[11px] text-mute truncate max-w-[160px]">{r.company}</span>
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
      key: "estValue",
      label: "Est. Value",
      align: "right",
      sortValue: (r) => r.estValue,
      render: (r) => formatCurrency(r.estValue),
    },
  ];

  const tradeCols: Column<PolTrade>[] = [
    { key: "date", label: "Traded", sortValue: (r) => new Date(r.transactionDate).getTime(), render: (r) => formatDate(r.transactionDate) },
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
      key: "action",
      label: "Type",
      align: "center",
      render: (r) => (
        <span
          className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10.5px] font-bold uppercase"
          style={{
            background: r.action === "Buy" ? "rgba(16,185,129,0.14)" : "rgba(239,68,68,0.14)",
            color: r.action === "Buy" ? "#10B981" : "#EF4444",
          }}
        >
          {r.action === "Buy" ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
          {r.action}
        </span>
      ),
    },
    { key: "amount", label: "Amount", align: "right", render: (r) => amountRange(r.amountMin, r.amountMax) },
    { key: "reported", label: "Reported", align: "right", render: (r) => (r.reportedDate ? formatDate(r.reportedDate) : "—") },
  ];

  return (
    <div className="w-full space-y-6">
      <Link href="/congressional-trades" className="text-accent text-[13px] inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> All congressional trades
      </Link>

      {/* Header */}
      <header className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt={p.name} className="rounded-full object-cover flex-shrink-0" style={{ width: 64, height: 64 }} />
          ) : (
            <div className="flex items-center justify-center rounded-full flex-shrink-0 text-[22px] font-bold" style={{ width: 64, height: 64, background: "var(--accent-soft)", color: "var(--accent)" }}>
              {initials(p.name)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight">{p.name}</h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13px] text-mute">
              <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 font-semibold" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                <Landmark className="h-3.5 w-3.5" /> {p.chamber}
              </span>
              {p.party && (
                <span className="rounded px-2 py-0.5 font-semibold text-white" style={{ background: partyColor }}>
                  {p.party}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <div className="flex justify-between text-[11px] font-semibold mb-1">
            <span style={{ color: "#10B981" }}>{Math.round(bias * 100)}% buying</span>
            <span style={{ color: "#EF4444" }}>{Math.round((1 - bias) * 100)}% selling</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden flex" style={{ background: "rgba(239,68,68,0.25)" }}>
            <div style={{ width: `${bias * 100}%`, background: "#10B981" }} />
          </div>
        </div>
      </header>

      {/* Stat tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <Stat label="Total Trades" value={String(s.totalTrades)} sub={`${s.buyCount} buys · ${s.sellCount} sells`} />
        <Stat label="Est. Bought" value={formatCurrency(s.buyValue)} accent="#10B981" />
        <Stat label="Est. Sold" value={formatCurrency(s.sellValue)} accent="#EF4444" />
        <Stat label="Est. Volume" value={formatCurrency(s.estTotalVolume)} />
        <Stat label="Companies" value={String(s.distinctTickers)} />
        <Stat label="Last Traded" value={formatDate(s.lastTraded)} sub={`since ${formatDate(s.firstTraded)}`} />
      </div>

      {/* Most traded + history */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-5">
        <section>
          <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2 inline-flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-accent" /> Most-Traded Stocks
          </h2>
          <div className="card overflow-hidden">
            <DataTable<TickerAgg> rows={p.topTickers} rowKey={(r) => r.ticker} columns={tickerCols} />
          </div>
        </section>
        <section>
          <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Disclosure History</h2>
          <div className="card overflow-hidden">
            <DataTable<PolTrade>
              rows={p.trades}
              rowKey={(r, i) => `${r.ticker}-${r.transactionDate}-${i}`}
              columns={tradeCols}
            />
          </div>
        </section>
      </div>
      <p className="text-[11px] text-faint">
        Amounts are the disclosed STOCK Act ranges (members report bands, not exact values);
        &ldquo;Est.&rdquo; figures use the range midpoint. Informational only — not investment advice.
      </p>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="card p-3.5">
      <div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">{label}</div>
      <div className="text-[19px] font-bold tracking-tight mt-1 tabular" style={accent ? { color: accent } : undefined}>
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
