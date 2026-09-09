"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, FileText, Flame } from "lucide-react";
import { ADVERTORIAL_LIST } from "@/content/advertorials";
import { AdSlot } from "@/components/AdSlot";

const MONTHLY = [
  { slug: "2026-05", label: "Insider Buying — May 2026" },
  { slug: "2026-04", label: "Insider Buying — April 2026" },
  { slug: "2026-03", label: "Insider Buying — March 2026" },
  { slug: "2026-02", label: "Insider Buying — February 2026" },
  { slug: "2026-01", label: "Insider Buying — January 2026" },
];

const CTA_REPORTS = [
  { ticker: "NVDA", title: "Should You Invest $1,000 in NVIDIA Right Now?" },
  { ticker: "TOP5", title: "5 Top Stocks to Buy Now — June's Picks" },
  { ticker: "AAPL", title: "Should You Invest $1,000 in Apple Right Now?" },
  { ticker: "TSLA", title: "Should You Invest $1,000 in Tesla Right Now?" },
];

export default function ReportsIndexPage() {
  return (
    <div className="w-full space-y-8">
      <header>
        <div className="text-mute text-sm mb-1 font-mono uppercase tracking-wider text-[11px]">
          Reports & Analysis
        </div>
        <h1
          className="text-[32px] sm:text-[40px] font-semibold tracking-tight"
          style={{ letterSpacing: "-0.6px" }}
        >
          Free Reports & Editorial
        </h1>
        <p className="text-mute text-[15px] mt-2 max-w-3xl leading-relaxed">
          Long-form analysis, monthly market summaries, and free downloadable reports.
        </p>
      </header>

      <AdSlot slot="leaderboard" seed="reports-top" />

      {/* Advertorials */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight mb-3 inline-flex items-center gap-2">
          <Flame className="h-4 w-4 text-accent" />
          Featured analysis
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {ADVERTORIAL_LIST.map((a, i) => (
            <motion.div
              key={a.slug}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
            >
              <Link
                href={`/advertorials/${a.slug}`}
                className="block rounded-lg overflow-hidden group transition"
                style={{
                  background: "var(--bg-2)",
                  border: "1px solid var(--border)",
                }}
              >
                <div
                  className="relative bg-[var(--bg-3)]"
                  style={{ aspectRatio: "16 / 9" }}
                >
                  <img
                    src={a.image}
                    alt=""
                    loading="lazy"
                    className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                </div>
                <div className="p-4">
                  <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                    {a.eyebrow}
                  </div>
                  <div className="text-[16px] font-bold leading-snug group-hover:text-accent transition">
                    {a.headline}
                  </div>
                  <div className="text-[12px] text-mute leading-snug mt-2 line-clamp-2">
                    {a.kicker}
                  </div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </section>

      {/* Monthly insider buying SEO reports */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight mb-3 inline-flex items-center gap-2">
          <FileText className="h-4 w-4 text-accent" />
          Monthly insider-buying reports
        </h2>
        <div className="card overflow-hidden">
          <ul className="divide-y divide-[var(--border)]">
            {MONTHLY.map((m) => (
              <li key={m.slug}>
                <Link
                  href={`/reports/monthly/${m.slug}`}
                  className="flex items-center justify-between px-5 py-3.5 hover:bg-[var(--accent-soft)] transition group"
                >
                  <span className="text-[14px] font-semibold text-soft group-hover:text-accent transition">
                    {m.label}
                  </span>
                  <ArrowRight className="h-4 w-4 text-faint group-hover:text-accent" />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <AdSlot slot="leaderboard" seed="reports-mid" />

      {/* Free CTA reports */}
      <section>
        <h2 className="text-[18px] font-bold tracking-tight mb-3">
          Free downloadable reports
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CTA_REPORTS.map((r) => (
            <Link
              key={r.ticker}
              href={`/reports/cta/${r.ticker}`}
              className="block rounded-lg p-5 group transition"
              style={{
                background:
                  "linear-gradient(135deg, color-mix(in srgb, var(--accent) 8%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 10%, var(--bg-2)) 100%)",
                border:
                  "1px solid color-mix(in srgb, var(--accent) 22%, var(--border))",
              }}
            >
              <div className="text-[10px] uppercase tracking-wider font-bold text-accent mb-1">
                Free report
              </div>
              <div className="text-[15px] font-bold leading-snug group-hover:text-accent transition">
                {r.title}
              </div>
              <div className="text-[12px] text-accent mt-2 inline-flex items-center gap-1 font-semibold">
                Get the report <ArrowRight className="h-3 w-3" />
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
