"use client";
import useSWR from "swr";
import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import { Flame, Lock, Sparkles } from "lucide-react";
import {
  API_BASE,
  RankingRow,
  RankingsResponse,
  fetcher,
  formatCurrency,
} from "@/lib/api";
import { TierBadge } from "@/components/TierBadge";
import { IqsTooltip } from "@/components/IqsTooltip";

export function SignalsList() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=20`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );

  const [visible, setVisible] = useState(8);
  const rows = data?.rows || [];
  const blurredTop5 = rows.slice(0, 5);
  const free = rows.slice(5);
  const visibleFree = free.slice(0, visible);
  const hasMore = free.length > visible;

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between pb-2 border-b border-[var(--border)]">
        <div className="inline-flex items-center gap-2">
          <Flame className="h-4 w-4 text-accent" />
          <h2 className="text-lg font-bold tracking-tight">
            Today's strongest signals · <IqsTooltip />
          </h2>
        </div>
        <Link
          href="/companies"
          className="text-[12px] font-semibold text-accent hover:underline"
        >
          Full rankings →
        </Link>
      </div>

      {isLoading || rows.length === 0 ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-16 shimmer rounded-md" />
          ))}
        </div>
      ) : (
        <>
          {/* Free rows (rank 6+) */}
          <ul className="divide-y divide-[var(--border)]">
            {visibleFree.map((r, i) => (
              <SignalRow
                key={r.companyId}
                r={r}
                rank={i + 6}
                index={i}
                blurred={false}
              />
            ))}
          </ul>

          {hasMore && (
            <div className="text-center">
              <button
                onClick={() => setVisible((v) => v + 8)}
                className="btn-secondary"
                style={{ padding: "8px 18px", fontSize: 13 }}
              >
                Show more
              </button>
            </div>
          )}

          {/* Premium-gated top 5 — sits at the bottom as the reveal */}
          {blurredTop5.length > 0 && (
            <div className="relative rounded-lg overflow-hidden mt-8">
              <ul
                className="divide-y divide-[var(--border)]"
                style={{ filter: "blur(5px)", pointerEvents: "none" }}
                aria-hidden
              >
                {[...blurredTop5].reverse().map((r, i) => (
                  <SignalRow
                    key={r.companyId}
                    r={r}
                    rank={5 - i}
                    index={i}
                    blurred
                  />
                ))}
              </ul>
              <div
                className="absolute inset-0 flex flex-col items-center justify-center text-center px-4"
                style={{
                  background:
                    "linear-gradient(180deg, color-mix(in srgb, var(--bg-2) 60%, transparent) 0%, color-mix(in srgb, var(--bg-2) 94%, transparent) 100%)",
                  backdropFilter: "blur(2px)",
                }}
              >
                <div
                  className="inline-flex h-11 w-11 rounded-xl items-center justify-center mb-2"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    boxShadow: "0 6px 18px rgba(0,102,255,0.25)",
                  }}
                >
                  <Sparkles className="h-5 w-5 text-white" />
                </div>
                <div className="inline-flex items-center gap-1 text-[14px] font-bold mb-0.5">
                  <Lock className="h-3.5 w-3.5 text-accent" />
                  Top 5 are premium
                </div>
                <div className="text-[12px] text-mute mb-3 max-w-[260px]">
                  Unlock the highest Insider Score signals first.
                </div>
                <Link
                  href="/premium"
                  className="btn-primary"
                  style={{ padding: "8px 18px", fontSize: 13 }}
                >
                  Unlock top picks
                </Link>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function SignalRow({
  r,
  rank,
  blurred,
  index,
}: {
  r: RankingRow;
  rank: number;
  blurred: boolean;
  index: number;
}) {
  const content = (
    <div className="grid grid-cols-[32px_1fr_auto] sm:grid-cols-[32px_1fr_auto_auto] gap-3 sm:gap-5 items-center py-3.5">
      <span className="text-[11px] font-mono font-bold text-faint tabular text-center">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          <span className="font-mono text-[13px] font-bold text-accent">
            {r.ticker || "—"}
          </span>
          <TierBadge iqs={r.iqs} size="sm" />
          {r.sector && (
            <span className="hidden md:inline text-[10px] uppercase tracking-wider text-mute font-semibold truncate max-w-[180px]">
              {r.sector}
            </span>
          )}
        </div>
        <div className="text-[13px] text-soft truncate" title={r.name}>
          {r.name}
        </div>
      </div>
      <div className="text-right">
        <div className="text-[10px] uppercase tracking-wider text-mute font-semibold">
          Insider Score
        </div>
        <div
          className="text-[15px] font-bold tabular"
          style={{ color: r.iqs >= 50 ? "var(--good)" : "var(--bad)" }}
        >
          {r.iqs.toFixed(1)}
        </div>
        {typeof r.iqsV1 === "number" && (
          <div className="text-[10px] tabular" style={{ color: "var(--text-faint)" }}>
            v1 {Math.min(99, r.iqsV1).toFixed(0)}
          </div>
        )}
      </div>
      <div className="text-right hidden sm:block">
        <div className="text-[10px] uppercase tracking-wider text-mute font-semibold">
          Bought
        </div>
        <div className="text-[13px] font-semibold tabular text-good">
          {formatCurrency(r.totalPurchaseValue)}
        </div>
      </div>
    </div>
  );

  if (blurred) {
    return <li>{content}</li>;
  }
  return (
    <motion.li
      initial={{ opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.3, delay: Math.min(index, 6) * 0.03 }}
    >
      <Link
        href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
        className="block hover:bg-[var(--accent-soft)] rounded-md transition px-2 -mx-2"
      >
        {content}
      </Link>
    </motion.li>
  );
}
