"use client";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";
import Link from "next/link";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <motion.header
      initial={{ opacity: 0, y: -16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      className="sticky top-0 z-40 glass-strong border-b border-[var(--border)]"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-3 group">
          <div className="relative h-10 w-10">
            <div className="absolute inset-0 rounded-2xl brand-gradient opacity-95" />
            <div
              className="absolute inset-[1.5px] rounded-[14px] flex items-center justify-center"
              style={{ background: "var(--logo-core)" }}
            >
              <TrendingUp className="h-5 w-5 text-[var(--brand-1)]" strokeWidth={2.5} />
            </div>
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 dot-pulse" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-sm font-bold tracking-tight">
              Insider Buying
              <span className="text-mute font-mono text-[10px] ml-1.5">IQS</span>
            </span>
            <span className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono">
              SEC Form 4 · Live ranking
            </span>
          </div>
        </Link>

        <div className="flex items-center gap-2 sm:gap-3">
          <div className="hidden md:flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.18em] text-mute mr-2">
            <span className="h-1 w-1 rounded-full bg-[var(--brand-3)] dot-pulse" />
            <span>EDGAR · Live</span>
          </div>
          <ThemeToggle />
        </div>
      </div>
    </motion.header>
  );
}
