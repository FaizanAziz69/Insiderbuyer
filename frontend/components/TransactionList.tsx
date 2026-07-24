"use client";
import Link from "next/link";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { formatCurrency, formatDate, formatNumber } from "@/lib/api";

interface Tx {
  id: string;
  insiderName: string;
  role: string;
  rawTitle: string;
  transactionDate: string;
  sharesBought: string | number;
  pricePerShare: string | number;
  totalValue: string | number;
  previousHoldings: string | number | null;
  postHoldings: string | number | null;
  filingUrl: string;
}

const ROLE_CLS: Record<string, string> = {
  CEO: "badge badge-gold",
  CFO: "badge badge-gold",
  COO: "badge badge-gold",
  Director: "badge badge-neutral",
  Other: "badge",
};

export function TransactionList({ transactions }: { transactions: Tx[] }) {
  if (!transactions.length) {
    return (
      <div className="card p-10 text-center text-sm text-mute">
        No qualifying open-market purchases in the last 90 days.
      </div>
    );
  }

  const columns: Column<Tx>[] = [
    rankColumn<Tx>(),
    {
      key: "insiderName",
      label: "Insider",
      filterable: true,
      sortValue: (t) => t.insiderName,
      render: (t) => (
        <>
          <Link href={`/insiders/${encodeURIComponent(t.insiderName)}`}
            className="block font-bold text-[15px] hover:text-accent transition">{t.insiderName}</Link>
          {t.rawTitle && (
            <div className="text-[12px] text-mute truncate max-w-[220px]">
              {t.rawTitle}
            </div>
          )}
        </>
      ),
    },
    {
      key: "role",
      label: "Role",
      filterable: true,
      sortValue: (t) => t.role,
      render: (t) => {
        const shares = Number(t.sharesBought);
        const prev = t.previousHoldings ? Number(t.previousHoldings) : 0;
        const stakeChange = prev > 0 ? (shares / prev) * 100 : null;
        const roleCls = ROLE_CLS[t.role] || ROLE_CLS.Other;
        return (
          <div className="flex items-center gap-2">
            <span className={roleCls}>{t.role}</span>
            {stakeChange !== null && (
              <span className="inline-flex items-center text-[11px] text-good">
                <ArrowUpRight className="h-3 w-3 mr-0.5" />
                +{stakeChange.toFixed(1)}%
              </span>
            )}
          </div>
        );
      },
    },
    {
      key: "transactionDate",
      label: "Date",
      filterable: true,
      sortValue: (t) => new Date(t.transactionDate).getTime(),
      render: (t) => <span className="text-mute text-[14px] font-bold tabular">{formatDate(t.transactionDate)}</span>,
    },
    {
      key: "sharesBought",
      label: "Shares",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => Number(t.sharesBought),
      render: (t) => <span className="tabular text-[14px] font-bold">{formatNumber(Number(t.sharesBought))}</span>,
    },
    {
      key: "pricePerShare",
      label: "Price",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => Number(t.pricePerShare),
      render: (t) => (
        <span className="tabular text-mute text-[14px] font-bold">${Number(t.pricePerShare).toFixed(2)}</span>
      ),
    },
    {
      key: "totalValue",
      label: "Value",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => Number(t.totalValue),
      render: (t) => (
        <span className="tabular font-bold text-[14px]">{formatCurrency(Number(t.totalValue))}</span>
      ),
    },
    {
      key: "filing",
      label: "Filing",
      sortable: false,
      render: (t) => (
        <a
          href={t.filingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-xs text-mute hover:text-accent"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          SEC
        </a>
      ),
    },
  ];

  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin">
        <DataTable<Tx>
          rows={transactions}
          rowKey={(t) => t.id}
          columns={columns}
        />
      </div>
    </div>
  );
}
