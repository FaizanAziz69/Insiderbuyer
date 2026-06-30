"use client";
import useSWR from "swr";
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Building2, LayoutGrid, Table2 } from "lucide-react";
import Link from "next/link";
import {
  API_BASE,
  RankingsResponse,
  RankingRow,
  fetcher,
  formatCurrency,
} from "@/lib/api";
import { shortSector } from "@/components/heatmap/StockHeatmap";
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

interface SectorAgg {
  sector: string;
  marketCap: number;
  avgChange: number | null;
  count: number;
  bought: number;
}

// ---- Color (same green/red bands as the company heat map) ------------------
function colorForChange(pct: number | null): { bg: string; fg: string } {
  if (pct == null) return { bg: "linear-gradient(135deg,#4b5563,#6b7280)", fg: "#f3f4f6" };
  if (pct >= 1.5) return { bg: "linear-gradient(135deg,#0a7a3e,#16a34a 60%,#22c55e)", fg: "#ecfdf5" };
  if (pct >= 0.5) return { bg: "linear-gradient(135deg,#15803d,#22c55e)", fg: "#f0fdf4" };
  if (pct >= 0.05) return { bg: "linear-gradient(135deg,#166534,#16a34a)", fg: "#f0fdf4" };
  if (pct <= -1.5) return { bg: "linear-gradient(135deg,#991b1b,#dc2626 60%,#ef4444)", fg: "#fef2f2" };
  if (pct <= -0.5) return { bg: "linear-gradient(135deg,#b91c1c,#dc2626)", fg: "#fef2f2" };
  if (pct <= -0.05) return { bg: "linear-gradient(135deg,#7f1d1d,#b91c1c)", fg: "#fef2f2" };
  return { bg: "linear-gradient(135deg,#4b5563,#6b7280)", fg: "#f3f4f6" };
}

// ---- Squarified-ish binary-slice treemap -----------------------------------
interface TItem {
  value: number;
  agg: SectorAgg;
}
interface TRect {
  x: number;
  y: number;
  w: number;
  h: number;
  agg: SectorAgg;
}
function slice(items: TItem[], x: number, y: number, w: number, h: number): TRect[] {
  if (items.length === 0) return [];
  if (items.length === 1) return [{ x, y, w, h, agg: items[0].agg }];
  const total = items.reduce((a, i) => a + i.value, 0);
  let cum = 0;
  let split = 1;
  for (let i = 0; i < items.length; i++) {
    cum += items[i].value;
    if (cum >= total / 2) {
      split = i + 1;
      break;
    }
  }
  if (split >= items.length) split = items.length - 1;
  if (split < 1) split = 1;
  const a = items.slice(0, split);
  const b = items.slice(split);
  const ratio = a.reduce((s, i) => s + i.value, 0) / total;
  if (w >= h) {
    return [...slice(a, x, y, w * ratio, h), ...slice(b, x + w * ratio, y, w * (1 - ratio), h)];
  }
  return [...slice(a, x, y, w, h * ratio), ...slice(b, x, y + h * ratio, w, h * (1 - ratio))];
}

const FAQS = [
  {
    q: "What does each sector tile represent?",
    a: "Each tile is one of the broad market sectors. Its size is proportional to the combined market capitalization of the companies in that sector, and its color reflects the sector's market-cap-weighted price change over the selected period.",
  },
  {
    q: "How is a sector's performance calculated?",
    a: "We take every ranked company in the sector and compute a market-cap-weighted average of its price change for the chosen time period, so larger companies move the sector more than smaller ones.",
  },
  {
    q: "Why follow sector performance?",
    a: "Capital rotates between sectors. Seeing which groups are leading or lagging — and lining that up with where insiders are buying — is where the IQS signal is most actionable.",
  },
];

export default function SectorsPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=300&live=1`,
    fetcher,
    { refreshInterval: 60000, revalidateOnFocus: false },
  );
  const [period, setPeriod] = useState<PeriodKey>("1d");
  const [view, setView] = useState<"map" | "table">("map");

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

  const changeFor = (r: RankingRow): number | null => {
    if (needPerf) return r.ticker ? perf?.returns?.[r.ticker]?.[PERF_FIELD[period]] ?? null : null;
    return typeof r.changePct === "number" ? r.changePct : null;
  };

  // Aggregate companies into broad sectors.
  const aggs = useMemo<SectorAgg[]>(() => {
    if (!data) return [];
    const map = new Map<
      string,
      { mcap: number; wChange: number; wMcap: number; count: number; bought: number }
    >();
    for (const r of data.rows) {
      const key = shortSector(r.sector);
      if (key === "Other") continue;
      const m = map.get(key) || { mcap: 0, wChange: 0, wMcap: 0, count: 0, bought: 0 };
      const mc = r.marketCap || 0;
      m.mcap += mc;
      m.count += 1;
      m.bought += r.totalPurchaseValue || 0;
      const chg = changeFor(r);
      if (chg != null) {
        const w = mc || 1;
        m.wChange += chg * w;
        m.wMcap += w;
      }
      map.set(key, m);
    }
    return Array.from(map.entries())
      .map(([sector, m]) => ({
        sector,
        marketCap: m.mcap,
        avgChange: m.wMcap ? +(m.wChange / m.wMcap).toFixed(2) : null,
        count: m.count,
        bought: m.bought,
      }))
      .sort((a, b) => b.marketCap - a.marketCap);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, perf, period, needPerf]);

  const totalMktCap = useMemo(() => aggs.reduce((s, a) => s + a.marketCap, 0), [aggs]);

  const rects = useMemo(() => {
    if (!aggs.length) return [] as TRect[];
    const items: TItem[] = aggs.map((a) => ({ value: Math.sqrt(Math.max(1, a.marketCap)), agg: a }));
    return slice(items, 0, 0, 100, 100);
  }, [aggs]);

  const columns: Column<SectorAgg>[] = [
    {
      key: "sector",
      label: "Sector",
      filterable: true,
      sortValue: (r) => r.sector,
      render: (r) => <span className="font-bold text-[15px]">{r.sector}</span>,
    },
    {
      key: "count",
      label: "Companies",
      align: "center",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.count,
      render: (r) => <span className="tabular text-[14px] font-bold">{r.count}</span>,
    },
    {
      key: "avgChange",
      label: "Avg Change %",
      align: "center",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.avgChange,
      render: (r) => {
        if (r.avgChange == null) return <span className="text-faint">—</span>;
        const up = r.avgChange >= 0;
        return (
          <span className="tabular text-[14px] font-bold" style={{ color: up ? "var(--good)" : "var(--bad)" }}>
            {up ? "+" : ""}
            {r.avgChange.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "center",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.marketCap,
      render: (r) => <span className="tabular text-[14px] font-bold">{formatCurrency(r.marketCap)}</span>,
    },
    {
      key: "pctTotal",
      label: "% of Total",
      align: "center",
      sortValue: (r) => (totalMktCap ? (r.marketCap / totalMktCap) * 100 : 0),
      render: (r) => (
        <span className="tabular text-[14px] text-mute">
          {totalMktCap ? ((r.marketCap / totalMktCap) * 100).toFixed(2) : "0.00"}%
        </span>
      ),
    },
    {
      key: "bought",
      label: "Insider $ Bought",
      align: "center",
      sortValue: (r) => r.bought,
      render: (r) => (
        <span className="tabular text-[14px] font-bold text-good">{formatCurrency(r.bought)}</span>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Building2 className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Sector heat map</span>
          <span className="live-dot live-dot-good ml-2 text-faint">live</span>
        </div>
        <h1 className="text-[28px] sm:text-[34px] font-bold tracking-tight" style={{ letterSpacing: "-0.5px" }}>
          Sector Performance Heat Map
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          Price performance of every market sector at a glance. Each tile&rsquo;s size reflects the
          sector&rsquo;s combined market capitalization and its color reflects the market-cap-weighted
          price change over the selected time period — green for gains, red for losses.
        </p>
      </motion.header>

      {/* Period toggle + map/table switch */}
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

      {/* Main visualization */}
      <div className="card p-4 sm:p-5">
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
            {aggs.length} sectors · tile size = market cap ·{" "}
            {PERIODS.find((p) => p.key === period)?.label} change
          </div>
        </div>

        {isLoading || !data ? (
          <div className="h-[520px] shimmer rounded" />
        ) : view === "map" ? (
          <div className="relative w-full" style={{ height: 520 }}>
            {loadingPerf && (
              <div className="absolute inset-0 z-10 flex items-center justify-center rounded bg-[color-mix(in_srgb,var(--bg-1)_55%,transparent)] text-[13px] text-mute">
                Loading {PERIODS.find((p) => p.key === period)?.label} performance…
              </div>
            )}
            {rects.map((rect) => {
              const { bg, fg } = colorForChange(rect.agg.avgChange);
              const big = rect.w > 18 && rect.h > 18;
              return (
                <Link
                  key={rect.agg.sector}
                  href="/heatmaps/market"
                  className="absolute overflow-hidden group"
                  style={{
                    left: `${rect.x}%`,
                    top: `${rect.y}%`,
                    width: `${rect.w}%`,
                    height: `${rect.h}%`,
                    padding: 2,
                  }}
                  title={`${rect.agg.sector} · ${rect.agg.avgChange ?? "—"}% · ${formatCurrency(rect.agg.marketCap)}`}
                >
                  <div
                    className="w-full h-full rounded-md flex flex-col justify-center items-center text-center px-2 transition-transform group-hover:scale-[0.99]"
                    style={{ background: bg, color: fg }}
                  >
                    <div className={`font-bold tracking-tight leading-tight ${big ? "text-[15px]" : "text-[11px]"}`}>
                      {rect.agg.sector}
                    </div>
                    {rect.agg.avgChange != null && (
                      <div className={`tabular font-bold ${big ? "text-[20px]" : "text-[12px]"}`}>
                        {rect.agg.avgChange >= 0 ? "+" : ""}
                        {rect.agg.avgChange.toFixed(2)}%
                      </div>
                    )}
                    {big && (
                      <div className="text-[11px] opacity-85 mt-0.5">
                        {formatCurrency(rect.agg.marketCap)} · {rect.agg.count} cos
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <DataTable<SectorAgg>
            rows={aggs}
            rowKey={(r) => r.sector}
            initialSort={{ key: "marketCap", dir: "desc" }}
            empty="No sector data."
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
          />
        )}
      </div>

      {/* Explainer + FAQ */}
      <section className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-6 lg:gap-10">
        <div className="space-y-6 max-w-3xl">
          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">About the Sector Heat Map</h2>
            <p className="text-[15px] text-soft leading-relaxed">
              This map rolls the entire ranked universe up into the broad market sectors, so you can
              see where money is flowing in a single glance. The larger a sector&rsquo;s tile, the
              more market capitalization it represents; the color shows how that whole sector is
              performing over the period you select.
            </p>
          </div>
          <div>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">How to Read It</h2>
            <p className="text-[15px] text-soft leading-relaxed">
              Green sectors are up, red are down, and deeper shades mean larger moves. Use the
              time-period toggle to recolor everything from a single session out to a full year, or
              switch to{" "}
              <button onClick={() => setView("table")} className="font-semibold underline" style={{ color: "var(--accent)" }}>
                the table view
              </button>{" "}
              to sort sectors by average change, market cap or insider dollars bought. Click any
              sector to drop into the full company-level heat map.
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
                { href: "/heatmaps/market", label: "Stock Heat Map", desc: "Every company by sector" },
                { href: "/market-data/top-gainers", label: "Top Gainers", desc: "Biggest gains today" },
                { href: "/market-data/top-losers", label: "Top Losers", desc: "Biggest losses today" },
                { href: "/market-data/most-active", label: "Most Active", desc: "Highest dollar volume" },
              ].map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block px-4 py-3 hover:bg-[var(--accent-soft)] transition group">
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
