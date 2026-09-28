"use client";

/**
 * §5.1's card sparkline: the strategy against the S&P 500.
 *
 * Both lines are scaled to the SAME range, not each to its own, because two
 * curves normalised separately always look close and the comparison the brief
 * wants is whether one beat the other.
 */
export function Sparkline({
  points,
  width = 120,
  height = 34,
}: {
  points: Array<{ v: number; b: number }>;
  width?: number;
  height?: number;
}) {
  if (!points?.length) {
    return <div style={{ width, height }} className="rounded" aria-hidden />;
  }
  const all = points.flatMap((p) => [p.v, p.b]).filter((n) => Number.isFinite(n));
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = hi - lo || 1;
  const x = (i: number) => (i / Math.max(1, points.length - 1)) * width;
  const y = (v: number) => height - ((v - lo) / span) * height;
  const path = (key: "v" | "b") =>
    points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[key]).toFixed(1)}`).join(" ");
  const last = points[points.length - 1];
  const ahead = last.v >= last.b;
  return (
    <svg width={width} height={height} aria-hidden style={{ overflow: "visible" }}>
      <path d={path("b")} fill="none" stroke="var(--text-faint)" strokeWidth="1.25" />
      <path
        d={path("v")}
        fill="none"
        stroke={ahead ? "var(--good)" : "var(--bad)"}
        strokeWidth="1.75"
      />
    </svg>
  );
}
