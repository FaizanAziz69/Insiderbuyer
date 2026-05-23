"use client";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronRight, Users, Crown, FileText } from "lucide-react";
import Link from "next/link";
import { RankingRow, formatCurrency, scoreTier } from "@/lib/api";
import { IqsBadge } from "./IqsBadge";

export function RankingTable({ rows, loading }: { rows: RankingRow[]; loading?: boolean }) {
  if (loading && !rows.length) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="space-y-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-14 rounded-xl bg-[var(--surface)] shimmer" />
          ))}
        </div>
      </div>
    );
  }
  if (!rows.length) {
    return (
      <div className="glass rounded-2xl p-12 text-center">
        <FileText className="h-8 w-8 text-faint mx-auto mb-3" />
        <div className="text-lg font-semibold mb-1">No insider buys ranked yet</div>
        <div className="text-sm text-mute">
          Pulling fresh Form 4 filings from SEC EDGAR. Check back in a minute.
        </div>
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-3 text-[10px] uppercase tracking-[0.2em] text-mute font-mono border-b border-[var(--border)]">
        <div className="col-span-1">Rank</div>
        <div className="col-span-3">Company</div>
        <div className="col-span-1 text-center">IQS</div>
        <div className="col-span-1 text-right">Buyers</div>
        <div className="col-span-2 text-right">Bought</div>
        <div className="col-span-2 text-right">Mkt cap</div>
        <div className="col-span-2 text-right">Sector</div>
      </div>

      <ul className="divide-soft">
        <AnimatePresence initial={true}>
          {rows.map((r, i) => {
            const tier = scoreTier(Number(r.iqs));
            return (
              <motion.li
                key={r.companyId}
                layout
                initial={{ opacity: 0, y: 24, filter: "blur(8px)" }}
                whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                viewport={{ once: true, amount: 0.25 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.55, delay: Math.min(i * 0.035, 0.6), ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                  className="row-hover group block md:grid md:grid-cols-12 md:gap-3 md:items-center px-4 sm:px-5 py-4 transition"
                >
                  <div className="md:col-span-1 flex items-center gap-2 mb-3 md:mb-0">
                    <span className="font-mono text-xs text-mute tabular-nums w-7">
                      #{String(r.rank).padStart(2, "0")}
                    </span>
                    {r.rank <= 3 && (
                      <Crown
                        className="h-3.5 w-3.5"
                        style={{
                          color:
                            r.rank === 1
                              ? "var(--accent-amber)"
                              : r.rank === 2
                              ? "var(--brand-3)"
                              : "var(--accent-rose)",
                        }}
                      />
                    )}
                  </div>

                  <div className="md:col-span-3 flex items-center gap-3 mb-3 md:mb-0 min-w-0">
                    <div className="relative h-10 w-10 flex-shrink-0">
                      <div className="absolute inset-0 rounded-xl brand-gradient opacity-80 group-hover:opacity-100 transition-opacity" />
                      <div
                        className="absolute inset-[1px] rounded-[11px] flex items-center justify-center font-bold text-[11px] tracking-wider"
                        style={{ background: "var(--logo-core)" }}
                      >
                        {(r.ticker || r.name).slice(0, 3).toUpperCase()}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold tracking-tight truncate flex items-center gap-2">
                        {r.ticker || "—"}
                        <span className="text-[9px] uppercase tracking-[0.18em] text-mute font-mono">
                          {tier.label}
                        </span>
                      </div>
                      <div className="text-xs text-mute truncate">{r.name}</div>
                    </div>
                  </div>

                  <div className="md:col-span-1 flex items-center justify-start md:justify-center mb-3 md:mb-0">
                    <IqsBadge iqs={r.iqs} size="sm" />
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-1 md:col-span-1 mb-3 md:mb-0 md:text-right">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-mute font-mono">
                      Buyers
                    </span>
                    <div className="inline-flex items-center md:justify-end gap-1.5 text-sm">
                      <Users className="h-3.5 w-3.5 text-mute md:hidden" />
                      <span className="font-medium tabular-nums">{r.distinctBuyers}</span>
                      <span className="text-faint text-xs tabular-nums">/{r.transactionCount}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-1 md:col-span-2 mb-3 md:mb-0 md:text-right">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-mute font-mono">
                      Bought
                    </span>
                    <span
                      className="text-sm font-semibold tabular-nums"
                      style={{ color: "var(--brand-3)" }}
                    >
                      {formatCurrency(r.totalPurchaseValue)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-1 md:col-span-2 mb-3 md:mb-0 md:text-right">
                    <span className="md:hidden text-[10px] uppercase tracking-wider text-mute font-mono">
                      Mkt cap
                    </span>
                    <span className="text-sm text-soft tabular-nums">
                      {formatCurrency(r.marketCap)}
                    </span>
                  </div>

                  <div className="md:col-span-2 flex md:justify-end items-center gap-2">
                    <span className="text-[11px] text-mute truncate max-w-[160px]">
                      {r.sector || "—"}
                    </span>
                    <ChevronRight className="h-4 w-4 text-faint group-hover:text-[var(--brand-1)] group-hover:translate-x-0.5 transition" />
                  </div>
                </Link>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
}
