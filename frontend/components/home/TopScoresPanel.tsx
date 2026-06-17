"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { Flame, Lock, Sparkles } from "lucide-react";
import { API_BASE, RankingRow, RankingsResponse, fetcher } from "@/lib/api";
import { IqsTooltip } from "../IqsTooltip";

function Row({
  r,
  rank,
  blurred,
}: {
  r: RankingRow;
  rank: number;
  blurred: boolean;
}) {
  const content = (
    <div className="grid grid-cols-[22px_1fr_auto] gap-2 items-center px-4 py-2.5">
      <span className="text-[10px] font-mono font-bold text-faint tabular text-center">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0">
        <div className="text-[12px] font-bold font-mono text-accent">
          {r.ticker || "—"}
        </div>
        <div className="text-[10px] text-mute truncate" title={r.name}>
          {r.name}
        </div>
      </div>
      <span
        className="text-[12px] font-bold tabular"
        style={{ color: r.iqs >= 50 ? "var(--good)" : "var(--bad)" }}
      >
        {r.iqs.toFixed(1)}
      </span>
    </div>
  );
  if (blurred) {
    return (
      <li
        className="select-none pointer-events-none"
        style={{ filter: "blur(5px)" }}
        aria-hidden
      >
        {content}
      </li>
    );
  }
  return (
    <li>
      <Link
        href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
        className="block hover:bg-[var(--accent-soft)] transition"
      >
        {content}
      </Link>
    </li>
  );
}

export function TopScoresPanel() {
  const { data, isLoading } = useSWR<RankingsResponse>(
    `${API_BASE}/rankings?limit=15`,
    fetcher,
    { refreshInterval: 60_000, revalidateOnFocus: false },
  );
  const rows = data?.rows || [];
  // Top-5 (highest IQS) are gated behind premium; ranks 6-10 are free.
  // Display order counts DOWN: visible 10→6 on top, blurred 5→1 below.
  const visibleDesc = rows.slice(5, 10).map((r, i) => ({ row: r, rank: i + 6 })).reverse();
  const blurredDesc = rows.slice(0, 5).map((r, i) => ({ row: r, rank: i + 1 })).reverse();

  return (
    <aside
      className="rounded-xl overflow-hidden"
      style={{
        background: "var(--bg-2)",
        border: "1px solid var(--border)",
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-2.5 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider">
          <Flame className="h-3.5 w-3.5 text-accent" />
          Top scores ·{" "}
          <IqsTooltip>
            <span className="font-mono font-bold text-accent underline decoration-dotted underline-offset-2">
              IQS
            </span>
          </IqsTooltip>
        </div>
      </div>

      {isLoading || rows.length === 0 ? (
        <ul className="divide-y divide-[var(--border)]">
          {Array.from({ length: 6 }).map((_, i) => (
            <li key={i} className="px-4 py-2.5">
              <div className="h-6 shimmer rounded" />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {/* Free rows 10 → 6 */}
          {visibleDesc.length > 0 && (
            <ul className="divide-y divide-[var(--border)]">
              {visibleDesc.map(({ row, rank }) => (
                <Row key={row.companyId} r={row} rank={rank} blurred={false} />
              ))}
            </ul>
          )}

          {/* Blurred 5 → 1 (premium) */}
          {blurredDesc.length > 0 && (
            <div className="relative border-t border-[var(--border)]">
              <ul className="divide-y divide-[var(--border)]">
                {blurredDesc.map(({ row, rank }) => (
                  <Row key={row.companyId} r={row} rank={rank} blurred />
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
                  className="inline-flex h-10 w-10 rounded-xl items-center justify-center mb-2"
                  style={{
                    background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                    boxShadow: "0 6px 18px rgba(0,102,255,0.25)",
                  }}
                >
                  <Sparkles className="h-4 w-4 text-white" />
                </div>
                <div className="inline-flex items-center gap-1 text-[12px] font-bold mb-0.5">
                  <Lock className="h-3 w-3 text-accent" />
                  Top 5 are premium
                </div>
                <div className="text-[11px] text-mute mb-2.5 max-w-[200px]">
                  Unlock the highest-IQS signals first.
                </div>
                <Link
                  href="/premium"
                  className="btn-primary"
                  style={{ padding: "6px 14px", fontSize: 12 }}
                >
                  Unlock top picks
                </Link>
              </div>
            </div>
          )}
        </>
      )}

      <Link
        href="/companies"
        className="block px-4 py-2.5 text-center text-[11px] font-semibold text-accent hover:bg-[var(--accent-soft)] border-t"
        style={{ borderColor: "var(--border)" }}
      >
        See full rankings →
      </Link>
    </aside>
  );
}
