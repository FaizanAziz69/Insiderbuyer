"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUp, ArrowDown } from "lucide-react";
import { API_BASE, fetcher, formatCurrency, formatDate } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";
import { Sparkline } from "@/components/Sparkline";
import { DataTable, Column } from "@/components/DataTable";
import { IqsScoreCell } from "@/components/IqsScoreCell";
import { PriceTargetCell } from "@/components/PriceTargetCell";
import { ReasoningTip } from "@/components/ReasoningTip";
import { WatchlistButton } from "@/components/WatchlistButton";
import { rankColumn } from "@/components/tableColumns";
import { PremiumValue } from "@/components/premium/PremiumValue";

/**
 * The platform-standard stock-list row — a superset shape every list maps
 * into. Missing fields render as "—"; the COLUMN SEQUENCE never changes
 * (client spec: every stock list follows the Top Insider Scores layout).
 */
export interface StandardRow {
  ticker?: string | null;
  name?: string | null;
  sector?: string | null;
  iqs?: number | null;
  reasoning?: string | null;
  totalPurchaseValue?: number | null;
  distinctBuyers?: number | null;
  hasCeoBuyer?: boolean;
  hasRepeatBuyer?: boolean;
  perfVsAvgCostPct?: number | null;
  insiderOwnershipPct?: number | null;
  insiderOwnershipChangePct?: number | null;
  /** Portfolio-holdings fields — present only on persona lists backed by
   *  real filings (13F / Form 4). */
  sharesHeld?: number | null;
  dollarValue?: number | null;
  weightPct?: number | null;
  lastBuyDate?: string | null;
  scoreUpdatedAt?: string | null;
  marketCap?: number | null;
  lastPrice?: number | null;
  livePrice?: number | null;
  changePct?: number | null;
  peRatio?: number | null;
  /** The backend's verdict on the row's insider columns: "covered" means real
   *  Form 4 aggregates are attached, the rest each explain a blank — and only
   *  "no-insider-buying" / "listing-not-covered" are statements about the
   *  company. "lookup-unavailable" means WE failed, so it must never be shown
   *  as evidence that nobody bought. */
  insiderCoverage?:
    | "covered"
    | "no-insider-buying"
    | "listing-not-covered"
    | "lookup-unavailable"
    | null;
  /** Human-readable form of `insiderCoverage`, supplied by the API. */
  insiderCoverageNote?: string | null;
  live?: {
    price?: number | null;
    changePct?: number | null;
    marketCap?: number | null;
    peRatio?: number | null;
  } | null;
}

/**
 * ── THE canonical column order ────────────────────────────────────────────
 * The single source of truth for every stock list on the platform (client
 * spec: every list follows the Top Insider Scores layout). Reorder or trim
 * THIS ARRAY and every list follows in one edit — the column bodies below are
 * keyed, not sequenced, so nothing else has to move.
 *
 * The client's verbatim list is: Company name · Analyst price target · Price ·
 * Insider Score · $ Bought · Signals · Last Updated · Market Cap · Sector ·
 * PE Ratio · 7D chart (and "Insider Buyers Removal", which is done — no
 * buyer-count column exists any more).
 *
 * Three keys are not in that list. ROI and Why sit immediately after Insider
 * Score — the client confirmed both stay, in that position ("Insider Score
 * first column ROI"). Ownership was never mentioned either way and is retained
 * deliberately: it carries real data on scored lists, so dropping it silently
 * would be the worse error. Deleting a key from this array is all it takes to
 * drop the column everywhere.
 */
export const STOCK_LIST_COLUMN_ORDER = [
  "rank", // "#" — not a client column, it's the list's own numbering
  "ticker", // Company name
  "upside", // Analyst price target
  "price",
  // Portfolio-holdings columns — carry data only on persona lists backed by
  // real filings (13F / Form 4); hidden everywhere else via hasAny.
  "weight", // % of the disclosed portfolio (client 2026-08-19: rank by this)
  "sharesHeld",
  "heldValue",
  "iqs", // Insider Score
  "roi", // not in the client's list; confirmed to stay, in this slot
  "why", // not in the client's list; confirmed to stay, in this slot
  "bought", // $ Bought
  "indicators", // Signals
  "lastUpdated", // Last Updated (was "Last Buy")
  "marketCap",
  "sector",
  "pe", // PE Ratio
  // "ownership" removed 2026-08-20 (client: "just remove for now")
  "spark7d", // 7D chart
] as const;

export type StockListColumnKey = (typeof STOCK_LIST_COLUMN_ORDER)[number];

const Ind = ({ label, color }: { label: string; color: string }) => (
  <span
    className="inline-flex items-center rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase tracking-wider"
    style={{ background: `color-mix(in srgb, ${color} 15%, transparent)`, color }}
  >
    {label}
  </span>
);

/** The columns whose values all come from our Form 4 pipeline — when every one
 *  of them is empty across the whole list, the list simply has no insider
 *  activity behind it and the table says so once instead of silently. */
const INSIDER_COLUMN_KEYS = ["iqs", "roi", "why", "bought", "indicators", "lastUpdated"];

/**
 * The "—" an insider-derived cell shows when there is nothing to show, with the
 * row's coverage note as its hover title. A blank insider cell on a list that
 * keeps the column (some names have Form 4 buys, this one doesn't) then reads
 * as "no open-market buying on record" instead of looking like a data outage.
 */
const NoInsiderValue = ({ row }: { row: StandardRow }) => {
  const note =
    row.insiderCoverage && row.insiderCoverage !== "covered" ? row.insiderCoverageNote : null;
  return (
    <span className={`text-faint text-[12px]${note ? " cursor-help" : ""}`} title={note || undefined}>
      —
    </span>
  );
};

/**
 * Platform-standard stock-list table: the exact Top Insider Scores column
 * sequence, taken from `STOCK_LIST_COLUMN_ORDER` above and enforced uniformly
 * across every category / exchange / market-cap / style / persona list.
 * Fetches its own analyst coverage and 7-day sparklines (batched, capped) for
 * the rows it shows.
 */
export function StandardStockListTable({
  rows,
  pageSize,
  gate,
  initialSort,
  initialFilters,
  countdownRank,
}: {
  rows: StandardRow[];
  pageSize?: number;
  gate?: { label: string; freeRows?: number; bullets?: string[] };
  /** Presentation-only knobs. None of them can change the column set or its
   *  order — that lives in STOCK_LIST_COLUMN_ORDER and nowhere else.
   *  `initialSort` falls back to Market Cap when the requested column was
   *  dropped for having no data on this list; `countdownRank` numbers the "#"
   *  column downwards (Blue Sky counts #50 → #1). */
  initialSort?: { key: StockListColumnKey; dir: "asc" | "desc" };
  initialFilters?: Record<string, string>;
  countdownRank?: boolean;
}) {
  // Analyst coverage — batched for the first 150 tickers (same budget the Top
  // Insider Scores page uses). Dotted symbols are included: the endpoint
  // serves them (RY.TO, SAP.DE and ABX.TO all return a target), and filtering
  // them out left the Analyst Price Target column empty on every row of the
  // all-dotted Canada and Germany lists.
  const tickerKey = rows
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 150)
    .join(",");
  const { data: analystData } = useSWR<{
    rows: { symbol: string; upsidePct: number | null; targetMean: number | null }[];
  }>(
    tickerKey
      ? `${API_BASE}/market-stats/analyst-ratings?symbols=${encodeURIComponent(tickerKey)}`
      : null,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  const upsideBySym = new Map<string, { upside: number | null; target: number | null }>();
  (analystData?.rows || []).forEach((r) =>
    upsideBySym.set(r.symbol.toUpperCase(), { upside: r.upsidePct, target: r.targetMean }),
  );

  // 7-day sparklines — first 100 rows (one batched, cached call). Dotted
  // symbols included for the same reason as above: /spark returns 7 points for
  // RY.TO, SAP.DE and ABX.TO, so excluding them only blanked the 7D column.
  const sparkKey = rows
    .slice(0, 100)
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .join(",");
  const { data: sparkData } = useSWR<{ spark: Record<string, number[]> }>(
    sparkKey ? `${API_BASE}/market-stats/spark?symbols=${encodeURIComponent(sparkKey)}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const sparkMap = sparkData?.spark || {};

  const price = (r: StandardRow) => r.live?.price ?? r.livePrice ?? r.lastPrice ?? null;
  const chg = (r: StandardRow) => r.live?.changePct ?? r.changePct ?? null;
  const cap = (r: StandardRow) => r.live?.marketCap ?? r.marketCap ?? null;
  const pe = (r: StandardRow) => r.live?.peRatio ?? r.peRatio ?? null;

  // Column bodies, KEYED — never sequenced here. The order the reader sees is
  // STOCK_LIST_COLUMN_ORDER's, applied once, below.
  const byKey: Record<StockListColumnKey, Column<StandardRow>> = {
    rank: rankColumn<StandardRow>(
      countdownRank ? { countdownFrom: rows.length } : undefined,
    ),
    ticker: {
      key: "ticker",
      label: "Company",
      sortValue: (r) => r.ticker || "",
      render: (r) => {
        const ticker = (r.ticker || "").toUpperCase();
        return (
          <span className="inline-flex items-center gap-2">
            {ticker && <WatchlistButton ticker={ticker} variant="icon" size="sm" />}
            <Link
              href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
              className="flex items-center gap-2 group"
            >
              <span
                className="flex-shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center"
                style={{ width: 30, height: 30, padding: 3, border: "1px solid var(--border)" }}
              >
                <CompanyLogo ticker={ticker} name={r.name || ticker} size={24} />
              </span>
              <span className="min-w-0">
                <span className="block font-mono text-[14px] font-bold text-accent group-hover:underline leading-tight">
                  {ticker || "—"}
                </span>
                <span
                  className="block text-[12px] font-medium truncate max-w-[190px] leading-tight"
                  style={{ color: "var(--text)" }}
                >
                  {r.name || ""}
                </span>
              </span>
            </Link>
          </span>
        );
      },
    },
    upside: {
      key: "upside",
      label: "Analyst Price Target",
      align: "center",
      sortValue: (r) => upsideBySym.get((r.ticker || "").toUpperCase())?.upside ?? null,
      render: (r) => {
        const u = upsideBySym.get((r.ticker || "").toUpperCase());
        return <PriceTargetCell target={u?.target ?? null} upsidePct={u?.upside ?? null} />;
      },
    },
    price: {
      key: "price",
      label: "Price",
      align: "right",
      filterable: true,
      filterType: "range",
      sortValue: (r) => price(r),
      render: (r) => {
        const p = price(r);
        const c = chg(r);
        const up = (c ?? 0) >= 0;
        return (
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="tabular font-bold text-[14px]">
              {p != null ? `$${Number(p).toFixed(2)}` : "—"}
            </span>
            {c != null && (
              <span
                className="tabular text-[11.5px] font-semibold inline-flex items-center gap-0.5"
                style={{ color: up ? "var(--good)" : "var(--bad)" }}
              >
                {up ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
                {up ? "+" : ""}
                {Number(c).toFixed(2)}%
              </span>
            )}
          </span>
        );
      },
    },
    weight: {
      key: "weight",
      label: "Weight",
      align: "right",
      info: "This position's share of the investor's total disclosed portfolio value.",
      sortValue: (r) => r.weightPct ?? null,
      render: (r) =>
        r.weightPct == null ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span className="tabular text-[14px] font-bold">{r.weightPct.toFixed(2)}%</span>
        ),
    },
    sharesHeld: {
      key: "sharesHeld",
      label: "Shares Held",
      align: "right",
      sortValue: (r) => r.sharesHeld ?? null,
      render: (r) =>
        r.sharesHeld == null ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span className="tabular text-[13.5px] font-semibold">
            {Number(r.sharesHeld).toLocaleString()}
          </span>
        ),
    },
    heldValue: {
      key: "heldValue",
      label: "Value",
      align: "right",
      info: "Position value — as reported on the latest 13F, or shares × live price for positions disclosed on Form 4.",
      sortValue: (r) => r.dollarValue ?? null,
      render: (r) =>
        !r.dollarValue ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span className="tabular text-[13.5px] font-bold">{formatCurrency(r.dollarValue)}</span>
        ),
    },
    iqs: {
      key: "iqs",
      label: "Insider Score",
      pro: true,
      align: "center",
      info: "Our 0–99 Insider Score — a weighted composite of insider-buying quality, sector strength, management tone, momentum, insider caliber and dilution. Blank when the company has no recent open-market insider buys.",
      sortValue: (r) => r.iqs ?? null,
      render: (r) =>
        r.iqs != null ? (
          <PremiumValue label="Insider Score">
            <IqsScoreCell iqs={r.iqs} />
          </PremiumValue>
        ) : (
          <NoInsiderValue row={r} />
        ),
    },
    roi: {
      key: "roi",
      label: "ROI",
      pro: true,
      align: "right",
      info: "How far the stock trades above or below the insiders' own 90-day average purchase price.",
      sortValue: (r) => r.perfVsAvgCostPct ?? null,
      render: (r) =>
        r.perfVsAvgCostPct == null ? (
          <NoInsiderValue row={r} />
        ) : (
          <PremiumValue label="ROI">
            <span
              className="tabular font-bold text-[13.5px]"
              style={{ color: r.perfVsAvgCostPct >= 0 ? "var(--good)" : "var(--bad)" }}
            >
              {r.perfVsAvgCostPct >= 0 ? "+" : ""}
              {r.perfVsAvgCostPct.toFixed(1)}%
            </span>
          </PremiumValue>
        ),
    },
    why: {
      key: "why",
      label: "Why",
      sortable: false,
      align: "center",
      render: (r) =>
        r.reasoning ? <ReasoningTip text={r.reasoning} /> : <NoInsiderValue row={r} />,
    },
    bought: {
      key: "bought",
      label: "$ Bought",
      align: "right",
      sortValue: (r) => r.totalPurchaseValue ?? null,
      render: (r) =>
        r.totalPurchaseValue ? (
          <span className="tabular font-bold text-[14px]" style={{ color: "var(--good)" }}>
            {formatCurrency(r.totalPurchaseValue)}
          </span>
        ) : (
          <NoInsiderValue row={r} />
        ),
    },
    indicators: {
      key: "indicators",
      label: "Signals",
      sortable: false,
      render: (r) => {
        const items: [string, string][] = [];
        if (r.hasCeoBuyer) items.push(["CEO Buy", "var(--good)"]);
        if ((r.distinctBuyers ?? 0) >= 2) items.push(["Cluster", "var(--accent)"]);
        if ((r.totalPurchaseValue ?? 0) >= 1_000_000) items.push(["Big Buy", "var(--gold)"]);
        if (r.hasRepeatBuyer) items.push(["Repeat", "#7c3aed"]);
        if (!items.length) return <NoInsiderValue row={r} />;
        return (
          <span className="inline-flex flex-wrap gap-1 max-w-[150px]">
            {items.map(([l, c]) => (
              <Ind key={l} label={l} color={c} />
            ))}
          </span>
        );
      },
    },
    lastUpdated: {
      key: "lastUpdated",
      label: "Last Updated",
      align: "right",
      sortValue: (r) => r.lastBuyDate || r.scoreUpdatedAt || "",
      render: (r) => {
        const d = r.lastBuyDate || r.scoreUpdatedAt;
        return d ? (
          <span className="text-mute text-[12.5px] tabular whitespace-nowrap">{formatDate(d)}</span>
        ) : (
          <NoInsiderValue row={r} />
        );
      },
    },
    marketCap: {
      key: "marketCap",
      label: "Market Cap",
      align: "right",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      sortValue: (r) => cap(r),
      render: (r) => (
        <span className="tabular text-[13.5px] text-mute font-bold">{formatCurrency(cap(r))}</span>
      ),
    },
    sector: {
      key: "sector",
      label: "Sector",
      filterable: true,
      sortValue: (r) => r.sector || "",
      render: (r) => (
        <span className="text-[12.5px] text-mute truncate inline-block max-w-[140px]">
          {r.sector || "—"}
        </span>
      ),
    },
    pe: {
      key: "pe",
      label: "P/E Ratio",
      align: "right",
      sortValue: (r) => pe(r),
      render: (r) => {
        const v = pe(r);
        return (
          <span className="tabular text-[13.5px] text-mute font-semibold">
            {v != null && Number.isFinite(v) ? Number(v).toFixed(1) : "—"}
          </span>
        );
      },
    },
    // "ownership" column def removed 2026-08-20 with its key above.
    spark7d: {
      key: "spark7d",
      label: "7D",
      sortable: false,
      align: "center",
      render: (r) => {
        const pts = sparkMap[(r.ticker || "").toUpperCase()];
        return pts?.length ? (
          <Sparkline data={pts} />
        ) : (
          <span className="text-faint text-[12px]">—</span>
        );
      },
    },
  };

  // The one place a reader's column sequence is decided.
  const columns: Column<StandardRow>[] = STOCK_LIST_COLUMN_ORDER.map((k) => byKey[k]);

  // Acceptance rule (QA audit): never ship a header that is empty in 100% of
  // rows. The standard SEQUENCE is preserved; columns with zero coverage for
  // this particular dataset are dropped (e.g. a curated mega-cap list where no
  // name has recent insider buys loses the insider columns instead of showing
  // seven all-dash columns).
  //
  // Two rules the checks below all obey. Coverage is measured over the WHOLE
  // row set, never the current page — paging must not make a header appear or
  // vanish. And the identity columns (#, Company, Price, Market Cap, Sector)
  // are absent from this map entirely, so they always render: they're what
  // makes the thing a stock list, and Market Cap is also the `initialSort`
  // target. A column whose data arrives on its own request stays put until
  // that request answers, so it doesn't flash in after first paint.
  //
  // Coverage is measured on the RAW row data, never on what the visitor is
  // entitled to see — that is what makes this compose with the inline column
  // paygating. A locked Insider Score still counts as data, so the column
  // survives and shows its PRO pill and unlock CTA (client spec: ungated lists
  // stay browsable with premium COLUMNS gated in place); and a column dropped
  // here is gone from `visible`, so a hidden column can never render a gate.
  // Holdings-backed persona lists are portfolio pages first: two Form 4 hits
  // among 178 positions don't justify five near-empty insider columns
  // (client 2026-08-20, eric-sprott). There an insider column needs a real
  // presence (≥5% of rows, min 3); everywhere else one row is enough.
  const isHoldingsList = rows.some((r) => r.weightPct != null);
  const insiderColThreshold = isHoldingsList
    ? Math.max(3, Math.ceil(rows.length * 0.05))
    : 1;
  const enough = (pred: (r: StandardRow) => boolean) =>
    rows.filter(pred).length >= insiderColThreshold;
  const hasAny = {
    upside:
      !analystData ||
      rows.some((r) => upsideBySym.get((r.ticker || "").toUpperCase())?.target != null),
    iqs: enough((r) => r.iqs != null),
    roi: enough((r) => r.perfVsAvgCostPct != null),
    why: enough((r) => !!r.reasoning),
    bought: enough((r) => (r.totalPurchaseValue ?? 0) > 0),
    indicators: enough(
      (r) => !!r.hasCeoBuyer || !!r.hasRepeatBuyer || (r.distinctBuyers ?? 0) >= 2 || (r.totalPurchaseValue ?? 0) >= 1_000_000,
    ),
    lastUpdated: rows.some((r) => r.lastBuyDate || r.scoreUpdatedAt),
    pe: rows.some((r) => pe(r) != null),
    weight: rows.some((r) => r.weightPct != null),
    sharesHeld: rows.some((r) => r.sharesHeld != null),
    heldValue: rows.some((r) => !!r.dollarValue),
    spark7d: rows.length > 0,
  } as Record<string, boolean>;
  const visible = columns.filter((c) => {
    const k = String(c.key);
    return !(k in hasAny) || hasAny[k];
  });

  // When the whole insider block goes, the reader is left with a plain quote
  // table and no idea why — so say it once, in one line, under the table. The
  // wording follows the rows' own coverage verdict: we only claim "nothing on
  // record" when the API actually proved the negative, and stay silent when the
  // rows carry no verdict at all rather than guess at a reason.
  const coverageLine = (() => {
    if (!rows.length || INSIDER_COLUMN_KEYS.some((k) => hasAny[k])) return null;
    // "covered" is not an explanation for a blank column, so it never picks the
    // wording — a 13F persona list whose rows are all "covered" but carry no
    // Form 4 aggregates says nothing rather than claiming it isn't covered.
    const verdicts = new Set(
      rows.map((r) => r.insiderCoverage).filter((v) => !!v && v !== "covered"),
    );
    if (!verdicts.size) return null;
    if (verdicts.has("lookup-unavailable"))
      return "We couldn’t check insider filings for every name on this list right now, so the insider columns are hidden.";
    if (verdicts.has("no-insider-buying"))
      return "No company on this list has open-market insider buying on record in the last 90 days, so the insider columns are hidden.";
    return "These listings aren’t in our SEC Form 4 coverage yet, so the insider columns are hidden.";
  })();

  // The default sort must name a column that survived the coverage filter
  // above — a list that lost its Insider Score column can't open sorted by it.
  // Market Cap is the fallback because it always renders (see `hasAny`).
  const sortSpec =
    initialSort && visible.some((c) => c.key === initialSort.key)
      ? initialSort
      : ({ key: "marketCap", dir: "desc" } as const);

  return (
    <>
      <DataTable<StandardRow>
        rows={rows}
        rowKey={(r, i) => `${r.ticker || "row"}-${i}`}
        pageSize={pageSize}
        initialSort={sortSpec}
        initialFilters={initialFilters}
        empty="No stocks match the current filters."
        columns={visible}
        gate={gate}
      />
      {coverageLine && (
        <p
          className="text-[12.5px] text-mute px-3 py-2.5"
          style={{ borderTop: "1px solid var(--border)" }}
        >
          {coverageLine}
        </p>
      )}
    </>
  );
}
