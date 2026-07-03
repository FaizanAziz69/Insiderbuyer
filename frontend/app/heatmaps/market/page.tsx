"use client";
import Link from "next/link";
import useSWR from "swr";
import { motion } from "framer-motion";
import { Flame } from "lucide-react";
import { API_BASE, RankingsResponse, fetcher } from "@/lib/api";
import { StockHeatmap } from "@/components/heatmap/StockHeatmap";

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
  const { data } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=500&live=1`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows ?? [];
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

      {/* In-house stock heat map */}
      <div className="card p-2 sm:p-3">
        {rows.length > 0 ? (
          <StockHeatmap rows={rows} height={620} mode="sector" />
        ) : (
          <div className="shimmer rounded" style={{ height: 620 }} />
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
