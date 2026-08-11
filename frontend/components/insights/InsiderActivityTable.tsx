"use client";
import useSWR from "swr";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
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

type InsiderTx = CompanyDetail["transactions"][number];

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

  const columns: Column<InsiderTx>[] = [
    rankColumn<InsiderTx>(),
    {
      key: "insiderName",
      label: "Insider",
      filterable: true,
      sortValue: (t) => t.insiderName,
      render: (t) => (
        <Link href={`/insiders/${encodeURIComponent(t.insiderName)}`}
          className="font-bold text-[15px] max-w-[200px] truncate inline-block align-bottom hover:text-accent transition">
          {t.insiderName}
        </Link>
      ),
    },
    {
      key: "role",
      label: "Role",
      filterable: true,
      sortValue: (t) => t.role || "Insider",
      render: (t) => (
        <span
          className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded"
          style={{
            background: "var(--accent-soft)",
            color: "var(--accent)",
          }}
        >
          {t.role || "Insider"}
        </span>
      ),
    },
    {
      key: "sharesBought",
      label: "Shares",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => Number(t.sharesBought),
      render: (t) => (
        <span className="tabular text-[14px] font-bold">{formatNumber(Number(t.sharesBought))}</span>
      ),
    },
    {
      key: "pricePerShare",
      label: "Price",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => Number(t.pricePerShare),
      render: (t) => (
        <span className="tabular text-[14px] font-bold">${Number(t.pricePerShare).toFixed(2)}</span>
      ),
    },
    {
      key: "totalValue",
      label: "Total Value",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => Number(t.totalValue),
      render: (t) => (
        <span className="tabular text-[14px] font-bold text-good">
          {formatCurrency(Number(t.totalValue))}
        </span>
      ),
    },
    {
      key: "transactionDate",
      label: "Date",
      filterable: true,
      align: "right",
      sortValue: (t) => new Date(t.transactionDate).getTime(),
      // Without this the select dropdown falls back to sortValue (a raw unix
      // timestamp); show formatted dates instead.
      filterLabel: (t) => formatDate(t.transactionDate),
      render: (t) => (
        <span className="tabular text-[14px] font-bold text-mute whitespace-nowrap">
          {formatDate(t.transactionDate)}
        </span>
      ),
    },
  ];

  return (
    <section className="my-8">
      <div className="flex items-baseline justify-between mb-3">
        <h2
          className="font-semibold tracking-tight"
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
        <DataTable<InsiderTx>
          rows={txs}
          rowKey={(t) => t.id}
          columns={columns}
        />
      </div>
      <p className="text-[11px] text-faint mt-2">
        Source: SEC EDGAR Form 4 filings. Open-market purchases only.
      </p>
    </section>
  );
}
