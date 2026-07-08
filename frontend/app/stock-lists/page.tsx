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
  const sectors = lists.filter(
    (l) => l.kind === "sector" || l.kind === "universe" || l.kind === "country",
  );
  const personas = lists.filter((l) => l.kind === "persona");
  const premium = lists.find((l) => l.kind === "premium");

  return (
    <div className="w-full space-y-8">
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
          any list to filter and sort by sector, market cap, and our premium Insider Score.
        </p>
      </header>

      {/* Premium "Top Insider Scores" — clean table-style row at the top,
          matching the list cards below (no gradient box). */}
      {premium && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="card overflow-hidden"
        >
          <Link
            href={`/stock-lists/${premium.slug}`}
            className="flex items-center justify-between gap-3 px-5 py-4 hover:bg-[var(--accent-soft)] transition group"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span
                className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0"
                style={{
                  background: "color-mix(in srgb, var(--gold) 18%, var(--bg-3))",
                  border: "1px solid color-mix(in srgb, var(--gold) 45%, var(--border))",
                }}
              >
                <Lock className="h-4 w-4" style={{ color: "var(--gold)" }} />
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-[15px] group-hover:text-accent transition">
                    {premium.title}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded"
                    style={{ background: "var(--gold)", color: "#3b2300" }}
                  >
                    <Sparkles className="h-2.5 w-2.5" /> Premium
                  </span>
                </div>
                <div className="text-[12px] text-mute truncate">{premium.description}</div>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="badge badge-neutral">{premium.count}</span>
              <ChevronRight className="h-4 w-4 text-faint group-hover:text-accent" />
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
