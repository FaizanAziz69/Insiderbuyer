"use client";
import { motion } from "framer-motion";

interface Point {
  asOfDate: string;
  iqs: number;
}

/** IQS trend over time — one point per scoring run, on the 0–100 scale.
 *  Pure-SVG line chart so it stays light enough for every stock page. */
export function IqsTrendChart({
  history,
  height = 180,
}: {
  history: Point[];
  height?: number;
}) {
  if (!history || history.length === 0) return null;

  const W = 720;
  const H = height;
  const PAD_L = 34;
  const PAD_R = 12;
  const PAD_T = 14;
  const PAD_B = 26;
  const innerW = W - PAD_L - PAD_R;
  const innerH = H - PAD_T - PAD_B;

  const pts = history.slice(-60); // last ~2 months of runs
  const xFor = (i: number) =>
    PAD_L + (pts.length === 1 ? innerW / 2 : (i / (pts.length - 1)) * innerW);
  const yFor = (iqs: number) =>
    PAD_T + innerH - (Math.max(0, Math.min(100, iqs)) / 100) * innerH;

  const path = pts
    .map((p, i) => `${i === 0 ? "M" : "L"}${xFor(i).toFixed(1)},${yFor(p.iqs).toFixed(1)}`)
    .join(" ");
  const areaPath = `${path} L${xFor(pts.length - 1).toFixed(1)},${PAD_T + innerH} L${PAD_L},${PAD_T + innerH} Z`;

  const latest = pts[pts.length - 1];
  const first = pts[0];
  const delta = latest.iqs - first.iqs;

  const fmtDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });

  return (
    <div
      className="rounded-lg overflow-hidden"
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
    >
      <div
        className="flex items-center justify-between px-4 py-3 border-b"
        style={{ borderColor: "var(--border)", background: "var(--bg-3)" }}
      >
        <h3 className="text-[12px] font-bold uppercase tracking-wider">
          IQS Trend Over Time
        </h3>
        <span
          className="tabular font-bold text-[12px]"
          style={{ color: delta >= 0 ? "var(--good)" : "var(--bad)" }}
        >
          {delta >= 0 ? "+" : ""}
          {delta.toFixed(1)} since {fmtDate(first.asOfDate)}
        </span>
      </div>
      <div className="p-3">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ display: "block" }}>
          <defs>
            <linearGradient id="iqs-trend-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.30" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {/* gridlines at 0 / 25 / 50 / 75 / 100 */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line
                x1={PAD_L}
                x2={W - PAD_R}
                y1={yFor(v)}
                y2={yFor(v)}
                stroke="var(--border)"
                strokeWidth={1}
                strokeDasharray={v === 0 ? undefined : "3 4"}
              />
              <text
                x={PAD_L - 6}
                y={yFor(v) + 3.5}
                textAnchor="end"
                fontSize={10}
                fill="var(--text-mute)"
                className="tabular"
              >
                {v}
              </text>
            </g>
          ))}
          <path d={areaPath} fill="url(#iqs-trend-fill)" />
          <motion.path
            d={path}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
          />
          {pts.map((p, i) => (
            <circle
              key={p.asOfDate + i}
              cx={xFor(i)}
              cy={yFor(p.iqs)}
              r={pts.length > 20 ? 2 : 3}
              fill="var(--accent)"
            >
              <title>{`${fmtDate(p.asOfDate)} — IQS ${p.iqs.toFixed(1)}`}</title>
            </circle>
          ))}
          {/* x labels: first / middle / last */}
          {[0, Math.floor((pts.length - 1) / 2), pts.length - 1]
            .filter((v, i, a) => a.indexOf(v) === i)
            .map((i) => (
              <text
                key={i}
                x={xFor(i)}
                y={H - 8}
                textAnchor={i === 0 ? "start" : i === pts.length - 1 ? "end" : "middle"}
                fontSize={10}
                fill="var(--text-mute)"
              >
                {fmtDate(pts[i].asOfDate)}
              </text>
            ))}
        </svg>
        <p className="text-[11px] text-faint mt-1 px-1">
          Composite IQS (0–100) recomputed on each scoring run from live SEC
          Form 4 data.
        </p>
      </div>
    </div>
  );
}
