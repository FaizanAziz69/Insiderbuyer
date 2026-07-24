"use client";
import { useState } from "react";
import useSWR from "swr";
import { useRouter } from "next/navigation";
import { PieChart, Search } from "lucide-react";
import { API_BASE, formatCurrency, formatDate } from "@/lib/api";

interface Seg { name: string; revenue: number; pct: number; prevRevenue: number | null; yoyPct: number | null }
interface Breakdown { segments: Seg[]; geography: Seg[]; total: number | null; asOf: string | null; form: string | null }

const DEFAULT_TICKERS = ["AMZN", "AAPL", "MSFT", "GOOGL", "META", "NVDA", "TSLA", "NFLX"];

/** QuiverQuant-style /revbreakdown dashboard: revenue by segment or geography
 *  across companies, straight from each company's latest 10-Q/10-K (SEC). */
export default function RevenueBreakdownDashboard() {
  const router = useRouter();
  const [tab, setTab] = useState<"segment" | "geography">("segment");
  const [tickers, setTickers] = useState<string[]>(DEFAULT_TICKERS);
  const [query, setQuery] = useState("");

  const { data, isLoading } = useSWR<Record<string, Breakdown>>(
    ["rev-breakdown", ...tickers],
    async () => {
      const entries = await Promise.all(
        tickers.map(async (t) => {
          try {
            const r = await fetch(`${API_BASE}/company-civic/revenue-segments?ticker=${encodeURIComponent(t)}`);
            return [t, (await r.json()) as Breakdown] as const;
          } catch {
            return [t, { segments: [], geography: [], total: null, asOf: null, form: null }] as const;
          }
        }),
      );
      return Object.fromEntries(entries);
    },
    { revalidateOnFocus: false, dedupingInterval: 30 * 60_000 },
  );

  const rows = tickers.flatMap((t) => {
    const b = data?.[t];
    const list = (tab === "geography" ? b?.geography : b?.segments) || [];
    return list.map((s) => ({ ticker: t, asOf: b?.asOf || null, ...s }));
  });

  const addTicker = () => {
    const t = query.trim().toUpperCase();
    if (t && !tickers.includes(t)) setTickers((prev) => [t, ...prev]);
    setQuery("");
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <div className="flex items-center gap-2.5">
        <span className="text-accent"><PieChart className="h-6 w-6" /></span>
        <h1 className="text-[26px] font-extrabold tracking-tight">Revenue Breakdown</h1>
      </div>
      <p className="text-[13.5px] text-mute mt-2 max-w-3xl leading-relaxed">
        Track revenue breakdowns of publicly-traded companies by segment or geography, parsed straight from each
        company&rsquo;s latest 10-Q/10-K filing on SEC EDGAR. Click a row to open the company&rsquo;s stock page.
      </p>

      <div className="flex flex-wrap items-center gap-3 mt-6">
        <div className="flex gap-1.5">
          {(["segment", "geography"] as const).map((t) => (
            <button key={t} onClick={() => setTab(t)}
              className="px-3 py-1.5 rounded text-[12px] font-bold uppercase tracking-wider transition"
              style={tab === t ? { background: "var(--accent)", color: "#fff" } : { background: "var(--bg-2)", color: "var(--text-mute)" }}>
              By {t === "segment" ? "Segment" : "Geography"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 rounded px-3 py-1.5" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
          <Search className="h-3.5 w-3.5 text-mute" />
          <input value={query} onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTicker()}
            placeholder="Add ticker (e.g. AMD)…"
            className="bg-transparent outline-none text-[13px] w-40" />
          <button onClick={addTicker} className="text-[11px] font-bold text-accent">ADD</button>
        </div>
      </div>

      <div className="card overflow-x-auto mt-4">
        <table className="w-full text-[13px]" style={{ minWidth: 720 }}>
          <thead>
            <tr className="text-[10.5px] uppercase tracking-wider text-mute text-left" style={{ background: "var(--bg-2)" }}>
              <th className="font-bold px-3.5 py-2.5">Ticker</th>
              <th className="font-bold px-3.5 py-2.5">{tab === "geography" ? "Geography Name" : "Segment Name"}</th>
              <th className="font-bold px-3.5 py-2.5 text-right">Revenue (USD)</th>
              <th className="font-bold px-3.5 py-2.5 text-right">YoY Change</th>
              <th className="font-bold px-3.5 py-2.5 text-right">YoY Change %</th>
              <th className="font-bold px-3.5 py-2.5 text-right">Report Date</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3.5 py-12 text-center text-[13px] text-mute">Reading latest SEC filings…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={6} className="px-3.5 py-12 text-center text-[13px] text-mute">No {tab} breakdowns found for these tickers.</td></tr>
            ) : (
              rows.map((r, i) => {
                const delta = r.prevRevenue != null ? r.revenue - r.prevRevenue : null;
                return (
                  <tr key={`${r.ticker}-${r.name}-${i}`}
                    onClick={() => router.push(`/companies/${encodeURIComponent(r.ticker)}`)}
                    className="cursor-pointer transition hover:bg-[var(--bg-2)]"
                    style={{ borderTop: "1px solid var(--border)" }}>
                    <td className="px-3.5 py-2.5 font-extrabold text-accent">{r.ticker}</td>
                    <td className="px-3.5 py-2.5 font-semibold">{r.name}</td>
                    <td className="px-3.5 py-2.5 text-right tabular font-semibold whitespace-nowrap">{formatCurrency(r.revenue)}</td>
                    <td className="px-3.5 py-2.5 text-right tabular whitespace-nowrap">
                      {delta == null ? <span className="text-mute">—</span> : (
                        <span style={{ color: delta >= 0 ? "#10B981" : "#EF4444" }}>{delta >= 0 ? "+" : "−"}{formatCurrency(Math.abs(delta))}</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right tabular whitespace-nowrap">
                      {r.yoyPct == null ? <span className="text-mute">—</span> : (
                        <span style={{ color: r.yoyPct >= 0 ? "#10B981" : "#EF4444" }}>{r.yoyPct >= 0 ? "+" : ""}{r.yoyPct}%</span>
                      )}
                    </td>
                    <td className="px-3.5 py-2.5 text-right text-mute whitespace-nowrap">{r.asOf ? formatDate(r.asOf) : "—"}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-[11px] text-faint mt-4">
        Source: SEC EDGAR (10-Q / 10-K). YoY change compares against the same period a year earlier from the filing&rsquo;s
        comparative column. Companies that don&rsquo;t disaggregate revenue (and non-SEC filers, e.g. German listings) won&rsquo;t appear.
      </p>
    </main>
  );
}
