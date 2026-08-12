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
const INSIDER_COLUMN_KEYS = ["iqs", "roi", "why", "bought", "indicators", "lastUpdated", "ownership"];

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
 * sequence — # | Company | Analyst Price Target | Price | Insider Score | ROI |
 * Why | $ Bought | Signals | Last Updated | Market Cap | Sector | P/E |
 * Insider Ownership | 7D — enforced uniformly across every category /
 * exchange / market-cap / style list. Fetches its own analyst coverage and
 * 7-day sparklines (batched, capped) for the rows it shows.
 */
export function StandardStockListTable({
  rows,
  pageSize,
  gate,
}: {
  rows: StandardRow[];
  pageSize?: number;
  gate?: { label: string; freeRows?: number; bullets?: string[] };
}) {
  // Analyst coverage — batched for the first 150 clean US tickers (same
  // budget the Top Insider Scores page uses).
  const tickerKey = rows
    .map((r) => (r.ticker || "").toUpperCase())
    .filter((t) => t && !t.includes("."))
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

  // 7-day sparklines — first 100 rows (one batched, cached call).
  const sparkKey = rows
    .slice(0, 100)
    .map((r) => (r.ticker || "").toUpperCase())
    .filter((t) => t && !t.includes("."))
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

  const columns: Column<StandardRow>[] = [
    rankColumn<StandardRow>(),
    {
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
    {
      key: "upside",
      label: "Analyst Price Target",
      align: "center",
      sortValue: (r) => upsideBySym.get((r.ticker || "").toUpperCase())?.upside ?? null,
      render: (r) => {
        const u = upsideBySym.get((r.ticker || "").toUpperCase());
        return <PriceTargetCell target={u?.target ?? null} upsidePct={u?.upside ?? null} />;
      },
    },
    {
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
    {
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
    {
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
    {
      key: "why",
      label: "Why",
      sortable: false,
      align: "center",
      render: (r) =>
        r.reasoning ? <ReasoningTip text={r.reasoning} /> : <NoInsiderValue row={r} />,
    },
    {
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
    {
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
    {
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
    {
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
    {
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
    {
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
    {
      key: "ownership",
      label: "Insider Ownership",
      pro: true,
      align: "right",
      info: "Share of the company held by its insiders, with the 90-day change in percentage points.",
      sortValue: (r) => r.insiderOwnershipPct ?? -1,
      render: (r) =>
        r.insiderOwnershipPct == null ? (
          <NoInsiderValue row={r} />
        ) : (
          <PremiumValue label="Insider Ownership">
          <span className="inline-flex flex-col items-end leading-tight">
            <span className="tabular text-[13.5px] font-bold">
              {r.insiderOwnershipPct.toFixed(1)}%
            </span>
            {r.insiderOwnershipChangePct != null &&
              (r.insiderOwnershipChangePct === 0 ? (
                <span className="tabular text-[11px] font-semibold text-mute">~0pp 90d</span>
              ) : (
                <span
                  className="tabular text-[11px] font-semibold"
                  style={{
                    color: r.insiderOwnershipChangePct >= 0 ? "var(--good)" : "var(--bad)",
                  }}
                >
                  {r.insiderOwnershipChangePct >= 0 ? "+" : ""}
                  {r.insiderOwnershipChangePct.toFixed(2)}pp 90d
                </span>
              ))}
          </span>
          </PremiumValue>
        ),
    },
    {
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
  ];

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
  const hasAny = {
    upside:
      !analystData ||
      rows.some((r) => upsideBySym.get((r.ticker || "").toUpperCase())?.target != null),
    iqs: rows.some((r) => r.iqs != null),
    roi: rows.some((r) => r.perfVsAvgCostPct != null),
    why: rows.some((r) => !!r.reasoning),
    bought: rows.some((r) => (r.totalPurchaseValue ?? 0) > 0),
    indicators: rows.some(
      (r) => r.hasCeoBuyer || r.hasRepeatBuyer || (r.distinctBuyers ?? 0) >= 2 || (r.totalPurchaseValue ?? 0) >= 1_000_000,
    ),
    lastUpdated: rows.some((r) => r.lastBuyDate || r.scoreUpdatedAt),
    pe: rows.some((r) => pe(r) != null),
    ownership: rows.some((r) => r.insiderOwnershipPct != null),
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
    const verdicts = new Set(rows.map((r) => r.insiderCoverage).filter(Boolean));
    if (!verdicts.size) return null;
    if (verdicts.has("lookup-unavailable"))
      return "We couldn’t check insider filings for every name on this list right now, so the insider columns are hidden.";
    if (verdicts.has("no-insider-buying"))
      return "No company on this list has open-market insider buying on record in the last 90 days, so the insider columns are hidden.";
    return "These listings aren’t in our SEC Form 4 coverage yet, so the insider columns are hidden.";
  })();

  return (
    <>
      <DataTable<StandardRow>
        rows={rows}
        rowKey={(r, i) => `${r.ticker || "row"}-${i}`}
        pageSize={pageSize}
        initialSort={{ key: "marketCap", dir: "desc" }}
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
