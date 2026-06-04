"use client";
import useSWR from "swr";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { API_BASE, IdeasResponse, fetcher, formatCurrency } from "@/lib/api";
import { CompanyLogo } from "../CompanyLogo";

export function StockIdeasGrid() {
  const { data } = useSWR<IdeasResponse>(`${API_BASE}/ideas`, fetcher, {
    refreshInterval: 5 * 60_000,
    revalidateOnFocus: false,
  });
  const lists = data?.lists || [];

  return (
    <section>
      <h2 className="section-h">
        <span>Stock Ideas</span>
        <Link
          href="/lists"
          className="section-h-action inline-flex items-center gap-0.5 hover:underline"
        >
          View all <ArrowRight className="h-3 w-3" />
        </Link>
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_1fr] gap-6 lg:gap-8">
        {/* "Big" position — first idea list, top row highlighted */}
        {lists[0] ? (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.1 }}
            transition={{ duration: 0.3 }}
            className="rounded-lg p-5"
            style={{
              background:
                "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--bg-2)) 0%, var(--bg-2) 100%)",
              border:
                "1px solid color-mix(in srgb, var(--accent) 18%, var(--border))",
            }}
          >
            <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
              {lists[0].title}
            </div>
            <div
              className="text-[18px] sm:text-[22px] font-semibold tracking-tight"
              style={{ letterSpacing: "-0.3px" }}
            >
              {lists[0].subtitle}
            </div>
            <ul className="mt-4 divide-y divide-[var(--border)]">
              {lists[0].rows.slice(0, 5).map((r, i) => (
                <li key={r.companyId}>
                  <Link
                    href={r.ticker ? `/companies/${encodeURIComponent(r.ticker)}` : "#"}
                    className="grid grid-cols-[24px_28px_1fr_auto] gap-2 items-center py-2.5 hover:bg-[var(--accent-soft)] rounded-md px-2 -mx-2 transition"
                  >
                    <span className="text-[10px] font-mono font-bold text-faint tabular text-center">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <CompanyLogo ticker={r.ticker} name={r.name} size={24} />
                    <div className="min-w-0">
                      <div className="text-[13px] font-bold font-mono text-accent">
                        {r.ticker || "—"}
                      </div>
                      <div className="text-[11px] text-mute truncate">{r.name}</div>
                    </div>
                    <span className="text-[12px] font-bold tabular text-good">
                      {formatCurrency(r.totalPurchaseValue)}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </motion.div>
        ) : (
          <div className="rounded-lg h-72 shimmer" />
        )}

        {/* Other idea lists, stacked */}
        <div className="flex flex-col gap-3">
          {lists.slice(1, 5).map((list, i) => (
            <motion.div
              key={list.slug}
              initial={{ opacity: 0, x: 6 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true, amount: 0.1 }}
              transition={{ duration: 0.25, delay: 0.04 * i }}
            >
              <Link
                href={`/lists`}
                className="block rounded-lg p-3 group transition"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                  {list.title}
                </div>
                <div className="text-[14px] font-bold leading-snug group-hover:text-accent transition mb-2">
                  {list.subtitle}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {list.rows.slice(0, 4).map((r) =>
                    r.ticker ? (
                      <span
                        key={r.companyId}
                        className="font-mono text-[11px] font-bold px-1.5 py-0.5 rounded"
                        style={{
                          background: "var(--accent-soft)",
                          color: "var(--accent)",
                        }}
                      >
                        {r.ticker}
                      </span>
                    ) : null,
                  )}
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
