"use client";
import { motion } from "framer-motion";
import { useState } from "react";

interface Day {
  date: string;
  count: number;
  value: number;
}

export function ActivityChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));
  const totalTrades = days.reduce((a, d) => a + d.count, 0);

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-baseline justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="text-[15px] font-semibold">30-day insider activity</div>
            <span className="live-dot live-dot-good text-faint">live</span>
          </div>
          <div className="text-xs text-mute mt-0.5">Daily count of insider buys</div>
        </div>
        <div className="text-sm text-mute tabular font-medium">
          <span className="text-good font-bold">{totalTrades}</span> trades · last 30d
        </div>
      </div>

      <div className="relative h-56">
        <div className="absolute inset-0 flex items-end justify-between gap-[3px] sm:gap-1">
          {days.map((d, i) => {
            const h = (d.count / max) * 100;
            const date = new Date(d.date);
            const showLabel = days.length <= 10 || i % 5 === 0 || i === days.length - 1;
            const label = showLabel
              ? date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
              : "";
            const dayNum = "";
            const isActive = hover === i;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end gap-2 group cursor-pointer relative"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {isActive && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="absolute -top-12 z-10 text-[11px] font-semibold px-2.5 py-1.5 rounded-lg whitespace-nowrap pointer-events-none"
                    style={{
                      background: "var(--text)",
                      color: "var(--bg-2)",
                      boxShadow: "var(--shadow-lg)",
                    }}
                  >
                    {d.count} trades · {d.date}
                  </motion.div>
                )}
                <motion.div
                  initial={{ scaleY: 0, opacity: 0 }}
                  animate={{ scaleY: 1, opacity: 1 }}
                  transition={{
                    duration: 0.7,
                    delay: 0.1 + i * 0.08,
                    ease: [0.22, 1, 0.36, 1],
                  }}
                  className="w-full rounded-md relative overflow-hidden"
                  style={{
                    height: `${Math.max(h, 4)}%`,
                    background: isActive
                      ? "linear-gradient(180deg, var(--accent), var(--accent-2))"
                      : "linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 50%, var(--bg-3)))",
                    transformOrigin: "bottom",
                    boxShadow: isActive ? "0 0 16px var(--accent-soft)" : "none",
                  }}
                >
                  <div
                    className="absolute inset-x-0 top-0 h-px"
                    style={{
                      background: "rgba(255,255,255,0.3)",
                    }}
                  />
                </motion.div>
                <div className="text-center">
                  <div className="text-[10px] text-mute font-mono">{label}</div>
                  <div className="text-[10px] text-faint font-mono">{dayNum}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
