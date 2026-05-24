"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { formatCurrency } from "@/lib/api";

interface Sector {
  name: string;
  value: number;
  count: number;
}

function colorFor(intensity: number) {
  if (intensity >= 0.7)
    return {
      bg: "linear-gradient(135deg, var(--good-strong), var(--good))",
      fg: "#ffffff",
    };
  if (intensity >= 0.4)
    return {
      bg: "linear-gradient(135deg, var(--accent), var(--accent-2))",
      fg: "#ffffff",
    };
  if (intensity >= 0.15)
    return {
      bg: "linear-gradient(135deg, var(--accent-soft), var(--bg-3))",
      fg: "var(--text)",
    };
  return { bg: "var(--bg-3)", fg: "var(--text-soft)" };
}

export function SectorHeatmap({ sectors }: { sectors: Sector[] }) {
  const cells = sectors.slice(0, 6);
  const total = cells.reduce((a, s) => a + s.value, 0) || 1;
  const max = cells[0]?.value || 1;

  return (
    <div className="card p-5 sm:p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="text-[15px] font-semibold">Sector insider activity</div>
            <span className="live-dot live-dot-good text-faint">live</span>
          </div>
          <div className="text-xs text-mute mt-0.5">Last 7 days, by purchase volume</div>
        </div>
        <Link href="/sectors" className="text-xs text-accent hover:underline font-medium">
          View all →
        </Link>
      </div>
      {cells.length === 0 ? (
        <div className="text-sm text-mute py-8 text-center">No sector activity yet.</div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {cells.map((s, i) => {
            const intensity = s.value / max;
            const { bg, fg } = colorFor(intensity);
            const pct = ((s.value / total) * 100).toFixed(1);
            return (
              <motion.div
                key={s.name}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
              >
                <Link
                  href="/sectors"
                  className="heatmap-cell block"
                  style={{ background: bg, color: fg, minHeight: 112 }}
                  title={`${pct}% of weekly volume · ${s.count} trades`}
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wider opacity-90 truncate">
                    {s.name}
                  </div>
                  <div className="text-xl font-bold tabular mt-2">
                    {formatCurrency(s.value)}
                  </div>
                  <div className="text-[11px] opacity-85 mt-0.5">
                    {pct}% · {s.count} trades
                  </div>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}
