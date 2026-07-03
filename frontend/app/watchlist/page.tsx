"use client";
import useSWR from "swr";
import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDown, ArrowUp, Plus, Star, X } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { useWatchlist } from "@/lib/watchlist";

interface Quote {
  symbol: string;
  name: string;
  price: number;
  changeAbs: number;
  changePct: number;
  marketCap: number | null;
}

interface WRow {
  symbol: string;
  name: string;
  price: number | null;
  changeAbs: number | null;
  changePct: number | null;
  marketCap: number | null;
}

const SUGGESTIONS = ["AAPL", "NVDA", "TSLA", "MSFT", "AMZN", "META", "GOOGL", "AMD"];

export default function WatchlistPage() {
  const { tickers, add, remove } = useWatchlist();
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Live quotes for the saved tickers — refreshed every 20s.
  const key = tickers.length
    ? `${API_BASE}/market-stats/quotes?symbols=${tickers.join(",")}`
    : null;
  const { data } = useSWR<{ rows: Quote[] }>(key, fetcher, {
    refreshInterval: 20_000,
    revalidateOnFocus: true,
  });

  const rows: WRow[] = useMemo(() => {
    const bySym = new Map<string, Quote>();
    (data?.rows || []).forEach((q) => bySym.set(q.symbol.toUpperCase(), q));
    return tickers.map((t) => {
      const q = bySym.get(t.toUpperCase());
      return {
        symbol: t.toUpperCase(),
        name: q?.name || t.toUpperCase(),
        price: q?.price ?? null,
        changeAbs: q?.changeAbs ?? null,
        changePct: q?.changePct ?? null,
        marketCap: q?.marketCap ?? null,
      };
    });
  }, [tickers, data]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    setError(null);
    if (!t) return;
    if (tickers.includes(t)) {
      setInput("");
      return; // already on the list — no duplicate
    }
    // Validate the ticker is a real, priced US stock before adding.
    setChecking(true);
    try {
      const res = await fetch(`${API_BASE}/market-stats/quotes?symbols=${encodeURIComponent(t)}`);
      const d = await res.json();
      const ok = (d?.rows || []).some(
        (r: Quote) => r.symbol?.toUpperCase() === t && typeof r.price === "number" && r.price > 0,
      );
      if (ok) {
        add(t);
        setInput("");
      } else {
        setError(`“${t}” isn’t a recognized U.S. stock ticker.`);
      }
    } catch {
      setError("Couldn’t verify that ticker — please try again.");
    } finally {
      setChecking(false);
    }
  }

  const columns: Column<WRow>[] = [
    rankColumn<WRow>(),
    {
      key: "symbol",
      label: "Company",
      sortValue: (r) => r.symbol,
      render: (r) => (
        <Link
          href={`/companies/${encodeURIComponent(r.symbol)}`}
          className="inline-flex items-center gap-2.5 group"
        >
          <CompanyLogo ticker={r.symbol} name={r.name} size={26} />
          <span className="min-w-0">
            <span className="block font-mono text-[14px] font-bold text-accent group-hover:underline leading-tight">
              {r.symbol}
            </span>
            <span
              className="block truncate max-w-[220px] text-[13px] font-medium leading-tight"
              style={{ color: "var(--text)" }}
            >
              {r.name}
            </span>
          </span>
        </Link>
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
        <p className="text-mute text-[14px] mt-2 max-w-3xl leading-relaxed">
          Track any stocks you follow with live prices and daily change. Add from here, or
          tap the star on any company page. Saved on this device — no login needed.
        </p>
      </header>

      {/* Add-by-symbol (validated against live quotes before saving) */}
      <div className="max-w-md">
        <form onSubmit={submit} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (error) setError(null);
            }}
            placeholder="Add a ticker (e.g. AAPL)"
            className="input-base flex-1"
            style={{ textTransform: "uppercase" }}
          />
          <button
            type="submit"
            disabled={checking}
            className="btn-primary"
            style={{ padding: "0 18px" }}
          >
            <Plus className="h-4 w-4" /> {checking ? "Checking…" : "Add"}
          </button>
        </form>
        {error && (
          <p className="mt-1.5 text-[12px]" style={{ color: "var(--bad)" }}>
            {error}
          </p>
        )}
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
