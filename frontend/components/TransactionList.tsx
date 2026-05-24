"use client";
import { ArrowUpRight, ExternalLink } from "lucide-react";
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
  return (
    <div className="card overflow-hidden">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="table-base">
          <thead>
            <tr>
              <th>Insider</th>
              <th>Role</th>
              <th>Date</th>
              <th className="text-right">Shares</th>
              <th className="text-right">Price</th>
              <th className="text-right">Value</th>
              <th>Filing</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((t) => {
              const shares = Number(t.sharesBought);
              const price = Number(t.pricePerShare);
              const value = Number(t.totalValue);
              const prev = t.previousHoldings ? Number(t.previousHoldings) : 0;
              const stakeChange = prev > 0 ? (shares / prev) * 100 : null;
              const roleCls = ROLE_CLS[t.role] || ROLE_CLS.Other;
              return (
                <tr key={t.id}>
                  <td>
                    <div className="font-semibold text-sm">{t.insiderName}</div>
                    {t.rawTitle && (
                      <div className="text-[11px] text-mute truncate max-w-[220px]">
                        {t.rawTitle}
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="flex items-center gap-2">
                      <span className={roleCls}>{t.role}</span>
                      {stakeChange !== null && (
                        <span className="inline-flex items-center text-[11px] text-good">
                          <ArrowUpRight className="h-3 w-3 mr-0.5" />
                          +{stakeChange.toFixed(1)}%
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="text-mute">{formatDate(t.transactionDate)}</td>
                  <td className="text-right tabular">{formatNumber(shares)}</td>
                  <td className="text-right tabular text-mute">${price.toFixed(2)}</td>
                  <td className="text-right tabular font-semibold">{formatCurrency(value)}</td>
                  <td>
                    <a
                      href={t.filingUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-mute hover:text-accent"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      SEC
                    </a>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
