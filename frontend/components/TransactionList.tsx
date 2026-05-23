"use client";
import { motion } from "framer-motion";
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

const ROLE_STYLE: Record<string, { color: string; bg: string }> = {
  CEO: { color: "var(--brand-1)", bg: "color-mix(in srgb, var(--brand-1) 18%, transparent)" },
  CFO: { color: "var(--brand-3)", bg: "color-mix(in srgb, var(--brand-3) 18%, transparent)" },
  COO: { color: "var(--accent-mint)", bg: "color-mix(in srgb, var(--accent-mint) 18%, transparent)" },
  Director: { color: "var(--accent-amber)", bg: "color-mix(in srgb, var(--accent-amber) 18%, transparent)" },
  Other: { color: "var(--text-soft)", bg: "var(--surface)" },
};

export function TransactionList({ transactions }: { transactions: Tx[] }) {
  if (!transactions.length) {
    return (
      <div className="glass rounded-2xl p-8 text-center text-sm text-mute">
        No qualifying open-market purchases in the last 90 days.
      </div>
    );
  }
  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="hidden lg:grid grid-cols-12 gap-3 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-mute font-mono border-b border-[var(--border)]">
        <div className="col-span-3">Insider</div>
        <div className="col-span-2">Role</div>
        <div className="col-span-2">Date</div>
        <div className="col-span-1 text-right">Shares</div>
        <div className="col-span-1 text-right">Price</div>
        <div className="col-span-2 text-right">Value</div>
        <div className="col-span-1 text-right">Filing</div>
      </div>
      <ul className="divide-soft">
        {transactions.map((t, i) => {
          const shares = Number(t.sharesBought);
          const price = Number(t.pricePerShare);
          const value = Number(t.totalValue);
          const prev = t.previousHoldings ? Number(t.previousHoldings) : 0;
          const stakeChange = prev > 0 ? (shares / prev) * 100 : null;
          const roleStyle = ROLE_STYLE[t.role] || ROLE_STYLE.Other;
          return (
            <motion.li
              key={t.id}
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              viewport={{ once: true, amount: 0.4 }}
              transition={{ duration: 0.55, delay: Math.min(i * 0.04, 0.5), ease: [0.22, 1, 0.36, 1] }}
              className="row-hover px-4 sm:px-5 py-4 lg:grid lg:grid-cols-12 lg:gap-3 lg:items-center"
            >
              <div className="lg:col-span-3 mb-2 lg:mb-0">
                <div className="font-semibold text-sm">{t.insiderName}</div>
                {t.rawTitle && (
                  <div className="text-[11px] text-mute truncate">{t.rawTitle}</div>
                )}
              </div>
              <div className="lg:col-span-2 mb-2 lg:mb-0">
                <span
                  className="inline-flex items-center text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full border"
                  style={{
                    color: roleStyle.color,
                    background: roleStyle.bg,
                    borderColor: `color-mix(in srgb, ${roleStyle.color} 30%, transparent)`,
                  }}
                >
                  {t.role}
                </span>
                {stakeChange !== null && (
                  <span
                    className="ml-2 inline-flex items-center text-[11px]"
                    style={{ color: "var(--accent-mint)" }}
                  >
                    <ArrowUpRight className="h-3 w-3 mr-0.5" />
                    +{stakeChange.toFixed(1)}% stake
                  </span>
                )}
              </div>
              <div className="lg:col-span-2 text-sm text-soft mb-2 lg:mb-0">
                {formatDate(t.transactionDate)}
              </div>
              <div className="lg:col-span-1 lg:text-right text-sm tabular-nums mb-1 lg:mb-0">
                <span className="lg:hidden text-[10px] uppercase tracking-wider text-mute font-mono mr-2">
                  Shares
                </span>
                {formatNumber(shares)}
              </div>
              <div className="lg:col-span-1 lg:text-right text-sm tabular-nums text-soft mb-1 lg:mb-0">
                <span className="lg:hidden text-[10px] uppercase tracking-wider text-mute font-mono mr-2">
                  Price
                </span>
                ${price.toFixed(2)}
              </div>
              <div className="lg:col-span-2 lg:text-right text-sm font-semibold tabular-nums mb-1 lg:mb-0">
                <span className="lg:hidden text-[10px] uppercase tracking-wider text-mute font-mono mr-2">
                  Value
                </span>
                {formatCurrency(value)}
              </div>
              <div className="lg:col-span-1 lg:text-right">
                <a
                  href={t.filingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-mute hover:text-[var(--brand-1)] transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  SEC
                </a>
              </div>
            </motion.li>
          );
        })}
      </ul>
    </div>
  );
}
