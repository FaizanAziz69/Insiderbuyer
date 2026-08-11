"use client";
import { useState } from "react";
import useSWR from "swr";
import Link from "next/link";
import { Flame, Activity, ArrowUp, ArrowDown, ChevronDown } from "lucide-react";
import { ExchangeFilter, ExchangeValue } from "@/components/ExchangeFilter";
import {
  API_BASE,
  RankingRow,
  RankingsResponse,
  fetcher,
  formatCurrency,
  formatDate,
} from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Sparkline } from "@/components/Sparkline";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { PriceTargetCell } from "@/components/PriceTargetCell";
import { ReasoningTip } from "@/components/ReasoningTip";
import { WatchlistButton } from "@/components/WatchlistButton";
import { BacktestChart } from "@/components/backtest/BacktestChart";
import { useBacktest } from "@/components/backtest/BacktestPanel";

/**
 * Insider strategy signal — how strong/clustered the recent insider buying is,
 * mirroring TipRanks' "Insider Signal" (Very Positive / Positive / Neutral).
 * Driven by the Insider Score composite and the number of distinct insiders buying.
 */

/** Minimum analysts behind a price target for a stock to qualify for this
 *  list. Client spec: only names with real analyst coverage and upside. */
const MIN_ANALYSTS = 2;

const FAQS = [
  {
    q: "How does the IQ Score work?",
    a: "It is a 0–99 composite of six weighted parts: the quality of the insider buying itself (45%), how strong the company's sector is right now (22%), the tone of management's own discussion in their latest filing (10%), how busy the stock's trading is versus normal (10%), the caliber of the insiders doing the buying (8%), and how much the company is diluting shareholders (5%) — minus a deduction of up to 15 points for confirmed litigation against the insiders. The buying part looks at purchase size against market cap, how many separate insiders bought, how senior they are, how much they grew their own stake, whether the stock trades below what they paid, how much of the company insiders own in total, and insider buying versus selling.",
  },
  {
    q: "Why do some stocks with insider buying not appear here?",
    a: `This list only includes companies with genuine analyst coverage — a published price target from at least ${MIN_ANALYSTS} analysts. Plenty of scored companies have insider buying but no sell-side coverage, so there is no price target or upside to show. Those still appear in the full rankings, just not on this list.`,
  },
  {
    q: "Does a high IQ Score mean the stock will go up?",
    a: "No. The score measures the quality and conviction of insider buying, not price direction. A company can score highly while its share price falls — that is by design, since insiders often buy into weakness. It is one input for research, not a recommendation to buy or sell.",
  },
  {
    q: "How often is the list updated?",
    a: "Insider filings are ingested from SEC EDGAR continuously — companies must report an open-market purchase within two business days — and scores are recalculated daily. Prices and analyst targets refresh throughout the trading day.",
  },
];

/** A ranking row plus the 50→1 display number shown in the # column. */
type Row50 = RankingRow & { displayRank: number };

export default function InsiderHotStocksPage() {
  // "Exchanges" filter — narrows the ranking by listing venue (ranking stays
  // global; sent to the API as &exchange=).
  const [exchange, setExchange] = useState<ExchangeValue>("all");
  const { data: bt } = useBacktest();

  const { data, isLoading } = useSWR<RankingsResponse>(
    // 300 candidates is ample to fill a top-50-with-coverage list (only the
    // first 150 tickers feed the coverage lookup); pulling 1000 was needless
    // database egress. Refresh every 30 min — scores only change on the ~6h
    // recalc, so tighter polling just re-transfers identical rows.
    `${API_BASE}/rankings?limit=300&live=1${exchange !== "all" ? `&exchange=${exchange}` : ""}`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );

  const rows: RankingRow[] = data?.rows || [];

  // Analyst coverage is a HARD requirement for this list, so we have to ask
  // about far more names than we display: only ~half of the ranked US names
  // carry a price target, so 150 candidates comfortably yields a top 50.
  const tickerKey = rows
    .map((r) => (r.ticker || "").toUpperCase())
    .filter((t) => t && !t.includes("."))
    .slice(0, 150)
    .join(",");

  // Analyst-implied potential upside % — rendered next to the Insider Score.
  const { data: analystData, isLoading: analystLoading } = useSWR<{
    rows: {
      symbol: string;
      upsidePct: number | null;
      targetMean: number | null;
      numAnalysts: number | null;
    }[];
  }>(
    tickerKey
      ? `${API_BASE}/market-stats/analyst-ratings?symbols=${encodeURIComponent(tickerKey)}`
      : null,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );

  const upsideBySym = new Map<string, { upside: number | null; target: number | null }>();
  /** Symbols with genuine sell-side coverage: a published price target from at
   *  least two analysts. One-analyst micro-cap targets produce nonsense upsides
   *  (4,800%+) that would discredit the whole list, so they are excluded. */
  const coveredSyms = new Set<string>();
  (analystData?.rows || []).forEach((r) => {
    const sym = r.symbol.toUpperCase();
    upsideBySym.set(sym, { upside: r.upsidePct, target: r.targetMean });
    if (r.targetMean != null && (r.numAnalysts ?? 0) >= MIN_ANALYSTS) coveredSyms.add(sym);
  });
  const coverageReady = (analystData?.rows || []).length > 0;
  // Analyst price targets only exist for US listings; for the Germany/Canada
  // tabs the coverage gate would filter everything out (and its fetch never
  // even fires — foreign tickers carry dots and are excluded from tickerKey),
  // which left the tab stuck on "Loading insider data…" forever.
  const requireCoverage = exchange === "all" || exchange === "US";

  // Top 50 only, on one page. The list counts DOWN — #50 first, #1 last — so
  // the strongest Insider Score sits at the bottom. Display rank is attached
  // per row (not derived from position) so it survives column sorting.
  const top50: Row50[] = rows
    .filter((r) => !requireCoverage || coveredSyms.has((r.ticker || "").toUpperCase()))
    .slice(0, 50)
    .map((r, i) => ({ ...r, displayRank: i + 1 }))
    .reverse();

  // 7-day sparklines for the 50 rows actually displayed (one batched,
  // cached call — keyed on the post-coverage-filter list, otherwise names
  // outside the first candidates would render an empty chart cell).
  const sparkKey = top50
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .join(",");
  const { data: sparkData } = useSWR<{ spark: Record<string, number[]> }>(
    sparkKey ? `${API_BASE}/market-stats/spark?symbols=${encodeURIComponent(sparkKey)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const sparkMap = sparkData?.spark || {};

  // Whole-days since a yyyy-mm-dd date (0 = today).
  const daysSince = (d?: string | null): number | null => {
    if (!d) return null;
    const t = new Date(d).getTime();
    if (Number.isNaN(t)) return null;
    return Math.max(0, Math.floor((Date.now() - t) / 86400000));
  };
  const Ind = ({ label, color }: { label: string; color: string }) => (
    <span
      className="inline-block rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wide whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
    >
      {label}
    </span>
  );

  const columns: Column<Row50>[] = [
    {
      key: "rank",
      label: "#",
      align: "center",
      sortValue: (r) => r.displayRank,
      render: (r) => (
        <span className="tabular text-[15px] font-bold" style={{ color: "var(--text)" }}>
          #{r.displayRank}
        </span>
      ),
    },
    {
      key: "ticker",
      label: "Company",
      sortValue: (r) => r.ticker || "",
      render: (r) => {
        const ticker = r.ticker || "";
        return (
          <span className="inline-flex items-center gap-2">
            {ticker && (
              <WatchlistButton ticker={ticker} variant="icon" size="sm" />
            )}
            <Link
              href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
              className="flex items-center gap-2"
            >
              <CompanyLogo ticker={ticker} name={r.name} size={22} />
              <div className="min-w-0">
                <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                  {ticker || "—"}
                </div>
                <div className="text-[13px] font-medium truncate max-w-[220px]" style={{ color: "var(--text)" }}>
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
      // Price + today's change stacked in one column (was two) so the table
      // fits without a horizontal scroller.
      label: "Price",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.livePrice ?? r.lastPrice ?? null,
      render: (r) => {
        const p = r.livePrice ?? r.lastPrice;
        const up = (r.changePct ?? 0) >= 0;
        return (
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="tabular font-bold text-[14px]">
              {p != null ? `$${p.toFixed(2)}` : "—"}
            </span>
            {r.changePct != null && (
              <span
                className="tabular text-[11.5px] font-semibold inline-flex items-center gap-0.5"
                style={{ color: up ? "var(--good)" : "var(--bad)" }}
              >
                {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                {up ? "+" : ""}
                {r.changePct.toFixed(2)}%
              </span>
            )}
          </span>
        );
      },
    },
    {
      key: "iqs",
      pro: true,
      info: "Our 0–99 Insider Score — a weighted composite of the buying itself (size vs market cap, cluster, seniority, stake growth, aggregate insider ownership), sector strength, management tone, trading momentum, insider caliber and share dilution, minus a litigation deduction. Recomputed daily.",
      label: "Insider Score",
      align: "center",
      sortValue: (r) => r.iqs ?? null,
      render: (r) => <IqsScoreCell iqs={r.iqs} />,
    },
    {
      key: "why",
      label: "Why",
      sortable: false,
      align: "center",
      render: (r) => <ReasoningTip text={r.reasoning} />,
    },
    {
      key: "upside",
      label: "Analyst Price Target",
      align: "center",
      // Client spec: this column ranks by the UPSIDE, not the target price.
      sortValue: (r) => upsideBySym.get((r.ticker || "").toUpperCase())?.upside ?? null,
      render: (r) => {
        const u = upsideBySym.get((r.ticker || "").toUpperCase());
        return <PriceTargetCell target={u?.target ?? null} upsidePct={u?.upside ?? null} />;
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      sortValue: (r) => r.marketCap ?? null,
      render: (r) => (
        <span className="tabular text-[14px] text-mute font-bold">
          {formatCurrency(r.marketCap)}
        </span>
      ),
    },
    {
      key: "buyers",
      label: "Insider Buyers",
      align: "right",
      sortValue: (r) => r.distinctBuyers,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">{r.distinctBuyers}</span>
      ),
    },
    {
      key: "indicators",
      label: "Signals",
      sortable: false,
      render: (r) => {
        const big = r.totalPurchaseValue >= 1_000_000;
        const items: [string, string][] = [];
        if (r.hasCeoBuyer) items.push(["CEO Buy", "var(--good)"]);
        if ((r.distinctBuyers ?? 0) >= 2) items.push(["Cluster", "var(--accent)"]);
        if (big) items.push(["Big Buy", "var(--gold)"]);
        if (r.hasRepeatBuyer) items.push(["Repeat", "#7c3aed"]);
        if (!items.length) return <span className="text-faint text-[12px]">—</span>;
        return (
          <span className="inline-flex flex-wrap gap-1 max-w-[150px]">
            {items.map(([l, c]) => (
              <Ind key={l} label={l} color={c} />
            ))}
          </span>
        );
      },
    },
    {
      key: "perfVsCost",
      label: "vs Insider Cost",
      pro: true,
      info: "How far the live price sits above or below the insiders' 90-day average purchase price (volume-weighted). Positive means the stock trades above what insiders paid; negative means you can buy below their cost.",
      align: "right",
      sortValue: (r) => r.perfVsAvgCostPct ?? -9999,
      render: (r) =>
        r.perfVsAvgCostPct == null ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span
            className="tabular text-[13.5px] font-bold"
            title={r.avgCost ? `Insiders' 90-day avg cost: $${r.avgCost.toFixed(2)}` : undefined}
            style={{ color: r.perfVsAvgCostPct >= 0 ? "var(--good)" : "var(--bad)" }}
          >
            {r.perfVsAvgCostPct >= 0 ? "+" : ""}
            {r.perfVsAvgCostPct.toFixed(1)}%
          </span>
        ),
    },
    {
      key: "ownership",
      label: "Insider Ownership",
      pro: true,
      info: "Share of the company held by its insiders (their latest reported holdings ÷ shares outstanding), with the change over the last 90 days in percentage points. Higher aligned ownership is a stronger signal.",
      align: "right",
      sortValue: (r) => r.insiderOwnershipPct ?? -1,
      render: (r) =>
        r.insiderOwnershipPct == null ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="tabular text-[13.5px] font-bold">
              {r.insiderOwnershipPct.toFixed(1)}%
            </span>
            {r.insiderOwnershipChangePct != null &&
              (r.insiderOwnershipChangePct === 0 ? (
                <span className="tabular text-[11px] font-semibold text-mute">
                  ~0pp 90d
                </span>
              ) : (
                <span
                  className="tabular text-[11px] font-semibold"
                  style={{ color: r.insiderOwnershipChangePct >= 0 ? "var(--good)" : "var(--bad)" }}
                >
                  {r.insiderOwnershipChangePct >= 0 ? "+" : ""}
                  {r.insiderOwnershipChangePct.toFixed(2)}pp 90d
                </span>
              ))}
          </span>
        ),
    },
    {
      key: "lastBuy",
      label: "Last Buy / Updated",
      align: "right",
      sortValue: (r) => (r.lastBuyDate ? new Date(r.lastBuyDate).getTime() : 0),
      render: (r) => {
        const dsBuy = daysSince(r.lastBuyDate);
        const dsUpd = daysSince(r.scoreUpdatedAt ? r.scoreUpdatedAt.slice(0, 10) : null);
        return (
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="text-[13px] font-semibold whitespace-nowrap">
              {dsBuy == null ? "—" : dsBuy === 0 ? "Today" : `${dsBuy}d ago`}
            </span>
            <span className="text-[10.5px] text-mute whitespace-nowrap">
              {dsUpd == null ? "" : dsUpd === 0 ? "updated today" : `updated ${dsUpd}d ago`}
            </span>
          </span>
        );
      },
    },
    {
      key: "spark7d",
      label: "7D",
      sortable: false,
      align: "center",
      render: (r) => <Sparkline data={sparkMap[(r.ticker || "").toUpperCase()]} />,
    },
    {
      key: "bought",
      label: "$ Bought",
      align: "right",
      sortValue: (r) => r.totalPurchaseValue,
      render: (r) => (
        <span
          className="tabular text-[14px] font-bold"
          style={{ color: "var(--good)" }}
        >
          {formatCurrency(r.totalPurchaseValue)}
        </span>
      ),
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Flame className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">
            Insider activity
          </span>
          <Activity className="h-3.5 w-3.5 text-faint ml-1" />
          <span className="live-dot live-dot-good ml-1 text-faint">live</span>
        </div>
        <h1
          className="text-[28px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Top Insider Scores
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-4xl leading-relaxed">
          Top Insider Scores displays the best stocks according to our{" "}
          <strong style={{ color: "var(--text)" }}>IQ Score</strong> — a 0–99
          measure of how strong and meaningful a company&rsquo;s insider buying
          is, built from six components: the buying itself (including insider
          ownership and selling), sector strength, management&rsquo;s own
          outlook, trading momentum, the caliber of the insiders buying, and
          share dilution — less a deduction for confirmed litigation.
          Only stocks with real analyst coverage appear here: every name below
          carries a published price target from at least {MIN_ANALYSTS}{" "}
          analysts. The list counts down to #1.
        </p>
      </header>

      {/* Performance — our own backtest of the insider signal against the
          S&P 500. Honest caveat in the caption: this tests the RAW insider
          buying signal, not the IQ Score itself, because stored scores are
          as-of-today and would leak future information into past weeks. */}
      {bt?.ready && bt.stats && bt.curve.length > 0 && (() => {
        // Trailing returns from the equity curve (strategy series 's').
        const curve = bt.curve;
        const lastPt = curve[curve.length - 1];
        const retSince = (days: number): number | null => {
          const target = lastPt.t - days * 86400000;
          let past = curve[0];
          for (const p of curve) {
            if (p.t <= target) past = p;
            else break;
          }
          return past.s > 0 ? +(((lastPt.s - past.s) / past.s) * 100).toFixed(2) : null;
        };
        const ret30 = retSince(30);
        const ret1y = retSince(365);
        const facts: { label: string; value: string; tone?: string }[] = [
          { label: "Backtest Start Date", value: bt.stats.startDate },
          {
            label: "CAGR (Total)",
            value: `${bt.stats.cagr >= 0 ? "+" : ""}${bt.stats.cagr.toFixed(2)}%`,
            tone: bt.stats.cagr >= 0 ? "var(--good)" : "var(--bad)",
          },
          {
            label: "Return (30d)",
            value: ret30 == null ? "—" : `${ret30 >= 0 ? "+" : ""}${ret30.toFixed(2)}%`,
            tone: ret30 == null ? undefined : ret30 >= 0 ? "var(--good)" : "var(--bad)",
          },
          {
            label: "Return (1Y)",
            value: ret1y == null ? "—" : `${ret1y >= 0 ? "+" : ""}${ret1y.toFixed(2)}%`,
            tone: ret1y == null ? undefined : ret1y >= 0 ? "var(--good)" : "var(--bad)",
          },
        ];
        return (
        <div className="card p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-6">
            {/* Chart column — title + All-Time %, then the chart with controls */}
            <div className="min-w-0">
              <h2 className="text-[22px] sm:text-[26px] font-bold tracking-tight leading-tight">
                Insider Purchases Strategy
              </h2>
              <div
                className="text-[22px] font-extrabold tabular mt-0.5 mb-3"
                style={{ color: bt.stats.totalReturn >= 0 ? "var(--good)" : "var(--bad)" }}
              >
                {bt.stats.totalReturn >= 0 ? "+" : ""}
                {bt.stats.totalReturn.toLocaleString(undefined, { maximumFractionDigits: 2 })}%{" "}
                <span className="text-[13px] font-semibold text-mute">All Time</span>
              </div>
              <BacktestChart
                curve={bt.curve}
                height={320}
                tipranks
                controls
                strategyLabel="Top Insider Buying Stocks"
                benchmarkLabel="S&P-500 (Market)"
              />
              <p className="text-[11px] text-mute mt-2">
                Hover the chart for the value on any week. Both series start at 100.
              </p>
            </div>

            {/* About panel */}
            <div
              className="rounded-lg p-5"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              <h3 className="text-[18px] font-bold tracking-tight mb-3">About</h3>
              <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-soft)" }}>
                The Insider Purchases Strategy scores open-market purchases by
                company insiders and rolls them up to a company level over a
                decaying trailing window. The top 10 companies by insider-buying
                are equally weighted and rebalanced at the start of every week.
                It tests the raw insider-buying signal, not the live IQ Score
                (stored as-of-today, which would leak future information).
                Returns are gross of costs; past performance does not predict
                future results.
              </p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-4 mt-5">
                {facts.map((f) => (
                  <div key={f.label} style={{ borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                    <div className="text-[11px] uppercase tracking-wider font-bold text-mute">
                      {f.label}
                    </div>
                    <div
                      className="text-[18px] font-extrabold tabular mt-0.5"
                      style={{ color: f.tone ?? "var(--text)" }}
                    >
                      {f.value}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
        );
      })()}

      <AdSlot slot="leaderboard" seed="insider-hot-top" />

      {/* Exchanges filter — All / U.S. / Canada / Germany */}
      <ExchangeFilter value={exchange} onChange={setExchange} />

      {/* Top 50 — one page, counting down #50 → #1 */}
      <div className="card overflow-hidden">
        {/* The list needs BOTH fetches (rankings + analyst coverage) before it
            can say anything is "empty" — rankings alone with coverage still in
            flight briefly yields zero covered rows, which used to flash
            "No insider buying data" for a few seconds on every load. */}
        {isLoading ||
        (requireCoverage && rows.length > 0 && (analystLoading || !analystData)) ? (
          <div className="p-12 text-center text-mute">Loading insider data…</div>
        ) : top50.length === 0 ? (
          <div className="p-12 text-center text-mute">
            No insider buying data available.
          </div>
        ) : (
          <DataTable<Row50>
            rows={top50}
            rowKey={(r, i) => (r.ticker || r.companyId || r.name || "") + i}
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
            dense
            pageSize={50}
            gate={{
              label: "Insider Score",
              bullets: [
                "All 50 ranked names, not just the preview",
                "The Insider Score and its v1 comparison",
                "Potential upside and analyst price targets",
                "Every new Form 4 the moment it lands",
              ],
            }}
          />
        )}
      </div>

      {/* How we rank */}
      <section className="card p-5 sm:p-6 max-w-4xl">
        <h2 className="text-[20px] font-bold tracking-tight mb-3">
          How we rank Top Insider Scores
        </h2>
        <p className="text-[15px] text-soft leading-relaxed">
          Stocks are ranked by our Insider Score, a 0–99 composite that weighs
          the dollar size of insider purchases relative to the company&rsquo;s
          market cap, the number of distinct insiders buying (a cluster of
          buyers carries more signal than a lone trade), the seniority of the
          buyers&rsquo; roles (a CEO or CFO buy outweighs a director&rsquo;s),
          and how much each insider grew their existing stake. A higher score is
          more bullish — even when the share price is falling — because it
          measures buying quality, not price momentum. Informational, not a
          trade recommendation.
        </p>
      </section>

      {/* FAQ — plain <details> so it works without JS and stays accessible. */}
      <section className="max-w-4xl">
        <h2
          className="text-[20px] font-bold tracking-tight pb-2 mb-0"
          style={{ borderBottom: "3px solid var(--accent)", display: "inline-block" }}
        >
          FAQ
        </h2>
        <div
          className="rounded-lg mt-4 overflow-hidden"
          style={{ border: "1px solid var(--border)", background: "var(--bg-2)" }}
        >
          {FAQS.map((f, i) => (
            <details
              key={f.q}
              className="group"
              style={{ borderTop: i ? "1px solid var(--border)" : undefined }}
            >
              <summary
                className="flex items-center justify-between gap-3 cursor-pointer list-none px-4 py-3.5 text-[15px] font-bold"
                style={{ color: "var(--text)" }}
              >
                {f.q}
                <ChevronDown className="h-4 w-4 flex-shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <div className="px-4 pb-4 text-[14.5px] leading-relaxed text-soft">
                {f.a}
              </div>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
