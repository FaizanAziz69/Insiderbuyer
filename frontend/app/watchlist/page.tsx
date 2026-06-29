"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { Plus, X, Star } from "lucide-react";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { TierBadge } from "@/components/TierBadge";
import { useWatchlist } from "@/lib/watchlist";

const SUGGESTIONS = ["NVDA", "AAPL", "TSLA", "MNSO", "DBGI", "SMMT"];

export default function WatchlistPage() {
  const { tickers, add, remove } = useWatchlist();
  const [input, setInput] = useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const t = input.trim().toUpperCase();
    if (t) add(t);
    setInput("");
  }

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Star className="h-4 w-4 text-accent" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Watchlist</span>
        </div>
        <h1 className="text-[28px] font-bold tracking-tight">Your Watchlist</h1>
        <p className="text-mute text-sm mt-1">
          Track tickers and see their IQS score and recent insider activity side-by-side.
          Saved on this device — no login needed.
        </p>
      </header>

      {/* Add ticker */}
      <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add a ticker (e.g. NVDA)"
          className="px-3 py-2 rounded-md text-[14px] w-56"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
        <button
          type="submit"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-[13px] font-bold"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          <Plus className="h-4 w-4" /> Add
        </button>
        {tickers.length === 0 && (
          <div className="flex items-center gap-1.5 text-[12px] text-mute ml-2">
            Try:
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => add(s)}
                className="font-mono font-bold text-accent hover:underline"
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </form>

      {tickers.length === 0 ? (
        <div
          className="rounded-lg p-10 text-center"
          style={{ background: "var(--bg-2)", border: "1px dashed var(--border-strong)" }}
        >
          <Star className="h-7 w-7 mx-auto mb-2 text-accent" />
          <p className="text-[14px] font-semibold mb-1">Your watchlist is empty</p>
          <p className="text-[12px] text-mute">
            Add a ticker above (or tap a suggestion) to start tracking its insider activity.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>Company</th>
                  <th className="text-right">Price</th>
                  <th className="text-right">Market Cap</th>
                  <th className="text-center">IQS</th>
                  <th className="text-right">Insider Buys</th>
                  <th className="text-right">Insider $ Bought</th>
                  <th className="text-right">Last Buy</th>
                  <th className="text-right">Remove</th>
                </tr>
              </thead>
              <tbody>
                {tickers.map((t) => (
                  <WatchRow key={t} ticker={t} onRemove={() => remove(t)} />
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <p className="text-[14px] text-mute leading-relaxed">
        Price and market cap are live for every ticker. IQS and insider columns come
        from SEC Form 4 open-market buys — a stock with no recent insider purchases
        (e.g. TSLA) shows &ldquo;—&rdquo; there by design. Informational, not financial advice.
      </p>
    </div>
  );
}

interface LiteStats {
  price: number | null;
  changePct: number | null;
  marketCap: number | null;
  name: string | null;
}

function WatchRow({ ticker, onRemove }: { ticker: string; onRemove: () => void }) {
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  // Live market data for EVERY ticker — even those with no insider Form 4 data.
  const { data: statsData } = useSWR<{ stats: LiteStats | null }>(
    `${API_BASE}/market-stats/stats?symbol=${encodeURIComponent(ticker)}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const stats = statsData?.stats;

  const company = data?.company;
  const score = data?.score;
  const buys = (data?.transactions || []).filter((tx) => tx.transactionCode === "P");
  const totalBought = buys.reduce((a, tx) => a + Number(tx.totalValue), 0);
  const lastBuy = buys[0]?.transactionDate || null;
  const price = stats?.price ?? company?.lastPrice ?? null;
  const changePct = stats?.changePct ?? null;
  const marketCap = stats?.marketCap ?? company?.marketCap ?? null;
  const name = company?.name || stats?.name || null;
  const up = (changePct ?? 0) >= 0;

  return (
    <tr>
      <td>
        <Link
          href={`/companies/${encodeURIComponent(ticker)}`}
          className="flex items-center gap-2.5 min-w-[200px]"
        >
          <CompanyLogo ticker={ticker} name={name || ticker} size={28} />
          <div className="min-w-0">
            <div className="font-mono text-[15px] font-bold text-accent">{ticker}</div>
            <div className="text-[12px] text-mute truncate max-w-[220px]">
              {name || (isLoading ? "Loading…" : ticker)}
            </div>
          </div>
        </Link>
      </td>
      <td className="text-right tabular font-bold text-[14px]">
        {price != null ? `$${Number(price).toFixed(2)}` : "—"}
        {changePct != null && (
          <div
            className="text-[12px] font-bold tabular"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {up ? "+" : ""}
            {changePct.toFixed(2)}%
          </div>
        )}
      </td>
      <td className="text-right tabular text-[14px] font-bold text-mute">
        {marketCap != null ? formatCurrency(marketCap) : "—"}
      </td>
      <td className="text-center">
        {score ? (
          <TierBadge iqs={Number(score.iqs)} size="sm" />
        ) : (
          <span className="text-faint">—</span>
        )}
      </td>
      <td className="text-right tabular text-[14px] font-bold">
        {buys.length || <span className="text-faint">—</span>}
      </td>
      <td className="text-right tabular font-bold text-[14px] text-good">
        {totalBought > 0 ? formatCurrency(totalBought) : "—"}
      </td>
      <td className="text-right tabular text-[14px] font-bold text-soft whitespace-nowrap">
        {lastBuy ? formatDate(lastBuy) : "—"}
      </td>
      <td className="text-right">
        <button
          onClick={onRemove}
          aria-label={`Remove ${ticker}`}
          className="inline-flex items-center justify-center h-7 w-7 rounded-md text-mute hover:text-[var(--bad)] transition"
        >
          <X className="h-4 w-4" />
        </button>
      </td>
    </tr>
  );
}
