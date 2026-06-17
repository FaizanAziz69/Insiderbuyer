"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
  formatNumber,
} from "@/lib/api";

interface Props {
  ticker: string;
  limit?: number;
}

/** Inline article widget — the recent Form 4 insider transactions behind the
 *  story. Same role as MarketBeat's embedded comparative table. */
export function InsiderActivityTable({ ticker, limit = 6 }: Props) {
  const { data, isLoading } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(ticker)}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 5 * 60_000 },
  );

  if (isLoading && !data) {
    return <div className="shimmer rounded-lg my-8" style={{ height: 220 }} />;
  }
  // Open-market purchases only — matches the footnote below.
  const txs = (data?.transactions || [])
    .filter((t) => t.transactionCode === "P")
    .slice(0, limit);
  if (txs.length === 0) return null;

  return (
    <section className="my-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="font-bold tracking-tight"
          style={{ fontSize: 22, letterSpacing: "-0.3px" }}
        >
          Recent Insider Activity — {ticker}
        </h2>
        <Link
          href={`/companies/${encodeURIComponent(ticker)}`}
          className="text-[12px] font-bold text-accent hover:underline uppercase tracking-wider inline-flex items-center gap-0.5"
        >
          All filings <ArrowUpRight className="h-3 w-3" />
        </Link>
      </div>
      <div
        className="rounded-lg overflow-hidden"
        style={{ border: "1px solid var(--border)" }}
      >
        <div className="overflow-x-auto">
          <table className="table-base w-full">
            <thead>
              <tr>
                <th>Insider</th>
                <th>Role</th>
                <th className="text-right">Shares</th>
                <th className="text-right">Price</th>
                <th className="text-right">Total Value</th>
                <th className="text-right">Date</th>
              </tr>
            </thead>
            <tbody>
              {txs.map((t) => (
                <tr key={t.id}>
                  <td className="font-semibold text-[13px] max-w-[200px] truncate">
                    {t.insiderName}
                  </td>
                  <td>
                    <span
                      className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
                      style={{
                        background: "var(--accent-soft)",
                        color: "var(--accent)",
                      }}
                    >
                      {t.role || "Insider"}
                    </span>
                  </td>
                  <td className="text-right tabular text-[13px]">
                    {formatNumber(Number(t.sharesBought))}
                  </td>
                  <td className="text-right tabular text-[13px]">
                    ${Number(t.pricePerShare).toFixed(2)}
                  </td>
                  <td className="text-right tabular text-[13px] font-bold text-good">
                    {formatCurrency(Number(t.totalValue))}
                  </td>
                  <td className="text-right tabular text-[12px] text-mute whitespace-nowrap">
                    {formatDate(t.transactionDate)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-[11px] text-faint mt-2">
        Source: SEC EDGAR Form 4 filings. Open-market purchases only.
      </p>
    </section>
  );
}
