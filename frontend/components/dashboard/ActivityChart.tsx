"use client";
import { useState } from "react";

interface Day {
  date: string;
  count: number;
  value: number;
}

export function ActivityChart({ days }: { days: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.count));

  return (
    <div className="card p-5">
      <div className="flex items-baseline justify-between mb-4">
        <div>
          <div className="text-[15px] font-semibold">7-day insider activity</div>
          <div className="text-xs text-mute mt-0.5">Daily count of insider buys</div>
        </div>
        <div className="text-xs text-mute tabular">
          {days.reduce((a, d) => a + d.count, 0)} trades total
        </div>
      </div>

      <div className="relative h-48">
        <div className="absolute inset-0 flex items-end justify-between gap-2">
          {days.map((d, i) => {
            const h = (d.count / max) * 100;
            const date = new Date(d.date);
            const label = date.toLocaleDateString(undefined, { weekday: "short" });
            const isActive = hover === i;
            return (
              <div
                key={d.date}
                className="flex-1 flex flex-col items-center justify-end gap-2 group cursor-pointer"
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
              >
                {isActive && (
                  <div
                    className="absolute z-10 text-[11px] font-semibold px-2 py-1.5 rounded-md whitespace-nowrap pointer-events-none"
                    style={{
                      background: "var(--bg-3)",
                      color: "var(--text)",
                      border: "1px solid var(--border-strong)",
                      transform: `translate(${(i / (days.length - 1)) * 100 - 50}%, -32px)`,
                      left: `${(i / Math.max(1, days.length - 1)) * 100}%`,
                      top: 0,
                    }}
                  >
                    {d.count} trades · {d.date}
                  </div>
                )}
                <div
                  className="w-full rounded-t transition-all duration-300 origin-bottom"
                  style={{
                    height: `${Math.max(h, 4)}%`,
                    background:
                      "linear-gradient(180deg, var(--accent), color-mix(in srgb, var(--accent) 50%, var(--bg-1)))",
                    opacity: isActive ? 1 : 0.85,
                    transform: isActive ? "scaleY(1.04)" : "scaleY(1)",
                  }}
                />
                <div className="text-[10px] text-mute font-mono">{label}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
