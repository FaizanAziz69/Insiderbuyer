"use client";
import useSWR from "swr";
import { useMemo } from "react";
import Link from "next/link";
import { ArrowDown, ArrowUp, TrendingDown, TrendingUp } from "lucide-react";
import { API_BASE, RankingsResponse, fetcher, formatCurrency } from "@/lib/api";

interface MoverRow {
  symbol: string;
  name: string;
  price: number;
  changePct: number;
  volume: number;
  marketCap: number | null;
}

function PanelTitle({ title, href }: { title: string; href: string }) {
  return (
    <div
      className="flex items-center justify-between px-4 py-2.5 border-b"
      style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
    >
      <div className="text-[12px] font-bold uppercase tracking-wider">{title}</div>
      <Link
        href={href}
        className="text-[12px] font-semibold text-accent hover:underline"
      >
        View all →
      </Link>
    </div>
  );
}

function InsiderSidePanel({
  title,
  href,
  side,
}: {
  title: string;
  href: string;
  side: "buys" | "sells";
}) {
  // Buys = top Insider Score rows (open-market purchases). Sells = REAL
  // Form 4 sales, aggregated per company by dollars sold — not the buys list.
  const { data: buysData } = useSWR<RankingsResponse>(
    side === "buys" ? `${API_BASE}/rankings?limit=8` : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const { data: sellsData } = useSWR<{
    rows: Array<{ ticker: string | null; companyName: string; marketCap?: number | null; totalValue: number }>;
  }>(
    side === "sells" ? `${API_BASE}/trades?side=sell&limit=100` : null,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = useMemo(() => {
    if (side === "buys") {
      return (buysData?.rows || []).slice(0, 8).map((r) => ({
        key: r.companyId,
        ticker: r.ticker,
        name: r.name,
        marketCap: r.marketCap,
        value: r.totalPurchaseValue,
      }));
    }
    const agg = new Map<string, { ticker: string; name: string; marketCap: number | null; value: number }>();
    for (const t of sellsData?.rows || []) {
      const sym = (t.ticker || "").toUpperCase();
      if (!sym) continue;
      const cur = agg.get(sym) || { ticker: sym, name: t.companyName, marketCap: t.marketCap ?? null, value: 0 };
      cur.value += Number(t.totalValue) || 0;
      agg.set(sym, cur);
    }
    return [...agg.values()]
      .sort((a, b) => b.value - a.value)
      .slice(0, 8)
      .map((r) => ({ key: r.ticker, ticker: r.ticker, name: r.name, marketCap: r.marketCap, value: r.value }));
  }, [side, buysData, sellsData]);

  return (
    <section
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <PanelTitle title={title} href={href} />
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-mute text-[12px] flex-1">Loading…</div>
      ) : (
        <ul className="divide-y divide-[var(--border)] flex-1">
          {rows.map((r, i) => (
            <li key={r.key}>
              <Link
                href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                className="grid grid-cols-[22px_1fr_auto] gap-2 items-center px-4 py-2.5 hover:bg-[var(--accent-soft)] transition"
              >
                <span className="text-[11px] font-mono font-bold text-faint tabular text-center">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="text-[15px] font-bold font-mono text-accent truncate">
                    {r.ticker || "—"}
                  </div>
                  <div className="text-[12px] text-mute truncate">{r.name}</div>
                  <div className="text-[10px] text-faint tabular">
                    Mkt cap {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                  </div>
                </div>
                <span
                  className="text-[14px] font-bold tabular flex items-center gap-0.5"
                  style={{ color: side === "buys" ? "var(--good)" : "var(--bad)" }}
                >
                  {side === "buys" ? (
                    <ArrowUp className="h-3 w-3" />
                  ) : (
                    <ArrowDown className="h-3 w-3" />
                  )}
                  {formatCurrency(r.value)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function GainerLoserPanel({ kind }: { kind: "gainers" | "losers" }) {
  const title = kind === "gainers" ? "Today's Top Gainers" : "Today's Top Losers";
  const href = kind === "gainers" ? "/market-data/top-gainers" : "/market-data/top-losers";
  const { data } = useSWR<{ rows: MoverRow[] }>(
    `${API_BASE}/market-stats/${kind === "gainers" ? "top-gainers" : "top-losers"}?limit=8`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = (data?.rows || []).slice(0, 8);

  return (
    <section
      className="rounded-lg overflow-hidden flex flex-col"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <PanelTitle title={title} href={href} />
      {rows.length === 0 ? (
        <div className="px-4 py-8 text-center text-mute text-[12px] flex-1">Loading…</div>
      ) : (
        <ul className="divide-y divide-[var(--border)] flex-1">
          {rows.map((r, i) => {
            const up = r.changePct >= 0;
            return (
              <li key={r.symbol}>
                <Link
                  href={`/companies/${encodeURIComponent(r.symbol)}`}
                  className="grid grid-cols-[22px_1fr_auto] gap-2 items-center px-4 py-2.5 hover:bg-[var(--accent-soft)] transition"
                >
                  <span className="text-[11px] font-mono font-bold text-faint tabular text-center">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[15px] font-bold font-mono text-accent truncate">
                      {r.symbol}
                    </div>
                    <div className="text-[12px] text-mute truncate">{r.name}</div>
                    <div className="text-[10px] text-faint tabular">
                      Mkt cap {r.marketCap ? formatCurrency(r.marketCap) : "—"}
                    </div>
                  </div>
                  <span
                    className="text-[14px] font-bold tabular flex items-center gap-0.5"
                    style={{ color: up ? "var(--good)" : "var(--bad)" }}
                  >
                    {up ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {up ? "+" : ""}
                    {r.changePct.toFixed(2)}%
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function HomeDatasets() {
  // Rotate the third dataset between Top Gainers and Top Losers
  // based on day-of-month so users see both over time.
  const showGainers = new Date().getDate() % 2 === 0;
  return (
    <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <InsiderSidePanel title="Top Insider Buys" href="/trades" side="buys" />
      <InsiderSidePanel title="Top Insider Sells" href="/trades" side="sells" />
      <GainerLoserPanel kind={showGainers ? "gainers" : "losers"} />
    </section>
  );
}
