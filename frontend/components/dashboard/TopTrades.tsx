"use client";
import Link from "next/link";
import { Lock } from "lucide-react";
import { formatCurrency, formatRelative } from "@/lib/api";

interface Trade {
  id: string;
  insiderName: string;
  role: string;
  rawTitle: string;
  ticker: string | null;
  companyName: string;
  totalValue: number;
  transactionDate: string;
}

export function TopTrades({ trades, total }: { trades: Trade[]; total: number }) {
  const visible = trades.slice(0, 5);
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
        <div>
          <div className="text-[15px] font-semibold">Top insider trades</div>
          <div className="text-xs text-mute mt-0.5">Ranked by purchase value (7d)</div>
        </div>
        <Link href="/trades" className="text-xs text-accent hover:underline">
          View all →
        </Link>
      </div>
      {visible.length === 0 ? (
        <div className="px-5 py-10 text-sm text-mute text-center">
          No insider trades in the last 7 days.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--border)]">
          {visible.map((t, i) => (
            <li key={t.id}>
              <Link
                href={t.ticker ? `/companies/${encodeURIComponent(t.ticker)}` : "#"}
                className="flex items-center gap-4 px-5 py-3.5 hover:bg-[color-mix(in_srgb,var(--accent)_6%,transparent)] transition"
              >
                <span
                  className="h-7 w-7 rounded-full flex items-center justify-center text-[12px] font-bold flex-shrink-0"
                  style={{ background: "var(--bg-3)", color: "var(--text-soft)" }}
                >
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-semibold truncate">{t.insiderName}</div>
                  <div className="text-[12px] text-mute truncate">
                    {t.companyName}
                    {t.rawTitle ? <> · {t.rawTitle}</> : null}
                  </div>
                </div>
                <div className="hidden sm:block">
                  <span className="text-accent text-sm font-semibold font-mono">
                    {t.ticker || "—"}
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold tabular">
                    {formatCurrency(t.totalValue)}
                  </div>
                  <div className="text-[11px] text-mute">{formatRelative(t.transactionDate)}</div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {total > visible.length && (
        <div className="px-5 py-4 border-t border-[var(--border)] flex items-center justify-between">
          <span className="text-xs text-mute">
            Showing {visible.length} of {total} trades
          </span>
          <Link
            href="/premium"
            className="inline-flex items-center gap-1.5 text-xs text-accent font-semibold hover:underline"
          >
            <Lock className="h-3 w-3" />
            Unlock all →
          </Link>
        </div>
      )}
    </div>
  );
}
