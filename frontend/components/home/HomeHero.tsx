"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowRight, Sparkles, TrendingUp } from "lucide-react";

export function HomeHero() {
  return (
    <section
      className="relative overflow-hidden -mx-4 sm:-mx-6 lg:-mx-8 -mt-6 sm:-mt-8 mb-8"
      style={{
        background:
          "linear-gradient(135deg, color-mix(in srgb, var(--accent) 10%, var(--bg-2)) 0%, color-mix(in srgb, var(--accent-2) 12%, var(--bg-2)) 100%)",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div
        aria-hidden
        className="absolute -top-32 -right-32 h-80 w-80 rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--accent) 30%, transparent)" }}
      />
      <div
        aria-hidden
        className="absolute -bottom-24 -left-24 h-64 w-64 rounded-full blur-3xl"
        style={{ background: "color-mix(in srgb, var(--accent-2) 28%, transparent)" }}
      />

      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-12 sm:py-16 text-center">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold uppercase tracking-wider text-white mb-5"
            style={{ background: "linear-gradient(90deg, var(--accent), var(--accent-2))" }}
          >
            <Sparkles className="h-3 w-3" />
            Live insider intelligence
          </div>
          <h1
            className="text-[34px] sm:text-[46px] font-bold tracking-tight leading-[1.05]"
            style={{ letterSpacing: "-0.6px" }}
          >
            Track insider conviction in real time
          </h1>
          <p className="text-soft mt-4 text-[15px] sm:text-[17px] max-w-2xl mx-auto leading-relaxed">
            Daily Insider Buying Quality Score (IQS) rankings from SEC Form 4 filings —
            distilled into a single, ranked feed of the strongest open-market signals.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/companies"
              className="btn-primary inline-flex items-center gap-1.5"
              style={{ padding: "11px 18px", fontSize: 14 }}
            >
              <TrendingUp className="h-4 w-4" />
              Market Beat
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <Link
              href="/premium"
              className="btn-secondary inline-flex items-center gap-1.5"
              style={{ padding: "11px 18px", fontSize: 14 }}
            >
              <Sparkles className="h-3.5 w-3.5" />
              Subscribe
            </Link>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
