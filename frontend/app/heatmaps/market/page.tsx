"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Flame, LayoutGrid, Table2 } from "lucide-react";
import Link from "next/link";
import {
  API_BASE,
  RankingsResponse,
  RankingRow,
  fetcher,
  formatCurrency,
} from "@/lib/api";
import { StockHeatmap } from "@/components/heatmap/StockHeatmap";
import { DataTable, Column } from "@/components/DataTable";

type PeriodKey = "sinceClose" | "1d" | "7d" | "30d" | "180d" | "1y";

const PERIODS: { key: PeriodKey; label: string }[] = [
  { key: "sinceClose", label: "Since Close" },
  { key: "1d", label: "1-Day" },
  { key: "7d", label: "7-Day" },
  { key: "30d", label: "30-Day" },
  { key: "180d", label: "180-Day" },
  { key: "1y", label: "1-Year" },
];

const PERF_FIELD: Record<PeriodKey, "d1" | "d7" | "d30" | "d180" | "y1"> = {
  sinceClose: "d1",
  "1d": "d1",
  "7d": "d7",
  "30d": "d30",
  "180d": "d180",
  "1y": "y1",
};

interface PerfResp {
  returns: Record<
    string,
    { d1: number | null; d7: number | null; d30: number | null; d180: number | null; y1: number | null }
  >;
}

const FAQS = [
  {
    q: "Which companies are included in the heat map?",
    a: "The map shows the largest U.S.-listed companies in our ranked universe, grouped by sector. Tile size is proportional to market capitalization, so the biggest companies occupy the most space.",
  },
  {
    q: "How often does the data refresh, and what time zone is used?",
    a: "Prices refresh on a rolling basis throughout the U.S. trading session (Eastern Time). The 1-Day view reflects the change versus the previous close; longer periods are computed from daily closing prices.",
  },
  {
    q: "What does each color mean?",
    a: "Green means the stock is up over the selected period and red means it is down — the deeper the shade, the larger the move. Tiles near zero appear gray. Switch the time period above to recolor the entire map.",
  },
];

export default function MarketHeatmapPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=200&live=1`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
  const [period, setPeriod] = useState<PeriodKey>("1d");
  const [sectorFilter, setSectorFilter] = useState<string>("All");
  const [view, setView] = useState<"map" | "table">("map");

  // 1-Day / Since Close use the real live intraday change already on each row.
  // Longer periods are fetched from the chart-derived performance endpoint.
  const needPerf = period !== "1d" && period !== "sinceClose";
  const topSymbols = useMemo(() => {
    if (!data) return [] as string[];
    return [...data.rows]
      .filter((r) => r.ticker)
      .sort((a, b) => (b.marketCap || 0) - (a.marketCap || 0))
      .slice(0, 140)
      .map((r) => r.ticker as string);
  }, [data]);

  const { data: perf } = useSWR<PerfResp>(
    needPerf && topSymbols.length
      ? `${API_BASE}/market-stats/performance?symbols=${topSymbols.join(",")}`
      : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );
  const loadingPerf = needPerf && !perf;

  const sectors = useMemo(() => {
    if (!data) return [] as string[];
    return Array.from(
      new Set(data.rows.map((r) => r.sector).filter(Boolean) as string[]),
    ).sort();
  }, [data]);

  // Rows with `changePct` remapped to the selected time period.
  const periodRows = useMemo(() => {
    if (!data) return [] as RankingRow[];
    const field = PERF_FIELD[period];
    return data.rows
      .filter((r) => sectorFilter === "All" || r.sector === sectorFilter)
      .map((r) => {
        let chg: number | null | undefined = r.changePct;
        if (needPerf && r.ticker) chg = perf?.returns?.[r.ticker]?.[field] ?? null;
        return { ...r, changePct: chg } as RankingRow;
      });
  }, [data, sectorFilter, period, perf, needPerf]);

  const totalMktCap = useMemo(
    () => periodRows.reduce((s, r) => s + (r.marketCap || 0), 0),
    [periodRows],
  );

  const columns: Column<RankingRow>[] = [
    {
      key: "name",
      label: "Company",
      filterable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="font-bold text-[15px] truncate max-w-[260px] inline-block align-middle">
          {r.name}
        </span>
      ),
    },
    {
      key: "ticker",
      label: "Symbol",
      filterable: true,
      sortValue: (r) => r.ticker || "",
      render: (r) =>
        r.ticker ? (
          <Link
            href={`/companies/${encodeURIComponent(r.ticker)}`}
            className="font-mono text-[15px] font-bold text-accent hover:underline"
          >
            {r.ticker}
          </Link>
        ) : (
          <span className="text-faint">—</span>
        ),
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "center",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.marketCap ?? null,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">{formatCurrency(r.marketCap)}</span>
      ),
    },
    {
      key: "pctTotal",
      label: "% of Total",
      align: "center",
      sortValue: (r) => (totalMktCap ? ((r.marketCap || 0) / totalMktCap) * 100 : 0),
      render: (r) => (
        <span className="tabular text-[14px] text-mute">
          {totalMktCap ? (((r.marketCap || 0) / totalMktCap) * 100).toFixed(2) : "0.00"}%
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "center",
      sortValue: (r) => r.livePrice ?? r.lastPrice ?? null,
      render: (r) => {
        const p = r.livePrice ?? r.lastPrice;
        return (
          <span className="tabular text-[14px] font-bold">
            {p != null ? `$${p.toFixed(2)}` : "—"}
          </span>
        );
      },
    },
    {
      key: "changePct",
      label: "Price Change %",
      align: "center",
      filterable: true,
      filterType: "range",
      sortValue: (r) => (typeof r.changePct === "number" ? r.changePct : null),
      render: (r) => {
        const c = r.changePct;
        if (typeof c !== "number") return <span className="text-faint">—</span>;
        const up = c >= 0;
        return (
          <span
            className="tabular text-[14px] font-bold"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {up ? "+" : ""}
            {c.toFixed(2)}%
          </span>
        );
      },
    },
  ];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Flame className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Heat map</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          U.S. Stock Market Heat Map
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          A live visualization of the price performance of the largest U.S. companies, grouped by
          sector. Each tile&rsquo;s size reflects market capitalization and its color reflects the
          price change over the selected time period — green for gains, red for losses.
        </p>
      </motion.header>

      {/* Time-period toggle + map/table view switch */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          className="inline-flex flex-wrap p-1 rounded-lg border"
          style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
        >
          {PERIODS.map((p) => (
            <button
              key={p.key}
              onClick={() => setPeriod(p.key)}
              className={`px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
                period === p.key ? "text-white" : "text-mute hover:text-soft"
              }`}
              style={
                period === p.key
                  ? { background: "var(--accent)", boxShadow: "0 4px 12px rgba(0,102,255,0.25)" }
                  : {}
              }
            >
              {p.label}
            </button>
          ))}
        </div>

        <div
          className="inline-flex p-1 rounded-lg border"
          style={{ background: "var(--bg-2)", borderColor: "var(--border)" }}
        >
          <button
            onClick={() => setView("map")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
              view === "map" ? "text-white" : "text-mute hover:text-soft"
            }`}
            style={view === "map" ? { background: "var(--accent)" } : {}}
          >
            <LayoutGrid className="h-3.5 w-3.5" /> Heat map
          </button>
          <button
            onClick={() => setView("table")}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-md transition ${
              view === "table" ? "text-white" : "text-mute hover:text-soft"
            }`}
            style={view === "table" ? { background: "var(--accent)" } : {}}
          >
            <Table2 className="h-3.5 w-3.5" /> View as table
          </button>
        </div>
      </div>

      {/* Sector filter */}
      {sectors.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => setSectorFilter("All")}
            className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition"
            style={{
              background: sectorFilter === "All" ? "var(--text-soft)" : "var(--bg-2)",
              color: sectorFilter === "All" ? "var(--bg-2)" : "var(--text-mute)",
              border: `1px solid ${sectorFilter === "All" ? "var(--text-soft)" : "var(--border)"}`,
            }}
          >
            All sectors
          </button>
          {sectors.slice(0, 9).map((s) => (
            <button
              key={s}
              onClick={() => setSectorFilter(s)}
              title={s}
              className="px-3 py-1.5 rounded-full text-[12px] font-semibold transition truncate max-w-[220px]"
              style={{
                background: sectorFilter === s ? "var(--text-soft)" : "var(--bg-2)",
                color: sectorFilter === s ? "var(--bg-2)" : "var(--text-mute)",
                border: `1px solid ${sectorFilter === s ? "var(--text-soft)" : "var(--border)"}`,
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Main visualization */}
      <div className="card p-4 sm:p-5">
        {/* Color legend */}
        <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
          <div className="flex items-center gap-2 text-[11px] text-mute font-mono">
            <span>&minus;3%</span>
            <span
              className="h-3 w-40 rounded"
              style={{
                background:
                  "linear-gradient(to right, #991b1b 0%, #dc2626 25%, #6b7280 50%, #16a34a 75%, #0a7a3e 100%)",
              }}
            />
            <span>+3%</span>
          </div>
          <div className="text-[11px] text-mute">
            {periodRows.length} {periodRows.length === 1 ? "company" : "companies"} · tile size =
            market cap · {PERIODS.find((p) => p.key === period)?.label} change
          </div>
        </div>

        {isLoading || !data ? (
          <div className="h-[560px] shimmer rounded" />
        ) : view === "map" ? (
          <div className="relative">
            {loadingPerf && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-[color-mix(in_srgb,var(--bg-1)_55%,transparent)] text-[13px] text-mute">
                Loading {PERIODS.find((p) => p.key === period)?.label} performance…
              </div>
            )}
            {periodRows.length === 0 ? (
              <div className="h-[560px] flex items-center justify-center text-sm text-mute">
                No ranked stocks match this filter.
              </div>
            ) : (
              <StockHeatmap rows={periodRows} height={560} mode="sector" />
            )}
          </div>
        ) : (
          <DataTable<RankingRow>
            rows={periodRows}
            rowKey={(r, i) => r.companyId || r.ticker || String(i)}
            initialSort={{ key: "marketCap", dir: "desc" }}
            empty="No companies match this filter."
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
          />
        )}
      </div>

      {/* Explainer + FAQ */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10">
        <div className="space-y-6 max-w-3xl">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">About the U.S. Stock Market Heat Map</h2>
            <p className="text-[15px] text-soft leading-relaxed">
              The heat map gives you the whole market in a single glance. Every tile is a company;
              the bigger the tile, the larger its market capitalization. Companies are grouped into
              their sectors, so you can instantly see whether a move is broad-based or concentrated
              in one corner of the market.
            </p>
          </div>
          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">How to Read the Heat Map</h2>
            <p className="text-[15px] text-soft leading-relaxed">
              Color encodes performance over the period you select above. Green tiles are up, red
              tiles are down, and the intensity of the shade scales with the size of the move — a
              deep-green tile is sharply higher, a faint one is barely changed. Hover any tile for
              the company name, ticker, market cap and exact change, and click it to open the full
              profile with its insider-buying activity and IQS score.
            </p>
          </div>
          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">Sectors &amp; Time Periods</h2>
            <p className="text-[15px] text-soft leading-relaxed">
              Use the sector chips to isolate a single group of companies, and the time-period
              toggle to recolor the map from a single session (Since Close / 1-Day) all the way out
              to a full year. Shorter periods surface today&rsquo;s movers; longer periods reveal
              durable trends. Prefer numbers to colors? Switch to{" "}
              <button
                onClick={() => setView("table")}
                className="font-semibold underline"
                style={{ color: "var(--accent)" }}
              >
                view the chart data as a table
              </button>{" "}
              — sortable by market cap, price and change.
            </p>
          </div>
          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">Why a Sector View Matters</h2>
            <p className="text-[15px] text-soft leading-relaxed">
              Money rotates between sectors. When you can see which groups are catching a bid and
              which are being sold, you can line up that rotation against where corporate insiders
              are actually buying — the intersection of sector strength and insider conviction is
              where our IQS signal is most useful.
            </p>
          </div>

          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-3">Frequently Asked Questions</h2>
            <div className="space-y-3">
              {FAQS.map((f) => (
                <div
                  key={f.q}
                  className="rounded-lg p-4"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
                >
                  <div className="text-[15px] font-bold mb-1">{f.q}</div>
                  <p className="text-[14px] text-soft leading-relaxed">{f.a}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Side rail — more maps */}
        <aside className="space-y-3 h-fit">
          <div
            className="rounded-lg overflow-hidden"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <div
              className="px-4 py-2.5 border-b text-[10px] uppercase tracking-[0.18em] font-bold text-mute font-mono"
              style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
            >
              More performance maps
            </div>
            <ul className="divide-y divide-[var(--border)]">
              {[
                { href: "/sectors", label: "Sector Heatmap", desc: "Insider buying volume by sector" },
                { href: "/market-data/top-gainers", label: "Top Gainers", desc: "Biggest gains today" },
                { href: "/market-data/top-losers", label: "Top Losers", desc: "Biggest losses today" },
                { href: "/market-data/most-active", label: "Most Active", desc: "Highest dollar volume" },
              ].map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="block px-4 py-3 hover:bg-[var(--accent-soft)] transition group"
                  >
                    <div className="text-[13px] font-bold group-hover:text-accent transition">{l.label}</div>
                    <div className="text-[11px] text-mute mt-0.5">{l.desc}</div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>
    </div>
  );
}
