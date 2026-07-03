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
                <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                  {ticker || "—"}
                </div>
                <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                  {t.companyName}
                </div>
              </div>
            </Link>
          </span>
        );
      },
    },
    {
      key: "marketCap",
      label: "Market Cap",
      filterable: true,
      filterType: "marketCapPreset",
      filterLabelText: "Market Cap",
      align: "right",
      sortValue: (t) => t.marketCap ?? null,
      render: (t) => (
        <span className="tabular text-mute text-[14px] font-bold">
          {t.marketCap ? formatCurrency(t.marketCap) : "—"}
        </span>
      ),
    },
    {
      key: "insiderName",
      label: "Insider",
      sortValue: (t) => t.insiderName,
      render: (t) => (
        <>
          <div className="font-bold text-[15px]">{t.insiderName}</div>
          {t.rawTitle && (
            <div className="text-[12px] text-mute truncate max-w-[200px]">{t.rawTitle}</div>
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
        const roleCls = ROLE_CLS[t.role] || ROLE_CLS.Other;
        return <span className={roleCls}>{t.role}</span>;
      },
    },
    {
      key: "action",
      label: "Action",
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
      render: (t) => <span className="tabular text-[14px] font-bold">{formatNumber(t.sharesBought)}</span>,
    },
    {
      key: "totalValue",
      label: "Value",
      filterable: true,
      filterType: "range",
      align: "right",
      sortValue: (t) => t.totalValue,
      render: (t) => (
        <span className="tabular text-[14px] font-bold">{formatCurrency(t.totalValue)}</span>
      ),
    },
    {
      key: "transactionDate",
      label: "Date",
      filterable: true,
      filterLabel: (t) => formatDate(t.transactionDate),
      align: "right",
      sortValue: (t) => new Date(t.transactionDate).getTime(),
      render: (t) => (
        <span className="text-mute text-[14px] font-bold tabular">{formatDate(t.transactionDate)}</span>
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
    <div className="card overflow-hidden relative">
      <div className="scrollbar-thin">
        <DataTable<TradeRow>
          rows={visibleRows}
          rowKey={(t) => t.id}
          initialSort={{ key: "marketCap", dir: "desc" }}
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
              <div className="font-mono text-[15px] font-bold text-accent hover:underline">
                {t.ticker || "—"}
              </div>
              <div className="text-[13px] font-medium truncate max-w-[200px]" style={{ color: "var(--text)" }}>
                {t.companyName}
              </div>
            </div>
          </Link>
        </span>
      </td>
      <td className="text-right tabular text-mute text-[14px] font-bold">
        {t.marketCap ? formatCurrency(t.marketCap) : "—"}
      </td>
      <td>
        <div className="font-bold text-[15px]">{t.insiderName}</div>
        {t.rawTitle && <div className="text-[12px] text-mute truncate max-w-[200px]">{t.rawTitle}</div>}
      </td>
      <td>
        <span className={roleCls}>{t.role}</span>
      </td>
      <td>
        <span className="badge badge-buy">BUY</span>
      </td>
      <td className="text-right tabular text-[14px] font-bold">{formatNumber(t.sharesBought)}</td>
      <td className="text-right tabular text-[14px] font-bold">{formatCurrency(t.totalValue)}</td>
      <td className="text-right text-mute text-[14px] font-bold tabular">{formatDate(t.transactionDate)}</td>
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
