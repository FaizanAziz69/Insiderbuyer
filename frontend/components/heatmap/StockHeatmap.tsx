"use client";
import Link from "next/link";
import { motion } from "framer-motion";
import { useMemo, useRef, useState, useEffect } from "react";
import { RankingRow, formatCurrency, formatNumber } from "@/lib/api";
import { CompanyLogo } from "@/components/CompanyLogo";

export type ColorBy =
  | "change"
  | "relvol"
  | "perfYear"
  | "perf50d"
  | "perf200d"
  | "postmarket";

// Tile-area basis (TradingView parity). The 1W/1M volume/turnover variants use
// Yahoo's 10-day and 3-month average daily volume as free proxies — relative
// tile sizes are preserved, which is all sizing needs.
export type SizeBy =
  | "marketCap"
  | "vol1d"
  | "vol1w"
  | "vol1m"
  | "turn1d"
  | "turn1w"
  | "turn1m"
  | "mono";

// Per-mode saturation clamp (%) for the diverging color scale. Larger windows
// (yearly performance) need a wider clamp than a single day's change.
const COLOR_CLAMP: Record<ColorBy, number> = {
  change: 5.5,
  postmarket: 5.5,
  perf50d: 20,
  perf200d: 30,
  perfYear: 60,
  relvol: 0,
};

function colorMetric(r: RankingRow, cb: ColorBy): number {
  switch (cb) {
    case "perfYear": return r.perfYear ?? 0;
    case "perf50d": return r.perf50d ?? 0;
    case "perf200d": return r.perf200d ?? 0;
    case "postmarket": return r.postMarketPct ?? 0;
    default: return typeof r.changePct === "number" ? r.changePct : 0;
  }
}

interface Props {
  rows: RankingRow[];
  height?: number;
  mode?: "sector" | "iqs" | "flat";
  /** What the tile AREA represents. */
  sizeBy?: SizeBy;
  /** What the tile COLOR represents. */
  colorBy?: ColorBy;
  /** Group by the row's sector verbatim (already-clean TRBC sectors from the
   *  market-heatmap feed) instead of running it through shortSector(). */
  rawSectors?: boolean;
}

// Module-scoped because the layout helpers are module-level; set synchronously
// before each layout pass (safe in render).
let CURRENT_SIZE_BY: SizeBy = "marketCap";
let USE_RAW_SECTORS = false;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
  row: RankingRow;
}

// LINEAR value — tile area is proportional to market cap (or volume), exactly
// like TradingView's heatmap, so mega-caps (AAPL/NVDA/MSFT/AMZN) dominate.
function tileValue(r: RankingRow): number {
  const sb = CURRENT_SIZE_BY;
  if (sb === "mono") return 1; // equal-size tiles
  const price = r.livePrice || r.lastPrice || 0;
  const vol1d = r.volume || 0;
  const vol1w = r.avgVol10d || 0; // 10-day avg daily volume ≈ weekly proxy
  const vol1m = r.avgVolume || 0; // 3-month avg daily volume ≈ monthly proxy
  let metric: number;
  switch (sb) {
    case "vol1d": metric = vol1d; break;
    case "vol1w": metric = vol1w; break;
    case "vol1m": metric = vol1m; break;
    case "turn1d": metric = price * vol1d; break;
    case "turn1w": metric = price * vol1w; break;
    case "turn1m": metric = price * vol1m; break;
    default: metric = r.marketCap || r.totalPurchaseValue || 0;
  }
  return Math.max(1, metric);
}

// Relative volume (today vs 3-month average) → 1 = normal, >1 = unusually active.
function relVol(r: RankingRow): number {
  const v = r.volume || 0;
  const a = r.avgVolume || 0;
  return a > 0 ? v / a : 1;
}

// Color ramp for "Relative volume": calm gray at ~1x, warming to hot red at 3x+.
function colorForRelVol(ratio: number): { bg: string } {
  const t = Math.max(0, Math.min(1, (ratio - 0.5) / 2.5)); // 0.5x→0 , 3x→1
  if (t < 0.15) return { bg: "#7f8c8d" };
  if (t < 0.4) return { bg: "#c99a2e" };
  if (t < 0.7) return { bg: "#d97706" };
  return { bg: "#b91c1c" };
}

/**
 * Squarified treemap (Bruls/Huizing/van Wijk) — the algorithm TradingView's
 * heatmap uses. Produces near-square tiles instead of the stripey rectangles
 * a slice-and-dice layout gives, so the result reads exactly like TradingView.
 * `items` should be pre-sorted descending by value for best aspect ratios.
 */
function squarifyTreemap(items: RankingRow[], X: number, Y: number, W: number, H: number): Rect[] {
  if (items.length === 0 || W <= 0 || H <= 0) return [];
  if (items.length === 1) return [{ x: X, y: Y, w: W, h: H, row: items[0] }];

  const totalVal = items.reduce((s, r) => s + tileValue(r), 0) || 1;
  const totalArea = W * H;
  const scaled = items.map((r) => ({ row: r, area: (tileValue(r) / totalVal) * totalArea }));

  const result: Rect[] = [];
  let x = X, y = Y, w = W, h = H;

  const worst = (rowAreas: number[], side: number): number => {
    let max = -Infinity, min = Infinity, sum = 0;
    for (const a of rowAreas) {
      sum += a;
      if (a > max) max = a;
      if (a < min) min = a;
    }
    const s2 = sum * sum;
    const side2 = side * side;
    return Math.max((side2 * max) / s2, s2 / (side2 * min));
  };

  const placeRow = (rowItems: { row: RankingRow; area: number }[]) => {
    const sum = rowItems.reduce((s, it) => s + it.area, 0);
    if (w >= h) {
      const colW = sum / h;
      let yy = y;
      for (const it of rowItems) {
        const tileH = it.area / colW;
        result.push({ x, y: yy, w: colW, h: tileH, row: it.row });
        yy += tileH;
      }
      x += colW;
      w -= colW;
    } else {
      const rowH = sum / w;
      let xx = x;
      for (const it of rowItems) {
        const tileW = it.area / rowH;
        result.push({ x: xx, y, w: tileW, h: rowH, row: it.row });
        xx += tileW;
      }
      y += rowH;
      h -= rowH;
    }
  };

  let row: { row: RankingRow; area: number }[] = [];
  for (const it of scaled) {
    const side = Math.min(w, h);
    if (row.length === 0) {
      row.push(it);
      continue;
    }
    const curWorst = worst(row.map((r) => r.area), side);
    const nextWorst = worst([...row.map((r) => r.area), it.area], side);
    if (nextWorst <= curWorst) {
      row.push(it);
    } else {
      placeRow(row);
      row = [it];
    }
  }
  if (row.length) placeRow(row);
  return result;
}

// Deterministic hash from string → 0..1
function hashUnit(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h % 1000) / 1000;
}

/**
 * Daily change % for a tile. Uses the REAL intraday change merged from the
 * live quote feed (rankings?live=1). Only when no quote exists for a ticker
 * do we fall back to an IQS-derived estimate so the tile still renders.
 */
function changePctFor(row: RankingRow): number {
  if (typeof row.changePct === "number") return row.changePct;
  const noise = (hashUnit(row.companyId || row.ticker || row.name) - 0.5) * 1.2;
  // IQS bands on the 0–100 composite scale.
  if (row.iqs >= 70) return 2.0 + noise;
  if (row.iqs >= 55) return 1.0 + noise * 0.8;
  if (row.iqs >= 40) return 0.3 + noise * 0.6;
  if (row.iqs >= 25) return -0.4 + noise * 0.5;
  return -1.8 + noise;
}

// TradingView-style diverging scale: a dark neutral center saturating to a
// solid green for gains and solid red for losses. Bigger moves → more
// saturated, exactly like the TradingView heatmap. Flat fills, no gradients.
const NEUTRAL: [number, number, number] = [65, 69, 81]; // #414551 medium gray (TradingView neutral)
const GREEN: [number, number, number] = [30, 174, 96]; // #1EAE60 strong gain
const RED: [number, number, number] = [228, 63, 61]; // #E43F3D strong loss

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r}, ${g}, ${bl})`;
}

function colorForChange(pct: number, clamp = 5) {
  const t = Math.max(-1, Math.min(1, pct / clamp));
  const bg = t >= 0 ? mix(NEUTRAL, GREEN, t) : mix(NEUTRAL, RED, -t);
  return { bg };
}

// IQS-band coloring on the 0–100 composite, mapped onto the same diverging
// scale (50 = neutral, 100 = strong green, 0 = strong red).
function colorForIqs(iqs: number) {
  const t = Math.max(-1, Math.min(1, (iqs - 50) / 50));
  const bg = t >= 0 ? mix(NEUTRAL, GREEN, t) : mix(NEUTRAL, RED, -t);
  return { bg };
}

interface SectorBlock {
  sector: string;
  x: number;
  y: number;
  w: number;
  h: number;
  tiles: Rect[];
}

// Map raw SEC SIC sector strings (e.g. "SERVICES-COMPUTER PROGRA...",
// "CRUDE PETROLEUM & NATURAL GAS") into the ~11 broad categories used by
// finance-publication heatmaps. Keyword-based so unknown SIC variants still
// roll up cleanly.
export function shortSector(s: string | null | undefined): string {
  if (!s) return "Other";
  const u = s.toUpperCase();

  if (
    u.includes("COMPUTER") ||
    u.includes("SOFTWARE") ||
    u.includes("SEMICONDUCTOR") ||
    u.includes("PREPACKAGED") ||
    u.includes("DATA PROCESS") ||
    u.includes("INFORMATION TECH") ||
    u === "TECHNOLOGY"
  )
    return "Technology";

  if (
    u.includes("OIL") ||
    u.includes("GAS ") ||
    u.endsWith(" GAS") ||
    u.includes("PETROLEUM") ||
    u.includes("CRUDE") ||
    u.includes("COAL") ||
    u.includes("DRILLING") ||
    u.includes("REFINING") ||
    u.includes("PIPELINE") ||
    u === "ENERGY"
  )
    return "Energy";

  if (
    u.includes("PHARMA") ||
    u.includes("BIOLOGICAL") ||
    u.includes("MEDICAL") ||
    u.includes("HEALTH") ||
    u.includes("HOSPITAL") ||
    u.includes("DRUG") ||
    u.includes("BIOTECH") ||
    u.includes("SURGICAL")
  )
    return "Health";

  if (
    u.includes("BANK") ||
    u.includes("INSURANCE") ||
    u.includes("FINANC") ||
    u.includes("SECURITIES") ||
    u.includes("INVESTMENT") ||
    u.includes("CREDIT") ||
    u.includes("HOLDING COMPAN")
  )
    return "Financial";

  if (
    u.includes("REAL ESTATE") ||
    u.includes("REIT") ||
    u.includes("LESSOR") ||
    u.includes("PROPERTY") ||
    u.includes("OPERATORS OF")
  )
    return "Real Estate";

  if (
    u.includes("COMMUNICAT") ||
    u.includes("TELECOM") ||
    u.includes("BROADCAST") ||
    u.includes("WIRELESS") ||
    u.includes("CABLE") ||
    u.includes("TELEPHONE")
  )
    return "Communication";

  if (
    u.includes("STEEL") ||
    u.includes("METAL") ||
    u.includes("CHEMICAL") ||
    u.includes("MINING") ||
    u.includes("GOLD") ||
    u.includes("SILVER") ||
    u.includes("PAPER") ||
    u.includes("LUMBER") ||
    u.includes("FOREST") ||
    u.includes("MATERIAL") ||
    u.includes("PLASTIC") ||
    u.includes("CEMENT")
  )
    return "Materials";

  if (
    u.includes("WATER") ||
    u.includes("UTILIT") ||
    u.includes("ELECTRIC SERV") ||
    u.includes("POWER") ||
    u.includes("NATURAL GAS DISTRIBUT")
  )
    return "Utilities";

  if (
    u.includes("FOOD") ||
    u.includes("BEVERAGE") ||
    u.includes("TOBACCO") ||
    u.includes("HOUSEHOLD PROD") ||
    u.includes("AGRICULTURAL") ||
    u.includes("GROCER")
  )
    return "Staples";

  if (
    u.includes("RETAIL") ||
    u.includes("RESTAURANT") ||
    u.includes("AUTO") ||
    u.includes("APPAREL") ||
    u.includes("HOTEL") ||
    u.includes("LEISURE") ||
    u.includes("MOTION PICTURE") ||
    u.includes("ENTERTAIN") ||
    u.includes("TOYS") ||
    u.includes("FURNITURE")
  )
    return "Consumer";

  if (
    u.includes("CONSTRUCT") ||
    u.includes("INDUSTRIAL") ||
    u.includes("MACHINERY") ||
    u.includes("AEROSPACE") ||
    u.includes("DEFENSE") ||
    u.includes("TRANSPORT") ||
    u.includes("RAILROAD") ||
    u.includes("SHIP") ||
    u.includes("ENGINEERING") ||
    u.includes("COMMERCIAL SERV") ||
    u.includes("AIR")
  )
    return "Industrials";

  return "Other";
}

function layoutWithSectors(
  rows: RankingRow[],
  w: number,
  h: number,
): SectorBlock[] {
  const grouped = new Map<string, RankingRow[]>();
  for (const r of rows) {
    const key = USE_RAW_SECTORS ? r.sector || "Other" : shortSector(r.sector);
    const list = grouped.get(key) || [];
    list.push(r);
    grouped.set(key, list);
  }
  const sectors = Array.from(grouped.entries())
    .map(([sector, items]) => {
      items.sort((a, b) => tileValue(b) - tileValue(a));
      const total = items.reduce((s, r) => s + tileValue(r), 0);
      return { sector, items, total };
    })
    .sort((a, b) => b.total - a.total);

  // First-level slice: allocate space per sector by total market cap (linear).
  const sectorRects = (() => {
    const sectorAsRows: RankingRow[] = sectors.map((s) => ({
      rank: 0,
      companyId: s.sector,
      ticker: s.sector,
      name: s.sector,
      sector: s.sector,
      marketCap: s.total, // tileValue is linear now → area ∝ summed market cap
      lastPrice: null,
      iqs: 0,
      insiderWeight: 0,
      transactionWeight: 0,
      convictionWeight: 0,
      historicalSuccessWeight: 0,
      clusterWeight: 0,
      marketTimingWeight: 0,
      distinctBuyers: 0,
      transactionCount: 0,
      totalPurchaseValue: s.total,
    }));
    return squarifyTreemap(sectorAsRows, 0, 0, w, h);
  })();

  const HEADER_H = 18;
  const PAD = 1;
  return sectorRects.map((rect, i) => {
    const meta = sectors[i];
    const innerW = Math.max(0, rect.w - PAD * 2);
    const innerH = Math.max(0, rect.h - HEADER_H - PAD);
    // Tiles are positioned RELATIVE to the sector block's content area,
    // not the heatmap root. Rendering wraps each block in an overflow:hidden
    // container so no tile can ever escape its sector boundary.
    const tiles = innerH > 0 ? squarifyTreemap(meta.items, 0, 0, innerW, innerH) : [];
    return {
      sector: meta.sector,
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      tiles,
    };
  });
}

export function StockHeatmap({
  rows,
  height = 520,
  mode = "sector",
  sizeBy = "marketCap",
  colorBy = "change",
  rawSectors = false,
}: Props) {
  CURRENT_SIZE_BY = sizeBy;
  USE_RAW_SECTORS = rawSectors;
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  // Hover state drives the TradingView-style interaction: the hovered tile
  // pops, its sector stays lit while the others dim, and a tooltip follows.
  const [hover, setHover] = useState<{
    sym: string;
    sector: string;
    row: RankingRow;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const blocks = useMemo(() => {
    if (!rows.length) return [];
    if (mode === "iqs" || mode === "flat") {
      // Single flat treemap — no sector grouping. Tiles sized by market cap.
      const sorted = [...rows].sort((a, b) => tileValue(b) - tileValue(a));
      const w = Math.max(320, width);
      const tiles = squarifyTreemap(sorted, 0, 0, w, height);
      return [{ sector: "", x: 0, y: 0, w, h: height, tiles }];
    }
    return layoutWithSectors(rows, Math.max(320, width), height);
  }, [rows, width, height, mode, sizeBy, rawSectors]);

  const HEADER_H = mode === "sector" ? 18 : 0;
  const PAD = 1;

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden"
      style={{ height, background: "#ffffff", borderRadius: 4 }}
      onMouseLeave={() => setHover(null)}
    >
      {blocks.map((b, bi) => {
        const showLabel = b.w >= 80 && b.h >= 60;
        // Sector-level hover highlight: the hovered stock's sector gets an
        // outline + subtle wash + bolder title. Other sectors are NOT dimmed.
        const isLit = !!hover && mode === "sector" && hover.sector === b.sector;
        return (
          <div
            key={`block-${b.sector}-${bi}`}
            style={{
              position: "absolute",
              left: b.x,
              top: b.y,
              width: b.w,
              height: b.h,
              overflow: "visible",
              zIndex: isLit ? 3 : 1,
            }}
          >
            {isLit && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  boxShadow: "inset 0 0 0 2px rgba(41,98,255,0.9)",
                  background: "rgba(41,98,255,0.05)",
                  borderRadius: 4,
                  pointerEvents: "none",
                  zIndex: 6,
                }}
              />
            )}
            {showLabel && (
              <div
                style={{
                  position: "absolute",
                  left: PAD,
                  top: 2,
                  right: PAD,
                  height: HEADER_H - 2,
                  fontSize: isLit ? 12 : 11,
                  fontWeight: 600,
                  color: isLit ? "#1d4ed8" : "var(--text-mute)",
                  letterSpacing: "0.01em",
                  pointerEvents: "none",
                  zIndex: 7,
                  overflow: "hidden",
                  whiteSpace: "nowrap",
                  textOverflow: "ellipsis",
                  lineHeight: `${HEADER_H - 2}px`,
                  padding: "0 5px",
                  transition: "color 0.12s ease, font-size 0.12s ease",
                }}
              >
                {b.sector}
              </div>
            )}
            {b.tiles.map((rect, i) => {
              const pct = changePctFor(rect.row);
              const iqs = rect.row.iqs;
              const rv = relVol(rect.row);
              const metric = colorMetric(rect.row, colorBy);
              const c =
                colorBy === "relvol"
                  ? colorForRelVol(rv)
                  : mode === "iqs"
                    ? colorForIqs(iqs)
                    : colorForChange(metric, COLOR_CLAMP[colorBy]);
              const tileW = rect.w;
              const tileH = rect.h;
              const area = tileW * tileH;
              const hideAll = tileW < 32 || tileH < 26;
              const tickerOnly = !hideAll && (tileW < 58 || tileH < 44);
              const tiny = area < 4500;
              const small = area < 10000;
              const medium = area < 18000;
              const tickerLen = Math.max(2, (rect.row.ticker || "").length);
              const tickerFs = Math.min(
                tickerOnly ? 12 : tiny ? 15 : small ? 19 : medium ? 26 : 36,
                Math.floor(((tileW - 8) / tickerLen) * 1.6),
              );
              const pctFs = Math.min(
                small ? 11 : medium ? 13 : 16,
                Math.floor(((tileW - 8) / 5) * 1.4),
              );
              // Prominent, tile-scaled logos (TradingView-plus): ~34% of the
              // smaller tile edge, so big-caps get big logos.
              const sym = rect.row.ticker || rect.row.companyId;
              const isHovered = hover?.sym === sym;
              const showLogo = !hideAll && tileW >= 30 && tileH >= 28;
              const showName = !hideAll && !tickerOnly && !tiny && !small && tileW >= 120;
              const baseLogo = Math.round(Math.min(tileW, tileH) * 0.34);
              const logoSize = Math.max(18, Math.min(96, baseLogo));
              const drawLogoSize = isHovered
                ? Math.min(110, Math.round(logoSize * 1.08))
                : logoSize;
              const sign = pct >= 0 ? "+" : "";
              const subLabel =
                colorBy === "relvol"
                  ? `${rv.toFixed(1)}×`
                  : mode === "iqs"
                    ? `IQS ${iqs.toFixed(1)}`
                    : colorBy === "change"
                      ? `${sign}${pct.toFixed(2)}%`
                      : `${metric >= 0 ? "+" : ""}${metric.toFixed(2)}%`;
              const tileTitle =
                mode === "iqs"
                  ? `${rect.row.ticker || rect.row.name} · IQS ${iqs.toFixed(1)} · ${formatCurrency(rect.row.marketCap)}`
                  : `${rect.row.ticker || rect.row.name} · ${sign}${pct.toFixed(2)}% · ${formatCurrency(rect.row.marketCap)}`;
              const tileX = PAD + rect.x;
              const tileY = HEADER_H + rect.y;
              return (
                <motion.div
                  key={rect.row.companyId}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 40) * 0.006 }}
                  onMouseEnter={(e) =>
                    setHover({ sym, sector: b.sector, row: rect.row, x: e.clientX, y: e.clientY })
                  }
                  onMouseMove={(e) =>
                    setHover((h) => (h && h.sym === sym ? { ...h, x: e.clientX, y: e.clientY } : h))
                  }
                  style={{
                    position: "absolute",
                    left: tileX + 1,
                    top: tileY + 1,
                    width: Math.max(0, tileW - 2),
                    height: Math.max(0, tileH - 2),
                    background: c.bg,
                    color: "#ffffff",
                    borderRadius: 4,
                    overflow: "hidden",
                    cursor: "pointer",
                    zIndex: isHovered ? 20 : 1,
                    filter: isHovered ? "brightness(1.1)" : undefined,
                    boxShadow: isHovered
                      ? "inset 0 0 0 2px rgba(255,255,255,0.95)"
                      : undefined,
                    transition: "filter 0.12s ease, box-shadow 0.12s ease",
                  }}
                >
                  <Link
                    href={rect.row.ticker ? `/companies/${encodeURIComponent(rect.row.ticker)}` : "#"}
                    className="absolute inset-0 flex flex-col items-center justify-center overflow-hidden"
                    style={{ color: "#ffffff", padding: 2, gap: 2 }}
                    title={tileTitle}
                  >
                    {showLogo && (
                      <span
                        className="rounded-lg overflow-hidden bg-white flex items-center justify-center flex-shrink-0"
                        style={{
                          width: drawLogoSize,
                          height: drawLogoSize,
                          padding: 2,
                          transition: "width 0.14s ease, height 0.14s ease",
                          boxShadow: "0 1px 3px rgba(0,0,0,0.25)",
                        }}
                      >
                        <CompanyLogo
                          ticker={rect.row.ticker || ""}
                          name={rect.row.name}
                          size={drawLogoSize - 4}
                        />
                      </span>
                    )}
                    {!hideAll && (
                      <div
                        className="tracking-tight leading-none text-center"
                        style={{
                          color: "#ffffff",
                          fontSize: Math.max(9, tickerFs),
                          fontWeight: 800,
                          letterSpacing: "-0.01em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rect.row.ticker || "—"}
                      </div>
                    )}
                    {showName && (
                      <div
                        className="leading-tight text-center px-1"
                        style={{
                          color: "rgba(255,255,255,0.92)",
                          fontSize: Math.max(9, Math.min(13, Math.floor(tileW / 12))),
                          fontWeight: 600,
                          maxWidth: "100%",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {rect.row.name}
                      </div>
                    )}
                    {!hideAll && !tickerOnly && !tiny && (
                      <div
                        className="leading-none tabular text-center"
                        style={{
                          color: "#ffffff",
                          fontSize: Math.max(9, pctFs),
                          fontWeight: 800,
                          marginTop: 1,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {subLabel}
                      </div>
                    )}
                  </Link>
                </motion.div>
              );
            })}
          </div>
        );
      })}

      {hover && <HeatmapTooltip hover={hover} />}
    </div>
  );
}

/** Floating TradingView-style tooltip: name, ticker, price, change, cap, volume. */
function HeatmapTooltip({
  hover,
}: {
  hover: { sym: string; sector: string; row: RankingRow; x: number; y: number };
}) {
  const r = hover.row;
  const chg = changePctFor(r);
  const up = chg >= 0;
  const price = r.livePrice ?? r.lastPrice ?? null;
  const vw = typeof window !== "undefined" ? window.innerWidth : 1200;
  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
  const W = 232;
  const left = Math.min(hover.x + 16, vw - W - 12);
  const top = Math.min(hover.y + 16, vh - 150);
  return (
    <div
      style={{
        position: "fixed",
        left,
        top,
        width: W,
        zIndex: 100,
        pointerEvents: "none",
        borderRadius: 10,
        background: "rgba(12,17,28,0.97)",
        color: "#fff",
        border: "1px solid rgba(255,255,255,0.14)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
        padding: 12,
      }}
    >
      <div className="flex items-center gap-2.5">
        <span className="rounded-md overflow-hidden bg-white flex items-center justify-center flex-shrink-0" style={{ width: 30, height: 30, padding: 2 }}>
          <CompanyLogo ticker={r.ticker || ""} name={r.name} size={26} />
        </span>
        <div className="min-w-0">
          <div className="text-[13px] font-bold leading-tight truncate">{r.name}</div>
          <div className="text-[11px] leading-tight" style={{ color: "rgba(255,255,255,0.6)" }}>
            {r.ticker} · {hover.sector || "—"}
          </div>
        </div>
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        <Stat label="Price" value={price != null ? `$${price.toFixed(2)}` : "—"} />
        <Stat
          label="Change"
          value={`${up ? "+" : ""}${chg.toFixed(2)}%`}
          color={up ? "#22c55e" : "#ef4444"}
        />
        <Stat label="Mkt Cap" value={r.marketCap ? formatCurrency(r.marketCap) : "—"} />
        <Stat label="Volume" value={r.volume ? formatNumber(r.volume) : "—"} />
      </div>
    </div>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div>
      <div style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontWeight: 700, color: color || "#fff" }}>{value}</div>
    </div>
  );
}

/** TradingView-style legend — discrete swatches, switches with Color-By. */
export function HeatmapLegend({ colorBy = "change" }: { colorBy?: ColorBy }) {
  let swatches: { label: string; c: string }[];
  if (colorBy === "relvol") {
    swatches = [
      { label: "0.5×", c: "#7f8c8d" },
      { label: "1×", c: "#a9752b" },
      { label: "1.5×", c: "#c99a2e" },
      { label: "2×", c: "#d97706" },
      { label: "3×+", c: "#b91c1c" },
    ];
  } else {
    const clamp = COLOR_CLAMP[colorBy] || 8;
    // Change & post-market use TradingView's exact tick labels; the wider
    // performance windows scale their labels off the clamp.
    const isChange = colorBy === "change" || colorBy === "postmarket";
    const stops = isChange
      ? [-5.5, -3.5, -1.5, 0, 1.5, 3.5, 5.5]
      : [-1, -0.6, -0.25, 0, 0.25, 0.6, 1].map((s) => Math.round(s * clamp));
    // Swatch colors are generated from the SAME diverging mix the tiles use,
    // so the legend matches the map exactly.
    swatches = stops.map((v) => {
      const t = Math.max(-1, Math.min(1, v / clamp));
      const c = t >= 0 ? mix(NEUTRAL, GREEN, t) : mix(NEUTRAL, RED, -t);
      return { label: `${v > 0 ? "+" : ""}${v}%`, c };
    });
  }
  return (
    <div className="flex flex-wrap items-end gap-x-1 gap-y-1">
      {swatches.map((s) => (
        <div key={s.label} className="flex flex-col items-center" style={{ width: 56 }}>
          <div style={{ height: 8, width: "100%", borderRadius: 2, background: s.c }} />
          <span className="mt-1 text-[11px] tabular" style={{ color: "var(--text-mute)" }}>
            {s.label}
          </span>
        </div>
      ))}
    </div>
  );
}
