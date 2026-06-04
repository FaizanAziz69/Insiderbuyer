"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ChevronRight, Sparkles, Lock } from "lucide-react";
import {
  API_BASE,
  StockListIndexResponse,
  fetcher,
} from "@/lib/api";

export default function StockListsHubPage() {
  const { data, isLoading } = useSWR<StockListIndexResponse>(
    `${API_BASE}/stock-lists`,
    fetcher,
    { refreshInterval: 5 * 60_000, revalidateOnFocus: false },
  );
  const lists = data?.lists || [];
  const sectors = lists.filter((l) => l.kind === "sector");
  const personas = lists.filter((l) => l.kind === "persona");
  const premium = lists.find((l) => l.kind === "premium");

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      <header>
        <div
          className="mb-2 font-mono uppercase"
          style={{
            color: "var(--accent)",
            fontSize: 12,
            fontWeight: 700,
            letterSpacing: "0.12em",
          }}
        >
          Stock Lists
        </div>
        <h1
          className="font-bold tracking-tight"
          style={{
            fontSize: "clamp(40px, 5.4vw, 60px)",
            letterSpacing: "-1px",
            lineHeight: 1.04,
          }}
        >
          All Stock Lists
        </h1>
        <p
          className="mt-4 max-w-3xl leading-relaxed"
          style={{ color: "var(--text-soft)", fontSize: 17 }}
        >
          Curated lists organised by sector and by famous investor portfolios. Click into
          any list to filter and sort by sector, market cap, and our premium IQS Score.
        </p>
      </header>

      {/* Premium IQS list — highlighted callout */}
      {premium && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Link
            href={`/stock-lists/${premium.slug}`}
            className="block rounded-xl p-5 sm:p-6 group transition"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 16%, var(--bg-2)) 100%)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 30%, var(--border-strong))",
            }}
          >
            <div className="flex items-start sm:items-center gap-4 flex-col sm:flex-row">
              <div
                className="h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0"
                style={{
                  background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
                  boxShadow: "0 6px 18px rgba(0,102,255,0.25)",
                }}
              >
                <Sparkles className="h-6 w-6 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                  <Lock className="h-3 w-3" />
                  Premium
                </div>
                <div className="text-[20px] font-bold tracking-tight">{premium.title}</div>
                <div className="text-[13px] text-soft mt-1 leading-relaxed">
                  {premium.description}
                </div>
              </div>
              <div className="text-[13px] font-semibold text-accent flex items-center gap-1 flex-shrink-0 group-hover:underline">
                Unlock <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </Link>
        </motion.div>
      )}

      {/* Two-column grid: Sectors / Personas */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] font-bold text-mute mb-3">
            Stocks by Interest
          </h2>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-[var(--border)]">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="px-5 py-4">
                      <div className="h-6 shimmer rounded" />
                    </li>
                  ))
                : sectors.map((l, i) => (
                    <motion.li
                      key={l.slug}
                      initial={{ opacity: 0, x: 4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                    >
                      <Link
                        href={`/stock-lists/${l.slug}`}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[var(--accent-soft)] transition group"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[14px] group-hover:text-accent transition">
                            {l.title}
                          </div>
                          <div className="text-[12px] text-mute truncate">
                            {l.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="badge badge-neutral">{l.count}</span>
                          <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent" />
                        </div>
                      </Link>
                    </motion.li>
                  ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="text-[10px] uppercase tracking-[0.18em] font-bold text-mute mb-3">
            Famous Investors
          </h2>
          <div className="card overflow-hidden">
            <ul className="divide-y divide-[var(--border)]">
              {isLoading
                ? Array.from({ length: 6 }).map((_, i) => (
                    <li key={i} className="px-5 py-4">
                      <div className="h-6 shimmer rounded" />
                    </li>
                  ))
                : personas.map((l, i) => (
                    <motion.li
                      key={l.slug}
                      initial={{ opacity: 0, x: 4 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: i * 0.02 }}
                    >
                      <Link
                        href={`/stock-lists/${l.slug}`}
                        className="flex items-center justify-between gap-3 px-5 py-3.5 hover:bg-[var(--accent-soft)] transition group"
                      >
                        <div className="min-w-0">
                          <div className="font-bold text-[14px] group-hover:text-accent transition">
                            {l.title}
                          </div>
                          <div className="text-[12px] text-mute truncate">
                            {l.description}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="badge badge-neutral">{l.count}</span>
                          <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent" />
                        </div>
                      </Link>
                    </motion.li>
                  ))}
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
