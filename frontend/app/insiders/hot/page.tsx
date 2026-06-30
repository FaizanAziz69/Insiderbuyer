"use client";
import useSWR from "swr";
import Link from "next/link";
import { Flame, Activity, ArrowUp, ArrowDown } from "lucide-react";
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
import { TierBadge } from "@/components/TierBadge";
import { Sparkline } from "@/components/Sparkline";
import { DataTable, Column } from "@/components/DataTable";

/**
 * Insider strategy signal — how strong/clustered the recent insider buying is,
 * mirroring TipRanks' "Insider Signal" (Very Positive / Positive / Neutral).
 * Driven by the IQS composite and the number of distinct insiders buying.
 */
function insiderSignal(r: RankingRow): { label: string; color: string; strength: number } {
  const buyers = r.distinctBuyers || 0;
  if (r.iqs >= 70 || buyers >= 4)
    return { label: "Very Positive", color: "var(--good)", strength: 92 };
  if (r.iqs >= 50 || buyers >= 2)
    return {
      label: "Positive",
      color: "color-mix(in srgb, var(--good) 70%, var(--warn))",
      strength: 64,
    };
  return { label: "Neutral", color: "var(--warn)", strength: 32 };
}

export default function InsiderHotStocksPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=100&live=1`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );

  const rows: RankingRow[] = data?.rows || [];

  // 7-day price sparklines — "recent stock behaviour" for each ticker.
  const tickerKey = rows
    .map((r) => (r.ticker || "").toUpperCase())
    .filter(Boolean)
    .slice(0, 60)
    .join(",");
  const { data: sparkData } = useSWR<{ spark: Record<string, number[]> }>(
    tickerKey ? `${API_BASE}/market-stats/spark?symbols=${tickerKey}` : null,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const sparkMap = sparkData?.spark || {};

  const columns: Column<RankingRow>[] = [
    {
      key: "rank",
      label: "#",
      sortable: false,
      className: "w-10",
      render: (_r, i) => (
        <span className="text-faint text-[12px] tabular">{i + 1}</span>
      ),
    },
    {
      key: "ticker",
      label: "Ticker",
      filterable: true,
      sortValue: (r) => r.ticker || "",
      render: (r) => {
        const ticker = r.ticker || "";
        return (
          <Link
            href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
            className="inline-flex items-center gap-2"
          >
            <CompanyLogo ticker={ticker} name={r.name} size={22} />
            <span className="font-mono text-[15px] font-bold text-accent hover:underline">
              {ticker || "—"}
            </span>
          </Link>
        );
      },
    },
    {
      key: "company",
      label: "Company",
      filterable: true,
      sortValue: (r) => r.name,
      render: (r) => (
        <span className="text-[14px] font-medium truncate max-w-[220px] inline-block align-middle" style={{ color: "var(--text)" }}>
          {r.name}
        </span>
      ),
    },
    {
      key: "iqs",
      label: "IQS",
      align: "center",
      sortValue: (r) => r.iqs,
      render: (r) => <TierBadge iqs={r.iqs} size="sm" />,
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
      key: "signal",
      label: "Insider Signal",
      align: "center",
      sortValue: (r) => insiderSignal(r).strength,
      render: (r) => {
        const s = insiderSignal(r);
        return (
          <div className="inline-flex flex-col items-stretch gap-1 min-w-[110px] align-middle">
            <div
              className="w-full h-2 rounded-full overflow-hidden"
              style={{ background: "var(--bg-3)" }}
            >
              <div
                className="h-full rounded-full"
                style={{ width: `${s.strength}%`, background: s.color }}
              />
            </div>
            <span
              className="text-[11px] font-bold whitespace-nowrap text-center"
              style={{ color: s.color }}
            >
              {s.label}
            </span>
          </div>
        );
      },
    },
    {
      key: "recent",
      label: "Recent (7D)",
      align: "center",
      sortable: false,
      render: (r) => <Sparkline data={sparkMap[(r.ticker || "").toUpperCase()]} />,
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
    {
      key: "avgCost",
      label: "Avg Cost",
      align: "right",
      sortValue: (r) => r.avgCost ?? null,
      render: (r) => (
        <span className="tabular text-[14px] font-bold">
          {r.avgCost != null ? `$${r.avgCost.toFixed(2)}` : "—"}
        </span>
      ),
    },
    {
      key: "lastBuyDate",
      label: "Last Buy",
      align: "right",
      sortValue: (r) => r.lastBuyDate ?? null,
      render: (r) => (
        <span className="tabular text-[14px] text-soft whitespace-nowrap">
          {formatDate(r.lastBuyDate)}
        </span>
      ),
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
          Insider Hot Stocks
        </h1>
        <p className="text-mute text-[14px] sm:text-[15px] mt-2 max-w-3xl leading-relaxed">
          U.S. companies seeing the most insider buying right now, ranked by our
          Insider Buying Quality Score (IQS).
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="insider-hot-top" />

      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-mute">Loading insider data…</div>
        ) : rows.length === 0 ? (
          <div className="p-12 text-center text-mute">
            No insider buying data available.
          </div>
        ) : (
          <DataTable<RankingRow>
            rows={rows}
            rowKey={(r, i) => (r.ticker || r.companyId || r.name || "") + i}
            initialSort={{ key: "iqs", dir: "desc" }}
            rowClassName="hover:bg-[var(--accent-soft)]"
            columns={columns}
          />
        )}
      </div>

      {/* How we rank */}
      <section className="card p-5 sm:p-6 max-w-4xl">
        <h2 className="text-[20px] font-bold tracking-tight mb-3">
          How we rank insider hot stocks
        </h2>
        <p className="text-[15px] text-soft leading-relaxed">
          Stocks are ranked by our Insider Buying Quality Score (IQS), a 0–100
          composite that weighs the dollar size of insider purchases relative to
          the company&rsquo;s market cap, the number of distinct insiders buying
          (a cluster of buyers carries more signal than a lone trade), the
          seniority of the buyers&rsquo; roles (a CEO or CFO buy outweighs a
          director&rsquo;s), and how much each insider grew their existing stake.
          The result is a feed of where corporate insiders are putting their own
          capital with the most conviction — informational, not a trade
          recommendation.
        </p>
      </section>
    </div>
  );
}
