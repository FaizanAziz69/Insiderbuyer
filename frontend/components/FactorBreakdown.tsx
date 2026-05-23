"use client";
import { motion } from "framer-motion";
import { formatDecimal } from "@/lib/api";

interface FactorProps {
  purchaseVolumeFactor: number | string;
  clusterFactor: number | string;
  roleWeightedVolume: number | string;
  holdingChangeFactor: number | string;
}

export function FactorBreakdown(p: FactorProps) {
  const factors = [
    {
      key: "purchaseVolumeFactor",
      label: "Purchase Volume",
      hint: "Total buying ÷ market cap",
      val: Number(p.purchaseVolumeFactor) || 0,
      from: "var(--brand-1)",
      to: "var(--brand-2)",
    },
    {
      key: "clusterFactor",
      label: "Cluster",
      hint: "log(1 + distinct insider buyers)",
      val: Number(p.clusterFactor) || 0,
      from: "var(--brand-3)",
      to: "var(--brand-1)",
    },
    {
      key: "roleWeightedVolume",
      label: "Role-Weighted",
      hint: "CEO/CFO/COO = 3×, Director = 2×",
      val: Number(p.roleWeightedVolume) || 0,
      from: "var(--accent-mint)",
      to: "var(--brand-3)",
    },
    {
      key: "holdingChangeFactor",
      label: "Holding Change",
      hint: "Avg % increase in insider stake",
      val: Number(p.holdingChangeFactor) || 0,
      from: "var(--accent-amber)",
      to: "var(--accent-rose)",
    },
  ];

  const max = Math.max(...factors.map((f) => Math.abs(f.val))) || 1;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
      {factors.map((f, i) => {
        const pct = Math.min(100, (Math.abs(f.val) / max) * 100);
        return (
          <motion.div
            key={f.key}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: i * 0.08 }}
            className="hud-corner relative glass rounded-2xl p-4 sm:p-5 overflow-hidden"
          >
            <div
              aria-hidden
              className="absolute -top-16 -right-16 h-40 w-40 rounded-full blur-3xl opacity-40"
              style={{
                background: `radial-gradient(circle, ${f.from}, transparent 70%)`,
              }}
            />
            <div className="relative flex items-baseline justify-between mb-2.5">
              <div>
                <div className="text-[10px] uppercase tracking-[0.22em] text-mute font-mono">
                  {f.label}
                </div>
                <div className="text-[11px] text-faint mt-1">{f.hint}</div>
              </div>
              <div className="text-xl sm:text-2xl font-bold tabular-nums tracking-tight">
                {formatDecimal(f.val, 4)}
              </div>
            </div>
            <div className="relative h-1.5 rounded-full bg-[var(--surface)] overflow-hidden mt-3">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.9, delay: 0.15 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="h-full rounded-full"
                style={{
                  background: `linear-gradient(90deg, ${f.from}, ${f.to})`,
                }}
              />
            </div>
          </motion.div>
        );
      })}
    </div>
  );
}
