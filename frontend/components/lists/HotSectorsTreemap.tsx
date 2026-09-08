"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { formatCurrency } from "@/lib/api";
import { SUBSCRIBE_HREF } from "@/lib/funnel";
import { PRODUCT_NAME } from "@/components/premium/PaywallCta";

/** What a tile needs — a subset of the Hot Sectors row. */
export interface TreemapSector {
  key: string;
  label: string;
  rank: number;
  dollarVolume: number;
  netVolumeFlow: number;
  netFlowPct: number | null;
  volumeVsAvgPct: number | null;
  flowIntensity: number;
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Squarified treemap (Bruls, Huizing, van Wijk). `values` must be sorted
 * descending and positive; returns one rect per value in the same order.
 */
function squarify(values: number[], rect: Rect): Rect[] {
  const out: Rect[] = [];
  const total = values.reduce((a, b) => a + b, 0);
  if (!total || !values.length) return out;
  const area = rect.w * rect.h;
  const scaled = values.map((v) => (v / total) * area);
  let free: Rect = { ...rect };
  let row: number[] = [];
  let i = 0;

  const worst = (r: number[], side: number): number => {
    const s = r.reduce((a, b) => a + b, 0);
    if (!s || !side) return Infinity;
    const mx = Math.max(...r);
    const mn = Math.min(...r);
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  const layoutRow = (r: number[], f: Rect): Rect => {
    const s = r.reduce((a, b) => a + b, 0);
    const horizontal = f.w >= f.h; // lay the row along the shorter side
    if (horizontal) {
      const colW = s / f.h;
      let y = f.y;
      for (const v of r) {
        const h = v / colW;
        out.push({ x: f.x, y, w: colW, h });
        y += h;
      }
      return { x: f.x + colW, y: f.y, w: f.w - colW, h: f.h };
    }
    const rowH = s / f.w;
    let x = f.x;
    for (const v of r) {
      const w = v / rowH;
      out.push({ x, y: f.y, w, h: rowH });
      x += w;
    }
    return { x: f.x, y: f.y + rowH, w: f.w, h: f.h - rowH };
  };

  while (i < scaled.length) {
    const side = Math.min(free.w, free.h);
    const v = scaled[i];
    if (!row.length || worst([...row, v], side) <= worst(row, side)) {
      row.push(v);
      i++;
    } else {
      free = layoutRow(row, free);
      row = [];
    }
  }
  if (row.length) layoutRow(row, free);
  return out;
}

const signed = (v: number | null | undefined, dp = 1): string =>
  v == null ? "—" : `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(dp)}%`;
const signedMoney = (v: number): string =>
  v === 0 ? "$0" : `${v > 0 ? "+" : "−"}${formatCurrency(Math.abs(v))}`;

/** Tile fill: brand green for inflow, brand red for outflow, mixed into the
 *  card background by intensity so both themes read correctly. */
function tileBackground(s: TreemapSector): string {
  if (s.netFlowPct == null || s.netVolumeFlow === 0) return "var(--bg-3)";
  const base = s.netVolumeFlow > 0 ? "var(--good)" : "var(--bad)";
  const pct = Math.round(14 + 66 * Math.max(0, Math.min(1, s.flowIntensity)));
  return `color-mix(in srgb, ${base} ${pct}%, var(--bg-2))`;
}

/**
 * The Hot Sectors heat map (client 2026-09-08): tile size = the sector's
 * session dollar volume, tile colour = net flow direction and strength
 * (green inflow / red outflow). Sizes are laid out with a squarified treemap
 * in pixel space, so the container is measured and given a fixed aspect.
 *
 * Paygate: while `locked`, the sector NAME on a tile is a blurred decoy (the
 * real label never enters the DOM — same rule as the table) and the tile links
 * to the subscribe page; every number stays visible.
 */
export function HotSectorsTreemap({
  sectors,
  locked,
  decoyLabel,
  activeKey,
  onSelect,
}: {
  sectors: TreemapSector[];
  locked: boolean;
  /** Decoy name for a masked tile, by zero-based rank. */
  decoyLabel: (i: number) => string;
  activeKey: string | null;
  onSelect: (key: string) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  // Wide screens get a cinema strip, phones a taller block.
  const height = width < 640 ? Math.round(width * 1.1) : Math.max(320, Math.min(520, Math.round(width * 0.46)));

  const { ordered, rects } = useMemo(() => {
    const ordered = sectors
      .filter((s) => s.dollarVolume > 0)
      .sort((a, b) => b.dollarVolume - a.dollarVolume);
    const rects = width > 0 ? squarify(ordered.map((s) => s.dollarVolume), { x: 0, y: 0, w: width, h: height }) : [];
    return { ordered, rects };
  }, [sectors, width, height]);

  return (
    <div
      ref={ref}
      className="relative w-full rounded-xl overflow-hidden"
      style={{ height, background: "var(--border)" }}
      role="list"
      aria-label="Sector heat map by net trading-volume flow"
    >
      {ordered.map((s, i) => {
        const r = rects[i];
        if (!r) return null;
        const area = r.w * r.h;
        const big = area > 26_000 && r.w > 150;
        const mid = area > 9_000 && r.w > 96;
        const tiny = r.w < 64 || r.h < 40;
        const active = s.key === activeKey;
        const style: React.CSSProperties = {
          position: "absolute",
          left: r.x,
          top: r.y,
          width: Math.max(0, r.w - 2),
          height: Math.max(0, r.h - 2),
          margin: 1,
          background: tileBackground(s),
          color: "var(--text)",
          outline: active ? "2px solid var(--accent)" : undefined,
          outlineOffset: -2,
        };
        const numbers = !tiny && (
          <div className="mt-auto leading-tight">
            <div
              className={`font-bold tabular ${big ? "text-[15px]" : "text-[12px]"}`}
              style={{ color: s.netVolumeFlow >= 0 ? "var(--good)" : "var(--bad)" }}
              title="Net dollar volume: volume in members trading up minus volume in members trading down"
            >
              {signedMoney(s.netVolumeFlow)}
            </div>
            {mid && (
              <div className="text-[11px] text-mute tabular whitespace-nowrap">
                {formatCurrency(s.dollarVolume)} vol · {signed(s.volumeVsAvgPct, 0)} vs avg
              </div>
            )}
          </div>
        );
        const label = locked ? (
          <span className="relative inline-flex items-center gap-1 max-w-full">
            <span aria-hidden className="select-none truncate" style={{ filter: "blur(5px)" }}>
              {decoyLabel(s.rank - 1)}
            </span>
            <Lock className="h-3.5 w-3.5 flex-shrink-0" style={{ color: "var(--premium)" }} />
            <span className="sr-only">sector name — included with {PRODUCT_NAME}</span>
          </span>
        ) : (
          <span className="truncate">{s.label}</span>
        );
        const inner = (
          <>
            <div className={`flex items-start gap-1.5 min-w-0 ${big ? "text-[15px]" : "text-[12.5px]"} font-bold`}>
              <span className="text-mute tabular font-semibold">#{s.rank}</span>
              {!tiny && label}
            </div>
            {numbers}
          </>
        );
        const cls =
          "flex flex-col p-2 rounded-md text-left transition hover:brightness-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)]";
        return locked ? (
          <Link
            key={s.key}
            href={SUBSCRIBE_HREF}
            role="listitem"
            className={cls}
            style={style}
            title={`Unlock sector names — included with ${PRODUCT_NAME}`}
          >
            {inner}
          </Link>
        ) : (
          <button
            key={s.key}
            type="button"
            role="listitem"
            className={cls}
            style={style}
            onClick={() => onSelect(s.key)}
            aria-pressed={active}
            title={`${s.label}: ${signedMoney(s.netVolumeFlow)} net flow on ${formatCurrency(s.dollarVolume)} volume — click for its stocks`}
          >
            {inner}
          </button>
        );
      })}
    </div>
  );
}
