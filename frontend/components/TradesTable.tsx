"use client";
import Link from "next/link";
import { ExternalLink, Lock } from "lucide-react";
import { DataTable, Column } from "@/components/DataTable";
import { rankColumn } from "@/components/tableColumns";
import { CompanyLogo } from "@/components/CompanyLogo";
import { WatchlistButton } from "@/components/WatchlistButton";
import { TradeRow, formatCurrency, formatDate, formatNumber } from "@/lib/api";

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
  const showPaywall = paywallAfter !== undefined && trades.length > paywallAfter;
  const visibleRows = showPaywall ? trades.slice(0, paywallAfter) : trades;
  const blurredRows = showPaywall ? trades.slice(paywallAfter!, paywallAfter! + 5) : [];

  const columns: Column<TradeRow>[] = [
    rankColumn<TradeRow>(),
    {
      key: "ticker",
      label: "Company",
      sortValue: (t) => t.ticker ?? "",
      render: (t) => {
        const ticker = t.ticker || "";
        return (
          <span className="inline-flex items-center gap-2">
            {ticker && <WatchlistButton ticker={ticker} variant="icon" size="sm" />}
            <Link
              href={ticker ? `/companies/${encodeURIComponent(ticker)}` : "#"}
              className="flex items-center gap-2"
            >
              <CompanyLogo ticker={ticker} name={t.companyName} size={22} />
              <div className="min-w-0">
                <div className="font-mono text-[14px] font-bold text-accent hover:underline">
                  {ticker || "—"}
                </div>
                <div className="text-[12px] font-medium truncate max-w-[150px]" style={{ color: "var(--text)" }}>
                  {t.companyName}
                </div>
              </div>
            </Link>
          </span>
        );
      },
    },
    {
      // Insider name + a single normalized role badge (CEO/CFO/COO/Director/
      // Other) shown on EVERY row, so the role is consistent and the filter is
      // by role — not by raw titles like "Chief Accounting Officer".
      key: "insider",
      label: "Insider",
      filterable: true,
      filterLabel: (t) => t.role,
      filterLabelText: "Role",
      sortValue: (t) => t.insiderName,
      render: (t) => (
        <div className="min-w-0" title={t.rawTitle || t.role}>
          <Link
            href={`/insiders/${encodeURIComponent(t.insiderName)}`}
            className="font-semibold text-[14px] truncate max-w-[190px] block hover:text-accent transition"
          >
            {t.insiderName}
          </Link>
          <span
            className={`${ROLE_CLS[t.role] || ROLE_CLS.Other} mt-0.5 inline-block`}
            style={{ fontSize: 10 }}
          >
            {t.role}
          </span>
        </div>
      ),
    },
    {
      key: "action",
      label: "Type",
      filterable: true,
      filterLabel: (t) => (t.type === "SELL" ? "SELL" : "BUY"),
      sortValue: (t) => (t.type === "SELL" ? "SELL" : "BUY"),
      render: (t) =>
        t.type === "SELL" ? (
          <span
            className="badge"
            style={{ background: "color-mix(in srgb, var(--bad) 16%, transparent)", color: "var(--bad)" }}
          >
            SELL
          </span>
        ) : (
          <span className="badge badge-buy">BUY</span>
        ),
    },
    {
      key: "sharesBought",
      label: "Shares",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => t.sharesBought,
      render: (t) => <span className="tabular text-[13px] font-bold">{formatNumber(t.sharesBought)}</span>,
    },
    {
      key: "totalValue",
      label: "Value",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => t.totalValue,
      render: (t) => (
        <span className="tabular text-[13px] font-bold">{formatCurrency(t.totalValue)}</span>
      ),
    },
    {
      key: "transactionDate",
      label: "Date",
      align: "right",
      sortValue: (t) => new Date(t.transactionDate).getTime(),
      render: (t) => (
        <span className="text-mute text-[13px] font-bold tabular whitespace-nowrap">{formatDate(t.transactionDate)}</span>
      ),
    },
    {
      key: "filing",
      label: "SEC",
      align: "center",
      sortable: false,
      render: (t) => (
        <a
          href={t.filingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center text-mute hover:text-accent"
          title="View Form 4 on SEC.gov"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      ),
    },
  ];

  return (
    <div className="card overflow-hidden relative">
      <div className="scrollbar-thin">
        <DataTable<TradeRow>
          rows={visibleRows}
          rowKey={(t) => t.id}
          initialSort={{ key: "totalValue", dir: "desc" }}
          columns={columns}
        />
      </div>

      {blurredRows.length > 0 && (
        <div className="overflow-x-auto scrollbar-thin">
          <table className="table-base">
            <tbody>
              {blurredRows.map((t, i) => (
                <tr key={t.id} className="paywall-blur pointer-events-none">
                  <Row t={t} rank={visibleRows.length + i + 1} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
      <td className="tabular text-[15px] font-bold" style={{ color: "var(--text)" }}>{rank}</td>
      <td>
        <span className="inline-flex items-center gap-2">
          {t.ticker && <WatchlistButton ticker={t.ticker} variant="icon" size="sm" />}
          <Link
            href={t.ticker ? `/companies/${encodeURIComponent(t.ticker)}` : "#"}
            className="flex items-center gap-2"
          >
            <CompanyLogo ticker={t.ticker || ""} name={t.companyName} size={22} />
            <div className="min-w-0">
              <div className="font-mono text-[14px] font-bold text-accent hover:underline">
                {t.ticker || "—"}
              </div>
              <div className="text-[12px] font-medium truncate max-w-[150px]" style={{ color: "var(--text)" }}>
                {t.companyName}
              </div>
            </div>
          </Link>
        </span>
      </td>
      <td>
        <Link href={`/insiders/${encodeURIComponent(t.insiderName)}`}
          className="block font-semibold text-[14px] truncate max-w-[190px] hover:text-accent transition">{t.insiderName}</Link>
        <span className={`${roleCls} mt-0.5 inline-block`} style={{ fontSize: 10 }}>{t.role}</span>
      </td>
      <td>
        <span className="badge badge-buy">BUY</span>
      </td>
      <td className="text-right tabular text-[13px] font-bold">{formatNumber(t.sharesBought)}</td>
      <td className="text-right tabular text-[13px] font-bold">{formatCurrency(t.totalValue)}</td>
      <td className="text-right text-mute text-[13px] font-bold tabular whitespace-nowrap">{formatDate(t.transactionDate)}</td>
      <td className="text-center">
        <a
          href={t.filingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center text-mute hover:text-accent"
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      </td>
    </>
  );
}
