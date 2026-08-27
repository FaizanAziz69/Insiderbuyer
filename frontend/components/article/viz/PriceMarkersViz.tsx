"use client";
import { useMemo } from "react";
import useSWR from "swr";
import Link from "next/link";
import {
  API_BASE,
  CompanyDetail,
  fetcher,
  formatCurrency,
  formatDate,
} from "@/lib/api";
import { VizFrame, VizSkeleton } from "./VizFrame";

/**
 * §7 viz 4 — Stock Price vs. Insider Buy Markers. "Show the price chart with
 * the purchase markers — visually demonstrates timing relative to price."
 *
 * The one viz that answers "was this purchase a signal?" on sight: a year of
 * closes with a dot on every open-market purchase, placed at the close of the
 * nearest trading day. A company with no purchases in the window still draws —
 * the empty chart with the "no purchases" caption is the Moderna case again,
 * and hiding it would hide the story.
 *
 * Static SVG on purpose. This sits mid-article, where a hover-tooltip chart
 * competes with reading; the interactive one lives on the company page, which
 * the caption links to.
 *
 * `data-viz="price-markers" data-ticker="CCJ" data-range="1y"`
 */

interface Bar {
  date: string;
  close: number;
}

export function PriceMarkersViz({
  ticker,
  range = "1y",
}: {
  ticker: string;
  range?: string;
}) {
  const sym = ticker.toUpperCase();
  const { data: hist, isLoading: loadingHist } = useSWR<{
    history: { bars: Bar[] } | null;
  }>(
    `${API_BASE}/market-stats/history?symbol=${encodeURIComponent(sym)}&range=${range}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 10 * 60_000 },
  );
  const { data: detail } = useSWR<CompanyDetail>(
    `${API_BASE}/companies/${encodeURIComponent(sym)}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000 },
  );

  const bars = hist?.history?.bars || [];
  const purchases = useMemo(
    () =>
      (detail?.transactions || [])
        .filter((t) => t.transactionCode === "P" && !t.priceSuspect)
        .slice(0, 40),
    [detail],
  );

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

    // Each purchase lands on the nearest bar by date — Form 4 transaction
    // dates include days the market was shut.
    const barTimes = bars.map((b) => Date.parse(b.date));
    const markers = purchases
      .map((t) => {
        const target = Date.parse(t.transactionDate);
        if (!Number.isFinite(target)) return null;
        let best = -1;
        let bestGap = Infinity;
        for (let i = 0; i < barTimes.length; i++) {
          const gap = Math.abs(barTimes[i] - target);
          if (gap < bestGap) {
            bestGap = gap;
            best = i;
          }
        }
        // A purchase outside the charted window has no honest position on it.
        if (best < 0 || bestGap > 10 * 86400_000) return null;
        return {
          id: t.id,
          x: x(best),
          y: y(bars[best].close),
          value: Number(t.totalValue),
          date: t.transactionDate,
          insider: t.insiderName,
        };
      })
      .filter(Boolean) as Array<{
      id: string;
      x: number;
      y: number;
      value: number;
      date: string;
      insider: string;
    }>;

    return { W, H, line, area: `${line} L ${W},${H - PAD_B} L 0,${H - PAD_B} Z`, min, max, markers };
  }, [bars, purchases]);

  if (loadingHist && bars.length === 0) return <VizSkeleton height={280} />;
  if (!geo) return null;

  const firstDate = bars[0]?.date;
  const lastDate = bars[bars.length - 1]?.date;
  const inWindow = geo.markers.length;
  const biggest = [...geo.markers].sort((a, b) => b.value - a.value)[0] || null;

  return (
    <VizFrame
      title={`${sym} price vs. insider purchases`}
      subtitle={`${formatDate(firstDate)} – ${formatDate(lastDate)}`}
      footnote={
        inWindow === 0 ? (
          <strong style={{ color: "var(--text-soft)" }}>
            No open-market purchases were filed inside this window.
          </strong>
        ) : (
          <>
            {inWindow} open-market purchase{inWindow === 1 ? "" : "s"} marked
            {biggest
              ? `, the largest ${formatCurrency(biggest.value)} by ${biggest.insider} on ${formatDate(biggest.date)}`
              : ""}
            .{" "}
            <Link href={`/companies/${sym}`} className="text-accent hover:underline">
              Interactive chart →
            </Link>
          </>
        )
      }
    >
      <div className="px-3 pt-3 pb-1">
        <svg
          viewBox={`0 0 ${geo.W} ${geo.H}`}
          width="100%"
          height={240}
          role="img"
          aria-label={`${sym} closing price with ${inWindow} insider purchase markers`}
          preserveAspectRatio="none"
        >
          <defs>
            <linearGradient id={`pm-fill-${sym}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.20" />
              <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d={geo.area} fill={`url(#pm-fill-${sym})`} />
          <path
            d={geo.line}
            fill="none"
            stroke="var(--accent)"
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
          {geo.markers.map((m) => (
            <g key={m.id}>
              <circle
                cx={m.x}
                cy={m.y}
                r={5.5}
                fill="var(--good)"
                stroke="var(--bg-2)"
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              <title>{`${m.insider} — ${formatCurrency(m.value)} on ${formatDate(m.date)}`}</title>
            </g>
          ))}
        </svg>
        <div
          className="flex items-center justify-between text-[11px] tabular pt-1"
          style={{ color: "var(--text-mute)" }}
        >
          <span>Low ${geo.min.toFixed(2)}</span>
          <span className="inline-flex items-center gap-1.5">
            <span
              className="inline-block rounded-full"
              style={{ width: 8, height: 8, background: "var(--good)" }}
            />
            Open-market purchase
          </span>
          <span>High ${geo.max.toFixed(2)}</span>
        </div>
      </div>
    </VizFrame>
  );
}
