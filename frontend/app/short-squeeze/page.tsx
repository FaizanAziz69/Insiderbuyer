"use client";
import useSWR from "swr";
import Link from "next/link";
import { Flame } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatNumber } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";

interface ShortRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  sharesShort: number | null;
  sharesShortPrior: number | null;
  shortPctFloat: number | null;
  shortRatio: number | null; // days to cover
  changePct: number | null; // MoM change in shares short (%)
  marketCap: number | null;
}
interface SqueezeRow extends ShortRow {
  squeeze: number | null;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** 0–100 squeeze score: how much fuel (short % of float) meets how hard it is
 *  to cover (days-to-cover), with a kicker for rising short interest. */
function squeezeScore(r: ShortRow): number | null {
  if (r.shortPctFloat == null && r.shortRatio == null) return null;
  const floatPart = clamp01((r.shortPctFloat ?? 0) / 30) * 50; //  ≥30% float ⇒ max
  const dtcPart = clamp01((r.shortRatio ?? 0) / 10) * 35; //       ≥10 days ⇒ max
  const momPart = clamp01((r.changePct ?? 0) / 50) * 15; //        +50% MoM ⇒ max
  return Math.round(floatPart + dtcPart + momPart);
}

function squeezeBadge(score: number) {
  if (score >= 70) return { label: "High", bg: "var(--bad)", fg: "#fff" };
  if (score >= 40)
    return { label: "Elevated", bg: "var(--warn)", fg: "#1a1205" };
  return { label: "Low", bg: "var(--bg-3)", fg: "var(--text-soft)" };
}

export default function ShortSqueezePage() {
  const { data, isLoading } = useSWR<{ rows: ShortRow[] }>(
    `${API_BASE}/market-stats/short-interest`,
    fetcher,
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const rows: SqueezeRow[] = (data?.rows || [])
    .map((r) => ({ ...r, squeeze: squeezeScore(r) }))
    .sort((a, b) => (b.squeeze ?? -1) - (a.squeeze ?? -1));

  // Live quotes for the tickers shown in the table.
  const tickerKey = rows
    .map((r) => (r.symbol || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 250)
    .join(",");
  const { data: quoteData } = useSWR<{ rows: { symbol: string; price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null }[] }>(
    tickerKey ? `${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(tickerKey)}` : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const quoteBySym = new Map<string, { price: number; changePct: number; peRatio?: number | null; dividendYield?: number | null }>();
  (quoteData?.rows || []).forEach((q) => quoteBySym.set(q.symbol.toUpperCase(), q));

  const columns: Column<SqueezeRow>[] = [
    rankColumn<SqueezeRow>(),
    {
      key: "symbol",
      label: "Company",
      sortValue: (r) => r.symbol,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />
          <Link href={`/companies/${encodeURIComponent(r.symbol)}`} className="flex items-center gap-2">
            <CompanyLogo ticker={r.symbol} name={r.name} size={22} />
            <div className="min-w-0">
              <div className="font-mono text-[15px] font-bold text-accent hover:underline">{r.symbol}</div>
              <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>{r.name}</div>
            </div>
          </Link>
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      sortValue: (r) => r.price,
      render: (r) => <span className="tabular text-[14px] font-bold">${r.price.toFixed(2)}</span>,
    },
    {
      key: "changePctLive",
      label: "Change %",
      align: "right",
      sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.changePct ?? null,
      render: (r) => {
        const q = quoteBySym.get((r.symbol || "").toUpperCase());
        if (!q || q.changePct == null) return <span className="text-faint text-[13px]">—</span>;
        const up = q.changePct >= 0;
        return <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>{up ? "+" : ""}{q.changePct.toFixed(2)}%</span>;
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      sortValue: (r) => r.marketCap,
      render: (r) => (
        <span className="tabular text-[14px] text-mute font-bold">{formatCurrency(r.marketCap)}</span>
      ),
    },
    {
      key: "peRatio",
      label: "P/E",
      align: "right",
      sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.peRatio ?? null,
      render: (r) => {
        const pe = quoteBySym.get((r.symbol || "").toUpperCase())?.peRatio;
        return <span className="tabular text-mute text-[13px] font-bold">{pe != null ? pe.toFixed(1) : "—"}</span>;
      },
    },
    {
      key: "dividendYield",
      label: "Div Yield",
      align: "right",
      sortValue: (r) => quoteBySym.get((r.symbol || "").toUpperCase())?.dividendYield ?? null,
      render: (r) => {
        const dy = quoteBySym.get((r.symbol || "").toUpperCase())?.dividendYield;
        return <span className="tabular text-mute text-[13px] font-bold">{dy != null ? dy.toFixed(2) + "%" : "—"}</span>;
      },
    },
    {
      key: "squeeze",
      label: "Squeeze Score",
      align: "center",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.squeeze,
      render: (r) => {
        if (r.squeeze == null) return <span className="text-faint">—</span>;
        const b = squeezeBadge(r.squeeze);
        return (
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-flex items-center justify-center rounded-md text-[13px] font-bold tabular"
              style={{ background: b.bg, color: b.fg, minWidth: 34, height: 24, padding: "0 6px" }}
            >
              {r.squeeze}
            </span>
            <span className="text-[11px] font-semibold text-mute">{b.label}</span>
          </span>
        );
      },
    },
    {
      key: "shortPctFloat",
      label: "Short % Float",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.shortPctFloat,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">
          {r.shortPctFloat != null ? `${r.shortPctFloat.toFixed(2)}%` : "—"}
        </span>
      ),
    },
    {
      key: "shortRatio",
      label: "Days to Cover",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.shortRatio,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">
          {r.shortRatio != null ? r.shortRatio.toFixed(1) : "—"}
        </span>
      ),
    },
    {
      key: "sharesShort",
      label: "Shares Short",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.sharesShort,
      render: (r) => (
        <span className="tabular text-[14px] text-mute font-bold">
          {r.sharesShort != null ? formatNumber(r.sharesShort) : "—"}
        </span>
      ),
    },
    {
      key: "changePct",
      label: "MoM Change",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.changePct,
      render: (r) => {
        if (r.changePct == null) return <span className="text-faint">—</span>;
        const up = r.changePct >= 0;
        return (
          <span className="tabular text-[14px] font-bold" style={{ color: up ? "var(--bad)" : "var(--good)" }}>
            {up ? "+" : ""}
            {r.changePct.toFixed(1)}%
          </span>
        );
      },
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Flame className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Short Squeeze</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] sm:text-[40px] font-semibold tracking-tight" style={{ letterSpacing: "-0.6px" }}>
          Short Squeeze List
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          Stocks ranked by short-squeeze potential — the short position of each stock combined
          into a single 0–100 score. A high score means a large share of the float is sold short
          and it would take many days of volume to cover, the classic setup for a squeeze.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="short-squeeze-top" />

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-mute">Loading short data…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-mute">No short-interest data available.</div>
        ) : (
          <DataTable<SqueezeRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            initialSort={{ key: "marketCap", dir: "desc" }}
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
          />
        )}
      </div>

      {/* How it's calculated */}
      <section className="card p-5 sm:p-6 max-w-4xl">
        <h2 className="text-[20px] font-bold tracking-tight mb-3">How the Squeeze Score works</h2>
        <p className="text-[15px] text-soft leading-relaxed mb-3">
          The score blends the three numbers that drive a short squeeze, each from the latest
          reported short-interest data:
        </p>
        <ul className="space-y-2 text-[14px] text-soft">
          <li>
            <span className="font-bold text-text">Short % of Float (50%)</span> — how much of the
            tradeable share count is sold short. The more shorts in the stock, the more buying
            pressure a squeeze can create.
          </li>
          <li>
            <span className="font-bold text-text">Days to Cover (35%)</span> — short interest ÷
            average daily volume. The longer it would take shorts to buy back their shares, the
            harder a squeeze is to escape.
          </li>
          <li>
            <span className="font-bold text-text">Month-over-month change (15%)</span> — rising
            short interest means bears are adding pressure into the name.
          </li>
        </ul>
        <p className="text-[13px] text-mute leading-relaxed mt-4">
          Scores of 70+ flag &ldquo;High&rdquo; squeeze potential, 40–69 &ldquo;Elevated.&rdquo;
          Short-interest data is reported on a delay (bi-monthly settlement) and is informational,
          not a trade recommendation.
        </p>
      </section>
    </div>
  );
}
