"use client";
import Link from "next/link";
import useSWR from "swr";
import { useState } from "react";
import { motion } from "framer-motion";
import { Flame, Search, ChevronDown, Check } from "lucide-react";
import { API_BASE, HeatQuote, heatToRanking, fetcher } from "@/lib/api";
import { StockHeatmap, HeatmapLegend } from "@/components/heatmap/StockHeatmap";

// USA sources shown in the Source menu (TradingView parity). Only S&P 500 is
// backed by our current data; the rest are listed but disabled until we have
// their constituents.
const SOURCES = [
  "Nasdaq 100 Index",
  "Nasdaq Composite Index",
  "Dow Jones Composite Average Index",
  "Dow Jones Industrial Average Index",
  "Dow Jones Transportation Average Index",
  "Dow Jones Utility Average Index",
  "KBW NASDAQ Bank Index",
  "Russell 1000 Index",
  "Russell 2000 Index",
  "Russell 3000 Index",
  "S&P 500 Index",
  "All US Companies",
];
const ENABLED_SOURCES = new Set(["S&P 500 Index"]);

const FAQS = [
  {
    q: "Which companies are included in the heat map?",
    a: "The map shows the companies we rank — the most active U.S.-listed names — grouped by sector. Each tile's size is proportional to market capitalization, so the biggest companies occupy the most space.",
  },
  {
    q: "How often does the data refresh?",
    a: "Prices update from our live quote feed during the U.S. trading session (Eastern Time) and refresh automatically every few minutes.",
  },
  {
    q: "What does each color mean?",
    a: "Green means the stock is up and red means it is down — the deeper the shade, the larger the move. Hover any tile for the company, price and exact change; click a tile to open its profile.",
  },
];

export default function MarketHeatmapPage() {
  const { data } = useSWR<{ rows: HeatQuote[] }>(
    `${API_BASE}/market-stats/heatmap`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const [groupBy, setGroupBy] = useState<"sector" | "none">("sector");
  const [query, setQuery] = useState("");
  const [source, setSource] = useState("S&P 500 Index");
  const [sourceOpen, setSourceOpen] = useState(false);

  const all = (data?.rows ?? []).map(heatToRanking);
  const q = query.trim().toUpperCase();
  const rows = q
    ? all.filter(
        (r) =>
          (r.ticker || "").toUpperCase().includes(q) ||
          r.name.toUpperCase().includes(q),
      )
    : all;

  return (
    <div className="w-full space-y-6">
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
          A live visualization of the U.S. market, grouped by sector. Each tile&rsquo;s size reflects
          market capitalization and its color reflects the price change — green for gains, red for
          losses. Hover for details and click any tile to open its profile.
        </p>
      </motion.header>

      {/* In-house stock heat map (TradingView-style controls + legend) */}
      <div className="card p-2 sm:p-3">
        {/* Control bar */}
        <div className="flex flex-wrap items-center gap-2 px-1 pb-2">
          {/* Source */}
          <div className="relative">
            <button
              onClick={() => setSourceOpen((o) => !o)}
              className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-semibold transition"
              style={{ background: "var(--bg-1)", border: "1px solid var(--border-strong)" }}
            >
              <span>🇺🇸</span>
              {source}
              <ChevronDown className="h-3.5 w-3.5" />
            </button>
            {sourceOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setSourceOpen(false)} />
                <div
                  className="absolute left-0 z-50 mt-1 w-[280px] rounded-lg py-1 shadow-xl"
                  style={{ background: "var(--bg-2)", border: "1px solid var(--border-strong)" }}
                >
                  <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-mute">
                    USA
                  </div>
                  {SOURCES.map((s) => {
                    const enabled = ENABLED_SOURCES.has(s);
                    const active = s === source;
                    return (
                      <button
                        key={s}
                        disabled={!enabled}
                        onClick={() => {
                          if (!enabled) return;
                          setSource(s);
                          setSourceOpen(false);
                        }}
                        className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] transition"
                        style={{
                          color: enabled ? "var(--text)" : "var(--text-faint)",
                          cursor: enabled ? "pointer" : "not-allowed",
                          background: active ? "var(--accent-soft)" : "transparent",
                        }}
                      >
                        <span>{s}</span>
                        {active && <Check className="h-3.5 w-3.5 text-accent" />}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>

          {/* Search */}
          <div
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2"
            style={{ background: "var(--bg-1)", border: "1px solid var(--border-strong)" }}
          >
            <Search className="h-3.5 w-3.5 text-mute" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search"
              className="bg-transparent text-[13px] outline-none w-28"
              style={{ color: "var(--text)" }}
            />
          </div>

          <ControlSelect
            label="Group by"
            value={groupBy}
            onChange={(v) => setGroupBy(v as "sector" | "none")}
            options={[
              { value: "sector", label: "Sector" },
              { value: "none", label: "No group" },
            ]}
          />
          <ControlSelect label="Color by" value="change" options={[{ value: "change", label: "Change %" }]} />
          <ControlSelect label="Size by" value="mktcap" options={[{ value: "mktcap", label: "Market cap" }]} />
        </div>

        {rows.length > 0 ? (
          <StockHeatmap rows={rows} height={620} mode={groupBy === "sector" ? "sector" : "flat"} />
        ) : (
          <div className="shimmer rounded" style={{ height: 620 }} />
        )}

        {/* Legend */}
        <div className="px-1 pt-3">
          <HeatmapLegend />
        </div>
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
              Color encodes performance: green tiles are up, red tiles are down, and the intensity
              of the shade scales with the size of the move — a deep-green tile is sharply higher, a
              faint one is barely changed. Hover any tile for the company name, price and exact
              change, use the timeframe control to switch periods, and scroll to zoom into a sector.
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

function ControlSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange?: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5"
      style={{ background: "var(--bg-1)", border: "1px solid var(--border-strong)" }}
    >
      <span className="text-[11px] font-semibold uppercase tracking-wider text-mute">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={!onChange || options.length < 2}
        className="bg-transparent text-[13px] font-semibold outline-none"
        style={{ color: "var(--text)", cursor: onChange && options.length > 1 ? "pointer" : "default" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
