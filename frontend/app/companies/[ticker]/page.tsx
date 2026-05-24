"use client";
import { use } from "react";
import useSWR from "swr";
import Link from "next/link";
import dynamic from "next/dynamic";
import { ArrowLeft, Building2, ExternalLink } from "lucide-react";
import { API_BASE, CompanyDetail, fetcher, formatCurrency, formatDecimal } from "@/lib/api";

const TransactionList = dynamic(
  () => import("@/components/TransactionList").then((m) => m.TransactionList),
  {
    ssr: false,
    loading: () => <div className="card h-64 animate-pulse" />,
  },
);

export default function CompanyPage({ params }: { params: Promise<{ ticker: string }> }) {
  const { ticker } = use(params);
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false },
  );

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      <Link
        href="/companies"
        className="inline-flex items-center gap-1.5 text-xs text-mute hover:text-accent transition"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to companies
      </Link>

      {isLoading || !data ? (
        <div className="card p-10 h-40 animate-pulse" />
      ) : !data.company ? (
        <div className="card p-10 text-center text-mute">Company not found.</div>
      ) : (
        <>
          <div className="card p-6 sm:p-7 relative overflow-hidden">
            <div className="flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-6">
              <div className="flex items-center gap-4">
                <div
                  className="h-14 w-14 rounded-xl flex items-center justify-center"
                  style={{ background: "var(--bg-3)", border: "1px solid var(--border)" }}
                >
                  <Building2 className="h-6 w-6 text-soft" />
                </div>
                <div>
                  <div className="label-mini">{data.company.ticker || data.company.cik}</div>
                  <h1 className="text-2xl sm:text-3xl font-bold tracking-tight mt-1">
                    {data.company.name}
                  </h1>
                  <div className="flex flex-wrap gap-3 mt-2 text-xs text-mute">
                    {data.company.sector && (
                      <span
                        className="px-2 py-0.5 rounded-full border"
                        style={{ background: "var(--bg-3)", borderColor: "var(--border)" }}
                      >
                        {data.company.sector}
                      </span>
                    )}
                    {data.company.marketCap !== null && (
                      <span>Mkt cap {formatCurrency(data.company.marketCap)}</span>
                    )}
                    {data.company.lastPrice !== null && (
                      <span>Last ${data.company.lastPrice.toFixed(2)}</span>
                    )}
                  </div>
                </div>
              </div>

              {data.score && (
                <div className="sm:ml-auto flex items-center gap-5">
                  <div className="text-right">
                    <div className="label-mini">IQS</div>
                    <div className="text-3xl font-bold tabular mt-1">
                      {Number(data.score.iqs).toFixed(2)}
                    </div>
                  </div>
                  <div className="h-12 w-px" style={{ background: "var(--border)" }} />
                  <div className="text-right">
                    <div className="label-mini">Bought (90d)</div>
                    <div className="text-lg font-bold tabular text-accent mt-1">
                      {formatCurrency(data.score.totalPurchaseValue)}
                    </div>
                    <div className="text-[11px] text-mute">
                      {data.score.distinctBuyers} insider
                      {data.score.distinctBuyers === 1 ? "" : "s"} ·{" "}
                      {data.score.transactionCount} txn
                      {data.score.transactionCount === 1 ? "" : "s"}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {data.score && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              <FactorCell
                label="Purchase Volume"
                hint="Total ÷ market cap"
                value={data.score.purchaseVolumeFactor}
              />
              <FactorCell
                label="Cluster"
                hint="log(1 + distinct buyers)"
                value={data.score.clusterFactor}
              />
              <FactorCell
                label="Role-Weighted"
                hint="CEO/CFO/COO=3×, Director=2×"
                value={data.score.roleWeightedVolume}
              />
              <FactorCell
                label="Holding Change"
                hint="Avg % increase in stake"
                value={data.score.holdingChangeFactor}
              />
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div className="text-[15px] font-semibold">Insider transactions</div>
                <div className="text-xs text-mute mt-0.5">Last 90 days · open-market buys only</div>
              </div>
            </div>
            <TransactionList transactions={data.transactions as any} />
          </div>
        </>
      )}
    </div>
  );
}

function FactorCell({
  label,
  hint,
  value,
}: {
  label: string;
  hint: string;
  value: number | string;
}) {
  return (
    <div className="card p-5">
      <div className="label-mini">{label}</div>
      <div className="text-[10px] text-faint mt-1">{hint}</div>
      <div className="text-2xl font-bold tabular tracking-tight mt-3">
        {formatDecimal(Number(value), 4)}
      </div>
    </div>
  );
}
