"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Sparkles } from "lucide-react";
import { API_BASE, IdeaRow, IdeasResponse, fetcher, formatCurrency } from "@/lib/api";
import { TierBadge } from "@/components/TierBadge";

function IdeaItem({ r, rank }: { r: IdeaRow; rank: number }) {
  return (
    <Link
      href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
      className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--accent-soft)] transition group"
    >
      <span className="font-mono text-[11px] text-faint w-6 tabular">
        {String(rank).padStart(2, "0")}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          {r.ticker ? (
            <span className="font-mono text-sm font-bold text-accent">{r.ticker}</span>
          ) : (
            <span className="text-faint">—</span>
          )}
          <TierBadge iqs={r.iqs} size="sm" />
          {r.sector && (
            <span className="hidden md:inline text-[11px] text-mute truncate max-w-[200px]">
              {r.sector}
            </span>
          )}
        </div>
        <div className="text-[13px] text-soft truncate mt-0.5">{r.name}</div>
      </div>
      <div className="text-right hidden sm:block">
        <div className="text-[11px] label-mini">Insider Score</div>
        <div className="text-sm font-bold tabular">{r.iqs.toFixed(1)}</div>
        {typeof r.iqsV1 === "number" && (
          <div className="text-[10px] tabular" style={{ color: "var(--text-faint)" }}>
            v1 {Math.min(99, r.iqsV1).toFixed(0)}
          </div>
        )}
      </div>
      <div className="text-right hidden md:block">
        <div className="text-[11px] label-mini">Bought</div>
        <div className="text-sm font-semibold tabular text-good">
          {formatCurrency(r.totalPurchaseValue)}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent transition" />
    </Link>
  );
}

export default function ListsPage() {
  const { data, isLoading } = useSWR<IdeasResponse>(
    `${API_BASE}/ideas`,
    fetcher,
    { refreshInterval: 5 * 60 * 1000, revalidateOnFocus: false },
  );

  return (
    <div className="w-full space-y-6">
      <header>
        <div className="flex items-center gap-2 text-mute text-sm mb-1">
          <Sparkles className="h-4 w-4" />
          <span className="font-mono uppercase tracking-wider text-[11px]">Ideas</span>
        </div>
        <h1 className="text-[28px] font-bold tracking-tight" style={{ letterSpacing: "-0.4px" }}>
          Investment ideas
        </h1>
        <p className="text-mute text-sm mt-1">
          Curated lists drawn from today's insider-buying activity, sorted descending. Updated every
          few minutes.
        </p>
      </header>

      {isLoading || !data ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="card h-48 shimmer" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {data.lists.map((list, li) => (
            <motion.section
              key={list.slug}
              initial={{ opacity: 0, y: 14 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.5, delay: li * 0.05, ease: [0.22, 1, 0.36, 1] }}
              className="card overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div>
                  <div className="text-[15px] font-semibold">{list.title}</div>
                  <div className="text-xs text-mute mt-0.5">{list.subtitle}</div>
                </div>
                <span className="badge badge-neutral">{list.rows.length}</span>
              </div>
              {list.rows.length === 0 ? (
                <div className="px-5 py-8 text-sm text-mute text-center">
                  No matches right now. Trigger ingestion or check back later.
                </div>
              ) : (
                <ul className="divide-y divide-[var(--border)]">
                  {list.rows.map((r, i) => (
                    <li key={r.companyId}>
                      <IdeaItem r={r} rank={i + 1} />
                    </li>
                  ))}
                </ul>
              )}
            </motion.section>
          ))}
        </div>
      )}
    </div>
  );
}
