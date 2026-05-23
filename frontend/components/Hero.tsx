"use client";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import { TrendingUp, Zap, Download } from "lucide-react";
import { useRef } from "react";

export function Hero({ asOfDate, csvHref }: { asOfDate?: string; csvHref: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start start", "end start"],
  });
  const y = useTransform(scrollYProgress, [0, 1], reduced ? [0, 0] : [0, 160]);
  const scale = useTransform(scrollYProgress, [0, 1], reduced ? [1, 1] : [1, 1.06]);
  const opacity = useTransform(scrollYProgress, [0, 0.6, 1], reduced ? [1, 1, 1] : [1, 0.6, 0]);

  return (
    <section ref={ref} className="relative overflow-hidden">
      <motion.div style={{ y: useTransform(scrollYProgress, [0, 1], [0, 80]) }} className="absolute inset-0 bg-grid opacity-70" />
      <motion.div style={{ y: useTransform(scrollYProgress, [0, 1], [0, 120]) }} className="absolute inset-0 bg-hex opacity-50" />

      <motion.div
        style={{ y, scale, opacity }}
        className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 pt-16 sm:pt-24 pb-12"
      >
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] backdrop-blur"
        >
          <Zap className="h-3 w-3 text-[var(--brand-1)]" />
          <span className="text-[10px] uppercase tracking-[0.22em] text-soft font-mono">
            Daily insider-buying ranking
          </span>
          {asOfDate && (
            <span className="text-[10px] font-mono text-mute border-l border-[var(--border)] pl-2">
              {asOfDate}
            </span>
          )}
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1.0, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 text-[2.5rem] sm:text-6xl lg:text-7xl font-bold tracking-tight leading-[1.02]"
        >
          When insiders buy,
          <br />
          <span className="gradient-text">we listen.</span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.95, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 max-w-2xl text-base sm:text-lg text-soft leading-relaxed"
        >
          <span className="font-semibold text-[var(--text)]">Insider Buying</span> ranks every U.S.
          public company by the conviction behind recent insider purchases — sourced daily, directly
          from SEC Form 4 filings.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.95, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap items-center gap-4"
        >
          <a href={csvHref} className="btn-primary">
            <Download className="h-4 w-4" />
            <span>Download CSV</span>
          </a>
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-mono uppercase tracking-[0.18em] text-mute">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="h-3.5 w-3.5 text-[var(--brand-3)]" />
              Volume · Cluster · Role · Holding-Δ
            </span>
          </div>
        </motion.div>
      </motion.div>
    </section>
  );
}
