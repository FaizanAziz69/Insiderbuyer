"use client";
import { scoreTier } from "@/lib/api";
import { motion } from "framer-motion";

export function IqsBadge({ iqs, size = "md" }: { iqs: number | string; size?: "sm" | "md" | "lg" }) {
  const n = Number(iqs) || 0;
  const t = scoreTier(n);
  const dim =
    size === "lg"
      ? "h-20 w-20 text-2xl"
      : size === "sm"
      ? "h-10 w-10 text-[11px]"
      : "h-12 w-12 text-sm";
  return (
    <motion.div
      whileHover={{ scale: 1.06 }}
      transition={{ type: "spring", stiffness: 280, damping: 18 }}
      className={`relative ${dim}`}
      title={`${t.label} signal`}
    >
      <span className={`absolute inset-0 rounded-2xl ${t.cls} spin-slow`} aria-hidden />
      <span
        className="absolute inset-[2px] rounded-[14px] flex items-center justify-center font-bold tracking-tight shadow-inner"
        style={{ background: "var(--logo-core)" }}
      >
        <span className="bg-gradient-to-br from-[var(--brand-1)] via-[var(--brand-2)] to-[var(--brand-3)] bg-clip-text text-transparent tabular-nums">
          {n.toFixed(2)}
        </span>
      </span>
    </motion.div>
  );
}
