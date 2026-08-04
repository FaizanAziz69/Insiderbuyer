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
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { IqsScoreCell } from "@/components/IqsScoreCell";
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
    a: "It is a 0–99 composite of five weighted parts: the quality of the insider buying itself (50%), how strong the company's sector is right now (25%), the tone of management's own discussion in their latest filing (10%), how busy the stock's trading is versus normal (10%), and how much the company is diluting shareholders (5%). The buying half looks at purchase size against market cap, how many separate insiders bought, how senior they are, how much they grew their own stake, and whether the stock now trades below what they paid.",
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
    `${API_BASE}/rankings?limit=1000&live=1${exchange !== "all" ? `&exchange=${exchange}` : ""}`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
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
    { refreshInterval: 10 * 60_000, revalidateOnFocus: false },
  );
  const upsideBySym = new Map<string, number | null>();
  /** Symbols with genuine sell-side coverage: a published price target from at
   *  least two analysts. One-analyst micro-cap targets produce nonsense upsides
   *  (4,800%+) that would discredit the whole list, so they are excluded. */
  const coveredSyms = new Set<string>();
  (analystData?.rows || []).forEach((r) => {
    const sym = r.symbol.toUpperCase();
    upsideBySym.set(sym, r.upsidePct);
    if (r.targetMean != null && (r.numAnalysts ?? 0) >= MIN_ANALYSTS) coveredSyms.add(sym);
  });
  const coverageReady = (analystData?.rows || []).length > 0;

  // Top 50 only, on one page. The list counts DOWN — #50 first, #1 last — so
  // the strongest Insider Score sits at the bottom. Display rank is attached
  // per row (not derived from position) so it survives column sorting.
  const top50: Row50[] = rows
    .filter((r) => coveredSyms.has((r.ticker || "").toUpperCase()))
    .slice(0, 50)
    .map((r, i) => ({ ...r, displayRank: i + 1 }))
    .reverse();

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
      label: "Price",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.livePrice ?? r.lastPrice ?? null,
      render: (r) => {
        const p = r.livePrice ?? r.lastPrice;
        return (
          <span className="tabular font-bold text-[14px]">
            {p != null ? `$${p.toFixed(2)}` : "—"}
          </span>
        );
      },
    },
    {
      key: "changePct",
      label: "Price Change",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => r.changePct ?? null,
      render: (r) => {
        if (r.changePct == null) return <span className="text-faint text-[13px]">—</span>;
        const up = r.changePct >= 0;
        return (
          <span
            className="tabular font-bold text-[14px] inline-flex items-center gap-0.5 justify-end"
            style={{ color: up ? "var(--good)" : "var(--bad)" }}
          >
            {up ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
            {up ? "+" : ""}
            {r.changePct.toFixed(2)}%
          </span>
        );
      },
    },
    {
      key: "iqs",
      label: "Insider Score",
      align: "center",
      sortValue: (r) => r.iqs ?? null,
      render: (r) => <IqsScoreCell iqs={r.iqs} />,
    },
    {
      key: "upside",
      label: "Potential Upside",
      align: "right",
      sortValue: (r) => upsideBySym.get((r.ticker || "").toUpperCase()) ?? null,
      render: (r) => {
        const u = upsideBySym.get((r.ticker || "").toUpperCase());
        if (u == null) return <span className="text-faint text-[13px]">—</span>;
        const up = u >= 0;
        return (
          <span className="tabular font-bold text-[14px]" style={{ color: up ? "var(--good)" : "var(--bad)" }}>
            {up ? "+" : ""}
            {u.toFixed(0)}%
          </span>
        );
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
          is, built from five factors: the buying itself, sector strength,
          management&rsquo;s own outlook, trading momentum and share dilution.
          Only stocks with real analyst coverage appear here: every name below
          carries a published price target from at least {MIN_ANALYSTS}{" "}
          analysts. The list counts down to #1.
        </p>
      </header>

      {/* Performance — our own backtest of the insider signal against the
          S&P 500. Honest caveat in the caption: this tests the RAW insider
          buying signal, not the IQ Score itself, because stored scores are
          as-of-today and would leak future information into past weeks. */}
      {bt?.ready && bt.stats && bt.curve.length > 0 && (
        <div className="card p-4 sm:p-5">
          <div className="grid grid-cols-1 lg:grid-cols-[1fr_260px] gap-5">
            <div className="min-w-0">
              <BacktestChart
                curve={bt.curve}
                height={300}
                tipranks
                strategyLabel="Top Insider Buying Stocks"
                benchmarkLabel="S&P-500"
              />
            </div>
            <div
              className="rounded-lg p-4 flex flex-col justify-center gap-4"
              style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
            >
              <div className="flex items-center gap-3">
                {/* Octagon badge, reference-style: green ring, ink center. */}
                <span
                  className="inline-flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 42,
                    height: 42,
                    background: "var(--good)",
                    clipPath:
                      "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
                  }}
                >
                  <span
                    className="inline-flex items-center justify-center text-[13px] font-extrabold"
                    style={{
                      width: 36,
                      height: 36,
                      background: "var(--bg-2)",
                      color: "var(--good)",
                      clipPath:
                        "polygon(30% 0%, 70% 0%, 100% 30%, 100% 70%, 70% 100%, 30% 100%, 0% 70%, 0% 30%)",
                    }}
                  >
                    IQ
                  </span>
                </span>
                <div className="text-[16px] font-bold leading-snug" style={{ color: "var(--text)" }}>
                  Top Insider Buying
                  <br />
                  Stocks Performance
                </div>
              </div>
              {[
                { label: "Total Return", value: bt.stats.totalReturn },
                { label: "Alpha Over S&P 500", value: bt.stats.alpha },
                { label: "Average Annualized Return", value: bt.stats.cagr },
              ].map((m) => (
                <div key={m.label} style={{ borderLeft: "4px solid var(--good)", paddingLeft: 12 }}>
                  <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
                    {m.label}
                  </div>
                  <div
                    className="text-[27px] font-extrabold tabular leading-tight mt-0.5"
                    style={{ color: m.value >= 0 ? "var(--good)" : "var(--bad)" }}
                  >
                    {m.value >= 0 ? "+" : ""}
                    {m.value.toFixed(1)}%
                  </div>
                </div>
              ))}
              <div
                className="text-[12px] text-mute pt-2.5 text-center"
                style={{ borderTop: "1px solid var(--border)" }}
              >
                Backtested results since {bt.stats.startDate.slice(0, 4)}
              </div>
            </div>
          </div>
          <p className="text-[12px] text-mute mt-3 leading-relaxed max-w-4xl">
            The chart compares the performance of US stocks with the heaviest
            open-market insider buying to the S&amp;P 500, starting{" "}
            {bt.stats.startDate}: each week the ten US-listed companies with the
            most purchases by individual officers and directors (institutional
            10%-owner filings excluded) are held equally weighted. It backtests
            the raw insider-buying signal, not the IQ Score — scores are stored
            as-of-today, so ranking past weeks by them would leak future
            information. Returns are gross of costs. Past performance does not
            predict future results.
          </p>
        </div>
      )}

      <AdSlot slot="leaderboard" seed="insider-hot-top" />

      {/* Exchanges filter — All / U.S. / Canada / Germany */}
      <ExchangeFilter value={exchange} onChange={setExchange} />

      {/* Top 50 — one page, counting down #50 → #1 */}
      <div className="card overflow-hidden">
        {/* The list needs BOTH fetches (rankings + analyst coverage) before it
            can say anything is "empty" — rankings alone with coverage still in
            flight briefly yields zero covered rows, which used to flash
            "No insider buying data" for a few seconds on every load. */}
        {isLoading || (rows.length > 0 && (analystLoading || !analystData)) ? (
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
          Stocks are ranked by our Insider Score, a 0–100 composite that weighs
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
