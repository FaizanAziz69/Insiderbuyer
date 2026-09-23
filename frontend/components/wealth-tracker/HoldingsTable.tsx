"use client";
import { useState } from "react";
import Link from "next/link";
import { Download, Lock } from "lucide-react";
import { CompanyLogo } from "@/components/CompanyLogo";
import { DataTable, Column } from "@/components/DataTable";
import { PremiumRowWall } from "@/components/premium/PremiumRowWall";
import { usePremium } from "@/components/premium/PremiumContext";
import { API_BASE, formatCurrency, formatDate } from "@/lib/api";
import { getAuthToken } from "@/lib/auth";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { pct } from "./types";
import type { WtHolding } from "./types";

/**
 * Current holdings (Brief v7 §2.4): ticker, est. shares, est. price paid,
 * current price, up/down %, first-bought, last-action. Free sees the top 5;
 * Insider Access sees the depth and can export. The API already withholds
 * the rows past five for a guest, so the wall here reflects what was served.
 */
export function HoldingsTable({
  holdings,
  total,
  locked,
  bioguide,
  memberName,
}: {
  holdings: WtHolding[];
  total: number;
  locked: boolean;
  bioguide: string;
  memberName: string;
}) {
  const { unlocked } = usePremium();
  const [busy, setBusy] = useState(false);

  const download = async () => {
    const token = getAuthToken();
    if (!token) return;
    setBusy(true);
    try {
      const res = await fetch(`${API_BASE}/wealth-tracker/member/export.csv?bioguide=${encodeURIComponent(bioguide)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${memberName.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-disclosed-holdings.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } finally {
      setBusy(false);
    }
  };

  const cols: Column<WtHolding>[] = [
    {
      key: "ticker",
      label: "Holding",
      sortValue: (r) => r.ticker,
      render: (r) => (
        <Link href={`/companies/${r.ticker}`} className="flex items-center gap-2 group min-w-0">
          <CompanyLogo ticker={r.ticker} name={r.name} size={24} />
          <span className="min-w-0">
            <span className="font-mono font-bold group-hover:text-accent transition">{r.ticker}</span>
            <span className="block text-[11px] text-mute truncate max-w-[180px]">{r.name}</span>
          </span>
        </Link>
      ),
    },
    {
      key: "shares",
      label: "Est. shares",
      align: "right",
      sortValue: (r) => r.shares,
      info: "Disclosed dollar range midpoint divided by the closing price on the trade date, net of sales (FIFO).",
      render: (r) => <span className="tabular">{r.shares >= 1000 ? Math.round(r.shares).toLocaleString() : r.shares.toFixed(1)}</span>,
    },
    {
      key: "value",
      label: "Est. value",
      align: "right",
      sortValue: (r) => r.value,
      render: (r) => <span className="tabular font-semibold">{formatCurrency(r.value)}</span>,
    },
    {
      key: "avgCost",
      label: "Est. price paid",
      align: "right",
      sortValue: (r) => r.avgCost,
      info: "Average cost of the shares still held, from the range midpoints (est.).",
      render: (r) => <span className="tabular">${r.avgCost.toFixed(2)}</span>,
    },
    {
      key: "price",
      label: "Price",
      align: "right",
      sortValue: (r) => r.price,
      render: (r) => (
        <span className="tabular">
          ${r.price.toFixed(2)}
          {r.status === "stale" ? (
            <span className="block text-[10px]" style={{ color: "var(--text-mute)" }} title="No recent price from the vendor — last close held.">
              as of {formatDate(r.priceAsOf)}
            </span>
          ) : null}
        </span>
      ),
    },
    {
      key: "unrealizedPct",
      label: "Up / down",
      align: "right",
      sortValue: (r) => r.unrealizedPct ?? -9999,
      render: (r) =>
        r.unrealizedPct == null ? (
          <span className="text-faint">—</span>
        ) : (
          <span className="font-semibold tabular" style={{ color: r.unrealizedPct >= 0 ? "#10B981" : "#EF4444" }}>
            {pct(r.unrealizedPct)}
            <span className="block text-[10px] font-normal" style={{ color: "var(--text-mute)" }}>
              {r.unrealized >= 0 ? "+" : "−"}
              {formatCurrency(Math.abs(r.unrealized))}
            </span>
          </span>
        ),
    },
    { key: "first", label: "First bought", align: "right", sortValue: (r) => r.firstBought || "", render: (r) => (r.firstBought ? formatDate(r.firstBought) : "—") },
    { key: "last", label: "Last action", align: "right", sortValue: (r) => r.lastAction || "", render: (r) => (r.lastAction ? formatDate(r.lastAction) : "—") },
    {
      key: "filings",
      label: "Filings",
      align: "center",
      sortable: false,
      render: (r) => (
        <a href="#trades" className="text-[11.5px] font-semibold text-accent" title={`${r.buys} buys · ${r.sells} sales — see the trade list`}>
          {r.buys + r.sells}
        </a>
      ),
    },
  ];

  return (
    <div>
      <div className="flex items-center justify-between mb-2 gap-3 flex-wrap">
        <div className="text-[12px]" style={{ color: "var(--text-mute)" }}>
          {total} disclosed {total === 1 ? "position" : "positions"}
          {locked ? ` · showing the top ${holdings.length}` : ""}
        </div>
        {unlocked ? (
          <button
            onClick={download}
            disabled={busy}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-md px-2.5 py-1.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text)" }}
          >
            <Download className="h-3.5 w-3.5" /> {busy ? "Preparing…" : "Export CSV"}
          </button>
        ) : (
          <Link
            href={SUBSCRIBE_HREF}
            className="inline-flex items-center gap-1.5 text-[12px] font-semibold rounded-md px-2.5 py-1.5"
            style={{ background: "var(--bg-elevated)", border: "1px solid var(--border)", color: "var(--text-mute)" }}
            title="Exports are part of Insider Access"
          >
            <Lock className="h-3.5 w-3.5" /> Export CSV
          </Link>
        )}
      </div>
      <div className="card overflow-hidden">
        {holdings.length ? (
          <DataTable<WtHolding> rows={holdings} rowKey={(r) => r.ticker} columns={cols} pageSize={locked ? holdings.length : 25} initialSort={{ key: "value", dir: "desc" }} />
        ) : (
          <div className="p-8 text-center text-mute text-sm">No open positions from disclosed trades.</div>
        )}
        {locked ? (
          <PremiumRowWall
            label="Every disclosed holding"
            total={total}
            forceShow
            bullets={[
              `All ${total} positions, not the top ${holdings.length}`,
              "Estimated cost, current value and up/down on each",
              "CSV export of the whole portfolio",
              "Filters beyond party and chamber on the leaderboard",
            ]}
          />
        ) : null}
      </div>
    </div>
  );
}
