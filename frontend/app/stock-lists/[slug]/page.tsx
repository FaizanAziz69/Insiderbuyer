"use client";
import useSWR from "swr";
import Link from "next/link";
import { use, useMemo } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, Sparkles } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { Sparkline } from "@/components/Sparkline";
import {
  API_BASE,
  fetcher,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Indicators } from "@/components/Indicators";
import { WatchlistButton } from "@/components/WatchlistButton";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { rankColumn } from "@/components/tableColumns";

interface RowLive {
  price: number;
  changeAbs: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  marketCap: number | null;
  peRatio?: number | null;
  dividendYield?: number | null;
}
interface DetailRow {
  ticker?: string | null;
  symbol?: string;
  name: string;
  sector?: string | null;
  marketCap?: number | null;
  iqs?: number;
  /** Insider-sourced (RankingRow) lists only. */
  distinctBuyers?: number;
  totalPurchaseValue?: number;
  avgCost?: number | null;
  lastBuyDate?: string | null;
  /** Blue Sky list — analyst target fields. */
  upsidePct?: number | null;
  targetMean?: number | null;
  recommendation?: string | null;
  numAnalysts?: number | null;
  live?: RowLive | null;
}
type ListKind = "sector" | "persona" | "premium" | "universe" | "country";
interface DetailResponse {
  slug: string;
  title: string;
  description: string;
  kind: ListKind;
  total: number;
  rows: DetailRow[];
}

const KIND_BLURB: Record<ListKind, string> = {
  sector:
    "A sector screen of U.S. names where corporate insiders have been buying. Rows are ranked by our Insider Score and enriched with live price, volume, and the latest open-market Form 4 purchases.",
  persona:
    "The latest disclosed holdings for this investor or group — sourced from SEC 13F filings (or congressional disclosures where applicable) — paired with live quotes and, where the same name also has Form 4 activity, real insider cost basis.",
  premium:
    "Our premium ranking of the highest Insider Scores across the U.S. market. Every name is backed by real SEC Form 4 filings and recomputed daily.",
  universe:
    "A curated market-cap and thematic basket, refreshed with live quotes. Where a name also shows up in our Form 4 insider data, we attach its insider cost basis and most recent buy date.",
  country:
    "A universe of the most-traded names listed in this market, refreshed with live quotes and cross-referenced against U.S. insider buying activity where available.",
};

const DETAIL_REC_LABEL: Record<string, { label: string; color: string }> = {
  strong_buy: { label: "Strong Buy", color: "var(--good)" },
  buy: { label: "Buy", color: "var(--good)" },
  hold: { label: "Hold", color: "var(--gold)" },
  underperform: { label: "Underperform", color: "var(--bad)" },
  sell: { label: "Sell", color: "var(--bad)" },
  strong_sell: { label: "Strong Sell", color: "var(--bad)" },
};

// Default cap-band selection per list so each opens true to its name. Large-Cap
// opens on Mega (its constituents are all > $200B) and Penny Stocks on Small.
// Other lists open unfiltered (max rows). Users can clear/change from the bar.
const DEFAULT_CAP_BY_SLUG: Record<string, string> = {
  "large-cap": "mega",
  "penny-stocks": "small",
};

export default function StockListDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = use(params);
  const capDefault = DEFAULT_CAP_BY_SLUG[slug];

  const { data, isLoading } = useSWR<DetailResponse>(
    `${API_BASE}/stock-lists/${slug}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  // Real indicator data so every row's chips reflect live signals, not just a
  // couple of heuristics: earnings-due-soon (next 7 days) and analyst coverage.
  const { data: earningsData } = useSWR<{ rows: { symbol: string }[] }>(
    `${API_BASE}/earnings/calendar?days=7`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const { data: analystData } = useSWR<{ rows: { symbol: string; recommendation: string | null }[] }>(
    `${API_BASE}/market-stats/analyst-ratings`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  const earningsSoon = useMemo(
    () => new Set((earningsData?.rows || []).map((r) => r.symbol.toUpperCase())),
    [earningsData],
  );
  const analystBuys = useMemo(() => {
    const s = new Set<string>();
    for (const r of analystData?.rows || []) {
      if (r.recommendation && /buy/i.test(r.recommendation)) s.add(r.symbol.toUpperCase());
    }
    return s;
  }, [analystData]);

  const rows = data?.rows || [];
  const listMissing = !isLoading && (!data || !Array.isArray(data.rows));

  // 7-day price sparklines for the listed tickers (keyless v8 chart, cached).
  const tickerKey = rows
    .map((r) => (r.ticker || r.symbol || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 60)
    .join(",");
  const { data: sparkData } = useSWR<{ spark: Record<string, number[]> }>(
    tickerKey ? `${API_BASE}/market-stats/spark?symbols=${tickerKey}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const sparkMap = sparkData?.spark || {};

  // Avg Cost / Last Buy are insider/holder concepts that the backend attaches
  // to sector, persona, universe and country lists (Form 4 cost basis or 13F
  // reported value). Only render the columns when at least one row carries a
  // real value, so pure quote-only lists don't show a column of dashes.
  const showAvgCost = rows.some((r) => r.avgCost != null);
  const showLastBuy = rows.some((r) => r.lastBuyDate != null);
  // Buyers / $ Bought come from the Insider Score RankingRow shape (sector + premium +
  // universe lists that were cross-referenced against Form 4 data).
  const showBuyers = rows.some((r) => (r.distinctBuyers ?? 0) > 0);
  const showBought = rows.some((r) => (r.totalPurchaseValue ?? 0) > 0);
  // Every stock list carries the Insider Score column (client spec) — names
  // without Form 4 activity simply render a dash.
  const showIqs = true;
  // Blue Sky list — analyst-upside columns + a #50 → #1 countdown rank.
  const showUpside = rows.some((r) => r.upsidePct != null);
  const isBlueSky = slug === "blue-sky";

  // Sector select options derived from the rows actually present.
  const hasSectors = rows.some((r) => r.sector && r.sector.trim());

  // Last-updated stamp: newest live quote is intraday, so just stamp "today".
  const updatedLabel = formatDate(new Date().toISOString());

  if (listMissing) {
    return (
      <div className="w-full space-y-6">
        <Link
          href="/stock-lists"
          className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          <span>All stock lists</span>
        </Link>
        <div className="card p-12 text-center text-mute">
          This stock list doesn&rsquo;t exist.{" "}
          <Link href="/stock-lists" className="text-accent font-bold hover:underline">
            Browse all lists →
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6">
      <Link
        href="/stock-lists"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        <span>All stock lists</span>
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
        {data?.kind && (
          <p
            className="mt-3 max-w-4xl leading-relaxed"
            style={{ color: "var(--text-mute)", fontSize: 15 }}
          >
            {KIND_BLURB[data.kind]}
          </p>
        )}
        {data && (
          <div
            className="mt-4 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[13px]"
            style={{ color: "var(--text-soft)" }}
          >
            <span className="tabular font-semibold" style={{ color: "var(--text)" }}>
              {rows.length} {rows.length === 1 ? "stock" : "stocks"}
            </span>
            <span aria-hidden style={{ color: "var(--text-mute)" }}>·</span>
            <span>Live quotes, updated {updatedLabel}</span>
            <span aria-hidden style={{ color: "var(--text-mute)" }}>·</span>
            <span>Use the Filters button to screen by market cap, sector or move</span>
          </div>
        )}
      </header>

      {/* Top banner ad */}
      <AdSlot slot="leaderboard" seed={`${slug}-top`} />

      {/* Table — sort/filter via the column headers themselves */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading…</div>
        ) : (
          <DataTable<DetailRow>
            rows={rows}
            rowKey={(r, i) => (r.ticker || r.symbol || r.name || "") + i}
            empty="No stocks in this list yet."
            initialSort={
              isBlueSky
                ? { key: "upside", dir: "asc" } // weakest qualifier first → counts down to #1
                : { key: "marketCap", dir: "desc" }
            }
            initialFilters={capDefault ? { marketCap: capDefault } : undefined}
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={[
              rankColumn<DetailRow>(isBlueSky ? { countdownFrom: rows.length } : undefined),
              {
                key: "company",
                label: "Company",
                sortValue: (r) => r.ticker || r.symbol || "",
                render: (r) => {
                  const ticker = r.ticker || r.symbol || "";
                  return (
                    <span className="inline-flex items-center gap-2">
                      {ticker && (
                        <WatchlistButton ticker={ticker} variant="icon" size="sm" />
                      )}
                      <Link
                        href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
                        className="flex items-center gap-2"
                      >
                        <CompanyLogo ticker={ticker} name={r.name} size={24} />
                        <div className="min-w-0">
                          <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                            {ticker || "—"}
                          </div>
                          <div className="truncate max-w-[260px] text-[13px] font-medium" style={{ color: "var(--text)" }}>
                            {r.name}
                          </div>
                        </div>
                      </Link>
                    </span>
                  );
                },
              },
              {
                key: "price",
                label: "Price",
                filterable: true,
                filterType: "range",
                filterLabelText: "Price ($)",
                align: "center",
                sortValue: (r) => r.live?.price ?? null,
                render: (r) =>
                  r.live?.price ? (
                    <span className="tabular font-bold text-[14px]">
                      ${r.live.price.toFixed(2)}
                    </span>
                  ) : (
                    <span className="text-mute">—</span>
                  ),
              },
              {
                key: "changePct",
                label: "Change %",
                filterable: true,
                filterType: "range",
                filterLabelText: "Change %",
                align: "center",
                sortValue: (r) => r.live?.changePct ?? null,
                render: (r) => {
                  if (!r.live) return <span className="text-mute">—</span>;
                  const up = r.live.changePct >= 0;
                  return (
                    <span
                      className="tabular text-[13px] font-bold inline-flex items-center gap-0.5"
                      style={{ color: up ? "var(--good)" : "var(--bad)" }}
                    >
                      {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {up ? "+" : ""}
                      {r.live.changePct.toFixed(2)}%
                    </span>
                  );
                },
              },
              {
                key: "marketCap",
                label: "Market Cap",
                filterable: true,
                filterType: "marketCapPreset",
                filterLabelText: "Market Cap",
                align: "center",
                sortValue: (r) => r.live?.marketCap ?? r.marketCap ?? null,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.live?.marketCap
                      ? formatCurrency(r.live.marketCap)
                      : r.marketCap
                      ? formatCurrency(r.marketCap)
                      : "—"}
                  </span>
                ),
              },
              ...(showIqs
                ? ([
                    {
                      key: "iqs",
                      label: "Insider Score",
                      align: "center",
                      filterable: true,
                      filterType: "range",
                      filterLabelText: "Insider Score (0–100)",
                      sortValue: (r) => r.iqs ?? null,
                      render: (r) => <IqsScoreCell iqs={r.iqs} />,
                    },
                  ] as Column<DetailRow>[])
                : []),
              ...(showUpside
                ? ([
                    {
                      key: "upside",
                      label: "Analyst Upside",
                      align: "center",
                      filterable: true,
                      filterType: "range",
                      filterLabelText: "Analyst Upside (%)",
                      sortValue: (r) => r.upsidePct ?? null,
                      render: (r) =>
                        r.upsidePct != null ? (
                          <span
                            className="tabular text-[13.5px] font-bold"
                            style={{ color: r.upsidePct >= 0 ? "var(--good)" : "var(--bad)" }}
                          >
                            +{r.upsidePct.toFixed(0)}%
                          </span>
                        ) : (
                          <span className="text-mute">—</span>
                        ),
                    },
                    {
                      key: "targetMean",
                      label: "Avg Target",
                      align: "right",
                      sortValue: (r) => r.targetMean ?? null,
                      render: (r) => (
                        <span className="tabular text-[13px] font-bold text-soft">
                          {r.targetMean != null ? `$${r.targetMean.toFixed(2)}` : "—"}
                        </span>
                      ),
                    },
                    {
                      key: "recommendation",
                      label: "Consensus",
                      align: "center",
                      sortValue: (r) => r.recommendation ?? "",
                      render: (r) => {
                        const rec = r.recommendation
                          ? DETAIL_REC_LABEL[r.recommendation]
                          : null;
                        return rec ? (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded text-[10.5px] font-bold uppercase tracking-wider"
                            style={{
                              background: `color-mix(in srgb, ${rec.color} 16%, transparent)`,
                              color: rec.color,
                            }}
                          >
                            {rec.label}
                          </span>
                        ) : (
                          <span className="text-mute">—</span>
                        );
                      },
                    },
                  ] as Column<DetailRow>[])
                : []),
              {
                key: "peRatio",
                label: "P/E",
                align: "right",
                sortValue: (r) => r.live?.peRatio ?? null,
                render: (r) => (
                  <span className="tabular text-mute text-[13px] font-bold">
                    {r.live?.peRatio != null ? r.live.peRatio.toFixed(1) : "—"}
                  </span>
                ),
              },
              {
                key: "dividendYield",
                label: "Div Yield",
                align: "right",
                sortValue: (r) => r.live?.dividendYield ?? null,
                render: (r) => (
                  <span className="tabular text-mute text-[13px] font-bold">
                    {r.live?.dividendYield != null
                      ? r.live.dividendYield.toFixed(2) + "%"
                      : "—"}
                  </span>
                ),
              },
              ...(hasSectors
                ? ([
                    {
                      key: "sector",
                      label: "Sector",
                      filterable: true,
                      filterType: "select",
                      filterLabelText: "Sector",
                      sortValue: (r) => r.sector || "",
                      filterLabel: (r) => r.sector || "",
                      render: (r) => (
                        <span className="text-[14px] truncate max-w-[150px] inline-block align-middle" style={{ color: "var(--text)" }}>
                          {r.sector || "—"}
                        </span>
                      ),
                    },
                  ] as Column<DetailRow>[])
                : []),
              {
                key: "spark7d",
                label: "7D Price",
                sortable: false,
                align: "center",
                render: (r) => <Sparkline data={sparkMap[(r.ticker || r.symbol || "").toUpperCase()]} />,
              },
              {
                key: "volume",
                label: "Volume",
                filterable: true,
                filterType: "range",
                align: "center",
                sortValue: (r) => r.live?.volume ?? null,
                render: (r) => (
                  <span className="tabular text-[14px] font-bold">
                    {r.live?.volume ? formatNumber(r.live.volume) : "—"}
                  </span>
                ),
              },
              {
                key: "avgVolume",
                label: "Avg Volume",
                filterable: true,
                filterType: "range",
                align: "center",
                sortValue: (r) => r.live?.avgVolume ?? null,
                render: (r) => (
                  <span className="tabular text-mute text-[14px] font-bold">
                    {r.live?.avgVolume ? formatNumber(r.live.avgVolume) : "—"}
                  </span>
                ),
              },
              ...(showBuyers
                ? ([
                    {
                      key: "distinctBuyers",
                      label: "Buyers",
                      align: "center",
                      sortValue: (r) => r.distinctBuyers ?? null,
                      render: (r) => (
                        <span className="tabular text-[14px] font-bold">
                          {r.distinctBuyers ? formatNumber(r.distinctBuyers) : "—"}
                        </span>
                      ),
                    },
                  ] as Column<DetailRow>[])
                : []),
              ...(showBought
                ? ([
                    {
                      key: "totalPurchaseValue",
                      label: "$ Bought",
                      align: "center",
                      sortValue: (r) => r.totalPurchaseValue ?? null,
                      render: (r) => (
                        <span className="tabular text-[14px] font-bold" style={{ color: "var(--good)" }}>
                          {r.totalPurchaseValue
                            ? formatCurrency(r.totalPurchaseValue)
                            : "—"}
                        </span>
                      ),
                    },
                  ] as Column<DetailRow>[])
                : []),
              ...(showAvgCost
                ? ([
                    {
                      key: "avgCost",
                      label: "Avg Cost",
                      align: "center",
                      sortValue: (r) => r.avgCost ?? null,
                      render: (r) => (
                        <span className="tabular text-[14px] font-bold">
                          {r.avgCost != null ? `$${r.avgCost.toFixed(2)}` : "—"}
                        </span>
                      ),
                    },
                  ] as Column<DetailRow>[])
                : []),
              ...(showLastBuy
                ? ([
                    {
                      key: "lastBuyDate",
                      label: "Last Buy",
                      align: "center",
                      sortValue: (r) => r.lastBuyDate ?? null,
                      render: (r) => (
                        <span className="tabular text-[14px] text-soft whitespace-nowrap">
                          {r.lastBuyDate ? formatDate(r.lastBuyDate) : "—"}
                        </span>
                      ),
                    },
                  ] as Column<DetailRow>[])
                : []),
              {
                key: "indicators",
                label: "Indicators",
                sortable: false,
                render: (r) => {
                  const sym = (r.ticker || r.symbol || "").toUpperCase();
                  return (
                    <Indicators
                      flags={{
                        insiderTrade: (r.totalPurchaseValue || 0) > 0 ? "buy" : null,
                        earningsDueSoon: sym ? earningsSoon.has(sym) : false,
                        analystUpgrade: sym ? analystBuys.has(sym) : false,
                        positiveNews: !!r.iqs && r.iqs >= 50,
                      }}
                    />
                  );
                },
              },
            ]}
          />
        )}
      </div>

      {/* Inline ad (kept below the table now that rows are sortable) */}
      {rows.length > 9 && <AdSlot slot="inline" seed={`${slug}-mid`} />}

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
          {showBought ? (
            <p className="text-[15px] text-soft leading-relaxed mb-5">
              Every name on this list is cross-referenced against real SEC Form
              4 filings and scored with our four-factor Insider Score: purchase volume, cluster effect, role weighting, and
              holding-change magnitude. The result is a ranked feed of where
              corporate insiders are actually putting their own capital — not
              where Wall Street says they should.
            </p>
          ) : (
            <p className="text-[15px] text-soft leading-relaxed mb-5">
              Each name is shown with its live price, intraday move, market cap
              and trading volume, and — where the same company also has
              open-market insider buying in our SEC Form 4 data — its insider
              cost basis and most recent buy date.
            </p>
          )}

          <h3
            className="font-bold tracking-tight mt-6 mb-3"
            style={{ fontSize: 20, letterSpacing: "-0.2px" }}
          >
            How to use this list
          </h3>
          <p className="text-[15px] text-soft leading-relaxed mb-4">
            Hit the <strong>Filters</strong> button above the table to screen by
            market-cap band, sector, price, or daily move; or click any column
            header to sort. Use the indicator chips on the right of each row to
            see at a glance which stocks have recent insider trades, earnings due
            soon, analyst upgrades, or fresh news coverage.
          </p>
          <p className="text-[15px] text-soft leading-relaxed mb-5">
            Pair this list with our live{" "}
            <Link
              href="/companies"
              className="font-semibold underline"
              style={{ color: "var(--accent)" }}
            >
              Insider Score rankings
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
            Insider Score is recomputed on every new filing — so the ordering you
            see reflects the current state of insider conviction across the
            list.
          </p>

          <Link
            href="/reports/cta/TOP5"
            className="inline-flex items-center gap-1.5 font-bold uppercase tracking-wider mt-2"
            style={{
              background: "var(--premium)",
              color: "var(--premium-ink)",
              padding: "12px 22px",
              fontSize: 12,
              letterSpacing: "0.08em",
              borderRadius: 2,
              boxShadow: "0 2px 6px rgba(0,0,0,0.08)",
            }}
          >
            View the Top 5 Insider Score Picks
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
                Premium · Insider Score Top Picks
              </div>
              <div className="text-[15px] font-bold leading-snug">
                See the top-5 highest Insider Score picks in {data?.title || "this list"}
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-accent group-hover:translate-x-0.5 transition" />
          </div>
        </Link>
      )}
    </div>
  );
}
