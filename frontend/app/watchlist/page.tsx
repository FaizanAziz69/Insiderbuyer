"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo } from "react";
import { ArrowDown, ArrowUp, Star, X } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";
import { WatchlistButton } from "@/components/WatchlistButton";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { PremiumValue } from "@/components/premium/PremiumValue";
import { StockSearch } from "@/components/nav/StockSearch";
import { rankColumn } from "@/components/tableColumns";
import { useWatchlist } from "@/lib/watchlist";
import { ToolIntro } from "@/components/ToolIntro";

interface Quote {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  marketCap: number | null;
  volume: number | null;
}

interface WRow {
  symbol: string;
  name: string;
  price: number | null;
  changeAbs: number | null;
  changePct: number | null;
  marketCap: number | null;
  volume: number | null;
  insiderTrades: number | null;
  iqs: number | null;
}

/** Compact volume formatter (no currency sign): 1.2M, 940K, 3.1B. */
function fmtVol(v: number | null): string {
  if (v == null) return "—";
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v / 1e3).toFixed(0)}K`;
  return String(v);
}

const SUGGESTIONS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "AMD"];

export default function WatchlistPage() {
  const { tickers, add, remove } = useWatchlist();

  // Live quotes for the saved tickers — refreshed every 20s.
  const key = tickers.length
    ? `${API_BASE}/market-stats/quotes?symbols=${tickers.join(",")}`
    : null;
  const { data } = useSWR<{ rows: Quote[] }>(key, fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  });

  // Insider Score + insider-trade counts per ticker, pulled from each stock's
  // company detail. Unlike the rankings feed (buy-scored companies only), this
  // covers ANY watchlist ticker that has Form 4 activity — buys and sells,
  // live-fetched from SEC when we haven't ingested it.
  const detailsKey = tickers.length ? `wl-insider:${tickers.join(",")}` : null;
  const { data: insiderData } = useSWR<Record<string, { iqs: number | null; trades: number | null }>>(
    detailsKey,
    async () => {
      const entries = await Promise.all(
        tickers.map(async (t) => {
          try {
            const r = await fetch(`${API_BASE}/companies/${encodeURIComponent(t)}`);
            if (!r.ok) throw new Error("bad status");
            const d = await r.json();
            const txs: any[] = Array.isArray(d?.transactions) ? d.transactions : [];
            const trades = txs.length || null;
            // Prefer the formal Insider Score (buy-quality). When a stock has no
            // open-market buys (so no formal score), derive a 0–100 insider
            // sentiment from its Form 4 buys vs sells, weighted by role — so the
            // column is populated for every stock with insider activity.
            let iqs = typeof d?.score?.iqs === "number" ? d.score.iqs : null;
            if (iqs == null && txs.length) {
              const roleMult = (role: string) =>
                /chief|\bceo\b|\bcfo\b|\bcoo\b/i.test(role) ? 3 : /director/i.test(role) ? 2 : 1;
              let buy = 0;
              let sell = 0;
              for (const tx of txs) {
                const v = Number(tx.totalValue) || 0;
                const m = roleMult(String(tx.role || tx.rawTitle || ""));
                if (tx.type === "SELL" || tx.transactionCode === "S") sell += v * m;
                else buy += v * m;
              }
              const denom = buy + sell;
              if (denom > 0) iqs = Math.round((buy / denom) * 100);
            }
            return [t.toUpperCase(), { iqs, trades }] as const;
          } catch {
            return [t.toUpperCase(), { iqs: null, trades: null }] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const insiderBySym = useMemo(() => {
    const m = new Map<string, { iqs: number | null; trades: number | null }>();
    Object.entries(insiderData || {}).forEach(([k, v]) => m.set(k, v));
    return m;
  }, [insiderData]);

  const rows: WRow[] = useMemo(() => {
    const bySym = new Map<string, Quote>();
    (data?.rows || []).forEach((q) => bySym.set(q.symbol.toUpperCase(), q));
    return tickers.map((t) => {
      const sym = t.toUpperCase();
      const q = bySym.get(sym);
      const ins = insiderBySym.get(sym);
      return {
        symbol: sym,
        name: q?.name || sym,
        price: q?.price ?? null,
        changeAbs: q?.changeAbs ?? null,
        changePct: q?.changePct ?? null,
        marketCap: q?.marketCap ?? null,
        volume: q?.volume ?? null,
        insiderTrades: ins?.trades ?? null,
        iqs: ins?.iqs ?? null,
      };
    });
  }, [tickers, data, insiderBySym]);


  const columns: Column<WRow>[] = [
    rankColumn<WRow>(),
    {
      key: "symbol",
      label: "Company",
      sortValue: (r) => r.symbol,
      render: (r) => (
        <span className="inline-flex items-center gap-2">
          {r.symbol && <WatchlistButton ticker={r.symbol} variant="icon" size="sm" />}
          <Link
            href={r.symbol ? `/companies/${encodeURIComponent(r.symbol)}` : "#"}
            className="flex items-center gap-2"
          >
            <CompanyLogo ticker={r.symbol || ""} name={r.name} size={22} />
            <div className="min-w-0">
              <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                {r.symbol || "—"}
              </div>
              <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                {r.name}
              </div>
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
      render: (r) => (
        <span className="tabular font-bold text-[14px]">
          {r.price != null ? `$${r.price.toFixed(2)}` : "—"}
        </span>
      ),
    },
    {
      key: "changePct",
      label: "Change",
      align: "right",
      sortValue: (r) => r.changePct,
      render: (r) => {
        if (r.changePct == null) return <span className="text-faint text-[13px]">—</span>;
        const up = r.changePct >= 0;
        return (
          <span
            className="tabular font-bold text-[14px] inline-flex flex-col items-end leading-tight"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            <span className="inline-flex items-center gap-0.5">
              {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
              {up ? "+" : ""}
              {r.changePct.toFixed(2)}%
            </span>
            {r.changeAbs != null && (
              <span className="text-[11px] font-semibold">
                {up ? "+" : ""}
                {r.changeAbs.toFixed(2)}
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      sortValue: (r) => r.marketCap,
      render: (r) => (
        <span className="tabular text-mute text-[13px] font-bold">
          {r.marketCap ? formatCurrency(r.marketCap) : "—"}
        </span>
      ),
    },
    {
      key: "volume",
      label: "Daily Volume",
      align: "right",
      sortValue: (r) => r.volume,
      render: (r) => (
        <span className="tabular text-[13px] font-bold">{fmtVol(r.volume)}</span>
      ),
    },
    {
      key: "insiderTrades",
      label: "Insider Trades",
      align: "right",
      sortValue: (r) => r.insiderTrades,
      render: (r) => (
        <span className="tabular text-[13px] font-bold">
          {r.insiderTrades != null ? r.insiderTrades : "—"}
        </span>
      ),
    },
    {
      key: "iqs",
      label: "Insider Score",
      align: "center",
      sortValue: (r) => r.iqs,
      render: (r) => (
                  <PremiumValue label="Insider Score">
                    <IqsScoreCell iqs={r.iqs} />
                  </PremiumValue>
                ),
    },
    {
      key: "remove",
      label: "",
      sortable: false,
      align: "right",
      render: (r) => (
        <button
          type="button"
          onClick={() => remove(r.symbol)}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-mute hover:text-[var(--bad)] hover:bg-[var(--bg-3)] transition"
          aria-label={`Remove ${r.symbol}`}
          title="Remove from watchlist"
        >
          <X className="h-4 w-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Star className="h-4 w-4" style={{ color: "var(--gold)" }} fill="var(--gold)" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Watchlist</span>
          {tickers.length > 0 && (
            <span className="live-dot live-dot-good ml-2 text-faint">live</span>
          )}
        </div>
        <h1
          className="text-[28px] sm:text-[34px] font-bold tracking-tight"
          style={{ letterSpacing: "-0.5px" }}
        >
          Your Watchlist
        </h1>
        <ToolIntro tagline="Your stocks. Scored by insiders. Monitored 24/7.">
          Add any stock to your watchlist and InsiderBuying.com tracks the insider activity on your behalf. The moment an insider files a Form 4 on a stock you’re watching, we score the transaction and — for premium subscribers — send you an alert within hours. This is how informed investors stay ahead.
        </ToolIntro>
      </header>

      {/* Add by ticker OR company name — typeahead search (e.g. "goo" → GOOGL) */}
      <div className="max-w-md">
        <StockSearch
          dark={false}
          placeholder="Add a ticker or company (e.g. Google)…"
          onSelect={(r) => add(r.symbol)}
        />
      </div>

      {tickers.length === 0 ? (
        <div
          className="rounded-lg p-12 text-center"
          style={{ background: "var(--bg-2)", border: "1px dashed var(--border-strong)" }}
        >
          <Star className="h-8 w-8 mx-auto mb-3" style={{ color: "var(--text-faint)" }} />
          <div className="text-[16px] font-bold mb-1">Your watchlist is empty</div>
          <p className="text-[13px] text-mute mb-5">
            Add stocks to track their price and daily change here.
          </p>
          <div className="flex flex-wrap gap-2 justify-center">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => add(s)} className="pill-link">
                + {s}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <DataTable<WRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            initialSort={{ key: "marketCap", dir: "desc" }}
            columns={columns}
          />
        </div>
      )}
    </div>
  );
}
