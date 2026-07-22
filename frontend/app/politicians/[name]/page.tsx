"use client";
import { use, useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { ArrowLeft, ArrowUpRight, ArrowDownRight } from "lucide-react";
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
interface YearVol { year: number; buyValue: number; sellValue: number }
interface SectorAgg { sector: string; trades: number; estValue: number }
interface Holding { ticker: string; company: string; estValue: number; allocation: number }
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
  topTickers: { ticker: string; company: string; buys: number; sells: number; estValue: number; trades: number }[];
  volumeByYear: YearVol[];
  topSectors: SectorAgg[];
  portfolio: Holding[];
  trades: PolTrade[];
}

function amountRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "—";
  if (min != null && max != null && max !== min) return `${formatCurrency(min)} – ${formatCurrency(max)}`;
  return formatCurrency(min ?? max);
}

export default function PoliticianProfilePage({ params }: { params: Promise<{ name: string }> }) {
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
        <div className="shimmer rounded-lg h-44" />
        <div className="shimmer rounded-lg h-72" />
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
        <div className="card p-12 text-center text-mute">No disclosures found for &ldquo;{decoded}&rdquo;.</div>
      </div>
    );
  }

  const s = p.stats;
  const partyWord = p.party?.startsWith("R") ? "Republican" : p.party?.startsWith("D") ? "Democrat" : null;
  const subtitle = [partyWord, p.chamber].filter(Boolean).join(" · ");

  const tradeCols: Column<PolTrade>[] = [
    {
      key: "stock",
      label: "Stock",
      render: (r) =>
        r.ticker ? (
          <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group">
            <CompanyLogo ticker={r.ticker} name={r.company} size={22} />
            <span className="min-w-0">
              <span className="font-mono font-semibold group-hover:text-accent transition">{r.ticker}</span>
              <span className="block text-[11px] text-mute truncate max-w-[150px]">{r.company}</span>
            </span>
          </Link>
        ) : (
          <span className="text-mute">{r.company}</span>
        ),
    },
    {
      key: "transaction",
      label: "Transaction",
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
          {r.action === "Buy" ? "Purchase" : "Sale"}
        </span>
      ),
    },
    { key: "filed", label: "Filed", align: "right", render: (r) => (r.reportedDate ? formatDate(r.reportedDate) : "—") },
    { key: "traded", label: "Traded", align: "right", sortValue: (r) => new Date(r.transactionDate).getTime(), render: (r) => formatDate(r.transactionDate) },
    { key: "amount", label: "Amount", align: "right", render: (r) => amountRange(r.amountMin, r.amountMax) },
  ];

  const portCols: Column<Holding>[] = [
    {
      key: "ticker",
      label: "Ticker",
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group">
          <CompanyLogo ticker={r.ticker} name={r.company} size={22} />
          <span className="font-mono font-bold group-hover:text-accent transition">{r.ticker}</span>
        </Link>
      ),
    },
    { key: "holding", label: "Est. Current Holding", align: "right", sortValue: (r) => r.estValue, render: (r) => formatCurrency(r.estValue) },
    {
      key: "alloc",
      label: "Portfolio Allocation",
      align: "right",
      sortValue: (r) => r.allocation,
      render: (r) => (
        <span className="inline-flex items-center gap-2 justify-end">
          <span className="hidden sm:block h-1.5 w-16 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
            <span className="block h-full" style={{ width: `${Math.min(100, r.allocation)}%`, background: "var(--accent)" }} />
          </span>
          <span className="font-mono tabular">{r.allocation.toFixed(1)}%</span>
        </span>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <Link href="/congressional-trades" className="text-accent text-[13px] inline-flex items-center gap-1">
        <ArrowLeft className="h-4 w-4" /> All congressional trades
      </Link>

      {/* ── Header + metrics row (QuiverQuant layout) ───────────────────── */}
      <header className="card p-5 sm:p-6">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {p.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={p.photoUrl} alt={p.name} className="rounded-full object-cover flex-shrink-0" style={{ width: 72, height: 72 }} />
          ) : (
            <div className="flex items-center justify-center rounded-full flex-shrink-0 text-[24px] font-bold" style={{ width: 72, height: 72, background: "var(--accent-soft)", color: "var(--accent)" }}>
              {initials(p.name)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-[26px] sm:text-[32px] font-bold tracking-tight leading-tight">{p.name}</h1>
            {subtitle && <div className="text-[13px] text-mute mt-0.5">{subtitle}</div>}
          </div>
        </div>

        {/* Metrics row */}
        <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-px rounded-lg overflow-hidden" style={{ background: "var(--border)" }}>
          <Metric label="Net Worth Est." value="—" />
          <Metric label="Trade Volume" value={formatCurrency(s.estTotalVolume)} />
          <Metric label="Total Trades" value={String(s.totalTrades)} />
          <Metric label="Last Traded" value={formatDate(s.lastTraded)} />
        </div>
      </header>

      {/* ── Trade Volume by Year + Top Traded Sectors ───────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-5">
        <section className="card p-4 sm:p-5">
          <h2 className="text-[15px] font-bold mb-3">Trade Volume by Year</h2>
          <VolumeByYear data={p.volumeByYear} />
          <div className="flex items-center gap-4 mt-3 text-[11px] text-mute">
            <Legend color="#10B981" label="Purchases" />
            <Legend color="#EF4444" label="Sales" />
          </div>
        </section>

        <section className="card p-4 sm:p-5">
          <h2 className="text-[15px] font-bold mb-3">Top Traded Sectors</h2>
          {p.topSectors.length === 0 ? (
            <p className="text-mute text-sm">No sector data.</p>
          ) : (
            <div className="space-y-2.5">
              {p.topSectors.map((sec) => {
                const max = p.topSectors[0].estValue || 1;
                return (
                  <div key={sec.sector}>
                    <div className="flex justify-between text-[12.5px] mb-1">
                      <span className="font-medium truncate">{sec.sector}</span>
                      <span className="text-mute font-mono">{formatCurrency(sec.estValue)}</span>
                    </div>
                    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "var(--bg-2)" }}>
                      <div style={{ width: `${(sec.estValue / max) * 100}%`, height: "100%", background: "var(--accent)" }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* ── Trades table ────────────────────────────────────────────────── */}
      <section>
        <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Trades</h2>
        <div className="card overflow-hidden">
          <DataTable<PolTrade> rows={p.trades} rowKey={(r, i) => `${r.ticker}-${r.transactionDate}-${i}`} columns={tradeCols} />
        </div>
      </section>

      {/* ── Estimated Live Stock Portfolio ──────────────────────────────── */}
      <section>
        <h2 className="text-[15px] font-bold uppercase tracking-wide mb-2">Estimated Live Stock Portfolio</h2>
        <div className="card overflow-hidden">
          {p.portfolio.length ? (
            <DataTable<Holding> rows={p.portfolio} rowKey={(r) => r.ticker} columns={portCols} />
          ) : (
            <div className="p-8 text-center text-mute text-sm">No net long positions from disclosed trades.</div>
          )}
        </div>
        <p className="text-[11px] text-faint mt-2">
          Holdings are estimated from disclosed buy/sell ranges (STOCK Act reports bands, not exact
          values or live balances). Informational only — not investment advice.
        </p>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="p-3" style={{ background: "var(--bg-1)" }}>
      <div className="text-[10.5px] uppercase tracking-wider text-mute font-bold">{label}</div>
      <div className="text-[18px] font-bold tracking-tight mt-1 tabular">{value}</div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Grouped bar chart — purchases (green) vs sales (red) est. $ per year. */
function VolumeByYear({ data }: { data: YearVol[] }) {
  const [hover, setHover] = useState<number | null>(null);
  if (!data.length) return <p className="text-mute text-sm">No trade history.</p>;
  const max = Math.max(1, ...data.map((d) => Math.max(d.buyValue, d.sellValue)));
  return (
    <div className="flex items-end gap-3 h-48 pt-4" style={{ overflowX: "auto" }}>
      {data.map((d) => (
        <div
          key={d.year}
          className="flex flex-col items-center gap-1.5 flex-1 min-w-[44px] relative"
          onMouseEnter={() => setHover(d.year)}
          onMouseLeave={() => setHover(null)}
        >
          {hover === d.year && (
            <div
              className="absolute -top-1 z-10 text-[11px] rounded px-2 py-1 whitespace-nowrap"
              style={{ background: "var(--text)", color: "var(--bg-1)", transform: "translateY(-100%)" }}
            >
              Buy {formatCurrency(d.buyValue)} · Sell {formatCurrency(d.sellValue)}
            </div>
          )}
          <div className="flex items-end gap-1 w-full justify-center" style={{ height: 150 }}>
            <div
              title={`Purchases ${formatCurrency(d.buyValue)}`}
              style={{ width: 14, height: `${(d.buyValue / max) * 100}%`, background: "#10B981", borderRadius: "3px 3px 0 0", minHeight: d.buyValue > 0 ? 3 : 0 }}
            />
            <div
              title={`Sales ${formatCurrency(d.sellValue)}`}
              style={{ width: 14, height: `${(d.sellValue / max) * 100}%`, background: "#EF4444", borderRadius: "3px 3px 0 0", minHeight: d.sellValue > 0 ? 3 : 0 }}
            />
          </div>
          <span className="text-[11px] text-mute font-mono">{d.year}</span>
        </div>
      ))}
    </div>
  );
}

function initials(name: string): string {
  const parts = name.replace(/[^A-Za-z ]/g, "").trim().split(/\s+/);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[parts.length - 1][0] || "")).toUpperCase();
}
