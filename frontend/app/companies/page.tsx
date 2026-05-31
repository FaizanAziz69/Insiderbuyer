"use client";
import useSWR from "swr";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { API_BASE, RankingRow, RankingsResponse, fetcher, formatCurrency } from "@/lib/api";
import { TierBadge } from "@/components/TierBadge";
import { PremiumGate } from "@/components/PremiumGate";

export default function CompaniesPage() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=200`,
    fetcher,
  );

  const top3 = data?.rows.slice(0, 3) || [];
  const rest = data?.rows.slice(3) || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      <header>
        <h1 className="text-[24px] font-bold tracking-tight">Companies by IQS</h1>
        <p className="text-mute text-sm mt-1">
          U.S. public companies ranked by the Insider Buying Quality Score, descending.
        </p>
      </header>

      {/* Premium-gated top 3 */}
      {top3.length > 0 && (
        <PremiumGate label="picks" count={3}>
          <div className="card overflow-hidden m-0" style={{ border: "none" }}>
            <table className="table-base">
              <thead>
                <tr>
                  <th className="w-12">#</th>
                  <th>Ticker</th>
                  <th>Tier</th>
                  <th>Company</th>
                  <th>Sector</th>
                  <th className="text-right">IQS</th>
                  <th className="text-right">Bought</th>
                </tr>
              </thead>
              <tbody>
                {top3.map((r) => (
                  <Row key={r.companyId} r={r} compact />
                ))}
              </tbody>
            </table>
          </div>
        </PremiumGate>
      )}

      {/* Free rows */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto scrollbar-thin">
          <table className="table-base">
            <thead>
              <tr>
                <th className="w-12">#</th>
                <th>Ticker</th>
                <th>Tier</th>
                <th>Company</th>
                <th>Sector</th>
                <th className="text-right">IQS</th>
                <th className="text-right">Buyers</th>
                <th className="text-right">Trades</th>
                <th className="text-right">Bought</th>
                <th className="text-right">Mkt cap</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {isLoading || !data ? (
                <tr>
                  <td colSpan={11} className="text-center text-mute py-10">
                    Loading…
                  </td>
                </tr>
              ) : rest.length === 0 ? (
                <tr>
                  <td colSpan={11} className="text-center text-mute py-10">
                    No more companies ranked yet.
                  </td>
                </tr>
              ) : (
                rest.map((r) => <Row key={r.companyId} r={r} />)
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function Row({ r, compact = false }: { r: RankingRow; compact?: boolean }) {
  return (
    <tr>
      <td className="text-faint tabular text-xs">{r.rank}</td>
      <td>
        {r.ticker ? (
          <Link
            href={`/companies/${encodeURIComponent(r.ticker)}`}
            className="font-semibold text-accent hover:underline font-mono"
          >
            {r.ticker}
          </Link>
        ) : (
          "—"
        )}
      </td>
      <td>
        <TierBadge iqs={r.iqs} size="sm" />
      </td>
      <td className="truncate max-w-[260px]">{r.name}</td>
      <td className="text-mute text-xs truncate max-w-[180px]">{r.sector || "—"}</td>
      <td className="text-right tabular font-semibold">{r.iqs.toFixed(2)}</td>
      {compact ? (
        <td className="text-right tabular text-accent font-semibold">
          {formatCurrency(r.totalPurchaseValue)}
        </td>
      ) : (
        <>
          <td className="text-right tabular">{r.distinctBuyers}</td>
          <td className="text-right tabular text-mute">{r.transactionCount}</td>
          <td className="text-right tabular text-accent font-semibold">
            {formatCurrency(r.totalPurchaseValue)}
          </td>
          <td className="text-right tabular text-mute">{formatCurrency(r.marketCap)}</td>
          <td>
            {r.ticker && (
              <Link
                href={`/companies/${encodeURIComponent(r.ticker)}`}
                className="inline-flex items-center text-mute hover:text-accent"
              >
                <ChevronRight className="h-4 w-4" />
              </Link>
            )}
          </td>
        </>
      )}
    </tr>
  );
}
