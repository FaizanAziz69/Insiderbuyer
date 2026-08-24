"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { LineChart } from "lucide-react";
import { API_BASE, fetcher, formatCurrency } from "@/lib/api";
import { AdSlot } from "@/components/AdSlot";
import { DataTable, Column } from "@/components/DataTable";
import { CompanyLogo } from "@/components/CompanyLogo";
import { PriceTargetCell } from "@/components/PriceTargetCell";
import { rankColumn } from "@/components/tableColumns";

/**
 * Top Analyst Stocks — rebuilt on measured top-analyst coverage (client rule
 * 2026-08-24): a stock is only listed when at least five analysts whose OWN
 * success rate clears 70% carry a live price target on it, and the ranking is
 * that coverage combined with their accuracy and the upside to the average of
 * exactly those analysts' targets. Everything on the row comes from
 * /analysts/top-stocks — no vendor consensus head-count is involved.
 */
interface CoveringAnalyst {
  analyst: string;
  firm: string | null;
  slug: string;
  successRate: number;
  target: number;
  date: string;
}
interface StockRow {
  symbol: string;
  name: string;
  sector: string | null;
  exchange: string | null;
  price: number;
  marketCap: number | null;
  topAnalysts: number;
  avgSuccessRate: number;
  avgTarget: number;
  upsidePct: number;
  consensusTarget: number | null;
  lastRatedDaysAgo: number;
  score: number;
  analysts: CoveringAnalyst[];
}
interface Universe {
  topAnalysts: number;
  covered: number;
  qualifying: number;
  minTopAnalysts: number;
  minSuccessRate: number;
}

export default function AnalystStocksPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{
    rows: StockRow[];
    universe: Universe;
    generatedAt: string | null;
  }>(`${API_BASE}/analysts/top-stocks?limit=50`, fetcher, {
    refreshInterval: 30 * 60_000,
    revalidateOnFocus: false,
  });

  const u = data?.universe;
  // The payload is already qualified, scored and capped at 50 by the backend.
  // Reverse it so the display counts DOWN to #1 (client 2026-08-21, same as
  // Top Insider Scores) with the strongest name behind the wall. Spread first
  // — the SWR-cached array must never be mutated in place.
  const rows = [...(data?.rows || [])].reverse().filter(
    (r) =>
      !q ||
      r.symbol.toLowerCase().includes(q.toLowerCase()) ||
      (r.name || "").toLowerCase().includes(q.toLowerCase()) ||
      (r.sector || "").toLowerCase().includes(q.toLowerCase()),
  );

  const minRate = u?.minSuccessRate ?? 70;
  const minCount = u?.minTopAnalysts ?? 5;

  const columns: Column<StockRow>[] = [
    // Paygated ranking: count DOWN so the free rows are the tail of the list
    // and #1 sits behind the wall, like Top Insider Scores.
    rankColumn<StockRow>({ countdownFrom: rows.length }),
    {
      key: "symbol",
      label: "Company",
      sortValue: (r) => r.symbol,
      render: (r) => (
        <Link href={`/companies/${r.symbol}`} className="flex items-center gap-2.5 group">
          <span
            className="flex-shrink-0 rounded-md overflow-hidden bg-white flex items-center justify-center"
            style={{ width: 30, height: 30, padding: 3, border: "1px solid var(--border)" }}
          >
            <CompanyLogo ticker={r.symbol} name={r.name} size={24} />
          </span>
          <span className="min-w-0">
            <span className="block font-bold text-[13.5px] leading-tight group-hover:text-accent" style={{ color: "var(--text)" }}>
              {r.symbol}
            </span>
            <span className="block text-[11.5px] text-mute leading-tight truncate max-w-[190px]">{r.name}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "topAnalysts",
      label: "Top Analysts",
      align: "right",
      // Real provenance now: these are analysts from OUR leaderboard whose
      // measured success rate clears the floor — not a sell-side head-count.
      info: `How many top-rated analysts currently cover the stock. An analyst only counts here if their own measured success rate is ${minRate}% or better and their price target is less than a year old. A stock needs at least ${minCount} of them to appear on this list at all.`,
      sortValue: (r) => r.topAnalysts,
      render: (r) => (
        // Native title: the covering analysts, with no fixed-position portal
        // to mis-place under the site's body zoom.
        <span
          className="tabular text-[13.5px] font-bold cursor-help"
          style={{ color: "var(--text)" }}
          title={r.analysts
            .map((a) => `${a.analyst}${a.firm ? ` (${a.firm})` : ""} — ${a.successRate}% success, $${a.target.toFixed(2)} target, ${a.date}`)
            .join("\n")}
        >
          {r.topAnalysts}
        </span>
      ),
    },
    {
      key: "avgSuccessRate",
      label: "Their Success Rate",
      align: "right",
      info: "The average measured success rate of exactly those covering analysts — the share of their seasoned calls that moved in the direction their target implied.",
      sortValue: (r) => r.avgSuccessRate,
      render: (r) => (
        <span className="tabular text-[13.5px] font-bold" style={{ color: "var(--good)" }}>
          {r.avgSuccessRate.toFixed(1)}%
        </span>
      ),
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      sortValue: (r) => r.price,
      render: (r) => <span className="tabular text-[13.5px]">{formatCurrency(r.price)}</span>,
    },
    {
      key: "upside",
      label: "Avg Top-Analyst Target",
      align: "center",
      info: "The average of the covering top analysts' most recent price targets, and the implied move from the current price. This is their average only — the wider sell-side consensus is in the next column.",
      sortValue: (r) => r.upsidePct,
      render: (r) => <PriceTargetCell target={r.avgTarget} upsidePct={r.upsidePct} />,
    },
    {
      key: "consensusTarget",
      label: "Consensus Target",
      align: "right",
      info: "The full sell-side consensus target for the same stock, shown for context. It does not affect the ranking on this page.",
      sortValue: (r) => r.consensusTarget ?? -1,
      render: (r) =>
        r.consensusTarget == null ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span className="tabular text-[13px] text-mute">${r.consensusTarget.toFixed(2)}</span>
        ),
    },
    {
      key: "score",
      label: "Analyst Score",
      align: "right",
      info: "The ranking figure: how many top analysts cover the stock, weighted by their average success rate and the upside to their average price target. Higher is stronger conviction from analysts with a track record.",
      sortValue: (r) => r.score,
      render: (r) => (
        <span className="tabular text-[13.5px] font-bold" style={{ color: "var(--accent)" }}>
          {r.score.toFixed(2)}
        </span>
      ),
    },
    {
      key: "sector",
      label: "Sector",
      sortValue: (r) => r.sector || "",
      filterable: true,
      render: (r) => <span className="text-[12.5px] text-mute">{r.sector || "—"}</span>,
    },
  ];

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <LineChart className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Top Analyst Stocks</span>
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Top Analyst Stocks
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-3 max-w-4xl leading-relaxed">
          Up to the top 50 stocks backed by Wall Street&rsquo;s most accurate
          analysts. A stock only makes this list when at least {minCount}{" "}
          analysts with a measured success rate of {minRate}% or better hold a
          live price target on it, and the ranking combines how many of those
          analysts cover it, how accurate they have been, and the upside to the
          average of their targets. Informational, not investment advice.
        </p>
        {u && (
          <p className="text-faint text-[12.5px] mt-2 max-w-4xl leading-relaxed">
            Right now {u.qualifying.toLocaleString()}{" "}
            {u.qualifying === 1 ? "stock clears" : "stocks clear"} that bar, out
            of {u.covered.toLocaleString()} carrying a live target from at least
            one of the {u.topAnalysts.toLocaleString()} analysts above{" "}
            {minRate}% on our leaderboard. The list grows as more of their calls
            season into a measured track record.
          </p>
        )}
      </header>

      <Link
        href="/analyst-ratings"
        className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-accent hover:underline"
      >
        See the analysts behind these calls, ranked by track record →
      </Link>

      <AdSlot slot="leaderboard" seed="analyst-stocks" />

      <div
        className="card p-4"
        style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
      >
        <label className="block text-[11px] uppercase tracking-wider font-bold text-mute mb-1">
          Search
        </label>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ticker, company or sector…"
          className="w-full sm:max-w-xs px-3 py-2 rounded-md text-[13px]"
          style={{
            background: "var(--bg-1)",
            border: "1px solid var(--border-strong)",
            color: "var(--text)",
          }}
        />
      </div>

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="text-center text-mute py-10">Loading top-analyst coverage…</div>
        ) : (
          <DataTable<StockRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            empty={
              q
                ? "No qualifying stocks match your search."
                : `No stock currently carries live targets from ${minCount} or more analysts above ${minRate}%.`
            }
            columns={columns}
            gate={{
              label: "Top Analyst Stocks",
              bullets: [
                `Only stocks covered by ${minCount}+ analysts above ${minRate}% success`,
                "Their average price target and the upside to it",
                "Ranked by coverage, accuracy and upside — counted down to #1",
                "Re-priced with live quotes all session",
              ],
            }}
          />
        )}
      </div>

      <p className="text-[12px] text-mute leading-relaxed">
        Success rates are measured from each analyst&rsquo;s own past price
        targets — the share of their seasoned calls (30 days or older) that
        moved in the direction the target implied — so only analysts with a real
        track record can put a stock on this list. Targets older than a year are
        treated as history, not live coverage. Upside is the move from the
        current price to the covering analysts&rsquo; average target.
        Informational, not investment advice.
      </p>
    </div>
  );
}
