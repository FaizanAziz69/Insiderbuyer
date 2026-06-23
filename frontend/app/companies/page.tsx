"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { API_BASE, RankingRow, RankingsResponse, fetcher, formatCurrency } from "@/lib/api";
import { TierBadge } from "@/components/TierBadge";
import { PremiumGate } from "@/components/PremiumGate";
import { DataTable, Column } from "@/components/DataTable";

// Shared column definitions — reused by both the free and paywall tables.
const rankCol: Column<RankingRow> = {
  key: "rank",
  label: "#",
  sortable: false,
  className: "w-12",
  render: (r) => <span className="text-faint tabular text-[11px]">{r.rank}</span>,
};

const tickerCol: Column<RankingRow> = {
  key: "ticker",
  label: "Ticker",
  filterable: true,
  sortValue: (r) => r.ticker ?? "",
  render: (r) =>
    r.ticker ? (
      <Link
        href={`/companies/${encodeURIComponent(r.ticker)}`}
        className="font-bold text-accent hover:underline font-mono text-[15px]"
      >
        {r.ticker}
      </Link>
    ) : (
      "—"
    ),
};

const tierCol: Column<RankingRow> = {
  key: "tier",
  label: "Tier",
  filterable: true,
  sortValue: (r) => r.iqs,
  render: (r) => <TierBadge iqs={r.iqs} size="sm" />,
};

const companyCol: Column<RankingRow> = {
  key: "company",
  label: "Company",
  filterable: true,
  sortValue: (r) => r.name,
  render: (r) => <span className="truncate max-w-[260px] text-[12px]">{r.name}</span>,
};

const sectorCol: Column<RankingRow> = {
  key: "sector",
  label: "Sector",
  filterable: true,
  sortValue: (r) => r.sector ?? "",
  render: (r) => (
    <span className="text-mute text-[12px] truncate max-w-[180px]">{r.sector || "—"}</span>
  ),
};

const iqsCol: Column<RankingRow> = {
  key: "iqs",
  label: "IQS",
  filterable: true,
  filterType: "range",
  align: "right",
  sortValue: (r) => r.iqs,
  render: (r) => <span className="tabular font-bold text-[14px]">{r.iqs.toFixed(1)}</span>,
};

const boughtCol: Column<RankingRow> = {
  key: "bought",
  label: "Bought",
  filterable: true,
  filterType: "range",
  align: "right",
  sortValue: (r) => r.totalPurchaseValue,
  render: (r) => (
    <span className="tabular text-accent font-bold text-[14px]">
      {formatCurrency(r.totalPurchaseValue)}
    </span>
  ),
};

export default function CompaniesPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=200`,
    fetcher,
  );

  // Top-5 are premium-gated; rest are free.
  // Display order counts DOWN: free rows N → 6 on top, blurred 5 → 1 at bottom.
  const top5Desc = [...(data?.rows.slice(0, 5) || [])].reverse();
  const restDesc = [...(data?.rows.slice(5) || [])].reverse();

  const freeColumns: Column<RankingRow>[] = [
    rankCol,
    tickerCol,
    tierCol,
    companyCol,
    sectorCol,
    iqsCol,
    {
      key: "buyers",
      label: "Buyers",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.distinctBuyers,
      render: (r) => <span className="tabular text-[14px] font-bold">{r.distinctBuyers}</span>,
    },
    {
      key: "trades",
      label: "Trades",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.transactionCount,
      render: (r) => <span className="tabular text-mute text-[14px] font-bold">{r.transactionCount}</span>,
    },
    boughtCol,
    {
      key: "mktcap",
      label: "Mkt cap",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (r) => r.marketCap,
      render: (r) => (
        <span className="tabular text-mute text-[14px] font-bold">{formatCurrency(r.marketCap)}</span>
      ),
    },
    {
      key: "action",
      label: "",
      sortable: false,
      render: (r) =>
        r.ticker ? (
          <Link
            href={`/companies/${encodeURIComponent(r.ticker)}`}
            className="inline-flex items-center text-mute hover:text-accent"
          >
            <ChevronRight className="h-4 w-4" />
          </Link>
        ) : null,
    },
  ];

  const compactColumns: Column<RankingRow>[] = [
    rankCol,
    tickerCol,
    tierCol,
    companyCol,
    sectorCol,
    iqsCol,
    boughtCol,
  ];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Companies by IQS</h1>
        <p className="text-mute text-sm mt-1">
          U.S. public companies ranked by the Insider Buying Quality Score. Highest scores at the
          bottom — top 5 are premium.
        </p>
      </header>

      {/* Free rows — highest rank at top, counts down to rank 6 */}
      <div className="card overflow-hidden">
        {isLoading || !data ? (
          <div className="text-center text-mute py-10">Loading…</div>
        ) : (
          <DataTable<RankingRow>
            rows={restDesc}
            rowKey={(r) => r.companyId}
            empty="No more companies ranked yet."
            columns={freeColumns}
          />
        )}
      </div>

      {/* Premium-gated top 5 — rendered last so it sits at the bottom of the page */}
      {top5Desc.length > 0 && (
        <PremiumGate label="picks" count={5}>
          <div className="card overflow-hidden m-0" style={{ border: "none" }}>
            <DataTable<RankingRow>
              rows={top5Desc}
              rowKey={(r) => r.companyId}
              columns={compactColumns}
            />
          </div>
        </PremiumGate>
      )}
    </div>
  );
}
