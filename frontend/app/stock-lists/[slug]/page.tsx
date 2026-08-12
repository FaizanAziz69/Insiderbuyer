"use client";
import useSWR from "swr";
import Link from "next/link";
import { use, useState } from "react";
import { ArrowLeft, ChevronRight, Sparkles } from "lucide-react";
import { StandardStockListTable, StandardRow } from "@/components/StandardStockListTable";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { ExchangeFilter, ExchangeValue } from "@/components/ExchangeFilter";
import { PoliticiansLeaderboard } from "@/components/PoliticiansLeaderboard";

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
/**
 * One row of a stock list as the API returns it — a superset of the standard
 * row: 13F persona lists add holder fields, Blue Sky adds analyst-target
 * fields. Every list renders through StandardStockListTable (client spec: one
 * column order for all of them), so the only work left here is mapping this
 * shape into StandardRow — see `toStandardRows`.
 */
interface DetailRow extends StandardRow {
  /** Persona / 13F rows key on `symbol` where insider rows key on `ticker`. */
  symbol?: string;
  avgCost?: number | null;
  /** Blue Sky list — analyst target fields. The standard table fetches its own
   *  analyst coverage for the Analyst Price Target column, so these ride along
   *  unread. */
  upsidePct?: number | null;
  targetMean?: number | null;
  recommendation?: string | null;
  numAnalysts?: number | null;
  note?: string | null;
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

/**
 * Every list maps into the one standard row shape, so every list renders
 * through the one canonical column order. Persona/13F rows only carry a subset
 * of the insider fields; the rest stay undefined and the table either hides the
 * column (no row has it) or dashes the cell with its coverage note.
 */
function toStandardRows(rows: DetailRow[]): StandardRow[] {
  return rows.map((r) => ({ ...r, ticker: r.ticker || r.symbol || null }));
}

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

  // "Exchanges" filter — narrows the list by listing venue. Ranking stays
  // global (a German stock scoring #1 shows #1 under "All"). Sent to the API
  // as ?exchange=; the backend maps US / CA / DE.
  const [exchange, setExchange] = useState<ExchangeValue>("all");

  const { data, isLoading } = useSWR<DetailResponse>(
    `${API_BASE}/stock-lists/${slug}${exchange !== "all" ? `?exchange=${exchange}` : ""}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const rows = data?.rows || [];
  const listMissing = !isLoading && (!data || !Array.isArray(data.rows));

  // Which of the two bottom-copy paragraphs fits this list — the insider one
  // only when the rows actually carry Form 4 purchase values.
  const showBought = rows.some((r) => (r.totalPurchaseValue ?? 0) > 0);
  // Blue Sky counts down #50 → #1 by implied upside instead of ranking by cap.
  const isBlueSky = slug === "blue-sky";

  // Last-updated stamp: newest live quote is intraday, so just stamp "today".
  const updatedLabel = formatDate(new Date().toISOString());

  // Politicians isn't a stock list — render the member leaderboard instead
  // (after all hooks, so hook order stays constant).
  if (slug === "politicians") return <PoliticiansLeaderboard />;

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
        {/* Client spec: no descriptions on stock-list pages. */}
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

      {/* Exchanges filter — All / U.S. / Canada / Germany. Ranking is global;
          this narrows the visible list by listing venue. */}
      <ExchangeFilter value={exchange} onChange={setExchange} />

      {/* Top banner ad */}
      <AdSlot slot="leaderboard" seed={`${slug}-top`} />

      {/* Table — sort/filter via the column headers themselves */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading…</div>
        ) : (
          /* ONE table for every list — sector, persona, premium, universe,
             country. The canonical column order lives in
             STOCK_LIST_COLUMN_ORDER (StandardStockListTable) and nowhere else,
             so it can no longer drift per branch: the persona and Blue Sky
             branches that used to sit here each defined their own columns,
             which is how persona lists ended up with an all-dash Insider Score
             column and a "Buyers" column the client asked to remove.
             Sorting, filtering, paging and paygating are unchanged — they all
             still come from DataTable. */
          <StandardStockListTable
            rows={toStandardRows(rows)}
            countdownRank={isBlueSky}
            initialSort={isBlueSky ? { key: "upside", dir: "asc" } : undefined}
            initialFilters={capDefault ? { marketCap: capDefault } : undefined}
            gate={
              isBlueSky
                ? {
                    label: "Blue Sky Stocks",
                    bullets: [
                      "Every 300%+ upside name, counted down to #1",
                      "Mean analyst targets behind each call",
                      "Top-analyst coverage counts per stock",
                      "Live prices and market caps",
                    ],
                  }
                : data?.kind === "premium"
                  ? {
                      label: "Top Insider Scores",
                      bullets: [
                        "The full ranked list, not just the preview",
                        "Insider Scores, ROI vs insider cost and signals",
                        "Insider ownership with 90-day change",
                        "Every new Form 4 the moment it lands",
                      ],
                    }
                  : undefined
            }
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
          {/* Client spec: no stock-list descriptions on the list pages. The
              API still sends `description` (STOCK_LIST_META) and it is still
              used elsewhere — it just isn't rendered here. */}
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
            header to sort. Use the <strong>Signals</strong> chips on each row to
            see at a glance which stocks have CEO buys, cluster buying, outsized
            purchases, or repeat buyers.
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
