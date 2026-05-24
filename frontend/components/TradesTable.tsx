"use client";
import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { useMemo, useState } from "react";
import { TradeRow, formatCurrency, formatDate, formatNumber } from "@/lib/api";

type SortKey = "transactionDate" | "totalValue" | "sharesBought" | "insiderName" | "ticker";

const ROLE_CLS: Record<string, string> = {
  CEO: "badge badge-gold",
  CFO: "badge badge-gold",
  COO: "badge badge-gold",
  Director: "badge badge-neutral",
  Other: "badge",
};

export function TradesTable({
  trades,
  total,
  paywallAfter,
}: {
  trades: TradeRow[];
  total: number;
  paywallAfter?: number;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("transactionDate");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const sorted = useMemo(() => {
    const arr = [...trades];
    arr.sort((a, b) => {
      const av = (a as any)[sortKey];
      const bv = (b as any)[sortKey];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [trades, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  }

  function sortIndicator(k: SortKey) {
    if (sortKey !== k) return null;
    return <span className="text-faint ml-1">{sortDir === "asc" ? "↑" : "↓"}</span>;
  }

  const showPaywall = paywallAfter !== undefined && sorted.length > paywallAfter;
  const visibleRows = showPaywall ? sorted.slice(0, paywallAfter) : sorted;
  const blurredRows = showPaywall ? sorted.slice(paywallAfter!, paywallAfter! + 5) : [];

  return (
    <div className="card overflow-hidden relative">
      <div className="overflow-x-auto scrollbar-thin">
        <table className="table-base">
          <thead>
            <tr>
              <th className="w-12">#</th>
              <th onClick={() => toggleSort("insiderName")} className="cursor-pointer select-none">
                Insider {sortIndicator("insiderName")}
              </th>
              <th onClick={() => toggleSort("ticker")} className="cursor-pointer select-none">
                Company {sortIndicator("ticker")}
              </th>
              <th>Role</th>
              <th>Action</th>
              <th
                onClick={() => toggleSort("sharesBought")}
                className="cursor-pointer select-none text-right"
              >
                Shares {sortIndicator("sharesBought")}
              </th>
              <th
                onClick={() => toggleSort("totalValue")}
                className="cursor-pointer select-none text-right"
              >
                Value {sortIndicator("totalValue")}
              </th>
              <th
                onClick={() => toggleSort("transactionDate")}
                className="cursor-pointer select-none text-right"
              >
                Date {sortIndicator("transactionDate")}
              </th>
              <th>Filing</th>
            </tr>
          </thead>
          <tbody>
            {visibleRows.map((t, i) => (
              <tr key={t.id}>
                <Row t={t} rank={i + 1} />
              </tr>
            ))}
            {blurredRows.map((t, i) => (
              <tr key={t.id} className="paywall-blur">
                <Row t={t} rank={visibleRows.length + i + 1} />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {showPaywall && (
        <div
          className="px-5 py-6 text-center border-t"
          style={{ borderColor: "var(--border)", background: "var(--bg-2)" }}
        >
          <Lock className="h-5 w-5 text-mute mx-auto mb-2" />
          <div className="text-sm text-soft mb-1">
            Showing {visibleRows.length} of {total} trades
          </div>
          <div className="text-xs text-mute mb-3">
            Unlock the full table, screener, real-time alerts, and AI insights.
          </div>
          <Link href="/premium" className="btn-primary">
            Unlock all →
          </Link>
        </div>
      )}
      {!showPaywall && total > visibleRows.length && (
        <div
          className="px-5 py-3 text-xs text-mute text-center border-t"
          style={{ borderColor: "var(--border)" }}
        >
          Showing {visibleRows.length} of {total} trades
        </div>
      )}
    </div>
  );
}

function Row({ t, rank }: { t: TradeRow; rank: number }) {
  const roleCls = ROLE_CLS[t.role] || ROLE_CLS.Other;
  return (
    <>
      <td className="text-faint tabular text-xs">{rank}</td>
      <td>
        <div className="font-semibold text-sm">{t.insiderName}</div>
        {t.rawTitle && <div className="text-[11px] text-mute truncate max-w-[200px]">{t.rawTitle}</div>}
      </td>
      <td>
        {t.ticker ? (
          <Link
            href={`/companies/${encodeURIComponent(t.ticker)}`}
            className="font-semibold text-accent hover:underline font-mono text-sm"
          >
            {t.ticker}
          </Link>
        ) : (
          <span className="text-faint">—</span>
        )}
        <div className="text-[11px] text-mute truncate max-w-[180px]">{t.companyName}</div>
      </td>
      <td>
        <span className={roleCls}>{t.role}</span>
      </td>
      <td>
        <span className="badge badge-buy">BUY</span>
      </td>
      <td className="text-right tabular">{formatNumber(t.sharesBought)}</td>
      <td className="text-right tabular font-semibold">{formatCurrency(t.totalValue)}</td>
      <td className="text-right text-mute text-xs">{formatDate(t.transactionDate)}</td>
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
    </>
  );
}
