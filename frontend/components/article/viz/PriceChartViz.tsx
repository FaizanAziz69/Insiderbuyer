"use client";
import { useMemo } from "react";
import useSWR from "swr";
import { API_BASE, fetcher, formatDate } from "@/lib/api";
import { VizFrame, VizSkeleton } from "./VizFrame";

/**
 * §7 viz 8 — plain share-price chart. Market data only, no insider layer.
 *
 * Added 2026-09-04, on the client's instruction that most Top Stories are to
 * "report the story the same way it is reported by mainstream media". Every
 * other approved viz reads our Form 4 record, so a straight news story had no
 * chart it could carry without turning into an insider piece — `price-markers`
 * is titled "price vs. insider purchases" and captions the absence of buying,
 * which is exactly the framing those stories are meant to drop.
 *
 * Closing prices with the window's move, low and high. Static SVG for the same
 * reason as price-markers: mid-article is no place for a hover chart, and the
 * interactive one lives on the company page.
 *
 * `<div data-viz="price-chart" data-ticker="GPRO" data-range="1y"></div>`
 */

interface Bar {
  date: string;
  close: number;
}

export function PriceChartViz({
  ticker,
  range = "1y",
}: {
  ticker: string;
  range?: string;
}) {
  const sym = ticker.toUpperCase();
  const { data: hist, isLoading } = useSWR<{ history: { bars: Bar[] } | null }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(sym)}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );

  const bars = hist?.history?.bars || [];

  const geo = useMemo(() => {
    if (bars.length < 2) return null;
    const W = 1000;
    const H = 240;
    const PAD_T = 12;
    const PAD_B = 22;
    const closes = bars.map((b) => b.close);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const rng = max - min || 1;
    const x = (i: number) => (i / (closes.length - 1)) * W;
    const y = (c: number) => PAD_T + (H - PAD_T - PAD_B) * (1 - (c - min) / rng);
    const pts = closes.map((c, i) => ({ x: x(i), y: y(c) }));
    const line = "M " + pts.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" L ");
    const first = closes[0];
    const last = closes[closes.length - 1];
    return {
      W,
      H,
      line,
      area: `${line} L ${W},${H - PAD_B} L 0,${H - PAD_B} Z`,
      min,
      max,
      first,
      last,
      changePct: first ? ((last - first) / first) * 100 : 0,
      lastPoint: pts[pts.length - 1],
    };
  }, [bars]);

  if (isLoading && bars.length === 0) return <VizSkeleton height={280} />;
  if (!geo) return null;

  const up = geo.changePct >= 0;
  // Gains green, losses red — the site's own convention, not the accent blue
  // the insider charts use, because this one is a market chart.
  const stroke = up ? "var(--good)" : "var(--bad)";
  const money = (n: number) => `$${n.toFixed(2)}`;

  return (
    <VizFrame
      title={`${sym} share price`}
      subtitle={`${formatDate(bars[0]?.date)} – ${formatDate(bars[bars.length - 1]?.date)}`}
      source="Market data, reviewed by InsiderBuying.com"
      footnote={
        <>
          Closed at <strong>{money(geo.last)}</strong>, {up ? "up" : "down"}{" "}
          {Math.abs(geo.changePct).toFixed(1)}% over the window. Range{" "}
          {money(geo.min)} – {money(geo.max)}.
        </>
      }
    >
      <div className="px-3 pt-3 pb-1">
        <svg
          viewBox={`0 0 ${geo.W} ${geo.H}`}
          width="100%"
          height={240}
          role="img"
          aria-label={`${sym} closing price, ${formatDate(bars[0]?.date)} to ${formatDate(
            bars[bars.length - 1]?.date,
          )}`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`pc-fill-${sym}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={stroke} stopOpacity="0.20" />
              <stop offset="100%" stopColor={stroke} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill={`url(#pc-fill-${sym})`} />
          <path
            d={geo.line}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          <circle cx={geo.lastPoint.x} cy={geo.lastPoint.y} r={4} fill={stroke} />
        </svg>
      </div>
    </VizFrame>
  );
}
