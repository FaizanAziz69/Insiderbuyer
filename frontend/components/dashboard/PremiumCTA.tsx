"use client";
import { motion } from "framer-motion";
import Link from "next/link";
import { Sparkles, ArrowRight } from "lucide-react";

export function PremiumCTA() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.65, ease: [0.22, 1, 0.36, 1] }}
      className="card p-6 sm:p-8 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(135deg, var(--bg-2) 0%, color-mix(in srgb, var(--accent) 8%, var(--bg-2)) 50%, color-mix(in srgb, var(--accent-2) 8%, var(--bg-2)) 100%)",
        borderColor: "color-mix(in srgb, var(--accent) 25%, var(--border))",
      }}
    >
      <div
        aria-hidden
        className="absolute -right-24 -top-24 h-72 w-72 rounded-full blur-3xl pointer-events-none"
        style={{ background: "color-mix(in srgb, var(--accent) 25%, transparent)" }}
      />
      <div
        aria-hidden
        className="absolute -left-16 -bottom-16 h-56 w-56 rounded-full blur-3xl pointer-events-none"
        style={{ background: "color-mix(in srgb, var(--accent-2) 18%, transparent)" }}
      />
      <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 sm:gap-8">
        <div className="flex-1">
          <div
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold uppercase tracking-wider text-white"
            style={{
              background: "linear-gradient(90deg, var(--accent), var(--accent-2))",
              boxShadow: "0 4px 12px rgba(0,102,255,0.3)",
            }}
          >
            <Sparkles className="h-3 w-3" />
            Insider Access
          </div>
          <h2
            className="mt-4 text-2xl sm:text-3xl font-bold tracking-tight"
            style={{ letterSpacing: "-0.4px" }}
          >
            Get Insider Intel
          </h2>
          <p className="mt-2 text-soft max-w-xl">
            Unlock the screener, real-time alerts, full insider rankings, and AI-generated market
            analysis.
          </p>
        </div>
        <Link href="/premium" className="btn-primary self-start sm:self-auto whitespace-nowrap">
          Unlock Insider Access
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </motion.div>
  );
}
