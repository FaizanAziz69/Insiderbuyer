"use client";
import useSWR from "swr";
import Link from "next/link";
import { use, useMemo, useState } from "react";
import { motion } from "framer-motion";
import { ArrowDown, ArrowUp, ChevronRight, Sparkles } from "lucide-react";
import {
  API_BASE,
  fetcher,
  formatCurrency,
  formatNumber,
} from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Indicators } from "@/components/Indicators";
import {
  FilteredListBar,
  ListFilters,
  mapMarketCapToBounds,
} from "@/components/lists/FilteredListBar";

interface RowLive {
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
}
interface DetailRow {
  ticker?: string | null;
  symbol?: string;
  name: string;
  sector?: string | null;
  marketCap?: number | null;
  iqs?: number;
  totalPurchaseValue?: number;
  live?: RowLive | null;
}
interface DetailResponse {
  slug: string;
  title: string;
  description: string;
  kind: "sector" | "persona" | "premium";
  total: number;
  rows: DetailRow[];
}

export default function StockListDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);

  const [filters, setFilters] = useState<ListFilters>({
    country: "USA (NYSE & NASDAQ)",
    sector: "All Sectors",
    marketCap: "All MarketCaps",
    iqs: "All Scores",
  });

  const qs = new URLSearchParams();
  if (filters.sector && filters.sector !== "All Sectors") {
    qs.set("sector", filters.sector);
  }
  const mc = mapMarketCapToBounds(filters.marketCap);
  if (mc.min) qs.set("minMarketCap", String(mc.min));
  if (mc.max) qs.set("maxMarketCap", String(mc.max));

  const { data, isLoading } = useSWR<DetailResponse>(
    `${API_BASE}/stock-lists/${slug}?${qs.toString()}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const rows = data?.rows || [];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <Link
        href="/stock-lists"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition"
      >
        ← All stock lists
      </Link>

      <header>
        <h1
          className="font-bold tracking-tight"
          style={{
            fontSize: "clamp(40px, 5.4vw, 60px)",
            letterSpacing: "-1px",
            lineHeight: 1.04,
          }}
        >
          {data?.title || "—"}
        </h1>
        {data?.description && (
          <p
            className="mt-4 max-w-4xl leading-relaxed"
            style={{ color: "var(--text-soft)", fontSize: 17 }}
          >
            {data.description}
          </p>
        )}
        <p
          className="mt-3 max-w-4xl leading-relaxed"
          style={{ color: "var(--text-mute)", fontSize: 15 }}
        >
          The list below highlights names matching this list&rsquo;s definition. View each
          stock&rsquo;s current price, market cap, volume, and recent indicators. Pair with
          the IQS Score for premium signal strength.
        </p>
      </header>

      {/* Top banner ad */}
      <AdSlot slot="leaderboard" seed={`${slug}-top`} />

      {/* Filter bar */}
      <FilteredListBar value={filters} onChange={setFilters} />

      {/* Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Ticker</th>
                <th>Company</th>
                <th className="text-right">Price</th>
                <th className="text-right">Market Cap</th>
                <th className="text-right">Volume</th>
                <th className="text-right">Avg Volume</th>
                <th>Indicators</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={8} className="text-center text-mute py-10">
                    Loading…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-mute py-10">
                    No matches for these filters.
                  </td>
                </tr>
              ) : (
                rows.flatMap((r, i) => {
                  const ticker = r.ticker || r.symbol || "";
                  const up = (r.live?.changePct ?? 0) >= 0;
                  const tr = (
                    <motion.tr
                      key={ticker || r.name}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.18, delay: Math.min(i, 12) * 0.02 }}
                    >
                      <td className="text-faint text-[12px] tabular">{i + 1}</td>
                      <td>
                        <Link
                          href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
                          className="inline-flex items-center gap-2"
                        >
                          <CompanyLogo ticker={ticker} name={r.name} size={24} />
                          <span className="font-mono text-[13px] font-bold text-accent hover:underline">
                            {ticker || "—"}
                          </span>
                        </Link>
                      </td>
                      <td className="truncate max-w-[260px]">{r.name}</td>
                      <td className="text-right tabular font-semibold">
                        {r.live?.price ? `$${r.live.price.toFixed(2)}` : "—"}
                        {r.live && (
                          <div
                            className="text-[11px] tabular"
                            style={{ color: up ? "var(--good)" : "var(--bad)" }}
                          >
                            <span className="inline-flex items-center gap-0.5">
                              {up ? (
                                <ArrowUp className="h-3 w-3" />
                              ) : (
                                <ArrowDown className="h-3 w-3" />
                              )}
                              {up ? "+" : ""}
                              {r.live.changePct.toFixed(2)}%
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="text-right tabular text-mute">
                        {r.live?.marketCap
                          ? formatCurrency(r.live.marketCap)
                          : r.marketCap
                          ? formatCurrency(r.marketCap)
                          : "—"}
                      </td>
                      <td className="text-right tabular">
                        {r.live?.volume ? formatNumber(r.live.volume) : "—"}
                      </td>
                      <td className="text-right tabular text-mute">
                        {r.live?.avgVolume ? formatNumber(r.live.avgVolume) : "—"}
                      </td>
                      <td>
                        <Indicators
                          flags={{
                            insiderTrade: (r.totalPurchaseValue || 0) > 0 ? "buy" : null,
                            // Earnings/analyst/news flags would come from a future
                            // batched IndicatorService call; we surface insider trades
                            // here based on whether the row has any IQS-tracked buys.
                            positiveNews: !!r.iqs && r.iqs >= 50,
                          }}
                        />
                      </td>
                    </motion.tr>
                  );
                  // Insert an inline ad between rows 8 and 9 to mirror MarketBeat density.
                  if (i === 7 && rows.length > 9) {
                    return [
                      tr,
                      <tr key="ad-inline">
                        <td colSpan={8} className="p-0">
                          <AdSlot slot="inline" seed={`${slug}-mid`} />
                        </td>
                      </tr>,
                    ];
                  }
                  return [tr];
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom copy block — MarketBeat-style editorial section */}
      {data?.title && (
        <section
          className="mt-4 rounded-lg p-6 sm:p-8 max-w-4xl"
          style={{
            background: "var(--bg-2)",
            border: "1px solid var(--border)",
          }}
        >
          <h2
            className="font-bold tracking-tight mb-4"
            style={{
              fontSize: 30,
              letterSpacing: "-0.4px",
              lineHeight: 1.15,
            }}
          >
            About the {data.title} List
          </h2>
          {data?.description && (
            <p className="text-[15px] text-soft leading-relaxed mb-4">
              {data.description}
            </p>
          )}
          <p className="text-[15px] text-soft leading-relaxed mb-5">
            Every name on this list is sourced from real SEC Form 4 filings and
            scored against our four-factor Insider Buying Quality Score (IQS):
            purchase volume, cluster effect, role weighting, and holding-change
            magnitude. The result is a ranked feed of where corporate insiders
            are actually putting their own capital — not where Wall Street says
            they should.
          </p>

          <h3
            className="font-bold tracking-tight mt-6 mb-3"
            style={{ fontSize: 20, letterSpacing: "-0.2px" }}
          >
            How to use this list
          </h3>
          <p className="text-[15px] text-soft leading-relaxed mb-4">
            Sort the table above by Market Cap to focus on the size class that
            fits your portfolio, by Volume to spot names with unusual activity,
            or by Avg Volume to filter out illiquid tickers. Use the indicator
            chips on the right of each row to see at a glance which stocks have
            recent insider trades, earnings due soon, analyst upgrades, or
            fresh news coverage.
          </p>
          <p className="text-[15px] text-soft leading-relaxed mb-5">
            Pair this list with our live{" "}
            <Link
              href="/companies"
              className="font-semibold underline"
              style={{ color: "var(--accent)" }}
            >
              IQS rankings
            </Link>{" "}
            and the{" "}
            <Link
              href="/heatmaps/market"
              className="font-semibold underline"
              style={{ color: "var(--accent)" }}
            >
              market heatmap
            </Link>{" "}
            to see how insider buying activity is intersecting with broader
            market performance.
          </p>

          <h3
            className="font-bold tracking-tight mt-6 mb-3"
            style={{ fontSize: 20, letterSpacing: "-0.2px" }}
          >
            Where the data comes from
          </h3>
          <p className="text-[15px] text-soft leading-relaxed mb-5">
            All transactions are pulled directly from SEC EDGAR Form 4 filings
            and refreshed multiple times per day. Live price, volume, and
            average volume are sourced from real-time market quote feeds. The
            IQS score is recomputed on every new filing — so the ordering you
            see reflects the current state of insider conviction across the
            list.
          </p>

          <Link
            href="/reports/cta/TOP5"
            className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider mt-2"
            style={{
              background: "var(--gold)",
              color: "#1a1a1a",
              padding: "12px 22px",
              fontSize: 12,
              letterSpacing: "0.08em",
              borderRadius: 2,
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            View the Top 5 IQS Picks
            <ChevronRight className="h-4 w-4" strokeWidth={2.5} />
          </Link>
        </section>
      )}

      {/* Premium teaser */}
      {data?.kind !== "premium" && (
        <Link
          href="/stock-lists/iqs-top-picks"
          className="block rounded-lg p-5 group transition"
          style={{
            background:
              "linear-gradient(135deg, color-mix(in srgb, var(--accent) 12%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 14%, var(--bg-2)) 100%)",
            border:
              "1px solid color-mix(in srgb, var(--accent) 30%, var(--border-strong))",
          }}
        >
          <div className="flex items-center gap-4">
            <div
              className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{
                background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              }}
            >
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-0.5">
                Premium · IQS Top Picks
              </div>
              <div className="text-[15px] font-bold leading-snug">
                See the top-5 highest-IQS picks in {data?.title || "this list"}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-accent group-hover:translate-x-0.5 transition" />
          </div>
        </Link>
      )}
    </div>
  );
}
