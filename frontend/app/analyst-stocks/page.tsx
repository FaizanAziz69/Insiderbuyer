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

/** One covered stock — consensus recommendation, coverage depth and the
 *  analyst-implied upside to the mean price target. Feeds the "Top Analyst
 *  Stocks" list (stocks Wall Street rates most highly), the stock-level
 *  counterpart to the individual-analyst ranking on /analyst-ratings. */
interface StockRow {
  symbol: string;
  name: string;
  sector: string | null;
  price: number;
  targetMean: number | null;
  targetHigh: number | null;
  targetLow: number | null;
  upsidePct: number | null;
  recommendation: string | null;
  numAnalysts: number | null;
  buyRatings: number | null;
  holdRatings: number | null;
  sellRatings: number | null;
  totalRatings: number | null;
}

const REC: Record<string, { label: string; color: string; rank: number }> = {
  strong_buy: { label: "Strong Buy", color: "var(--good)", rank: 5 },
  buy: { label: "Buy", color: "var(--good)", rank: 4 },
  hold: { label: "Hold", color: "var(--gold)", rank: 3 },
  underperform: { label: "Underperform", color: "var(--bad)", rank: 2 },
  sell: { label: "Sell", color: "var(--bad)", rank: 1 },
  strong_sell: { label: "Strong Sell", color: "var(--bad)", rank: 0 },
};
const recOf = (k: string | null) => (k ? REC[k] : undefined);

export default function AnalystStocksPage() {
  const [q, setQ] = useState("");
  const { data, isLoading } = useSWR<{ rows: StockRow[] }>(
    `${API_BASE}/market-stats/analyst-ratings`,
    fetcher,
    { refreshInterval: 30 * 60_000, revalidateOnFocus: false },
  );
  // Only genuinely covered names with a consensus rating belong on this list.
  // Top 100 only (client 2026-08-21: "top 100 kafi ha"): rank by consensus
  // strength, then analyst-implied upside, keep the best 100 and hand them to
  // the table already reversed so the display counts down #100 → #1 with #1
  // behind the wall. Spread before sort — the SWR-cached array must not mutate.
  const rows = [...(data?.rows || [])]
    .filter((r) => r.recommendation && r.price > 0)
    .sort(
      (a, b) =>
        (recOf(b.recommendation)?.rank ?? -1) - (recOf(a.recommendation)?.rank ?? -1) ||
        (b.upsidePct ?? -9999) - (a.upsidePct ?? -9999),
    )
    .slice(0, 100)
    .reverse()
    .filter(
      (r) =>
        !q ||
        r.symbol.toLowerCase().includes(q.toLowerCase()) ||
        (r.name || "").toLowerCase().includes(q.toLowerCase()) ||
        (r.sector || "").toLowerCase().includes(q.toLowerCase()),
    );

  const columns: Column<StockRow>[] = [
    // Paygated ranking (client 2026-08-21): count DOWN so the free rows are
    // the tail of the list and #1 sits behind the wall, like Top Insider Scores.
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
      key: "recommendation",
      label: "Analyst Consensus",
      sortValue: (r) => recOf(r.recommendation)?.rank ?? -1,
      render: (r) => {
        const rec = recOf(r.recommendation);
        if (!rec) return <span className="text-faint text-[12px]">—</span>;
        return (
          <span
            className="inline-flex items-center text-[11.5px] font-bold px-2 py-0.5 rounded-full"
            style={{ background: `color-mix(in srgb, ${rec.color} 15%, transparent)`, color: rec.color }}
          >
            {rec.label}
          </span>
        );
      },
    },
    {
      key: "buyRatings",
      label: "Buy Ratings",
      align: "right",
      info: "How many covering analysts rate the stock a Buy (Strong Buy + Buy), out of its total ratings. The Hold/Sell split is on each stock's Forecast tab.",
      sortValue: (r) => r.buyRatings ?? -1,
      render: (r) =>
        r.buyRatings == null || r.totalRatings == null ? (
          <span className="text-faint text-[12px]">—</span>
        ) : (
          <span className="tabular text-[13.5px]">
            <span className="font-bold" style={{ color: "var(--good)" }}>{r.buyRatings}</span>
            <span className="text-mute"> / {r.totalRatings} Buy</span>
          </span>
        ),
    },
    {
      key: "numAnalysts",
      label: "Top Analysts",
      align: "right",
      // Honest provenance: this is the sell-side consensus head-count, NOT a
      // count of the analysts on our /analyst-ratings leaderboard (no
      // per-symbol endpoint exists for those — see report).
      info: "How many Wall Street analysts hold a live rating on this stock, from the published sell-side consensus. Matches the Buy Ratings denominator. The individual analysts we rank on their own track record are on Top Analysts.",
      // Use the rating-breakdown total when present so the count never reads
      // lower than the Buy count (the two Yahoo fields can disagree).
      sortValue: (r) => r.totalRatings ?? r.numAnalysts ?? 0,
      render: (r) => (
        <span className="tabular text-[13px] text-mute">{r.totalRatings ?? r.numAnalysts ?? "—"}</span>
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
      label: "Price Target",
      align: "center",
      info: "Mean analyst price target and the implied upside/downside from the current price. Ranked highest upside first.",
      sortValue: (r) => r.upsidePct ?? -9999,
      render: (r) => <PriceTargetCell target={r.targetMean} upsidePct={r.upsidePct} />,
    },
    {
      key: "sector",
      label: "Sector",
      sortValue: (r) => r.sector || "",
      filterable: true,
      render: (r) => (
        <span className="text-[12.5px] text-mute">{r.sector || "—"}</span>
      ),
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
          The top 100 stocks Wall Street rates most highly right now — ranked
          by consensus recommendation and the analyst-implied upside to the
          mean price target, from every name with genuine sell-side coverage.
          Refreshed with live quotes. Informational, not investment advice.
        </p>
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
          <div className="text-center text-mute py-10">Loading analyst coverage…</div>
        ) : (
          <DataTable<StockRow>
            rows={rows}
            rowKey={(r) => r.symbol}
            empty="No covered stocks match your search."
            columns={columns}
            gate={{
              label: "Top Analyst Stocks",
              bullets: [
                "The top 100 stocks, ranked by consensus + upside down to #1",
                "Buy-rating counts from top Wall Street analysts",
                "Mean price targets and implied upside",
                "Updated with live quotes all session",
              ],
            }}
          />
        )}
      </div>

      <p className="text-[12px] text-mute leading-relaxed">
        Consensus and price targets are aggregated across covering analysts and
        refreshed intraday. Upside is the percentage move from the current price
        to the mean target. A stock appears here once it carries a published
        analyst consensus — informational, not investment advice.
      </p>
    </div>
  );
}
