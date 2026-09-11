"use client";

/** A price line for the panel — inline SVG, no chart library, theme-aware.
 *  §7.1 calls for "an updating price sparkline"; it redraws on every patch
 *  because the points come straight from the store the bubbles read. */
export function Sparkline({
  points,
  height = 56,
  color,
}: {
  points: { t: number; p: number }[];
  height?: number;
  color?: string;
}) {
  if (!points || points.length < 2) {
    return (
      <div
        style={{
          height,
          display: "grid",
          placeItems: "center",
          fontSize: 11,
          color: "var(--text-faint)",
          border: "1px dashed var(--viz-line)",
          borderRadius: 9,
        }}
      >
        No price history yet
      </div>
    );
  }
  const W = 100;
  const H = 100;
  const xs = points.map((d) => d.t);
  const ys = points.map((d) => d.p);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);
  const spanX = x1 - x0 || 1;
  // A flat line should sit mid-box, not on the floor.
  const pad = (y1 - y0) * 0.12 || 0.02;
  const lo = Math.max(0, y0 - pad);
  const hi = Math.min(1, y1 + pad);
  const spanY = hi - lo || 1;
  const px = (d: { t: number; p: number }) => ((d.t - x0) / spanX) * W;
  const py = (d: { t: number; p: number }) => H - ((d.p - lo) / spanY) * H;
  const line = points.map((d, i) => `${i === 0 ? "M" : "L"}${px(d).toFixed(2)},${py(d).toFixed(2)}`).join(" ");
  const area = `${line} L${W},${H} L0,${H} Z`;
  const stroke = color ?? (ys[ys.length - 1] >= ys[0] ? "var(--viz-good)" : "var(--viz-bad)");
  const gid = `sparkfill-${Math.abs(Math.round(x0))}`;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      preserveAspectRatio="none"
      style={{ width: "100%", height, display: "block" }}
      aria-hidden
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={stroke} stopOpacity="0.28" />
          <stop offset="100%" stopColor={stroke} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gid})`} />
      <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** §7.1 the YES/NO split bar. */
export function SplitBar({ yes }: { yes: number | null }) {
  const y = yes == null ? 0.5 : Math.min(1, Math.max(0, yes));
  return (
    <div
      style={{
        display: "flex",
        height: 26,
        borderRadius: 7,
        overflow: "hidden",
        border: "1px solid var(--viz-line)",
        fontFamily: "var(--viz-mono), monospace",
        fontSize: 11,
        fontWeight: 700,
      }}
    >
      <div
        style={{
          width: `${y * 100}%`,
          background: "color-mix(in srgb, var(--good) 38%, transparent)",
          color: "var(--viz-good)",
          display: "grid",
          placeItems: "center",
          minWidth: y > 0.14 ? undefined : 0,
          overflow: "hidden",
        }}
      >
        {y > 0.14 ? `YES ${Math.round(y * 100)}%` : ""}
      </div>
      <div
        style={{
          flex: 1,
          background: "color-mix(in srgb, var(--bad) 30%, transparent)",
          color: "var(--viz-bad)",
          display: "grid",
          placeItems: "center",
          overflow: "hidden",
        }}
      >
        {1 - y > 0.14 ? `NO ${Math.round((1 - y) * 100)}%` : ""}
      </div>
    </div>
  );
}
